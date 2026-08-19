package main

import (
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"github.com/getlantern/systray"
)

const serverPort = "9800"

// 单实例锁：命名 Mutex，进程退出时由系统自动释放
const singleInstanceMutexName = "bookmark-tray-single-instance"

var (
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	procCreateMutex = kernel32.NewProc("CreateMutexW")
	procCloseHandle = kernel32.NewProc("CloseHandle")
)

var singleMutex syscall.Handle

const errAlreadyExists = syscall.Errno(183) // ERROR_ALREADY_EXISTS

// ensureSingleInstance 检测是否已有实例在运行；返回 false 表示已有实例（应提醒后退出）
// 注意：CreateMutexW 在 mutex 已存在时仍返回有效句柄，必须检查 GetLastError==183，
// 不能只依赖 err（Go syscall 包装器此时不报错）
func ensureSingleInstance() bool {
	namePtr, _ := syscall.UTF16PtrFromString(singleInstanceMutexName)
	h, _, lastErr := procCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(namePtr)))
	if h == 0 {
		// 创建失败（如权限受限）：保守放行，避免托盘起不来
		return true
	}
	if lastErr == errAlreadyExists {
		procCloseHandle.Call(h)
		return false
	}
	singleMutex = syscall.Handle(h)
	return true
}

func main() {
	// 单实例：重复启动时提醒用户并退出，避免出现多个托盘程序
	if !ensureSingleInstance() {
		showAlreadyRunningMsg()
		return
	}
	systray.Run(onReady, onExit)
}

// showAlreadyRunningMsg 通过 user32.dll 弹出提示（x/sys/windows 无 MessageBox 封装）
func showAlreadyRunningMsg() {
	user32 := syscall.NewLazyDLL("user32.dll")
	proc := user32.NewProc("MessageBoxW")
	title, _ := syscall.UTF16PtrFromString("网页收藏助手")
	text, _ := syscall.UTF16PtrFromString("网页收藏助手托盘程序已在运行，请勿重复启动。")
	// 0x40 = MB_ICONINFORMATION，0 = MB_OK
	proc.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x40)
}

func onReady() {
	systray.SetIcon(loadIcon())
	systray.SetTitle("书签收藏")
	systray.SetTooltip("书签收藏本地服务")

	mOpen := systray.AddMenuItem("打开收藏", "在浏览器中打开书签收藏")
	mStart = systray.AddMenuItem("启动服务", "启动本地书签服务")
	mStop = systray.AddMenuItem("停止服务", "停止本地书签服务")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("退出", "退出并停止服务")

	// 托盘启动后自动拉起本地服务
	startServer()
	updateMenuState()

	// 定时刷新菜单状态：服务可能被外部启动/停止（如直接运行 bookmark-server.exe）
	go func() {
		for {
			time.Sleep(2 * time.Second)
			updateMenuState()
		}
	}()

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				openBrowser("http://localhost:" + serverPort)
			case <-mStart.ClickedCh:
				startServer()
				updateMenuState()
			case <-mStop.ClickedCh:
				stopServer()
				updateMenuState()
			case <-mQuit.ClickedCh:
				stopServer()
				systray.Quit()
				return
			}
		}
	}()
}

func onExit() {
	stopServer()
}

var serverCmd *exec.Cmd
var mStart, mStop *systray.MenuItem

// loadIcon 返回编译期内嵌的托盘图标（iconBytes 由 scripts/genicon 生成），运行时不依赖 exe 同级文件
func loadIcon() []byte {
	return iconBytes
}

// serverRunning 检测本地服务端口是否已在监听（避免重复启动）
func serverRunning() bool {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:"+serverPort, 500*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// updateMenuState 根据服务运行状态，只显示「启动服务」或「停止服务」其中一个菜单项
func updateMenuState() {
	if serverRunning() {
		mStart.Hide()
		mStop.Show()
	} else {
		mStart.Show()
		mStop.Hide()
	}
}

// exeDir 返回当前可执行文件所在目录（bookmark-server.exe 与之同级）
func exeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

func startServer() {
	if serverRunning() {
		fmt.Println("服务已在运行（端口", serverPort, "），跳过启动")
		return
	}
	if serverCmd != nil && serverCmd.Process != nil {
		return // 已在运行
	}
	bin := filepath.Join(exeDir(), "bookmark-server.exe")
	if _, err := os.Stat(bin); err != nil {
		fmt.Println("未找到服务程序:", bin)
		return
	}
	// server 子命令显式传 -port（本项目统一用 9800，与 CLI 默认一致）；dbpath 用默认 data/bookmarks.db（相对 cmd.Dir）
	cmd := exec.Command(bin, "server", "-port", serverPort)
	cmd.Dir = exeDir()
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	// 以无控制台窗口方式拉起服务进程（tray 为 GUI 程序，避免服务再弹黑框）
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		fmt.Println("启动服务失败:", err)
		return
	}
	serverCmd = cmd
	fmt.Println("书签服务已启动")
}

func stopServer() {
	if serverCmd != nil && serverCmd.Process != nil {
		_ = serverCmd.Process.Kill()
		_ = serverCmd.Wait()
		serverCmd = nil
		fmt.Println("书签服务已停止")
		return
	}
	// 兜底：服务由外部进程启动（本进程未持有句柄）时，按进程名终止
	if serverRunning() {
		cmd := exec.Command("taskkill", "/IM", "bookmark-server.exe", "/F")
		if err := cmd.Run(); err != nil {
			fmt.Println("停止外部服务进程失败:", err)
			return
		}
		fmt.Println("书签服务已停止（外部进程）")
	}
}

func openBrowser(u string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", u)
	case "darwin":
		cmd = exec.Command("open", u)
	default:
		cmd = exec.Command("xdg-open", u)
	}
	_ = cmd.Start()
}

