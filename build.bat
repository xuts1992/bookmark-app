@echo off
chcp 65001 >nul

@REM Python 3.13.12
@REM Go 1.23.5
@REM Node 22.22.2       
@REM set "GOROOT=D:\.dev\binaries\go\go"
@REM set "PATH=%PATH%;D:\.dev\binaries\go\go\bin;D:\.dev\binaries\node\versions\22.22.2"
@REM set "GOTOOLCHAIN=local"
@REM set "GOPROXY=https://goproxy.cn,direct"
@REM set "NPM_REGISTRY=--registry https://registry.npmmirror.com"


REM 项目根目录 = 脚本所在目录（%~dp0 动态获取，避免写死本机路径，方便分享给别人）
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
echo ====================================
echo   网页收藏助手 - 项目构建
echo ====================================
echo.
echo [后端] Go + Gin + GORM + SQLite
echo [前端] Vue 3 + Vite
echo [插件] Chrome Extension (Manifest V3)
echo.


REM ---------- 构建前端 (Vue) ----------
echo [1/4] 构建前端 Vue 页面...
cd /d "%ROOT%\web"
where npm >nul 2>&1
if not errorlevel 1 goto npm_found
echo [错误] 未找到 npm，请先安装 Node.js 18+
echo   下载: https://nodejs.org/
pause
exit /b 1
:npm_found
if exist node_modules goto deps_ok
echo   安装前端依赖 (npm install)...
call npm install --registry https://registry.npmmirror.com
:deps_ok
echo   编译 Vue 到 backend\static ...
call npm run build
if not errorlevel 1 goto fe_ok
echo [失败] 前端构建出错
pause
exit /b 1
:fe_ok
echo   前端构建完成。

REM ---------- 构建后端 (Go) ----------
echo [2/4] 编译后端 Go 服务...
cd /d "%ROOT%\backend"
where go >nul 2>&1
if not errorlevel 1 goto go_found
echo [错误] 未找到 go，请先安装 Go 1.23+
echo   下载: https://go.dev/dl/
pause
exit /b 1
:go_found
echo   编译 bookmark-server.exe ...
go build -o bookmark-server.exe .
if errorlevel 1 goto be_fail
echo [完成] 编译成功: backend\bookmark-server.exe
goto be_done
:be_fail
echo [失败] 后端编译出错
pause
exit /b 1
:be_done

REM ---------- 编译 tray 托盘程序 ----------
echo [3/4] 编译托盘程序 start.exe...
cd /d "%ROOT%\backend\tray"
REM -H windowsgui: GUI 子系统，启动不弹黑框；rsrc.syso 提供内嵌图标
REM 用最新 icon.ico 重新生成内嵌图标资源，避免文件图标与运行图标不一致
copy /Y ..\icon.ico .\icon.ico >nul 2>&1
REM 由 genicon 重新生成字节数组（编译期内嵌托盘图标，规避子包 //go:embed 工具链问题）
go run "%ROOT%\backend\scripts\genicon" "%ROOT%\backend\tray\icon.ico" "%ROOT%\backend\tray\icon_data.go" >nul
if exist rsrc.syso del /f rsrc.syso
rsrc -ico ..\icon.ico -o rsrc.syso
if errorlevel 1 goto rsrc_warn
echo   已用最新 icon.ico 更新内嵌图标资源
goto rsrc_done
:rsrc_warn
echo [警告] 生成 rsrc.syso 失败，start.exe 文件图标可能仍为旧图标
:rsrc_done
go build -ldflags "-H windowsgui" -o ..\start.exe .
if errorlevel 1 goto tray_fail
echo [完成] 编译成功: backend\start.exe
goto tray_done
:tray_fail
echo [失败] tray 编译出错
pause
exit /b 1
:tray_done
cd /d "%ROOT%\backend"

REM ---------- 收集产物到 build 目录 ----------
echo [4/4] 收集运行所需文件到 build 目录...
set "BACK=%ROOT%\backend"
set "BUILD=%ROOT%\build"

REM 停止可能占用 exe / static / resource 文件的旧服务进程与托盘
taskkill /IM bookmark-server.exe /F >nul 2>&1
taskkill /IM start.exe /F >nul 2>&1

REM 清空并重建 build 目录
if not exist "%BUILD%" goto build_clean_ok
powershell -NoProfile -Command "Remove-Item -Recurse -Force '%BUILD%' -ErrorAction SilentlyContinue"
:build_clean_ok
mkdir "%BUILD%" >nul 2>&1

REM 复制后端产物与运行所需文件到 build（static 与 icon.ico 已 embed 进 exe，无需复制；data 为用户数据目录）
copy /Y "%BACK%\bookmark-server.exe" "%BUILD%\" >nul
copy /Y "%BACK%\start.exe" "%BUILD%\" >nul
xcopy /E /I /Y "%BACK%\data" "%BUILD%\data" >nul 2>&1
xcopy /E /I /Y "%ROOT%\extension" "%BUILD%\extension" >nul

REM 校验产物齐全
if exist "%BUILD%\bookmark-server.exe" goto chk1_ok
echo [失败] bookmark-server.exe 未就位
pause
exit /b 1
:chk1_ok
if exist "%BUILD%\extension\manifest.json" goto chk4_ok
echo [失败] extension 未就位
pause
exit /b 1
:chk4_ok
echo   完成：%BUILD%


cd /d "%ROOT%"
echo.
echo ====================================
echo   构建完成！运行 %BUILD%\bookmark-server.exe 启动服务
echo   （build 目录即自包含部署目录；bookmarks.db 首次运行自动生成）
echo ====================================
echo.
pause
