<script setup>
defineProps({
  open: { type: Boolean, default: false },
  sidebarTagQuery: { type: String, default: '' },
  filteredTree: { type: Array, default: () => [] },
  expanded: { type: Object, default: () => ({}) },
  filterCategory: { type: [Number, String, null], default: null },
  filterTags: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'update:sidebarTagQuery', 'clear-filter', 'toggle-category', 'select-tag'])
</script>

<template>
  <!-- 左侧筛选侧边栏：分类(一级) → 标签(二级)（推开式，不覆盖主内容） -->
  <aside class="sidebar" :class="{ open }">
    <div class="sidebar-head">
      <span class="sidebar-title">分类 / 标签</span>
      <button class="sidebar-close" @click="emit('close')" aria-label="关闭">✕</button>
    </div>
    <div class="sidebar-body">
      <div class="sidebar-search">
        <input
          type="text"
          :value="sidebarTagQuery"
          placeholder="搜索标签..."
          @input="emit('update:sidebarTagQuery', $event.target.value)"
        />
        <button
          v-if="sidebarTagQuery"
          class="sidebar-search-clear"
          @click="emit('update:sidebarTagQuery', '')"
          aria-label="清空搜索"
          title="清空"
        >✕</button>
      </div>
      <button class="tree-cat all" :class="{ active: !filterCategory && filterTags.length === 0 }" @click="emit('clear-filter')">
        全部书签
      </button>
      <div class="tree-node" v-for="cat in filteredTree" :key="cat.id">
        <div class="tree-cat-row">
          <button
            type="button"
            class="tree-toggle"
            @click="emit('toggle-category', cat.id)"
            :aria-label="expanded[cat.id] ? '收起' : '展开'"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" :class="{ rotated: expanded[cat.id] }">
              <path fill="currentColor" d="M9 6l6 6-6 6z" />
            </svg>
          </button>
          <span
            class="tree-cat label"
            @click="emit('toggle-category', cat.id)"
          >
            {{ cat.name }}
          </span>
        </div>
        <div class="tree-tags" v-show="expanded[cat.id]">
          <button
            v-for="t in cat.tags"
            :key="t.id"
            class="tree-tag"
            :class="{ active: filterTags.includes(t.id) }"
            @click="emit('select-tag', t)"
          >
            # {{ t.name }}
          </button>
          <span v-if="cat.tags.length === 0" class="tree-tag-empty">暂无标签</span>
        </div>
      </div>
      <div class="sidebar-empty" v-if="filteredTree.length === 0 && sidebarTagQuery">未找到匹配标签</div>
    </div>
  </aside>
</template>

<style scoped>
/* 左侧筛选侧边栏（从左侧滑出） */
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
/* 侧边栏内标签搜索框 */
.sidebar-search {
  position: relative;
  margin-bottom: 12px;
}
.sidebar-search input {
  width: 100%;
  padding: 10px 32px 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  color: var(--text);
  background: #fff;
}
.sidebar-search input:focus {
  border-color: var(--primary);
}
.sidebar-search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: none;
  color: #999;
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  font-size: 14px;
  line-height: 1;
}
.sidebar-search-clear:hover {
  background: #f0f0f4;
  color: #555;
}
.sidebar-empty {
  font-size: 13px;
  color: #bbb;
  padding: 12px 4px;
  text-align: center;
}
/* 树：分类一级 */
.tree-cat {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  padding: 9px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.tree-cat:hover {
  background: #f3f3fb;
}
.tree-cat.all {
  margin-bottom: 6px;
  color: var(--primary);
}
/* 分类可折叠（点击折叠/展开其下标签），但不可作为筛选选中 */
.tree-cat.label {
  cursor: pointer;
}
.tree-cat.label:hover {
  background: #f3f3fb;
}
.tree-cat.active {
  background: var(--primary);
  color: #fff;
}
.tree-cat.active:hover {
  background: var(--primary);
  color: #fff;
}
.tree-cat-row {
  display: flex;
  align-items: center;
}
.tree-toggle {
  background: none;
  border: none;
  padding: 9px 4px 9px 0;
  cursor: pointer;
  color: var(--muted);
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.tree-toggle svg {
  transition: transform 0.2s;
}
.tree-toggle svg.rotated {
  transform: rotate(90deg);
}
.tree-cat-row .tree-cat {
  flex: 1;
}
/* 树：标签二级 */
.tree-tags {
  padding: 4px 0 8px 26px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tree-tag {
  text-align: left;
  background: #f6f6fc;
  border: 1px solid #ececf5;
  color: var(--text);
  font-size: 13px;
  padding: 7px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.18s, color 0.18s, border-color 0.18s;
}
.tree-tag:hover {
  background: #ececfb;
}
.tree-tag.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.tree-tag-empty {
  font-size: 12px;
  color: #bbb;
  padding: 4px 12px;
}
</style>
