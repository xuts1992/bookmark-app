# 网页收藏助手 (Bookmark Collector)

一个网页收藏系统：浏览器插件一键收藏当前网页，后端用 Go 存储并提供网页展示与数据接口，前端管理页用 Vue 开发。

最开始使用django和element-admin 项目开发, 但使用需要搭建python环境, 现使用workbuddy重构

## 架构

```
bookmark-app/
├── backend/                 # Go 后端 (Gin + GORM + SQLite)
│   ├── main.go              # 服务入口：API + 静态网页托管
│   ├── static/              # ← Vue 构建产物 (index.html + assets/)，由 Go 对外提供
│   ├── go.mod / go.sum
│   └── default-tags.toml    # 用户自定义标签, 程序启动时会自动添加到数据库中
├── web/                     # Vue 3 + Vite 前端源码
│   ├── src/                 # App.vue / components / api.js
│   ├── vite.config.js       # dev:3000 + /api 代理到 :9800；build 输出到 ../backend/static
│   └── package.json
├── extension/               # Chrome 浏览器插件 (Manifest V3)
│   ├── manifest.json
│   ├── popup.html / popup.js
│   └── background.js
├── build.bat                # 一键构建前端 + 后端, 使用 http://localhost:9800/ 访问
└── dev.bat                # 启动前端+后端开发环境  打开 http://localhost:3000/ 访问开发环境
```

## 开发工作流

**前端开发 (Vue, 端口 3000)**
```powershell
cd web
npm install --registry https://registry.npmmirror.com
npm run dev        # 启动 Vite，访问 http://localhost:3000
```
- Vite 跑在 **3000** 端口
- 页面里所有 `/api/...` 请求通过 Vite 代理转发到 **Go 后端 9800** 端口
- 修改 `web/src` 下的代码，浏览器热更新

**后端开发 (Go, 端口 9800)**
```powershell
cd backend
go run . server -port 9800   # 或 go build -o bookmark-server.exe 后运行
# 访问 http://localhost:9800
```
- 服务端支持命令行参数：`server` 子命令可指定 `-port`（默认 9800）与 `-dbpath`（默认 data/bookmarks.db）；`loadimg` 子命令执行一次图标/封面下载任务后退出。
- Go 负责：提供 `/api` 数据接口、读写 SQLite、托管 `backend/static` 下的编译后网页

## 生产构建

```powershell
# 构建后放到了build目录下
build.bat

```


命令行启动： `cd build && ./bookmark-server.exe` 
或者点击 start.exe 这是一个托盘程序


## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/health` | 健康检查 |
| GET  | `/api/bookmarks?limit=200` | 书签列表 |
| POST | `/api/bookmarks` | 新增书签（URL 已存在则更新标题/标签） |
| GET  | `/api/search?q=关键词` | 搜索 |
| GET  | `/api/stats` | 统计（总数/今日） |
| DELETE | `/api/bookmarks/:id` | 删除书签 |

## 安装浏览器插件

1. 打开 Chrome → 访问 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择 `extension/` 文件夹
5. 点击插件图标 → 自动获取当前页标题/网址 → 一键收藏

## 技术说明

- **SQLite 驱动**：使用 `github.com/glebarez/sqlite`（纯 Go，无需 CGO/gcc），避免 Windows 上安装 MinGW 的麻烦。
- **Vue 构建路径**：`vite.config.js` 中 `base: './'` + `build.outDir: '../backend/static'`，保证编译产物由 Go 同源托管、无需额外配置。
- **开发代理**：`vite.config.js` 中 `server.proxy['/api']` 指向 `http://localhost:9800`。
