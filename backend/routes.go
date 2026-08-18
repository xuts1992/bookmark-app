package main

import (
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

// registerRoutes 注册全部 HTTP 路由：静态资源、SPA 回退、/api 接口
func registerRoutes(r *gin.Engine) {
	staticDir := filepath.Join(".", "static")
	// Vue 构建生成的 JS/CSS 等资源（base: './' → 引用路径为 ./assets/...）
	r.Static("/assets", filepath.Join(staticDir, "assets"))
	// 本地资源（图标/封面）：resourceDir/icons、resourceDir/covers，对外以 /resource 访问
	r.Static("/resource", resourceDir)
	// 根路径返回首页
	r.GET("/", func(c *gin.Context) {
		c.File(filepath.Join(staticDir, "index.html"))
	})
	// 站点 favicon（浏览器标签页图标）：避免被 SPA 回退吞掉返回主页
	r.StaticFile("/favicon.ico", filepath.Join(staticDir, "favicon.ico"))

	api := r.Group("/api")
	{
		api.GET("/health", healthHandler)
		api.GET("/stats", statsHandler)

		// 资源同步设置
		api.GET("/settings", getSettings)
		api.PUT("/settings", updateSettings)

		// 书签：列表 / 新增 / 搜索 / 删除 / 修改
		api.GET("/bookmarks", listBookmarks)
		api.GET("/bookmarks/:id", getBookmark)
		api.POST("/bookmarks", createBookmark)
		api.GET("/search", searchBookmarks)
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
	}

	// 单页应用回退：非 /api 的未知路径返回 index.html
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(404, gin.H{"error": "Not found"})
			return
		}
		c.File(filepath.Join(staticDir, "index.html"))
	})
}
