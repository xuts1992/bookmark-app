package main

import (
	"strings"

	"gorm.io/gorm"
)

// upsertBookmarkDetail 写入/更新书签详情（按 bookmark_id 唯一，存在则更新，否则新建）
func upsertBookmarkDetail(db *gorm.DB, bookmarkID uint, content string) {
	var d BookmarkDetail
	res := db.Where("bookmark_id = ?", bookmarkID).First(&d)
	if res.Error == nil {
		d.Content = content
		db.Save(&d)
	} else {
		db.Create(&BookmarkDetail{BookmarkID: bookmarkID, Content: content})
	}
}

// getDefaultCategory 取得或创建默认分类「默认」
func getDefaultCategory(db *gorm.DB) Category {
	var c Category
	db.Where("name = ?", "默认").FirstOrCreate(&c, Category{Name: "默认"})
	return c
}

// syncBookmarkTags 同步书签与标签的多对多关系，并刷新冗余 tags 字符串
func syncBookmarkTags(db *gorm.DB, b *Bookmark, tagIDs []uint, tagsStr string, defCatID uint) error {
	var tags []Tag
	if len(tagIDs) > 0 {
		db.Where("id IN ?", tagIDs).Find(&tags)
	} else if strings.TrimSpace(tagsStr) != "" {
		for _, n := range strings.Split(tagsStr, ",") {
			n = strings.TrimSpace(n)
			if n == "" {
				continue
			}
			var t Tag
			db.Where("name = ? AND category_id = ?", n, defCatID).
				FirstOrCreate(&t, Tag{Name: n, CategoryID: &defCatID})
			tags = append(tags, t)
		}
	}
	if err := db.Model(b).Association("TagsR").Replace(tags); err != nil {
		return err
	}
	names := make([]string, 0, len(tags))
	for _, t := range tags {
		names = append(names, t.Name)
	}
	b.Tags = strings.Join(names, ",")
	return nil
}

// migrateData 一次性迁移：预置分类、为已有书签补全分类与标签关联
func migrateData(db *gorm.DB) {
	def := getDefaultCategory(db)
	for _, n := range []string{"开发", "设计", "资讯", "工具"} {
		var c Category
		db.Where("name = ?", n).FirstOrCreate(&c, Category{Name: n})
	}
	var books []Bookmark
	db.Find(&books)
	for i := range books {
		b := &books[i]
		if b.CategoryID == nil {
			id := def.ID
			b.CategoryID = &id
		}
		if strings.TrimSpace(b.Tags) != "" {
			var cnt int64
			db.Table("bookmark_tags").Where("bookmark_id = ?", b.ID).Count(&cnt)
			if cnt == 0 {
				_ = syncBookmarkTags(db, b, nil, b.Tags, def.ID)
			}
		}
		db.Save(b)
	}
}

// ensureSettingRow 确保单例设置行（id=1）存在，返回当前设置
func ensureSettingRow(db *gorm.DB) Setting {
	var s Setting
	res := db.Where("id = ?", 1).First(&s)
	if res.Error != nil {
		s = Setting{ID: 1, SyncEnabled: false, SyncIntervalMinutes: 60}
		db.Create(&s)
	}
	return s
}
