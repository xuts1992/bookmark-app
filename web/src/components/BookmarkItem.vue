<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  bookmark: { type: Object, required: true }
})
const emit = defineEmits(['delete', 'edit', 'open', 'favorite', 'tag'])

// 复制网址：优先用 Clipboard API；不可用时（非安全上下文等）退回 execCommand 兜底
const copied = ref(false)
async function copyUrl() {
  const url = props.bookmark.url || ''
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url)
    } else {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch (_) {
    copied.value = false
  }
}

// 跳转：新标签页打开原网页
function openUrl() {
  if (props.bookmark.url) {
    window.open(props.bookmark.url, '_blank', 'noopener')
  }
}

const domain = computed(() => {
  try {
    return new URL(props.bookmark.url).hostname
  } catch (_) {
    return props.bookmark.url
  }
})

function onImgError(e) {
  const parent = e.target.parentElement
  parent.innerHTML = '<span class="placeholder">🔖</span>'
}

// 右侧封面加载失败时的兜底：移除封面容器，避免破图
function onCoverError(e) {
  const el = e.target.closest('.bookmark-cover')
  if (el) el.style.display = 'none'
}

// 把后端返回的 created_at（RFC3339 字符串）格式化为「YYYY-MM-DD HH:mm:ss」本地时间。
// 保留秒级精度（与原始数据一致），去掉丑陋的 T 与时区后缀；完整值保留在 title 悬浮提示。
function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() +
    '-' + p(d.getMonth() + 1) +
    '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) +
    ':' + p(d.getMinutes()) +
    ':' + p(d.getSeconds())
  )
}
</script>

<template>
  <div class="bookmark-item" :class="{ 'is-video': bookmark.is_video }">
      <div class="bookmark-icon">
        <!-- 视频：左侧显示 Bilibili 小电视图标（本地 ico） -->
        <img v-if="bookmark.is_video" class="bili-icon" :src="'/resource/icons/bilibili.com.ico'" alt="B站视频" />
        <img v-else-if="bookmark.cover" :src="bookmark.cover" :alt="bookmark.title" @error="onImgError" />
        <img v-else-if="bookmark.favicon" :src="bookmark.favicon" :alt="bookmark.title" @error="onImgError" />
        <span v-else class="placeholder">🔖</span>
      </div>
      <div class="bookmark-info">
        <div class="bookmark-title">
          <span class="bm-title-link" @click.stop="emit('open', bookmark.id)">{{ bookmark.title }}</span>
        </div>
        <div class="bookmark-url">{{ domain }}</div>
        <div class="bookmark-meta">
          <span class="cat-badge" v-if="bookmark.category">{{ bookmark.category.name }}</span>
          <span class="meta-badge" v-if="bookmark.author">👤 {{ bookmark.author }}</span>
          <span class="meta-badge" v-if="bookmark.collection">📚 {{ bookmark.collection }}</span>
          <span class="tag-chip" v-for="t in (bookmark.tag_list || [])" :key="t.id" @click.stop="emit('tag', t)">{{ t.name }}</span>
          <span class="date" v-if="bookmark.pubdate" title="发布时间">🗓 {{ bookmark.pubdate }}</span>
          <!-- <span class="date" :title="bookmark.created_at">{{ formatTime(bookmark.created_at) }}</span> -->
        </div>
      </div>
      <!-- 视频：靠右侧显示封面图片 -->
      <div class="bookmark-cover" v-if="bookmark.is_video && bookmark.cover">
        <img :src="bookmark.cover" :alt="bookmark.title" @error="onCoverError" />
        <span class="duration" v-if="bookmark.duration">{{ bookmark.duration }}</span>
      </div>
    <div class="bookmark-actions">
      <button
        class="btn-fav"
        :class="{ active: bookmark.is_favorite }"
        @click="emit('favorite', bookmark.id)"
        :title="bookmark.is_favorite ? '取消收藏' : '收藏'"
        :aria-label="bookmark.is_favorite ? '取消收藏' : '收藏'"
      >
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path fill="currentColor" d="M12 17.27l5.18 3.15c.42.26.97-.1.86-.57l-1.37-5.94 4.6-3.99c.39-.34.18-.97-.36-.99l-6.05-.52-2.36-5.58c-.2-.47-.84-.47-1.04 0L9.14 8.31l-6.05.52c-.54.02-.75.65-.36.99l4.6 3.99-1.37 5.94c-.11.47.44.83.86.57L12 17.27z" />
        </svg>
      </button>
      <button class="btn-copy" @click="copyUrl" :title="copied ? '已复制到剪贴板' : '复制网址'">{{ copied ? '已复制' : '复制' }}</button>
      <button class="btn-open" @click="openUrl" title="跳转到原网页">跳转</button>
      <button class="btn-edit" @click="emit('edit', bookmark)">编辑</button>
      <button class="btn-delete" @click="emit('delete', bookmark.id)">删除</button>
    </div>
  </div>
</template>

<style scoped>
.bookmark-item {
  background: var(--card);
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s, box-shadow 0.2s;
}
.bookmark-item:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
}
.bookmark-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: #f0f0f0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.bookmark-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bookmark-icon .placeholder {
  font-size: 18px;
}
/* 视频条目左侧 Bilibili 小电视图标（本地 ico） */
.bookmark-item.is-video .bookmark-icon {
  background: #f0f0f0;
}
.bookmark-item.is-video .bili-icon {
  width: 30px;
  height: 30px;
  object-fit: contain;
}
/* 视频条目右侧封面缩略图 */
.bookmark-cover {
  width: 120px;
  height: 68px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  background: #f0f0f0;
  align-self: center;
}
.bookmark-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.bookmark-cover .duration {
  position: absolute;
  right: 4px;
  bottom: 4px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 11px;
  line-height: 1;
  padding: 2px 5px;
  border-radius: 4px;
}
.bookmark-info {
  flex: 1;
  min-width: 0;
}
.bookmark-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bm-title-link {
  cursor: pointer;
}
.bm-title-link:hover {
  color: var(--primary);
  text-decoration: underline;
}
.bookmark-title a {
  color: var(--text);
  text-decoration: none;
}
.bookmark-title a:hover {
  color: var(--primary);
}
.bookmark-url {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
.bookmark-meta {
  font-size: 12px;
  color: #bbb;
  margin-top: 2px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.cat-badge {
  background: var(--primary);
  color: #fff;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.tag-chip {
  background: #eef0fb;
  color: #5a5fce;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  cursor: default;
}
.meta-badge {
  background: #f3f3f7;
  color: #777;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.date {
  color: #bbb;
}
.bookmark-actions {
  flex-shrink: 0;
}
.btn-delete {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.2s;
}
.btn-delete:hover {
  background: #fff5f5;
}
.btn-fav {
  background: none;
  border: none;
  color: #d8d8e0;
  font-size: 13px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}
.btn-fav:hover {
  background: #fff7e6;
  color: #ffb31a;
}
.btn-fav.active {
  color: #ffb31a;
}
.btn-edit {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.2s;
}
.btn-edit:hover {
  background: #f0f3ff;
}
.btn-copy {
  background: none;
  border: none;
  color: #777;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.2s, color 0.2s;
  white-space: nowrap;
}
.btn-copy:hover {
  background: #f0f3ff;
  color: var(--primary);
}
.btn-open {
  background: none;
  border: none;
  color: #1a9e6f;
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  transition: background 0.2s, color 0.2s;
  white-space: nowrap;
}
.btn-open:hover {
  background: #e8f7f1;
  color: #128a5e;
}
</style>
