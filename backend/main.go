package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "bookmarks.db"
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "9000"
	}

	// 资源目录（图标/封面本地存储）：默认 backend/resource，通过 /resource 静态访问
	resourceDir = mustAbs(filepath.Join(".", "resource"))
	if err := os.MkdirAll(resourceDir, 0o755); err != nil {
		log.Fatalf("无法创建资源目录: %v", err)
	}

	// 打开 SQLite 数据库（glebarez/sqlite 为纯 Go 实现，无需 CGO/gcc）
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		log.Fatalf("无法打开数据库: %v", err)
	}
	DB = db
	if err := db.AutoMigrate(&Bookmark{}, &Category{}, &Tag{}, &BookmarkDetail{}, &Setting{}); err != nil {
		log.Fatalf("数据库迁移失败: %v", err)
	}
	// 一次性数据迁移：补充默认/示例分类，并为已有书签建立分类与标签关联
	migrateData(DB)
	// 加载默认标签配置（default/default-tags.toml）：构建受保护集合，并把缺失的分类/标签补建进库
	loadDefaultTags()
	ensureDefaultTags(DB)
	// 读取/初始化配置（单例 id=1），并按开关启动资源定时同步调度器
	settings := ensureSettingRow(DB)
	startSyncScheduler(DB, settings)
	// 资源本地化：把已有书签的远程图标/封面下载到本地（后台执行，不阻塞启动；幂等）
	go localizeExistingResources(DB)

	r := gin.Default()
	r.Use(corsMiddleware())
	// 注册全部路由（静态资源 / SPA 回退 / /api 接口）
	registerRoutes(r)

	log.Println("==================================================")
	log.Println("  📚 网页收藏服务 (Go + Gin + GORM + SQLite)")
	log.Println("==================================================")
	log.Println("  管理页面: http://localhost:" + port)
	log.Println("  数据文件: " + mustAbs(dbPath))
	log.Println("==================================================")
	r.Run("0.0.0.0:" + port)
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
