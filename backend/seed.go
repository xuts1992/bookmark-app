package main

import (
	_ "embed"
	"log"
	"os"
	"path/filepath"
	"strings"

	"gorm.io/gorm"
)

// seedCategory 对应 default-tags.toml 中一个 [分类] 块及其标签
type seedCategory struct {
	Name string
	Tags []string
}
type seedData struct {
	Categories []seedCategory
}

// defaultCategoryName 名称（默认分类）：出现在任何 [分类] 段之外的标签
// （即未归属任何分类的数据）会被归入此分类，而非被丢弃。
const defaultCategoryName = "默认"

// 受保护集合：启动时从配置文件加载，用于「配置中存在则禁止删除」的拦截判断
var (
	protectedCategories = map[string]bool{}            // category name -> 受保护
	protectedTags       = map[string]map[string]bool{} // category name -> (tag name -> 受保护)
	parsedSeed          seedData                       // 原始解析结果，供启动补建使用
)

// systemDefaultTags 编译进二进制的系统默认标签配置（backend/tags.toml）。
// 作为不可编辑的内置默认，每次启动都会与「用户自定义的 default-tags.toml」合并后补建进数据库。
//
//go:embed tags.toml
var systemDefaultTags string

// defaultTagsPath 返回用户自定义配置（default-tags.toml）路径：用户数据统一放在 data 目录，
// 优先取 data/default-tags.toml（exe 同级 → 当前目录 → 上级目录），找不到再回退旧位置（历史部署兼容）。
func defaultTagsPath() string {
	var candidates []string
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "data", "default-tags.toml"))
	}
	candidates = append(candidates, filepath.Join("data", "default-tags.toml"))
	candidates = append(candidates, filepath.Join("..", "data", "default-tags.toml"))
	// 旧位置回退（历史部署：default-tags.toml 与 exe 同级 / 当前目录 / 上级目录）
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "default-tags.toml"))
	}
	candidates = append(candidates, filepath.Join(".", "default-tags.toml"))
	candidates = append(candidates, filepath.Join("..", "default-tags.toml"))
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	if len(candidates) > 0 {
		return candidates[0]
	}
	return filepath.Join("data", "default-tags.toml")
}

// loadDefaultTags 合并两类配置并填充受保护集合（供删除拦截使用）：
//   1) 系统默认：编译进二进制的 backend/tags.toml（不可编辑的内置默认）；
//   2) 用户自定义：运行时读取的 default-tags.toml（可随部署修改）。
// 两者按「分类名合并、标签去重」的规则合并，结果用于启动时补建数据库与删除保护。
// 任一来源缺失/解析失败时仅告警，不阻断启动。
func loadDefaultTags() {
	// 1) 系统默认（嵌入二进制，随 exe 分发，不可编辑）
	embedSeed := loadEmbeddedDefaultTags()

	// 2) 用户自定义（运行时文件）
	userSeed := seedData{}
	if path := defaultTagsPath(); path != "" {
		if data, err := os.ReadFile(path); err == nil {
			if sd, err := parseDefaultTags(data); err == nil {
				userSeed = sd
			} else {
				log.Printf("⚠️ 用户自定义标签配置解析失败 %s: %v", path, err)
			}
		} else {
			log.Printf("⚠️ 未找到用户自定义标签配置 %s（将仅使用内置默认）: %v", path, err)
		}
	}

	// 3) 合并两类配置
	parsedSeed = mergeSeedData(embedSeed, userSeed)

	// 4) 构建受保护集合（两者并集：内置 + 用户自定义均禁止删除）
	protectedCategories = map[string]bool{}
	protectedTags = map[string]map[string]bool{}
	for _, sd := range allSeeds(embedSeed, userSeed) {
		for _, c := range sd.Categories {
			protectedCategories[c.Name] = true
			if protectedTags[c.Name] == nil {
				protectedTags[c.Name] = map[string]bool{}
			}
			for _, t := range c.Tags {
				protectedTags[c.Name][t] = true
			}
		}
	}

	log.Printf("✓ 已加载标签配置（系统内置 %d 分类 / 用户自定义 %d 分类），合并后 %d 分类 / %d 标签项",
		len(embedSeed.Categories), len(userSeed.Categories),
		len(parsedSeed.Categories), countSeedTags(parsedSeed))
}

// allSeeds 返回两个配置源，供遍历构建受保护集合。
func allSeeds(a, b seedData) []seedData {
	return []seedData{a, b}
}

// loadEmbeddedDefaultTags 返回编译进二进制的系统默认标签配置（backend/tags.toml）。
func loadEmbeddedDefaultTags() seedData {
	sd, err := parseDefaultTags([]byte(systemDefaultTags))
	if err != nil {
		log.Printf("⚠️ 内置默认标签配置(tags.toml)解析失败: %v", err)
		return seedData{}
	}
	return sd
}

// mergeSeedData 按「同名分类合并、标签去重」合并两份配置，返回合并结果。
func mergeSeedData(a, b seedData) seedData {
	merged := seedData{}
	index := map[string]int{}
	for _, src := range []seedData{a, b} {
		for _, c := range src.Categories {
			i, ok := index[c.Name]
			if !ok {
				merged.Categories = append(merged.Categories, seedCategory{Name: c.Name})
				i = len(merged.Categories) - 1
				index[c.Name] = i
			}
			have := map[string]bool{}
			for _, t := range merged.Categories[i].Tags {
				have[t] = true
			}
			for _, t := range c.Tags {
				if !have[t] {
					merged.Categories[i].Tags = append(merged.Categories[i].Tags, t)
					have[t] = true
				}
			}
		}
	}
	// 保证「默认」分类排在最前（置顶），无论它来自哪份配置、出现在什么位置
	for i := range merged.Categories {
		if merged.Categories[i].Name == defaultCategoryName && i > 0 {
			c := merged.Categories[i]
			merged.Categories = append(merged.Categories[:i], merged.Categories[i+1:]...)
			merged.Categories = append([]seedCategory{c}, merged.Categories...)
			break
		}
	}
	return merged
}

// parseDefaultTags 按行解析 default-tags.toml：
// 以 [分类名] 作为分类标题，其下方每行一个标签；空行与 # 开头的注释会被忽略。
// 出现在任何 [分类] 段之前、未归属任何分类的标签，会被惰性归入「默认」分类（而非丢弃）。
// 该格式并非严格 TOML，故采用自定义解析而非 toml 库。
func parseDefaultTags(data []byte) (seedData, error) {
	sd := seedData{}
	current := -1 // 当前分类在 sd.Categories 中的下标，-1 表示尚未遇到分类标题
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			name := strings.TrimSpace(line[1 : len(line)-1])
			if name == "" {
				continue
			}
			sd.Categories = append(sd.Categories, seedCategory{Name: name})
			current = len(sd.Categories) - 1
			continue
		}
		if current < 0 {
			// 出现在任何 [分类] 之前的标签行：归入「默认」分类，而非丢弃
			idx := -1
			for i, c := range sd.Categories {
				if c.Name == defaultCategoryName {
					idx = i
					break
				}
			}
			if idx < 0 {
				// 新创建的「默认」分类置于最前，使其在筛选/下拉列表中默认排在最上方
				sd.Categories = append([]seedCategory{{Name: defaultCategoryName}}, sd.Categories...)
				idx = 0
				current = idx
			}
			sd.Categories[idx].Tags = append(sd.Categories[idx].Tags, line)
			continue
		}
		sd.Categories[current].Tags = append(sd.Categories[current].Tags, line)
	}
	return sd, nil
}

// countSeedTags 统计配置中标签项总数（仅用于日志）
func countSeedTags(sd seedData) int {
	n := 0
	for _, c := range sd.Categories {
		n += len(c.Tags)
	}
	return n
}

// ensureDefaultTags 启动时把配置中「数据库尚未存在」的分类/标签补建进去（FirstOrCreate，幂等）。
func ensureDefaultTags(db *gorm.DB) {
	for _, sc := range parsedSeed.Categories {
		var cat Category
		db.Where("name = ?", sc.Name).FirstOrCreate(&cat, Category{Name: sc.Name})
		for _, tn := range sc.Tags {
			var tag Tag
			db.Where("name = ? AND category_id = ?", tn, cat.ID).
				FirstOrCreate(&tag, Tag{Name: tn, CategoryID: &cat.ID})
		}
	}
}

// isCategoryProtected 分类名是否在默认配置中（存在则删除前应拦截）
func isCategoryProtected(name string) bool {
	return protectedCategories[name]
}

// isTagProtected 标签（按所属分类名 + 标签名）是否在默认配置中
func isTagProtected(catName, tagName string) bool {
	if m, ok := protectedTags[catName]; ok {
		return m[tagName]
	}
	return false
}
