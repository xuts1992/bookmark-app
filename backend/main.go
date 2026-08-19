package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// syncLog 后台任务专用日志（资源同步/图标封面下载），写入 data/logs/sync.log，与 server.log 分离
var syncLog *log.Logger

// serverLogFile 请求日志文件句柄（gin 输出到 server.log），initLogging 初始化
var serverLogFile *os.File

// currentDBPath 当前数据库路径（initDataBase 确定，供启动横幅显示）
var currentDBPath string

func main() {
	args := os.Args[1:]
	if len(args) > 0 {
		switch args[0] {
		case "server":
			runServer(args[1:])
			return
		case "loadimg":
			runLoadImg()
			return
		case "help", "-h", "--help":
			printUsage()
			return
		default:
			// 以 - 开头的参数（如 -port 9801）视为 server 模式的参数；否则是未知命令
			if !strings.HasPrefix(args[0], "-") {
				fmt.Printf("未知命令 %q，可用命令：server / loadimg\n", args[0])
				printUsage()
				os.Exit(2)
			}
			runServer(args)
			return
		}
	}
	// 无任何子命令/参数：按现有模式启动服务
	runServer(nil)
}

func printUsage() {
	fmt.Println("用法: bookmark-server [命令] [参数]")
	fmt.Println("  无参数 / server   启动网页收藏服务（HTTP :9800）")
	fmt.Println("                    参数：-port 指定端口（默认 9800）；-dbpath 指定 SQLite 数据库文件（默认 data/bookmarks.db）")
	fmt.Println("  loadimg           执行一次图标/封面本地化下载任务后退出")
}

// initLogging 初始化日志：server.log（标准库 log + gin 请求日志）与 sync.log（后台任务日志）
func initLogging(dbPath string) {
	logDir := filepath.Join(filepath.Dir(dbPath), "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		log.Fatalf("无法创建日志目录: %v", err)
	}
	var err error
	serverLogFile, err = os.OpenFile(filepath.Join(logDir, "server.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		log.Fatalf("无法打开日志文件: %v", err)
	}
	// 标准库 log：控制台与文件同时输出
	log.SetOutput(io.MultiWriter(os.Stdout, serverLogFile))

	// 后台任务日志（资源同步/图标封面下载）：单独写 data/logs/sync.log
	syncFile, err := os.OpenFile(filepath.Join(logDir, "sync.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		log.Fatalf("无法打开后台任务日志文件: %v", err)
	}
	syncLog = log.New(io.MultiWriter(os.Stdout, syncFile), "[SYNC] ", log.LstdFlags)
}

// initDataBase 打开 SQLite 数据库并完成迁移与种子（server / loadimg 共用）
func initDataBase(dbPath string) *gorm.DB {
	currentDBPath = dbPath

	// 资源目录（图标/封面本地存储）：用户数据统一放 data 目录，默认 backend/data/resource，通过 /resource 静态访问
	resourceDir = mustAbs(filepath.Join("data", "resource"))
	if err := os.MkdirAll(resourceDir, 0o755); err != nil {
		log.Fatalf("无法创建资源目录: %v", err)
	}

	// 日志目录与文件
	initLogging(currentDBPath)

	// 打开 SQLite 数据库（glebarez/sqlite 为纯 Go 实现，无需 CGO/gcc）
	db, err := gorm.Open(sqlite.Open(currentDBPath), &gorm.Config{})
	if err != nil {
		log.Fatalf("无法打开数据库: %v", err)
	}
	DB = db
	if err := db.AutoMigrate(&Bookmark{}, &Category{}, &Tag{}, &BookmarkDetail{}, &Setting{}); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}
	// 回收站迁移：bookmarks.url 唯一索引会阻止「软删除后重新收藏同一网址」，启动时移除该索引
	_ = db.Exec("DROP INDEX IF EXISTS idx_bookmarks_url").Error
	// 一次性数据迁移：补充默认/示例分类，并为已有书签建立分类与标签关联
	migrateData(DB)
	// 加载默认标签配置（default/default-tags.toml）：构建受保护集合，并把缺失的分类/标签补建进库
	loadDefaultTags()
	ensureDefaultTags(DB)
	return db
}

// defaultDBPath 返回默认数据库路径：优先 DB_PATH 环境变量，否则 data/bookmarks.db（相对当前目录）
func defaultDBPath() string {
	if p := os.Getenv("DB_PATH"); p != "" {
		return p
	}
	return filepath.Join("data", "bookmarks.db")
}

// runServer 服务模式（无参数 / server 子命令）：支持 -port / -dbpath 参数
func runServer(args []string) {
	// 解析参数：-port 指定端口（默认 9800）、-dbpath 指定数据库文件（默认 data/bookmarks.db）
	port := "9800"
	dbPath := filepath.Join("data", "bookmarks.db")
	fs := flag.NewFlagSet("server", flag.ContinueOnError)
	fs.StringVar(&port, "port", port, "服务端口（默认 9800）")
	fs.StringVar(&dbPath, "dbpath", dbPath, "SQLite 数据库文件路径（默认 data/bookmarks.db）")
	fs.SetOutput(os.Stderr)
	if err := fs.Parse(args); err != nil {
		if err != flag.ErrHelp {
			fmt.Println(err)
		}
		os.Exit(2)
	}
	// 显式传入的 flag 优先；未指定时回退环境变量（兼容旧方式），最后使用默认值
	set := make(map[string]bool)
	fs.Visit(func(f *flag.Flag) { set[f.Name] = true })
	if !set["port"] {
		if p := os.Getenv("PORT"); p != "" {
			port = p
		}
	}
	if !set["dbpath"] {
		if p := os.Getenv("DB_PATH"); p != "" {
			dbPath = p
		}
	}

	db := initDataBase(dbPath)
	// 读取/初始化配置（单例 id=1），并按开关启动资源定时同步调度器
	settings := ensureSettingRow(db)
	startSyncScheduler(db, settings)
	// 资源本地化：把已有书签的远程图标/封面下载到本地（后台执行，不阻塞启动；幂等）
	go localizeExistingResources(db)

	r := gin.New()
	r.Use(gin.LoggerWithWriter(io.MultiWriter(os.Stdout, serverLogFile)), gin.Recovery())
	r.Use(corsMiddleware())
	// 注册全部路由（静态资源 / SPA 回退 / /api 接口）
	registerRoutes(r)

	log.Println("==================================================")
	log.Println("  📚 网页收藏服务 (Go + Gin + GORM + SQLite)")
	log.Println("==================================================")
	log.Println("  管理页面: http://localhost:" + port)
	log.Println("  数据文件: " + mustAbs(currentDBPath))
	log.Println("==================================================")
	r.Run("0.0.0.0:" + port)
}

// runLoadImg loadimg 子命令：同步执行一次图标/封面本地化下载任务后退出（不启动 HTTP 服务）
func runLoadImg() {
	db := initDataBase(defaultDBPath())
	log.Println("loadimg：开始下载图标与封面...")
	localizeExistingResources(db)
	log.Println("loadimg：完成")
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
