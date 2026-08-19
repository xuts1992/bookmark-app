package main

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/gorm"
)

// extFromContentType 依据 MIME 类型推断图片扩展名
func extFromContentType(ct string) string {
	switch {
	case strings.Contains(ct, "png"):
		return ".png"
	case strings.Contains(ct, "jpeg"), strings.Contains(ct, "jpg"):
		return ".jpg"
	case strings.Contains(ct, "webp"):
		return ".webp"
	case strings.Contains(ct, "gif"):
		return ".gif"
	case strings.Contains(ct, "svg"):
		return ".svg"
	case strings.Contains(ct, "x-icon"), strings.Contains(ct, "ico"):
		return ".ico"
	case strings.Contains(ct, "bmp"):
		return ".bmp"
	default:
		return ".png"
	}
}

// downloadImage 将远程图片下载到本地并按「内容 hash + 格式」命名，返回相对路径（/resource/...）。
// 文件名取图片内容的 SHA-256 前 16 位十六进制，因此内容相同的图片只会保存一份（天然去重）。
// 若 url 为空返回 ""；若非 http(s)（已是本地或相对路径）原样返回；下载/校验失败则回退为原始 url。
func downloadImage(rawURL, subdir string, timeout time.Duration) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		syncLog.Printf("downloadImage：URL 为空，直接返回空（subdir=%s）", subdir)
		return ""
	}
	if !strings.HasPrefix(rawURL, "http://") && !strings.HasPrefix(rawURL, "https://") {
		syncLog.Printf("downloadImage：非 http(s) URL 跳过下载，原样返回（subdir=%s url=%s）", subdir, rawURL)
		return rawURL
	}
	dir := filepath.Join(resourceDir, subdir)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		syncLog.Printf("downloadImage：创建目录失败（subdir=%s dir=%s err=%v）", subdir, dir, err)
		return rawURL
	}
	client := &http.Client{Timeout: timeout}
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		syncLog.Printf("downloadImage：构造请求失败（subdir=%s url=%s err=%v）", subdir, rawURL, err)
		return rawURL
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
	req.Header.Set("Referer", rawURL)
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		syncLog.Printf("下载%s资源失败 %s: %v", subdir, rawURL, err)
		return rawURL
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		syncLog.Printf("downloadImage：读取响应体失败（subdir=%s url=%s err=%v）", subdir, rawURL, err)
		return rawURL
	}
	if len(data) == 0 {
		syncLog.Printf("downloadImage：响应体为空（subdir=%s url=%s）", subdir, rawURL)
		return rawURL
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "image/") {
		ct = http.DetectContentType(data)
		if !strings.HasPrefix(ct, "image/") {
			syncLog.Printf("downloadImage：响应内容不是图片（subdir=%s url=%s ct=%s）", subdir, rawURL, ct)
			return rawURL
		}
	}
	ext := extFromContentType(ct)
	// 内容 hash 命名：相同图片只存一份
	sum := sha256.Sum256(data)
	h := hex.EncodeToString(sum[:])[:16]
	abs := filepath.Join(dir, h+ext)
	rel := "/resource/" + subdir + "/" + h + ext
	if _, err := os.Stat(abs); err == nil {
		return rel // 已存在相同内容文件，直接复用
	}
	if err := os.WriteFile(abs, data, 0o644); err != nil {
		syncLog.Printf("写入%s资源失败 %s: %v", subdir, abs, err)
		return rawURL
	}
	return rel
}

// downloadIcon 将书签图标下载到本地 resource/icons/，文件名以「网页域名」命名（如 www.bilibili.com.ico），
// 因此同一网站只会保存一份图标（按域名去重：新数据若 icons 目录下已有以该域名开头的文件，则直接复用，不重复下载）。
// 返回 /resource/icons/... 相对路径；无域名、非 http(s)、下载失败则回退为传入的原始 favicon（远程 URL 或空）。
func downloadIcon(pageURL, faviconURL string, timeout time.Duration) string {
	host := hostOf(pageURL)
	if host == "" {
		syncLog.Printf("downloadIcon：无法解析域名，回退原始 favicon（pageURL=%s favicon=%s）", pageURL, faviconURL)
		return faviconURL
	}
	// 以域名作为文件名（如 www.bilibili.com），天然按站点去重
	name := strings.ReplaceAll(host, ":", "_")
	dir := filepath.Join(resourceDir, "icons")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		syncLog.Printf("downloadIcon：创建 icons 目录失败（dir=%s err=%v）", dir, err)
		return faviconURL
	}
	// 已存在以该域名开头的图标文件（任意扩展名）→ 直接复用，不重复下载
	if matches, _ := filepath.Glob(filepath.Join(dir, name+".*")); len(matches) > 0 {
		return "/resource/icons/" + filepath.Base(matches[0])
	}
	// 下载源：优先用户显式 favicon，否则按域名取 /favicon.ico
	iconURL := ""
	if u := strings.TrimSpace(faviconURL); strings.HasPrefix(u, "http://") || strings.HasPrefix(u, "https://") {
		iconURL = u
	} else {
		iconURL = "https://" + host + "/favicon.ico"
	}
	client := &http.Client{Timeout: timeout}
	req, err := http.NewRequest("GET", iconURL, nil)
	if err != nil {
		syncLog.Printf("downloadIcon：构造请求失败（host=%s url=%s err=%v）", host, iconURL, err)
		return faviconURL
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
	req.Header.Set("Referer", iconURL)
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		syncLog.Printf("下载图标失败 %s: %v", iconURL, err)
		return faviconURL
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		syncLog.Printf("downloadIcon：读取响应体失败（host=%s url=%s err=%v）", host, iconURL, err)
		return faviconURL
	}
	if len(data) == 0 {
		syncLog.Printf("downloadIcon：响应体为空（host=%s url=%s）", host, iconURL)
		return faviconURL
	}
	ct := resp.Header.Get("Content-Type")
	if !strings.HasPrefix(ct, "image/") {
		ct = http.DetectContentType(data)
	}
	ext := extFromContentType(ct)
	abs := filepath.Join(dir, name+ext)
	rel := "/resource/icons/" + name + ext
	if _, err := os.Stat(abs); err == nil {
		return rel
	}
	if err := os.WriteFile(abs, data, 0o644); err != nil {
		syncLog.Printf("写入图标失败 %s: %v", abs, err)
		return faviconURL
	}
	return rel
}

// hostOf 从网页 URL 中提取域名（host），失败返回空串
func hostOf(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return u.Hostname()
}

// rehashLocalCover 将已存在的本地封面（旧版按书签 id 命名）按内容 hash 重命名为
// /resource/covers/<hash>.<ext>，实现去重；若内容相同的文件已存在则直接复用并删除旧文件。
// 入参 relPath 形如 /resource/covers/<id>.<ext>，返回新的相对路径；失败则原样返回。
func rehashLocalCover(relPath string) string {
	abs := filepath.Join(resourceDir, strings.TrimPrefix(relPath, "/resource/"))
	data, err := os.ReadFile(abs)
	if err != nil {
		syncLog.Printf("rehashLocalCover：读取本地封面失败（rel=%s err=%v）", relPath, err)
		return relPath
	}
	sum := sha256.Sum256(data)
	h := hex.EncodeToString(sum[:])[:16]
	ext := filepath.Ext(abs)
	if ext == "" {
		ext = ".jpg"
	}
	dir := filepath.Dir(abs)
	newAbs := filepath.Join(dir, h+ext)
	newRel := "/resource/covers/" + h + ext
	if newAbs == abs {
		return relPath
	}
	if _, err := os.Stat(newAbs); err == nil {
		// 已有相同内容文件 → 删除旧文件，复用已有文件
		os.Remove(abs)
	} else if err := os.Rename(abs, newAbs); err != nil {
		syncLog.Printf("rehashLocalCover：重命名失败（from=%s to=%s err=%v）", abs, newAbs, err)
		return relPath
	}
	return newRel
}

// asyncDownloadBookmarkResources 异步下载单个书签的图标/封面并回写数据库：
// 创建/更新书签后立即返回响应，资源下载放到后台 goroutine 执行（不阻塞请求）。
// 行为与原来的同步下载一致：成功回写本地 /resource 路径；失败回退原始远程 URL 或不回写。
// 幂等：downloadIcon/downloadImage 内部按域名/内容 hash 去重，与定时同步任务并存不会重复下载。
func asyncDownloadBookmarkResources(db *gorm.DB, b *Bookmark, faviconURL, coverURL string) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				syncLog.Printf("异步下载资源 panic (id=%d): %v", b.ID, r)
			}
		}()
		// 重新读取最新记录，避免覆盖其它请求对该书签的修改
		var cur Bookmark
		if err := db.First(&cur, b.ID).Error; err != nil {
			syncLog.Printf("异步下载资源：书签 id=%d 不存在，跳过", b.ID)
			return
		}
		changed := false
		// 仅回写「已本地化」的图标（/resource/...）；下载失败回退的远程 URL 不回写，
		// 保持 favicon 为空，由定时任务 localizeExistingResources 持续重试（与 localize 判断一致）
		if local := downloadIcon(cur.URL, faviconURL, 15*time.Second); local != "" && local != cur.Favicon && !strings.HasPrefix(local, "http") {
			cur.Favicon = local
			changed = true
		}
		if cur.IsVideo {
			if local := downloadImage(coverURL, "covers", 15*time.Second); local != "" && local != cur.Cover {
				cur.Cover = local
				changed = true
			}
		}
		if changed {
			if err := db.Save(&cur).Error; err != nil {
				syncLog.Printf("异步下载资源回写失败 id=%d: %v", b.ID, err)
				return
			}
			syncLog.Printf("异步下载资源完成 id=%d favicon=%s cover=%s", b.ID, cur.Favicon, cur.Cover)
		} else {
			syncLog.Printf("异步下载资源无变化 id=%d（favicon=%s cover=%s：已是最新、无需下载或下载失败被跳过）", b.ID, cur.Favicon, cur.Cover)
		}
	}()
}

// localizeExistingResources 处理已有书签的资源本地化：
//   - 图标：所有书签（含视频）的 favicon 下载到本地 resource/icons，以网址命名（相同网址自动去重）；已是本地路径则跳过
//   - 封面：仅视频书签（is_video=true）的远程封面下载到本地（内容 hash 命名，自动去重）；旧 id 命名封面按内容 hash 重命名
//
// 幂等：已是本地路径或文件已存在则跳过，重复启动不会重复下载。
func localizeExistingResources(db *gorm.DB) {
	var books []Bookmark
	db.Find(&books)
	dl := 0
	for i := range books {
		b := &books[i]
		changed := false
		// 图标：所有书签的 favicon 下载到本地 resource/icons，以网址(域名)命名（相同网址自动去重）
		//  - 已有远程 http(s) 图标 → 下载
		//  - 无图标但 URL 可解析 → 按域名 favicon.ico 派生后下载
		//  - 已是本地路径但对应文件缺失（如改名/清理）→ 重新下载
		switch {
		case strings.HasPrefix(b.Favicon, "http"), b.Favicon == "":
			if local := downloadIcon(b.URL, b.Favicon, 6*time.Second); local != "" && !strings.HasPrefix(local, "http") {
				b.Favicon = local
				changed = true
			}
		case strings.HasPrefix(b.Favicon, "/resource/icons/"):
			abs := filepath.Join(resourceDir, strings.TrimPrefix(b.Favicon, "/resource/"))
			if _, err := os.Stat(abs); err != nil {
				// 本地文件缺失：重新下载；失败则回退为远程 favicon（与不可达域名一致），避免断图
				host := hostOf(b.URL)
				remote := ""
				if host != "" {
					remote = "https://" + host + "/favicon.ico"
				}
				if local := downloadIcon(b.URL, remote, 6*time.Second); local != "" {
					b.Favicon = local
					changed = true
				}
			}
		}
		// 封面：仅视频书签本地化
		//  - 远程 URL：下载并按内容 hash 命名（自动去重）
		//  - 本地旧命名(/resource/covers/<id>.<ext>)：按内容 hash 重命名去重（不重新下载）
		if b.IsVideo {
			if strings.HasPrefix(b.Cover, "http") {
				if local := downloadImage(b.Cover, "covers", 6*time.Second); local != b.Cover {
					b.Cover = local
					changed = true
				}
			} else if strings.HasPrefix(b.Cover, "/resource/covers/") {
				if renamed := rehashLocalCover(b.Cover); renamed != b.Cover {
					b.Cover = renamed
					changed = true
				}
			}
		}
		if changed {
			db.Save(b)
			dl++
		}
	}
	if dl > 0 {
		syncLog.Printf("已本地化 %d 个书签的图标/封面资源", dl)
	}
}

func mustAbs(p string) string {
	a, err := filepath.Abs(p)
	if err != nil {
		return p
	}
	return a
}
