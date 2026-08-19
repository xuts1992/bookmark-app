package main

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

func healthHandler(c *gin.Context) {
	c.JSON(200, gin.H{"status": "ok", "storage": "sqlite"})
}

func statsHandler(c *gin.Context) {
	var total int64
	DB.Model(&Bookmark{}).Count(&total)
	var todayCount int64
	today := time.Now().Format("2006-01-02")
	DB.Model(&Bookmark{}).Where("date(created_at) = ?", today).Count(&todayCount)
	c.JSON(200, gin.H{"total": total, "today": todayCount})
}

// getSettings 读取单例配置（id=1）；不存在则创建默认行
func getSettings(c *gin.Context) {
	s := ensureSettingRow(DB)
	c.JSON(200, s)
}

// updateSettings 更新（同步开关 / 间隔分钟），并热重启定时同步调度器
func updateSettings(c *gin.Context) {
	var inp struct {
		SyncEnabled         *bool `json:"sync_enabled"`
		SyncIntervalMinutes *int  `json:"sync_interval_minutes"`
	}
	if err := c.ShouldBindJSON(&inp); err != nil {
		c.JSON(400, gin.H{"error": "请求格式错误"})
		return
	}
	s := ensureSettingRow(DB)
	enabled := s.SyncEnabled
	interval := s.SyncIntervalMinutes
	if inp.SyncEnabled != nil {
		enabled = *inp.SyncEnabled
	}
	if inp.SyncIntervalMinutes != nil {
		if *inp.SyncIntervalMinutes < 1 {
			*inp.SyncIntervalMinutes = 1
		}
		interval = *inp.SyncIntervalMinutes
	}
	// 用显式 UPDATE 持久化（避免 GORM Save 在数值列上的写入歧义）
	if err := DB.Model(&Setting{}).Where("id = ?", 1).
		Updates(map[string]interface{}{"sync_enabled": enabled, "sync_interval_minutes": interval}).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	s.SyncEnabled = enabled
	s.SyncIntervalMinutes = interval
	// 热重启调度器（会先停掉旧的定时器）
	startSyncScheduler(DB, s)
	// 启用后立即触发一次同步（接受任务后下载封面与图标）
	if s.SyncEnabled {
		go localizeExistingResources(DB)
	}
	c.JSON(200, s)
}

// listBookmarks 书签列表，支持分页、分类过滤、标签过滤（AND）
func listBookmarks(c *gin.Context) {
	base := DB.Model(&Bookmark{})
	if cat := c.Query("category_id"); cat != "" {
		if id, err := strconv.Atoi(cat); err == nil {
			base = base.Where("category_id = ?", id)
		}
	}
	if ids := parseTagIDs(c.QueryArray("tag_id")); len(ids) > 0 {
		base = applyTagFilter(base, ids)
	}
	if c.Query("is_video") == "1" {
		base = base.Where("is_video = ?", true)
	}
	if c.Query("favorite") == "1" {
		base = base.Where("is_favorite = ?", true)
	}
	var total int64
	base.Count(&total)

	limit := 200
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if n, err := strconv.Atoi(o); err == nil && n > 0 {
			offset = n
		}
	}
	var list []Bookmark
	base.Order("created_at desc").Limit(limit).Offset(offset).
		Preload("Category").Preload("TagsR").Preload("Detail").Find(&list)
	c.JSON(200, gin.H{"items": list, "total": total})
}

// createBookmark 新增书签（URL 已存在则更新）；支持 category_id 与 tag_ids
func createBookmark(c *gin.Context) {
	var inp bookmarkInput
	if err := c.ShouldBindJSON(&inp); err != nil {
		c.JSON(400, gin.H{"error": "请求格式错误"})
		return
	}
	inp.Title = strings.TrimSpace(inp.Title)
	inp.URL = strings.TrimSpace(inp.URL)
	inp.Favicon = strings.TrimSpace(inp.Favicon)
	inp.Author = strings.TrimSpace(inp.Author)
	inp.Collection = strings.TrimSpace(inp.Collection)
	inp.Cover = strings.TrimSpace(inp.Cover)
	if inp.Title == "" || inp.URL == "" {
		c.JSON(400, gin.H{"error": "标题和网址不能为空"})
		return
	}
	def := getDefaultCategory(DB)
	var b Bookmark
	res := DB.Where("url = ?", inp.URL).First(&b)
	if res.Error == nil {
		// 已存在 → 更新
		b.Title = inp.Title
		if inp.CategoryID != nil {
			b.CategoryID = inp.CategoryID
		}
		b.Author = inp.Author
		b.Collection = inp.Collection
		if inp.Pubdate != nil {
			b.Pubdate = inp.Pubdate
		}
		// 封面/图标改为异步下载：先存原始值（远程 URL），后台下载完成后回写本地路径
		b.Cover = inp.Cover
		b.IsVideo = inp.IsVideo
		b.Duration = strings.TrimSpace(inp.Duration)
		if err := syncBookmarkTags(DB, &b, inp.TagIDs, inp.Tags, def.ID); err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		DB.Save(&b)
		upsertBookmarkDetail(DB, b.ID, inp.Detail)
		// 图标/封面异步下载，不阻塞请求
		asyncDownloadBookmarkResources(DB, &b, inp.Favicon, inp.Cover)
		DB.Preload("Category").Preload("TagsR").Preload("Detail").First(&b, b.ID)
		c.JSON(200, gin.H{"message": "已存在（已更新）", "bookmark": b})
		return
	}

	b = Bookmark{
		Title:      inp.Title,
		URL:        inp.URL,
		Favicon:    "",
		Author:     inp.Author,
		Collection: inp.Collection,
		Cover:      "",
		IsVideo:    inp.IsVideo,
		Duration:   strings.TrimSpace(inp.Duration),
		Pubdate:    inp.Pubdate,
		CreatedAt:  time.Now(),
	}
	if inp.CategoryID != nil {
		b.CategoryID = inp.CategoryID
	} else {
		id := def.ID
		b.CategoryID = &id
	}
	if err := DB.Create(&b).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if inp.Favicon != "" {
		b.Favicon = inp.Favicon
	}
	b.Cover = inp.Cover
	if err := syncBookmarkTags(DB, &b, inp.TagIDs, inp.Tags, def.ID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	DB.Save(&b)
	upsertBookmarkDetail(DB, b.ID, inp.Detail)
	// 图标/封面异步下载，不阻塞请求
	asyncDownloadBookmarkResources(DB, &b, inp.Favicon, inp.Cover)
	DB.Preload("Category").Preload("TagsR").Preload("Detail").First(&b, b.ID)
	c.JSON(201, gin.H{"message": "收藏成功", "bookmark": b})
}

// searchBookmarks 搜索（支持分页、分类、标签过滤）
func searchBookmarks(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(200, gin.H{"items": []Bookmark{}, "total": 0})
		return
	}
	like := "%" + q + "%"
	cond := "title LIKE ? OR url LIKE ? OR tags LIKE ?"
	base := DB.Model(&Bookmark{}).Where(cond, like, like, like)
	if cat := c.Query("category_id"); cat != "" {
		if id, err := strconv.Atoi(cat); err == nil {
			base = base.Where("category_id = ?", id)
		}
	}
	if ids := parseTagIDs(c.QueryArray("tag_id")); len(ids) > 0 {
		base = applyTagFilter(base, ids)
	}
	if c.Query("is_video") == "1" {
		base = base.Where("is_video = ?", true)
	}
	if c.Query("favorite") == "1" {
		base = base.Where("is_favorite = ?", true)
	}
	var total int64
	base.Count(&total)

	limit := 10
	if l := c.Query("limit"); l != "" {
		if n, err := strconv.Atoi(l); err == nil && n > 0 {
			limit = n
		}
	}
	offset := 0
	if o := c.Query("offset"); o != "" {
		if n, err := strconv.Atoi(o); err == nil && n > 0 {
			offset = n
		}
	}
	var list []Bookmark
	base.Order("created_at desc").Limit(limit).Offset(offset).
		Preload("Category").Preload("TagsR").Preload("Detail").Find(&list)
	c.JSON(200, gin.H{"items": list, "total": total})
}

// exportBookmarks 导出当前筛选条件下的全部书签（Excel .xlsx 下载），筛选参数与 list/search 一致，不分页
func exportBookmarks(c *gin.Context) {
	base := DB.Model(&Bookmark{})
	if cat := c.Query("category_id"); cat != "" {
		if id, err := strconv.Atoi(cat); err == nil {
			base = base.Where("category_id = ?", id)
		}
	}
	if ids := parseTagIDs(c.QueryArray("tag_id")); len(ids) > 0 {
		base = applyTagFilter(base, ids)
	}
	if c.Query("is_video") == "1" {
		base = base.Where("is_video = ?", true)
	}
	if c.Query("favorite") == "1" {
		base = base.Where("is_favorite = ?", true)
	}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		like := "%" + q + "%"
		base = base.Where("title LIKE ? OR url LIKE ? OR tags LIKE ?", like, like, like)
	}
	var list []Bookmark
	base.Order("created_at desc").
		Preload("Category").Preload("TagsR").Preload("Detail").Find(&list)

	// 生成 Excel（.xlsx）
	f := excelize.NewFile()
	defer f.Close()
	sheet := "书签"
	f.SetSheetName("Sheet1", sheet)

	headers := []string{"ID", "标题", "网址", "分类", "标签", "作者", "合集", "发布时间", "时长", "是否视频", "是否收藏", "图标", "封面", "详情", "创建时间"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}
	for i, b := range list {
		row := i + 2
		cat, tags, detail, pub := "", "", "", ""
		if b.Category != nil {
			cat = b.Category.Name
		}
		for _, t := range b.TagsR {
			if tags != "" {
				tags += ", "
			}
			tags += t.Name
		}
		if b.Detail != nil {
			detail = b.Detail.Content
		}
		if b.Pubdate != nil {
			pub = *b.Pubdate
		}
		video, fav := "否", "否"
		if b.IsVideo {
			video = "是"
		}
		if b.IsFavorite {
			fav = "是"
		}
		vals := []interface{}{
			b.ID, b.Title, b.URL, cat, tags, b.Author, b.Collection, pub,
			b.Duration, video, fav, b.Favicon, b.Cover, detail,
			b.CreatedAt.Format("2006-01-02 15:04:05"),
		}
		for j, v := range vals {
			cell, _ := excelize.CoordinatesToCellName(j+1, row)
			f.SetCellValue(sheet, cell, v)
		}
	}
	// 列宽
	widths := []float64{8, 40, 50, 12, 20, 14, 14, 14, 10, 10, 10, 30, 30, 60, 20}
	for i, w := range widths {
		col, _ := excelize.ColumnNumberToName(i + 1)
		f.SetColWidth(sheet, col, col, w)
	}
	// 表头加粗
	if styleID, err := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}}); err == nil {
		f.SetRowStyle(sheet, 1, 1, styleID)
	}

	buf, err := f.WriteToBuffer()
	if err != nil {
		c.JSON(500, gin.H{"error": "导出失败"})
		return
	}
	fname := fmt.Sprintf("bookmarks-%s.xlsx", time.Now().Format("20060102-150405"))
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fname))
	c.Data(200, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf.Bytes())
}

// getBookmark 按 id 获取单个书签（含分类、标签、详情），供前端详情页 /page/{id} 使用
func getBookmark(c *gin.Context) {
	id := c.Param("id")
	var b Bookmark
	if err := DB.Preload("Category").Preload("TagsR").Preload("Detail").First(&b, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "书签不存在"})
		return
	}
	c.JSON(200, gin.H{"bookmark": b})
}

// setFavorite 设置书签收藏状态（星标）：body { "favorite": true|false }
func setFavorite(c *gin.Context) {
	id := c.Param("id")
	var inp struct {
		Favorite *bool `json:"favorite"`
	}
	if err := c.ShouldBindJSON(&inp); err != nil || inp.Favorite == nil {
		c.JSON(400, gin.H{"error": "缺少 favorite 参数"})
		return
	}
	var b Bookmark
	if err := DB.First(&b, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "书签不存在"})
		return
	}
	b.IsFavorite = *inp.Favorite
	if err := DB.Save(&b).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	DB.Preload("Category").Preload("TagsR").Preload("Detail").First(&b, b.ID)
	c.JSON(200, gin.H{"bookmark": b})
}

// deleteBookmark 删除书签（软删除 → 进回收站；详情/标签关联保留，恢复后完整还原）
func deleteBookmark(c *gin.Context) {
	id := c.Param("id")
	res := DB.Delete(&Bookmark{}, id)
	if res.Error != nil {
		c.JSON(500, gin.H{"error": res.Error.Error()})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "书签不存在"})
		return
	}
	c.JSON(200, gin.H{"message": "已移入回收站"})
}

// listTrash 回收站列表：已软删除的书签（按删除时间倒序）
func listTrash(c *gin.Context) {
	var list []Bookmark
	DB.Unscoped().Where("deleted_at IS NOT NULL").Order("deleted_at desc").
		Preload("Category").Preload("TagsR").Find(&list)

	type trashItem struct {
		ID        uint     `json:"id"`
		Title     string   `json:"title"`
		URL       string   `json:"url"`
		Category  string   `json:"category"`
		Tags      []string `json:"tags"`
		DeletedAt string   `json:"deleted_at"`
	}
	items := make([]trashItem, 0, len(list))
	for _, b := range list {
		cat := ""
		if b.Category != nil {
			cat = b.Category.Name
		}
		tags := make([]string, 0, len(b.TagsR))
		for _, t := range b.TagsR {
			tags = append(tags, t.Name)
		}
		del := ""
		if b.DeletedAt.Valid {
			del = b.DeletedAt.Time.Format("2006-01-02 15:04:05")
		}
		items = append(items, trashItem{ID: b.ID, Title: b.Title, URL: b.URL, Category: cat, Tags: tags, DeletedAt: del})
	}
	c.JSON(200, gin.H{"items": items, "total": len(items)})
}

// restoreBookmark 恢复回收站中的书签（清除软删除标记，详情/标签/收藏等全部还原）
func restoreBookmark(c *gin.Context) {
	id := c.Param("id")
	res := DB.Unscoped().Model(&Bookmark{}).Where("id = ?", id).Update("deleted_at", nil)
	if res.Error != nil {
		c.JSON(500, gin.H{"error": res.Error.Error()})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "书签不存在"})
		return
	}
	c.JSON(200, gin.H{"message": "已恢复"})
}

// purgeBookmark 彻底删除（不可恢复）：清除书签、详情与标签关联
func purgeBookmark(c *gin.Context) {
	id := c.Param("id")
	DB.Where("bookmark_id = ?", id).Delete(&BookmarkDetail{})
	DB.Exec("DELETE FROM bookmark_tags WHERE bookmark_id = ?", id)
	res := DB.Unscoped().Delete(&Bookmark{}, id)
	if res.Error != nil {
		c.JSON(500, gin.H{"error": res.Error.Error()})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(404, gin.H{"error": "书签不存在"})
		return
	}
	c.JSON(200, gin.H{"message": "已彻底删除"})
}

// updateBookmark 修改书签（按 id 更新）；支持 category_id 与 tag_ids
func updateBookmark(c *gin.Context) {
	id := c.Param("id")
	var inp bookmarkInput
	if err := c.ShouldBindJSON(&inp); err != nil {
		c.JSON(400, gin.H{"error": "请求格式错误"})
		return
	}
	inp.Title = strings.TrimSpace(inp.Title)
	inp.URL = strings.TrimSpace(inp.URL)
	inp.Favicon = strings.TrimSpace(inp.Favicon)
	inp.Author = strings.TrimSpace(inp.Author)
	inp.Collection = strings.TrimSpace(inp.Collection)
	inp.Cover = strings.TrimSpace(inp.Cover)
	if inp.Title == "" || inp.URL == "" {
		c.JSON(400, gin.H{"error": "标题和网址不能为空"})
		return
	}
	var b Bookmark
	if err := DB.First(&b, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "书签不存在"})
		return
	}
	// 若修改了 URL，需检查是否与其它书签冲突（url 有唯一索引）
	if inp.URL != b.URL {
		var dup Bookmark
		if err := DB.Where("url = ? AND id <> ?", inp.URL, id).First(&dup).Error; err == nil {
			c.JSON(409, gin.H{"error": "该网址已存在于其它书签"})
			return
		}
	}
	def := getDefaultCategory(DB)
	b.Title = inp.Title
	b.URL = inp.URL
	b.Favicon = downloadIcon(inp.URL, inp.Favicon, 15*time.Second)
	if inp.CategoryID != nil {
		b.CategoryID = inp.CategoryID
	}
	b.Author = inp.Author
	b.Collection = inp.Collection
	if inp.Pubdate != nil {
		b.Pubdate = inp.Pubdate
	}
	if inp.IsVideo {
		if cov := downloadImage(inp.Cover, "covers", 15*time.Second); cov != "" {
			b.Cover = cov
		}
	} else {
		b.Cover = inp.Cover
	}
	b.IsVideo = inp.IsVideo
	b.Duration = strings.TrimSpace(inp.Duration)
	if err := syncBookmarkTags(DB, &b, inp.TagIDs, inp.Tags, def.ID); err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	if err := DB.Save(&b).Error; err != nil {
		c.JSON(500, gin.H{"error": err.Error()})
		return
	}
	upsertBookmarkDetail(DB, b.ID, inp.Detail)
	DB.Preload("Category").Preload("TagsR").Preload("Detail").First(&b, b.ID)
	c.JSON(200, gin.H{"message": "更新成功", "bookmark": b})
}

// updateDetail 仅更新书签详情正文（富文本），不影响标题/网址等其它字段
func updateDetail(c *gin.Context) {
	id := c.Param("id")
	var inp struct {
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&inp); err != nil {
		c.JSON(400, gin.H{"error": "请求格式错误"})
		return
	}
	var b Bookmark
	if err := DB.First(&b, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "书签不存在"})
		return
	}
	upsertBookmarkDetail(DB, b.ID, inp.Content)
	DB.Preload("Category").Preload("TagsR").Preload("Detail").First(&b, b.ID)
	c.JSON(200, gin.H{"message": "更新成功", "bookmark": b})
}

// batchUpdateBookmarks 批量操作：对「当前筛选条件下所有匹配」的书签生效（非仅当前页展示）
// body: { filter:{category_id,tag_ids,is_video,q,favorite}, set_category?, add_tags?[], remove_tags?[], favorite?bool, delete?bool }
func batchUpdateBookmarks(c *gin.Context) {
	var inp struct {
		Filter struct {
			CategoryID *int  `json:"category_id"` // nil=不过滤分类
			TagIDs     []int `json:"tag_ids"`
			IsVideo    bool  `json:"is_video"`
			Q          string `json:"q"`
			Favorite   bool  `json:"favorite"`
		} `json:"filter"`
		SetCategory *int  `json:"set_category"` // nil=不变；非 nil 设该分类（0=默认）
		AddTags     []int `json:"add_tags"`
		RemoveTags  []int `json:"remove_tags"`
		Favorite    *bool `json:"favorite"` // nil=不变
		Delete      bool  `json:"delete"`
	}
	if err := c.ShouldBindJSON(&inp); err != nil {
		c.JSON(400, gin.H{"error": "请求格式错误"})
		return
	}

	// 构建与主页一致的筛选条件（搜索用 LIKE，普通用精确过滤）
	var base *gorm.DB
	q := strings.TrimSpace(inp.Filter.Q)
	if q != "" {
		like := "%" + q + "%"
		base = DB.Model(&Bookmark{}).Where("title LIKE ? OR url LIKE ? OR tags LIKE ?", like, like, like)
	} else {
		base = DB.Model(&Bookmark{})
	}
	if inp.Filter.CategoryID != nil {
		base = base.Where("category_id = ?", *inp.Filter.CategoryID)
	}
	if len(inp.Filter.TagIDs) > 0 {
		base = applyTagFilter(base, inp.Filter.TagIDs)
	}
	if inp.Filter.IsVideo {
		base = base.Where("is_video = ?", true)
	}
	if inp.Filter.Favorite {
		base = base.Where("is_favorite = ?", true)
	}

	var total int64
	base.Count(&total)
	if total == 0 {
		c.JSON(200, gin.H{"affected": 0, "message": "没有符合条件的书签"})
		return
	}

	// 删除（软删除 → 进回收站；详情/标签关联保留，恢复后可完整还原）
	if inp.Delete {
		var ids []int
		base.Pluck("id", &ids)
		DB.Delete(&Bookmark{}, ids)
		c.JSON(200, gin.H{"affected": len(ids), "message": "已移入回收站 " + strconv.Itoa(len(ids)) + " 条书签"})
		return
	}

	affected := total

	// 取出匹配 id 列表，后续按 id 批量更新（避免带筛选条件时 UPDATE 的列歧义）
	var matchIDs []int
	base.Pluck("id", &matchIDs)

	// 设置分类
	if inp.SetCategory != nil {
		val := *inp.SetCategory
		if val == 0 {
			def := getDefaultCategory(DB)
			val = int(def.ID)
		}
		if len(matchIDs) > 0 {
			if tx := DB.Model(&Bookmark{}).Where("id IN ?", matchIDs).Update("category_id", val); tx.Error != nil {
				c.JSON(500, gin.H{"error": tx.Error.Error()})
				return
			}
		}
	}

	// 收藏状态
	if inp.Favorite != nil {
		if len(matchIDs) > 0 {
			if tx := DB.Model(&Bookmark{}).Where("id IN ?", matchIDs).Update("is_favorite", *inp.Favorite); tx.Error != nil {
				c.JSON(500, gin.H{"error": tx.Error.Error()})
				return
			}
		}
	}

	// 标签：逐条追加 / 移除关联，并刷新冗余 tags 字符串
	if len(inp.AddTags) > 0 || len(inp.RemoveTags) > 0 {
		ids := matchIDs
		var addModels, removeModels []Tag
		if len(inp.AddTags) > 0 {
			DB.Where("id IN ?", inp.AddTags).Find(&addModels)
		}
		if len(inp.RemoveTags) > 0 {
			DB.Where("id IN ?", inp.RemoveTags).Find(&removeModels)
		}
		for _, id := range ids {
			var b Bookmark
			if err := DB.Preload("TagsR").First(&b, id).Error; err != nil {
				continue
			}
			if len(addModels) > 0 {
				if err := DB.Model(&b).Association("TagsR").Append(addModels); err != nil {
					c.JSON(500, gin.H{"error": err.Error()})
					return
				}
			}
			if len(removeModels) > 0 {
				if err := DB.Model(&b).Association("TagsR").Delete(removeModels); err != nil {
					c.JSON(500, gin.H{"error": err.Error()})
					return
				}
			}
			var tags []Tag
			DB.Model(&b).Association("TagsR").Find(&tags)
			names := make([]string, 0, len(tags))
			for _, t := range tags {
				names = append(names, t.Name)
			}
			b.Tags = strings.Join(names, ",")
			DB.Model(&Bookmark{}).Where("id = ?", id).Update("tags", b.Tags)
		}
	}

	c.JSON(200, gin.H{"affected": affected, "message": "已更新 " + strconv.Itoa(int(affected)) + " 条书签"})
}

// listCategories 分类列表（「默认」分类固定置顶，其余按名称排序）
func listCategories(c *gin.Context) {
	var list []Category
	DB.Order("CASE WHEN name = '" + defaultCategoryName + "' THEN 0 ELSE 1 END, name").Find(&list)
	c.JSON(200, list)
}

// createCategory 新建分类
func createCategory(c *gin.Context) {
	var inp struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&inp); err != nil || strings.TrimSpace(inp.Name) == "" {
		c.JSON(400, gin.H{"error": "分类名称不能为空"})
		return
	}
	name := strings.TrimSpace(inp.Name)
	var existing Category
	if err := DB.Where("name = ?", name).First(&existing).Error; err == nil {
		c.JSON(200, gin.H{"message": "已存在", "category": existing})
		return
	}
	cat := Category{Name: name}
	DB.Create(&cat)
	c.JSON(201, gin.H{"message": "创建成功", "category": cat})
}

// listTags 标签列表（可按分类过滤）
func listTags(c *gin.Context) {
	q := DB.Order("name")
	if cat := c.Query("category_id"); cat != "" {
		if id, err := strconv.Atoi(cat); err == nil {
			q = q.Where("category_id = ?", id)
		}
	}
	var list []Tag
	q.Find(&list)
	c.JSON(200, list)
}

// createTag 新建标签
func createTag(c *gin.Context) {
	var inp struct {
		Name       string `json:"name"`
		CategoryID *uint  `json:"category_id"`
	}
	if err := c.ShouldBindJSON(&inp); err != nil || strings.TrimSpace(inp.Name) == "" {
		c.JSON(400, gin.H{"error": "标签名称不能为空"})
		return
	}
	name := strings.TrimSpace(inp.Name)
	def := getDefaultCategory(DB)
	catID := inp.CategoryID
	if catID == nil {
		catID = &def.ID
	}
	var existing Tag
	if err := DB.Where("name = ? AND category_id = ?", name, *catID).First(&existing).Error; err == nil {
		c.JSON(200, gin.H{"message": "已存在", "tag": existing})
		return
	}
	t := Tag{Name: name, CategoryID: catID}
	DB.Create(&t)
	c.JSON(201, gin.H{"message": "创建成功", "tag": t})
}

// renameCategory 分类重命名
func renameCategory(c *gin.Context) {
	id := c.Param("id")
	var inp struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&inp); err != nil || strings.TrimSpace(inp.Name) == "" {
		c.JSON(400, gin.H{"error": "分类名称不能为空"})
		return
	}
	name := strings.TrimSpace(inp.Name)
	var dup Category
	if err := DB.Where("name = ? AND id <> ?", name, id).First(&dup).Error; err == nil {
		c.JSON(409, gin.H{"error": "分类名称已存在"})
		return
	}
	var cat Category
	if err := DB.First(&cat, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "分类不存在"})
		return
	}
	cat.Name = name
	DB.Save(&cat)
	c.JSON(200, gin.H{"message": "更新成功", "category": cat})
}

// deleteCategory 删除分类（其下书签改挂默认分类，级联删除标签与关联）
func deleteCategory(c *gin.Context) {
	id := c.Param("id")
	var cat Category
	if err := DB.First(&cat, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "分类不存在"})
		return
	}
	if cat.Name == "默认" {
		c.JSON(400, gin.H{"error": "默认分类不能删除"})
		return
	}
	if isCategoryProtected(cat.Name) {
		c.JSON(400, gin.H{"error": "该分类已在默认配置中，不允许删除"})
		return
	}
	def := getDefaultCategory(DB)
	DB.Model(&Bookmark{}).Where("category_id = ?", cat.ID).Update("category_id", def.ID)
	var tags []Tag
	DB.Where("category_id = ?", cat.ID).Find(&tags)
	for _, t := range tags {
		DB.Exec("DELETE FROM bookmark_tags WHERE tag_id = ?", t.ID)
	}
	DB.Where("category_id = ?", cat.ID).Delete(&Tag{})
	DB.Delete(&cat)
	c.JSON(200, gin.H{"message": "删除成功"})
}

// renameTag 标签重命名（可同时改所属分类）
func renameTag(c *gin.Context) {
	id := c.Param("id")
	var inp struct {
		Name       string `json:"name"`
		CategoryID *uint  `json:"category_id"`
	}
	if err := c.ShouldBindJSON(&inp); err != nil || strings.TrimSpace(inp.Name) == "" {
		c.JSON(400, gin.H{"error": "标签名称不能为空"})
		return
	}
	name := strings.TrimSpace(inp.Name)
	var tag Tag
	if err := DB.First(&tag, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "标签不存在"})
		return
	}
	catID := tag.CategoryID
	if inp.CategoryID != nil {
		catID = inp.CategoryID
	}
	var dup Tag
	if err := DB.Where("name = ? AND category_id = ? AND id <> ?", name, catID, id).First(&dup).Error; err == nil {
		c.JSON(409, gin.H{"error": "该分类下标签已存在"})
		return
	}
	tag.Name = name
	tag.CategoryID = catID
	DB.Save(&tag)
	c.JSON(200, gin.H{"message": "更新成功", "tag": tag})
}

// deleteTag 删除标签（清理多对多关联）
func deleteTag(c *gin.Context) {
	id := c.Param("id")
	var tag Tag
	if err := DB.First(&tag, id).Error; err != nil {
		c.JSON(404, gin.H{"error": "标签不存在"})
		return
	}
	catName := ""
	if tag.CategoryID != nil {
		var tc Category
		if err := DB.First(&tc, *tag.CategoryID).Error; err == nil {
			catName = tc.Name
		}
	}
	if isTagProtected(catName, tag.Name) {
		c.JSON(400, gin.H{"error": "该标签已在默认配置中，不允许删除"})
		return
	}
	DB.Exec("DELETE FROM bookmark_tags WHERE tag_id = ?", tag.ID)
	DB.Delete(&tag)
	c.JSON(200, gin.H{"message": "删除成功"})
}

// listProtected 返回默认配置中受保护（不可删除）的分类与标签，供前端删除前查询提示。
// 来源：编译进二进制的 backend/tags.toml（系统默认）+ 运行时 data/default-tags.toml（用户自定义）。
func listProtected(c *gin.Context) {
	cats := make([]string, 0, len(protectedCategories))
	for name := range protectedCategories {
		cats = append(cats, name)
	}
	type protectedTag struct {
		Category string `json:"category"`
		Name     string `json:"name"`
	}
	tags := make([]protectedTag, 0, len(protectedTags))
	for catName, m := range protectedTags {
		for tagName := range m {
			tags = append(tags, protectedTag{Category: catName, Name: tagName})
		}
	}
	c.JSON(200, gin.H{"categories": cats, "tags": tags})
}

// （提取规则功能已迁移到浏览器插件本地 storage，后端不再持久化 extract_rule）
