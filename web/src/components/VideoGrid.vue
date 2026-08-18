<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  bookmarks: { type: Array, default: () => [] }
})
const emit = defineEmits(['delete', 'edit', 'favorite'])

// 记录封面加载失败的 id，失败则回退到占位图
const failed = ref(new Set())
function onImgError(b) {
  failed.value.add(b.id)
}
function hasCover(b) {
  return b.cover && !failed.value.has(b.id)
}

// 收藏时间：只精确到秒（去掉毫秒与时区后缀），如 2026-08-03 15:00:37
function formatTime(s) {
  if (!s) return ''
  return s.slice(0, 19).replace('T', ' ')
}

// 标签：最多取前 2 个展示，放不下由容器 overflow 隐藏
function visibleTags(b) {
  return (b.tag_list || []).slice(0, 2)
}

// 「更多」图标菜单：点击图标弹出 编辑 / 删除
const openId = ref(null)
function toggleMenu(b) {
  openId.value = openId.value === b.id ? null : b.id
}
function onEdit(b) {
  openId.value = null
  emit('edit', b)
}
function onDelete(b) {
  openId.value = null
  emit('delete', b.id)
}
// 点击菜单以外的区域关闭弹层
function onDocClick(e) {
  if (openId.value == null) return
  if (e.target.closest('.vmore')) return
  openId.value = null
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="video-grid">
    <div class="vcard" v-for="b in bookmarks" :key="b.id">
      <a class="vcover" :href="b.url" target="_blank" rel="noopener">
        <img v-if="hasCover(b)" :src="b.cover" :alt="b.title" @error="onImgError(b)" />
        <div class="vcover-ph" v-else>
          <img :src="'/resource/icons/bilibili.com.ico'" alt="B站视频" />
        </div>
        <span class="vduration" v-if="b.duration">{{ b.duration }}</span>
        <div class="vplay">
          <svg viewBox="0 0 24 24" width="36" height="36">
            <circle cx="12" cy="12" r="11" fill="rgba(255,255,255,0.92)" />
            <path d="M10 8l6 4-6 4z" fill="#222" />
          </svg>
        </div>
      </a>
      <div class="vinfo">
        <a class="vtitle" :href="b.url" target="_blank" rel="noopener" :title="b.title">{{ b.title }}</a>
        <div class="vmeta">
          <span class="vup" v-if="b.author">👤 {{ b.author }}</span>
          <span class="vcol" v-if="b.collection">📚 {{ b.collection }}</span>
        </div>
        <!-- 标签：最多 2 个，放不下隐藏 -->
        <div class="vtags" v-if="visibleTags(b).length">
          <span class="vtag" v-for="t in visibleTags(b)" :key="t.id">#{{ t.name }}</span>
        </div>
        <div class="vfooter">
          <span class="vtime" v-if="b.created_at">{{ formatTime(b.created_at) }}</span>
          <button
            class="v-fav-btn"
            :class="{ active: b.is_favorite }"
            @click.stop="emit('favorite', b.id)"
            :title="b.is_favorite ? '取消收藏' : '收藏'"
            :aria-label="b.is_favorite ? '取消收藏' : '收藏'"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M12 17.27l5.18 3.15c.42.26.97-.1.86-.57l-1.37-5.94 4.6-3.99c.39-.34.18-.97-.36-.99l-6.05-.52-2.36-5.58c-.2-.47-.84-.47-1.04 0L9.14 8.31l-6.05.52c-.54.02-.75.65-.36.99l4.6 3.99-1.37 5.94c-.11.47.44.83.86.57L12 17.27z" />
            </svg>
          </button>
          <div class="vmore" :class="{ open: openId === b.id }">
            <button class="v-more-btn" @click.stop="toggleMenu(b)" title="更多操作" aria-label="更多操作">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <circle cx="5" cy="12" r="2" fill="currentColor" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
                <circle cx="19" cy="12" r="2" fill="currentColor" />
              </svg>
            </button>
            <div class="v-menu" v-if="openId === b.id">
              <button class="v-menu-item" @click.stop="onEdit(b)">
                <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                编辑
              </button>
              <button class="v-menu-item danger" @click.stop="onDelete(b)">
                <svg viewBox="0 0 24 24" width="15" height="15"><path fill="currentColor" d="M6 19a2 2 0 002 2h8a2 2 0 002-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.video-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 18px;
  padding-top: 4px;
}
/* 宽屏下固定每行 5 个视频 */
@media (min-width: 1180px) {
  .video-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}
.vcard {
  position: relative;
  background: var(--card);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s, box-shadow 0.2s;
  display: flex;
  flex-direction: column;
}
.vcard:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.12);
  z-index: 20;
}
.vcover {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: linear-gradient(135deg, #4b5bd6 0%, #7b4397 100%);
  overflow: hidden;
  border-radius: 12px 12px 0 0;
}
.vcover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.3s ease;
}
.vcard:hover .vcover img {
  transform: scale(1.06);
}
.vcover-ph {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e3f4fb, #cfe9f7);
}
.vcover-ph img {
  width: 56px;
  height: 56px;
  object-fit: contain;
  opacity: 0.92;
}
.vduration {
  position: absolute;
  right: 6px;
  bottom: 6px;
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
  z-index: 2;
}
.vplay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.22);
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 3;
}
.vcard:hover .vplay {
  opacity: 1;
}
.vinfo {
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.vtitle {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.9em;
}
.vtitle:hover {
  color: var(--primary);
}
.vmeta {
  margin-top: 8px;
  font-size: 12px;
  color: #999;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
/* 标签：最多展示 2 个，单行放不下时隐藏溢出 */
.vtags {
  margin-top: 8px;
  display: flex;
  flex-wrap: nowrap;
  overflow: hidden;
  gap: 6px;
}
.vtag {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--primary);
  background: #f0f3ff;
  border: 1px solid #e3e8ff;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
/* 底部：收藏时间 + 更多操作 */
.vfooter {
  margin-top: auto;
  padding-top: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.vtime {
  font-size: 12px;
  color: #aaa;
}
.vmore {
  position: relative;
}
.v-fav-btn {
  border: none;
  background: none;
  color: #d8d8e0;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}
.v-fav-btn:hover {
  background: #fff7e6;
  color: #ffb31a;
}
.v-fav-btn.active {
  color: #ffb31a;
}
.v-more-btn {
  border: none;
  background: none;
  color: #999;
  cursor: pointer;
  padding: 4px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}
.v-more-btn:hover {
  background: #f2f2f7;
  color: var(--text);
}
.v-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  min-width: 116px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  padding: 4px;
  z-index: 50;
  display: flex;
  flex-direction: column;
}
.v-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  color: var(--text);
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.18s;
}
.v-menu-item:hover {
  background: #f4f4fb;
}
.v-menu-item.danger {
  color: var(--danger);
}
.v-menu-item.danger:hover {
  background: #fff5f5;
}
</style>
