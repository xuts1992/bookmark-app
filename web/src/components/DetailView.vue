<script setup>
import { computed, ref } from 'vue'
import RichTextEditor from './RichTextEditor.vue'

const props = defineProps({
  bookmark: { type: Object, default: null },
  loading: { type: Boolean, default: false }
})
const emit = defineEmits(['back', 'edit', 'delete', 'favorite', 'save-detail'])

const categoryName = computed(() => (props.bookmark && props.bookmark.category ? props.bookmark.category.name : ''))
const tags = computed(() => (props.bookmark && props.bookmark.tag_list) || [])
const content = computed(() => {
  const d = props.bookmark && props.bookmark.detail
  return d && d.content ? d.content : ''
})

// 富文本编辑弹窗
const showEditor = ref(false)
const editContent = ref('')
const saving = ref(false)
function openEditor() {
  editContent.value = content.value
  showEditor.value = true
}
async function saveEditor() {
  saving.value = true
  try {
    emit('save-detail', editContent.value)
    showEditor.value = false
  } finally {
    saving.value = false
  }
}
function cancelEditor() {
  showEditor.value = false
}

function formatTime(v) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return v
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
  )
}
</script>

<template>
  <div class="detail-view">
    <div class="detail-bar">
      <button class="detail-back" @click="emit('back')">← 返回</button>
      <div class="detail-actions" v-if="bookmark">
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
        <button class="btn-edit" @click="emit('edit', bookmark)">编辑</button>
        <button class="btn-edit-detail" @click="openEditor">编辑详情</button>
        <button class="btn-delete" @click="emit('delete', bookmark.id)">删除</button>
      </div>
    </div>

    <div v-if="loading" class="detail-loading">加载中…</div>

    <div v-else-if="bookmark" class="detail-body">
      <!-- 视频：顶部显示封面；非视频不显示 -->
      <img
        v-if="bookmark.is_video && bookmark.cover"
        class="detail-cover"
        :src="bookmark.cover"
        :alt="bookmark.title"
      />

      <h1 class="detail-title">{{ bookmark.title }}</h1>

      <div class="detail-meta">
        <span class="cat-badge" v-if="categoryName">{{ categoryName }}</span>
        <span class="meta-badge" v-if="bookmark.author">👤 {{ bookmark.author }}</span>
        <span class="meta-badge" v-if="bookmark.collection">📚 {{ bookmark.collection }}</span>
        <span class="tag-chip" v-for="t in tags" :key="t.id">#{{ t.name }}</span>
        <span class="date" v-if="bookmark.pubdate" title="发布时间">🗓 {{ bookmark.pubdate }}</span>
        <span class="date" :title="bookmark.created_at">{{ formatTime(bookmark.created_at) }}</span>
        <span class="video-badge" v-if="bookmark.is_video">
          <img :src="'/resource/icons/bilibili.com.ico'" alt="" /> 视频
        </span>
        <span class="duration-badge" v-if="bookmark.is_video && bookmark.duration">{{ bookmark.duration }}</span>
      </div>

      <a class="detail-link" :href="bookmark.url" target="_blank" rel="noopener">打开原网页 ↗</a>

      <div class="detail-content" v-if="content" v-html="content"></div>
      <div class="detail-content empty" v-else>暂无详情内容</div>
    </div>

    <div v-else class="detail-empty">未找到该书签</div>

    <!-- 富文本编辑详情弹窗 -->
    <div class="editor-mask" v-if="showEditor" @click.self="cancelEditor">
      <div class="editor-modal">
        <div class="editor-modal-head">
          <span>编辑详情</span>
          <button class="editor-close" @click="cancelEditor" title="关闭">✕</button>
        </div>
        <RichTextEditor v-model="editContent" />
        <div class="editor-modal-foot">
          <button class="btn-ghost" @click="cancelEditor">取消</button>
          <button class="btn-primary" :disabled="saving" @click="saveEditor">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-view {
  max-width: 860px;
  margin: 0 auto;
  padding: 8px 0 60px;
}
.detail-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  background: var(--bg, #fff);
  padding: 12px 0;
  z-index: 10;
}
.detail-back {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 15px;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
}
.detail-back:hover {
  background: #f0f3ff;
}
.detail-actions {
  display: flex;
  gap: 4px;
}
.btn-edit {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.btn-edit:hover {
  background: #f0f3ff;
}
.btn-delete {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
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
.detail-loading,
.detail-empty {
  text-align: center;
  color: var(--muted, #999);
  padding: 60px 0;
}
.detail-body {
  background: var(--card, #fff);
  border-radius: 14px;
  padding: 22px 26px 28px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.detail-cover {
  width: 100%;
  max-height: 420px;
  object-fit: cover;
  border-radius: 12px;
  display: block;
  margin-bottom: 18px;
  background: #f0f0f0;
}
.detail-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text, #222);
  margin: 0 0 12px;
  line-height: 1.35;
}
.detail-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #bbb;
  margin-bottom: 14px;
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
}
.meta-badge {
  background: #f3f3f7;
  color: #777;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.video-badge {
  background: linear-gradient(135deg, #00AEEC, #0084c2);
  color: #fff;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}
.video-badge img {
  width: 13px;
  height: 13px;
  object-fit: contain;
  vertical-align: middle;
}
.duration-badge {
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.date {
  color: #bbb;
}
.detail-link {
  display: inline-block;
  color: var(--primary);
  text-decoration: none;
  font-size: 14px;
  margin-bottom: 18px;
}
.detail-link:hover {
  text-decoration: underline;
}
.detail-content {
  word-break: break-word;
  font-size: 15px;
  line-height: 1.7;
  color: var(--text, #333);
}
.detail-content.empty {
  color: var(--muted, #999);
  font-size: 14px;
}
.detail-content :deep(h2) {
  font-size: 20px;
  margin: 18px 0 10px;
  font-weight: 700;
}
.detail-content :deep(h3) {
  font-size: 17px;
  margin: 14px 0 8px;
  font-weight: 700;
}
.detail-content :deep(p) {
  margin: 8px 0;
}
.detail-content :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 8px 0;
}
.detail-content :deep(a) {
  color: var(--primary, #5a5fce);
}
.detail-content :deep(ul),
.detail-content :deep(ol) {
  padding-left: 22px;
  margin: 8px 0;
}
.detail-content :deep(pre) {
  background: #f4f4f7;
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 13px;
}
.detail-content :deep(blockquote) {
  margin: 10px 0;
  padding: 4px 14px;
  border-left: 3px solid var(--primary, #5a5fce);
  color: #666;
  background: #f7f8fc;
}
.btn-edit-detail {
  background: none;
  border: 1px solid var(--primary, #5a5fce);
  color: var(--primary, #5a5fce);
  font-size: 13px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
}
.btn-edit-detail:hover {
  background: #f0f3ff;
}
.editor-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}
.editor-modal {
  width: min(820px, 96vw);
  max-height: 88vh;
  background: #fff;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}
.editor-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border, #e3e3ec);
}
.editor-close {
  background: none;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: #999;
}
.editor-close:hover {
  color: #333;
}
.editor-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--border, #e3e3ec);
}
.btn-ghost {
  background: #f3f3f7;
  border: none;
  color: #555;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}
.btn-ghost:hover {
  background: #e9e9f0;
}
.btn-primary {
  background: var(--primary, #5a5fce);
  border: none;
  color: #fff;
  padding: 8px 22px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
