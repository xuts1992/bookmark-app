@echo off
chcp 65001 >nul
REM ============================================================
REM  网页收藏助手 - 开发模式一键启动 (dev.bat)
REM  同时拉起 Go 后端 (9000) 与 Vue 前端开发服务器 (3000)
REM  前端通过 Vite 把 /api、/resource 代理到后端 9000，无需构建
REM  用法：双击本文件，或命令行执行 dev.bat
REM ============================================================


@REM Python 3.13.12
@REM Go 1.23.5
@REM Node 22.22.2     
@REM set "GOROOT=D:\.dev\binaries\go\go"
@REM set "PATH=%PATH%;D:\.dev\binaries\go\go\bin;D:\.dev\binaries\node\versions\22.22.2"
@REM set "GOTOOLCHAIN=local"
@REM set "GOPROXY=https://goproxy.cn,direct"
@REM set "NPM_REGISTRY=--registry https://registry.npmmirror.com"


REM ---- 项目目录（= 脚本所在目录，%~dp0 动态获取；工具路径仍为本机绝对路径）----
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

echo ====================================
echo   网页收藏助手 - 开发模式启动
echo   后端 : http://localhost:9000
echo   前端 : http://localhost:3000
echo ====================================
echo.

REM ---- 若 9000 端口已被占用，提示先关闭 ----
netstat -ano 2>nul | findstr ":9000" >nul
if %errorlevel% equ 0 (
  echo [提示] 9000 端口似乎已被占用，新后端可能无法启动。请先关闭占用该端口的程序。
)

REM ---- 停止可能已运行的构建版服务，避免端口冲突 ----
taskkill /F /IM bookmark-server.exe >nul 2>&1

REM ---- 前端依赖未安装则先安装 ----
if not exist "%ROOT%\web\node_modules" (
  echo [前端] 未检测到 node_modules，正在安装依赖...
  pushd "%ROOT%\web"
  call npm install %NPM_REGISTRY%
  popd
)

REM ---- 启动后端 (Go) ----
echo [后端] 启动 Go 服务 (go run .)  -^>  http://localhost:9000
start "bookmark-backend" /D "%ROOT%\backend" cmd /k "go run ."

REM ---- 启动前端 (Vue dev) ----
echo [前端] 启动 Vue 开发服务器 (npm run dev)  -^>  http://localhost:3000
start "bookmark-frontend" /D "%ROOT%\web" cmd /k "npm run dev"

echo.
echo 已打开两个独立窗口：bookmark-backend / bookmark-frontend
echo 关闭对应窗口即可停止该服务。
echo 后端改代码后请在后端窗口按 Ctrl+C，再执行 go run . 重新编译运行。
echo.

REM ---- 等待服务启动后自动打开浏览器（前端开发服务器）----
ping -n 4 127.0.0.1 >nul
start "" "http://localhost:3000"

echo.
pause
