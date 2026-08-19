package main

import (
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

// resourceDir 资源（图标/封面）本地目录绝对路径，提供 /resource 静态访问
var resourceDir string

// DB 全局数据库句柄（handler / 迁移 / 调度器共用）
var DB *gorm.DB

// Bookmark 书签模型
type Bookmark struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	Title      string    `json:"title" gorm:"not null"`
	// url 不用唯一索引：软删除后已删记录仍占索引，会导致「删了再收藏同一网址」失败；逻辑唯一性由 createBookmark 的 Where(url) 查重保证
	URL        string    `json:"url" gorm:"not null"`
	Favicon    string    `json:"favicon" gorm:"default:''"`
	Author     string    `json:"author" gorm:"default:''"`     // 作者
	Collection string    `json:"collection" gorm:"default:''"` // 合集
	Cover      string    `json:"cover" gorm:"default:''"`       // 封面图片地址
	IsVideo    bool      `json:"is_video" gorm:"default:false"` // 是否为视频收藏
	IsFavorite bool      `json:"is_favorite" gorm:"default:false"` // 是否收藏（星标）；默认否
	Duration   string    `json:"duration" gorm:"default:''"`    // 视频时长（如 12:34），用于视频卡片角标
	Pubdate    *string   `json:"pubdate" gorm:"type:varchar(32)"` // 发布时间（可空，如 2024-01-15 或 Unix 时间戳字符串）
	Tags       string    `json:"tags" gorm:"default:''"`        // 冗余展示字段（标签名逗号拼接）
	CategoryID *uint     `json:"category_id"`                   // 外键 → categories.id（可空）
	Category   *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	TagsR      []Tag     `json:"tag_list,omitempty" gorm:"many2many:bookmark_tags;"`
	Detail     *BookmarkDetail `json:"detail,omitempty" gorm:"foreignKey:BookmarkID"`
	CreatedAt  time.Time `json:"created_at"`
	// 软删除：删除进回收站；普通查询自动排除已删除行，回收站用 Unscoped 访问
	DeletedAt gorm.DeletedAt `json:"-" gorm:"index"`
}

// BookmarkDetail 书签详情表（一对一外键关联 Bookmark，Content 存放大文本）
type BookmarkDetail struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	BookmarkID uint      `json:"bookmark_id" gorm:"uniqueIndex;not null"` // 一对一：每个书签仅一条详情
	Bookmark   *Bookmark `json:"bookmark,omitempty" gorm:"foreignKey:BookmarkID"`
	Content    string    `json:"content" gorm:"type:text"` // 大文本字段（正文/长描述等）
}

// Category 分类表
type Category struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	Name      string    `json:"name" gorm:"uniqueIndex;not null"`
	CreatedAt time.Time `json:"created_at"`
	Tags      []Tag     `json:"tags,omitempty" gorm:"foreignKey:CategoryID"`
}

// Tag 标签表（外键关联分类；与书签多对多）
type Tag struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	Name       string    `json:"name" gorm:"not null"`
	CategoryID *uint     `json:"category_id"` // 外键 → categories.id（可空）
	Category   *Category `json:"category,omitempty" gorm:"foreignKey:CategoryID"`
	CreatedAt  time.Time `json:"created_at"`
}

// Setting 单例配置（id 固定为 1）：资源同步相关开关
//   - SyncEnabled：是否定时同步下载封面和图标（默认 false）
//   - SyncIntervalMinutes：同步间隔（分钟），开启同步后生效
type Setting struct {
	ID                  uint `json:"id" gorm:"primaryKey"`
	SyncEnabled         bool `json:"sync_enabled"`
	SyncIntervalMinutes int  `json:"sync_interval_minutes"`
}

// bookmarkInput 书签写入参数（兼容旧插件的 tags 字符串，也支持结构化 category_id / tag_ids）
type bookmarkInput struct {
	Title      string `json:"title"`
	URL        string `json:"url"`
	Favicon    string `json:"favicon"`
	Author     string `json:"author"`
	Collection string `json:"collection"`
	Cover      string `json:"cover"`
	IsVideo    bool   `json:"is_video"`
	Duration   string `json:"duration"`
	Detail     string  `json:"detail"`
	Pubdate    *string `json:"pubdate"`
	Tags       string  `json:"tags"`
	CategoryID *uint  `json:"category_id"`
	TagIDs     []uint `json:"tag_ids"`
}

// parseTagIDs 解析多个 tag_id 查询参数（同一键可重复出现，如 ?tag_id=1&tag_id=2）
func parseTagIDs(values []string) []int {
	var ids []int
	for _, s := range values {
		s = strings.TrimSpace(s)
		if s == "" {
			continue
		}
		if id, err := strconv.Atoi(s); err == nil {
			ids = append(ids, id)
		}
	}
	return ids
}

// applyTagFilter 按多个标签过滤（AND 语义：书签须同时拥有所有给定标签）
func applyTagFilter(base *gorm.DB, tagIDs []int) *gorm.DB {
	for _, id := range tagIDs {
		base = base.Where("id IN (SELECT bookmark_id FROM bookmark_tags WHERE tag_id = ?)", id)
	}
	return base
}
