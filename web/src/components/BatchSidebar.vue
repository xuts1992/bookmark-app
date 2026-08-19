<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  totalCount: { type: Number, default: 0 },
  categories: { type: Array, default: () => [] },
  allTags: { type: Array, default: () => [] },
  batchTagIds: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'apply', 'toggle-tag', 'browse-tags', 'confirm-delete'])

// 本地 UI 状态
const batchCategory = ref(null) // 设置分类：null=不修改，0=默认，否则分类 id
const batchTagMode = ref('add') // 标签操作模式：add / remove

// 已选标签对象列表（用于在侧边栏展示名称）
const selectedTagList = computed(() =>
  props.batchTagIds.map((id) => props.allTags.find((t) => t.id === id)).filter(Boolean)
)
</script>

<template>
  <!-- 批量操作侧边栏：对当前筛选条件下所有匹配数据生效 -->
  <aside class="sidebar batch-sidebar" :class="{ open }">
    <div class="sidebar-head">
      <span class="sidebar-title">批量操作</span>
      <button class="sidebar-close" @click="emit('close')" aria-label="关闭">✕</button>
    </div>
    <div class="sidebar-body batch-body">
      <p class="batch-hint">将对当前筛选条件下的 <b>{{ totalCount }}</b> 条书签生效（作用于全部匹配，分页未展示的数据也生效）。</p>

      <!-- 设置分类 -->
      <div class="batch-section">
        <div class="batch-section-title">设置分类</div>
        <select class="batch-select" v-model="batchCategory">
          <option :value="null">（不修改）</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          <option :value="0">默认</option>
        </select>
        <button class="batch-apply" :disabled="batchCategory === null" @click="emit('apply', { set_category: batchCategory })">应用分类</button>
      </div>

      <!-- 标签：添加 / 移除（通过 AllTag 弹窗选标签，侧边栏仅展示已选） -->
      <div class="batch-section">
        <div class="batch-section-title">标签</div>
        <div class="batch-tag-mode">
          <label><input type="radio" value="add" v-model="batchTagMode" /> 添加</label>
          <label><input type="radio" value="remove" v-model="batchTagMode" /> 移除</label>
        </div>
        <!-- 已选标签（点击可取消） -->
        <div class="batch-selected" v-if="selectedTagList.length">
          <button
            v-for="t in selectedTagList"
            :key="t.id"
            class="batch-chip"
            :title="'点击取消选择'"
            @click="emit('toggle-tag', t.id)"
          ># {{ t.name }} ✕</button>
        </div>
        <div class="batch-tag-empty" v-else>尚未选择标签</div>
        <!-- 打开全部标签弹窗的按钮（图标） -->
        <button class="batch-browsetags" @click="emit('browse-tags')">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM6.5 8C5.67 8 5 7.33 5 6.5S5.67 5 6.5 5 8 5.67 8 6.5 7.33 8 6.5 8z" />
          </svg>
          浏览全部标签
        </button>
        <button
          class="batch-apply"
          :disabled="batchTagIds.length === 0"
          @click="batchTagMode === 'add' ? emit('apply', { add_tags: batchTagIds }) : emit('apply', { remove_tags: batchTagIds })"
        >{{ batchTagMode === 'add' ? '添加标签' : '移除标签' }}</button>
      </div>

      <!-- 一键收藏 -->
      <div class="batch-section">
        <div class="batch-section-title">收藏</div>
        <button class="batch-apply wide" @click="emit('apply', { favorite: true })">★ 全部标记为收藏</button>
        <button class="batch-apply wide" @click="emit('apply', { favorite: false })">☆ 全部取消收藏</button>
      </div>

      <!-- 一键删除 -->
      <div class="batch-section">
        <div class="batch-section-title">删除</div>
        <button class="batch-danger" @click="emit('confirm-delete')">🗑 一键删除（不可恢复）</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* 左侧侧边栏基础（滑出/定位，筛选与批量共用） */
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  max-width: 82vw;
  background: var(--card);
  z-index: 500;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.16);
  transform: translateX(-100%);
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
  display: flex;
  flex-direction: column;
}
.sidebar.open {
  transform: translateX(0);
}
.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 18px 14px;
  border-bottom: 1px solid #eee;
}
.sidebar-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
}
.sidebar-close {
  background: none;
  border: none;
  font-size: 18px;
  color: #999;
  cursor: pointer;
  line-height: 1;
}
.sidebar-close:hover {
  color: #555;
}
.sidebar-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px 24px;
}
/* 批量侧边栏特有 */
.batch-sidebar {
  border-right: 4px solid #2bb3a3;
}
.batch-hint {
  font-size: 13px;
  color: var(--muted, #888);
  line-height: 1.6;
  background: #f3fbfa;
  border: 1px solid #d4efeb;
  border-radius: 10px;
  padding: 10px 12px;
  margin: 0 0 4px;
}
.batch-hint b {
  color: #2bb3a3;
}
.batch-section {
  padding: 14px 0;
  border-top: 1px solid #eee;
}
.batch-section:first-of-type {
  border-top: none;
}
.batch-section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 10px;
}
/* 已选标签（侧边栏内展示，点击取消） */
.batch-selected {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.batch-chip {
  border: 1px solid #2bb3a3;
  background: #eafaf8;
  color: #1d8e80;
  padding: 5px 10px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.batch-chip:hover {
  background: #2bb3a3;
  color: #fff;
}
.batch-tag-empty {
  font-size: 13px;
  color: var(--muted, #999);
  margin-bottom: 10px;
}
/* 浏览全部标签按钮（图标） */
.batch-browsetags {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  justify-content: center;
  border: 2px dashed #b9e3de;
  background: #f3fbfa;
  color: #1d8e80;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
  margin-bottom: 10px;
  transition: all 0.15s ease;
}
.batch-browsetags:hover {
  border-color: #2bb3a3;
  background: #eafaf8;
}
.batch-select {
  width: 100%;
  padding: 9px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  color: var(--text);
  background: #fff;
  margin-bottom: 10px;
}
.batch-select:focus {
  border-color: #2bb3a3;
}
.batch-apply {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: #2bb3a3;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s;
}
.batch-apply:hover:not(:disabled) {
  background: #239c8e;
}
.batch-apply:disabled {
  background: #c7d6d4;
  cursor: not-allowed;
}
.batch-apply.wide {
  margin-top: 2px;
}
.batch-tag-mode {
  display: flex;
  gap: 18px;
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--text);
}
.batch-tag-mode label {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
}
.batch-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 168px;
  overflow-y: auto;
  margin-bottom: 10px;
}
.batch-tag-check {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  background: #f3f3fb;
  border-radius: 8px;
  padding: 5px 9px;
  cursor: pointer;
  color: var(--text);
}
.batch-danger {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 10px;
  background: #ff5a5f;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s;
}
.batch-danger:hover {
  background: #e8454a;
}
</style>
