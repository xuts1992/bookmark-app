package main

import (
	"embed"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

//go:embed all:static
var staticFS embed.FS

// registerRoutes 注册全部 HTTP 路由：静态资源（编译期内嵌）、SPA 回退、/api 接口
func registerRoutes(r *gin.Engine) {
	// 从内嵌 staticFS 读取静态文件（Vite 构建产物，编译时嵌入 exe，运行时不依赖文件系统）
	readStatic := func(name string) ([]byte, error) {
		return staticFS.ReadFile("static/" + name)
	}
	indexHTML, err := readStatic("index.html")
	if err != nil {
		panic("embed static/index.html: " + err.Error())
	}
	favicon, err := readStatic("favicon.ico")
	if err != nil {
		panic("embed static/favicon.ico: " + err.Error())
	}

	// Vue 构建生成的 JS/CSS 等资源（base: './' → 引用路径为 ./assets/...）
	r.GET("/assets/*filepath", func(c *gin.Context) {
		p := strings.TrimPrefix(c.Param("filepath"), "/")
		data, err := readStatic("assets/" + p)
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		c.Data(http.StatusOK, contentTypeFor(p), data)
	})
	// 本地资源（图标/封面）：运行时数据目录 data/resource，对外以 /resource 访问
	r.Static("/resource", resourceDir)
	// 根路径返回首页
	r.GET("/", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})
	// 站点 favicon（浏览器标签页图标）：避免被 SPA 回退吞掉返回主页
	r.GET("/favicon.ico", func(c *gin.Context) {
		c.Data(http.StatusOK, "image/x-icon", favicon)
	})

	api := r.Group("/api")
	{
		api.GET("/health", healthHandler)
		api.GET("/stats", statsHandler)

		// 资源同步设置
		api.GET("/settings", getSettings)
		api.PUT("/settings", updateSettings)

		// 书签：列表 / 新增 / 搜索 / 导出 / 删除 / 修改
		api.GET("/bookmarks", listBookmarks)
		api.GET("/bookmarks/:id", getBookmark)
		api.POST("/bookmarks", createBookmark)
		api.GET("/search", searchBookmarks)
		api.GET("/export", exportBookmarks)
		// 回收站：列表 / 恢复 / 彻底删除
		api.GET("/trash", listTrash)
		api.PUT("/trash/:id/restore", restoreBookmark)
		api.DELETE("/trash/:id", purgeBookmark)
		api.DELETE("/bookmarks/:id", deleteBookmark)
		api.PUT("/bookmarks/:id", updateBookmark)
		api.PUT("/bookmarks/:id/favorite", setFavorite)
		api.PUT("/bookmarks/:id/detail", updateDetail)
		api.POST("/bookmarks/batch", batchUpdateBookmarks)

		// 分类：列表 / 新建 / 重命名 / 删除
		api.GET("/categories", listCategories)
		api.POST("/categories", createCategory)
		api.PUT("/categories/:id", renameCategory)
		api.DELETE("/categories/:id", deleteCategory)

		// 标签：列表 / 新建 / 重命名 / 删除
		api.GET("/tags", listTags)
		api.POST("/tags", createTag)
		api.PUT("/tags/:id", renameTag)
		api.DELETE("/tags/:id", deleteTag)

		// 受保护配置（默认配置中的分类/标签，删除前查询用）
		api.GET("/protected", listProtected)
	}

	// 单页应用回退：非 /api 的未知路径返回 index.html
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(404, gin.H{"error": "Not found"})
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
	})
}

// contentTypeFor 按扩展名返回静态资源的 Content-Type
func contentTypeFor(name string) string {
	switch {
	case strings.HasSuffix(name, ".js"):
		return "application/javascript; charset=utf-8"
	case strings.HasSuffix(name, ".css"):
		return "text/css; charset=utf-8"
	case strings.HasSuffix(name, ".png"):
		return "image/png"
	case strings.HasSuffix(name, ".jpg"), strings.HasSuffix(name, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(name, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(name, ".ico"):
		return "image/x-icon"
	case strings.HasSuffix(name, ".woff2"):
		return "font/woff2"
	case strings.HasSuffix(name, ".map"):
		return "application/json"
	default:
		return "application/octet-stream"
	}
}
