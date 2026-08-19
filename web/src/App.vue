<script setup>
// 逻辑已抽到 src/composables：useApp（主逻辑）、useAdminRoute（admin 路由）、filters（URL 筛选持久化）
// 这里仅做薄壳：引入 useApp 并解构模板所需的全部绑定。模板保持原样。
import { ref, onMounted, onBeforeUnmount } from 'vue'
import BookmarkItem from './components/BookmarkItem.vue'
import VideoGrid from './components/VideoGrid.vue'
import AdminView from './components/AdminView.vue'
import DetailView from './components/DetailView.vue'
import AllTag from './components/AllTag.vue'
import FabToolbar from './components/FabToolbar.vue'
import FilterSidebar from './components/FilterSidebar.vue'
import BatchSidebar from './components/BatchSidebar.vue'
import BookmarkForm from './components/BookmarkForm.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import { useApp } from './composables/useApp.js'

const {
  // 状态
  bookmarks, total, today, loading,
  searchQuery, toastMsg, toastShow,
  showForm, editing, submitting, form, formError,
  categories, allTags, filterCategory, filterTags, filterFavorite,
  sidebarOpen, sidebarTagQuery, expanded,
  view, displayMode,
  perPage, currentOffset, totalCount,
  detailId, detailBookmark, detailLoading,
  // 计算属性
  activeCatLabel, activeTagLabels, filteredTree, formTagOptions, displayList, pageNum, pageTotal,
  // 方法
  openEdit, openAdd, goMain, onSearch, clearSearch, onCategoryChange,
  setDisplayMode, clearFilter, onDelete, prevPage, nextPage, toggleSidebar, goDetail,
  toggleCategory,
  goAdmin, selectTag, closeForm, submitForm, onUrlBlur, onPreviewError,
  toggleFavoriteFilter, toggleFavorite, saveDetail,
  batchOpen, toggleBatch, batchApply, refresh,
  currentFilter,
} = useApp()

// —— 吸顶（纯 JS 实现，不使用 CSS 静态规则）——
// 下滑越过标题栏高度后：搜索栏(.toolbar)吸顶固定，标题栏(.header)视觉隐藏但保留布局空间避免抖动。
let headerEl = null
let toolbarEl = null
let pinned = false
let threshold = 80
let thresholdReady = false
let rafId = 0

function findEls() {
  headerEl = document.querySelector('.header')
  toolbarEl = document.querySelector('.toolbar')
  // 阈值取工具栏距文档顶部的距离（约等于标题栏高度），仅需首次正确计算一次，
  // 之后即便 header 被 transform 移走也不重算（getBoundingClientRect 会含 transform，导致误差）。
  if (toolbarEl && !thresholdReady) {
    threshold = toolbarEl.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0)
    if (threshold <= 0) threshold = 80
    thresholdReady = true
  }
}

function applyPin(on) {
  if (!toolbarEl) return
  if (on && !pinned) {
    pinned = true
    toolbarEl.style.position = 'sticky'
    toolbarEl.style.top = '0'
    toolbarEl.style.zIndex = '500'
    toolbarEl.style.background = '#ffffff'
    toolbarEl.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)'
    toolbarEl.style.paddingTop = '10px'
    toolbarEl.style.paddingBottom = '10px'
    toolbarEl.style.marginBottom = '20px'
    if (headerEl) {
      headerEl.style.transition = 'transform 0.25s ease'
      headerEl.style.transform = 'translateY(-100%)'
    }
  } else if (!on && pinned) {
    pinned = false
    toolbarEl.style.position = ''
    toolbarEl.style.top = ''
    toolbarEl.style.zIndex = ''
    toolbarEl.style.background = ''
    toolbarEl.style.boxShadow = ''
    toolbarEl.style.paddingTop = ''
    toolbarEl.style.paddingBottom = ''
    toolbarEl.style.marginBottom = ''
    if (headerEl) {
      headerEl.style.transform = ''
    }
  }
}

function onScroll() {
  rafId = 0
  // 元素可能因视图切换被重建，失效则重新获取并重置 apply 状态
  if (!toolbarEl || !document.body.contains(toolbarEl)) {
    toolbarEl = null
    headerEl = null
    pinned = false
    findEls()
  }
  if (!toolbarEl) return
  const y = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0
  applyPin(y > threshold)
}

function requestScroll() {
  if (!rafId) rafId = window.requestAnimationFrame(onScroll)
}

onMounted(() => {
  findEls()
  onScroll()
  window.addEventListener('scroll', requestScroll, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', requestScroll)
  if (rafId) window.cancelAnimationFrame(rafId)
})

// 批量侧边栏的本地 UI 状态（batchCategory/batchTagMode 已在 BatchSidebar 组件内自持）
const batchTagIds = ref([])       // 选中的标签 id（AllTag 弹窗共用）
const showAllTag = ref(false)     // 是否弹出「全部标签」选择窗
// 已选标签的切换（批量侧边栏与 AllTag 弹窗共用）
function toggleBatchTag(id) {
  const i = batchTagIds.value.indexOf(id)
  if (i >= 0) batchTagIds.value.splice(i, 1)
  else batchTagIds.value.push(id)
}

// —— 自定义警告/确认弹窗（ConfirmDialog）——
const confirmState = ref(null) // { title, message, danger, onConfirm, highlight }
function showConfirm(title, message, onConfirm, danger = false, highlight = '') {
  confirmState.value = { title, message, danger, onConfirm, highlight }
}
function cancelConfirm() {
  confirmState.value = null
}
function doConfirm() {
  const fn = confirmState.value && confirmState.value.onConfirm
  confirmState.value = null
  if (fn) fn()
}

// 当前是否存在任何筛选条件（分类/标签/搜索/只看常用/视频视图）
function hasAnyFilter() {
  return (
    filterCategory.value != null ||
    filterTags.value.length > 0 ||
    searchQuery.value.trim() !== '' ||
    filterFavorite.value ||
    displayMode.value === 'video'
  )
}

// 批量操作入口：任何批量修改（设置分类/标签/收藏）前都弹确认，显示操作描述与目标条数，避免误操作
function applyBatch(ops) {
  if (ops.delete) {
    confirmBatchDelete()
    return
  }
  const hasFilter = hasAnyFilter()
  const desc = batchOpDesc(ops)
  const tip = hasFilter
    ? `将对当前筛选条件下的 ${totalCount.value} 条书签执行「${desc}」。`
    : `当前没有任何筛选条件，将对全部 ${totalCount.value} 条书签执行「${desc}」。`
  showConfirm(
    `确认批量${desc}？`,
    `${tip}\n确定要继续吗？`,
    () => batchApply(ops),
    false,
    `${totalCount.value} 条书签`
  )
}

// 根据批量操作参数生成中文描述
function batchOpDesc(ops) {
  if (ops.set_category != null) {
    if (ops.set_category === 0) return '设置分类为「默认」'
    const c = categories.value.find((c) => c.id === ops.set_category)
    return `设置分类为「${c ? c.name : ops.set_category}」`
  }
  if (ops.add_tags) return `添加 ${ops.add_tags.length} 个标签`
  if (ops.remove_tags) return `移除 ${ops.remove_tags.length} 个标签`
  if (ops.favorite === true) return '全部标记为收藏'
  if (ops.favorite === false) return '全部取消收藏'
  return '批量修改'
}

// 一键删除（同样使用自定义确认弹窗，危险样式）
function confirmBatchDelete() {
  showConfirm(
    '⚠️ 一键删除（不可恢复）',
    `确定要删除当前筛选条件下的全部 ${totalCount.value} 条书签吗？此操作不可恢复！`,
    () => batchApply({ delete: true }),
    true,
    `${totalCount.value} 条书签`
  )
}

// 导出：弹确认显示将导出的条数，确认后下载 Excel（.xlsx，筛选参数与列表/批量一致）
function handleExport() {
  const hasFilter = hasAnyFilter()
  const scope = hasFilter ? '当前筛选条件下的' : '全部'
  showConfirm(
    '确认导出？',
    `将导出${scope} ${totalCount.value} 条书签（Excel 文件）。\n确定要继续吗？`,
    () => {
      const f = currentFilter()
      const p = new URLSearchParams()
      if (f.category_id != null) p.set('category_id', f.category_id)
      ;(f.tag_ids || []).forEach((id) => p.append('tag_id', id))
      if (f.is_video) p.set('is_video', '1')
      if (f.favorite) p.set('favorite', '1')
      if (f.q) p.set('q', f.q)
      const qs = p.toString()
      const a = document.createElement('a')
      a.href = `/api/export${qs ? '?' + qs : ''}`
      a.download = ''
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
    false,
    `${totalCount.value} 条书签`
  )
}
</script>

<template>
  <div :class="{ 'sidebar-open': sidebarOpen, 'batch-open': batchOpen }">
    <AdminView v-if="view === 'admin'" @edit="openEdit" @add="openAdd" @back="goMain" />
    <DetailView
      v-else-if="view === 'detail'"
      :bookmark="detailBookmark"
      :loading="detailLoading"
      @back="goMain"
      @edit="openEdit"
      @delete="onDelete"
      @favorite="toggleFavorite"
      @save-detail="saveDetail"
    />
    <template v-else>
    <header class="header">
      <h1>📚 我的网页收藏</h1>
    </header>

    <main class="container">
      <div class="toolbar">
        <select class="cat-select" v-model="filterCategory" @change="onCategoryChange">
          <option :value="null">全部分类</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <div class="search-bar">
          <input
            type="text"
            v-model="searchQuery"
            placeholder="搜索书签..."
            @keyup.enter="onSearch"
          />
          <button
            v-if="searchQuery"
            class="search-clear"
            @click="clearSearch"
            title="清空"
            aria-label="清空搜索"
          >✕</button>
          <button
            class="search-go"
            @click="onSearch"
            title="搜索"
            aria-label="搜索"
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="currentColor" d="M15.5 14h-.79l-.28-.27a6.5 6.5 0 10-.7.7l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0A4.5 4.5 0 1114 9.5 4.5 4.5 0 019.5 14z" />
            </svg>
          </button>
        </div>
        <button class="btn-add" @click="openAdd">+ 添加书签</button>
        <div class="view-switch" role="tablist" aria-label="视图切换">
          <button
            class="vs-btn"
            :class="{ active: displayMode === 'list' }"
            @click="setDisplayMode('list')"
            title="列表视图"
            aria-label="列表视图"
          >
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" /></svg>
          </button>
          <button
            class="vs-btn"
            :class="{ active: displayMode === 'video' }"
            @click="setDisplayMode('video')"
            title="视频视图"
            aria-label="视频视图"
          >
            <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M4 4h16a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zm6 4v8l6-4-6-4z" /></svg>
          </button>
        </div>
      </div>

      <!-- 筛选指示条：显示当前按 分类/标签/收藏 过滤，可一键清除 -->
      <div class="filter-bar" v-if="filterCategory || filterTags.length || filterFavorite">
        <span class="filter-chip" v-if="filterCategory">
          分类：<b>{{ activeCatLabel }}</b>
        </span>
        <span class="filter-chip" v-if="filterTags.length">
          标签：
          <b v-for="t in activeTagLabels" :key="t.id" class="chip-tag">#{{ t.name }}</b>
        </span>
        <span class="filter-chip fav" v-if="filterFavorite">
          ★ 只看常用
        </span>
        <button class="filter-clear" @click="clearFilter" title="清除筛选">✕ 全部</button>
      </div>

      <div class="bookmark-list" v-if="!loading && displayMode === 'list'">
        <div class="empty" v-if="displayList.length === 0">
          <div class="icon">📭</div>
          还没有收藏，点「添加书签」或去安装浏览器插件吧！
        </div>
        <BookmarkItem
          v-for="b in displayList"
          :key="b.id"
          :bookmark="b"
          @delete="onDelete"
          @edit="openEdit"
          @open="goDetail"
          @favorite="toggleFavorite"
          @tag="selectTag"
        />
      </div>

      <!-- 视频视图：Bilibili 风格网格 -->
      <VideoGrid
        v-else-if="!loading && displayMode === 'video'"
        :bookmarks="displayList"
        @delete="onDelete"
        @edit="openEdit"
        @favorite="toggleFavorite"
      />
      <div class="empty video-empty" v-if="!loading && displayMode === 'video' && displayList.length === 0">
        <div class="icon">🎬</div>
        还没有收藏视频，添加书签时勾选「标记为视频」即可在此以视频形式展示。
      </div>
    </main>

    <!-- 分页：右下角上/下翻页图标 -->
    <div class="pager" v-if="totalCount > perPage">
      <button
        class="pager-btn"
        :disabled="currentOffset <= 0"
        @click="prevPage"
        title="上一页 (PageUp)"
        aria-label="上一页"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M12 8l-6 6 1.4 1.4L12 10.8l4.6 4.6L18 14z" />
        </svg>
      </button>
      <span class="pager-info">{{ pageNum }} / {{ pageTotal }}</span>
      <button
        class="pager-btn"
        :disabled="currentOffset + perPage >= totalCount"
        @click="nextPage"
        title="下一页 (PageDown)"
        aria-label="下一页"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path fill="currentColor" d="M12 16l6-6-1.4-1.4L12 13.2l-4.6-4.6L6 10z" />
        </svg>
      </button>
    </div>

    <!-- 左侧按钮工具条：刷新/批量/收藏/筛选/管理/导出 -->
    <FabToolbar
      :sidebar-open="sidebarOpen"
      :batch-open="batchOpen"
      :filter-favorite="filterFavorite"
      @refresh="refresh"
      @toggle-batch="toggleBatch"
      @toggle-favorite-filter="toggleFavoriteFilter"
      @toggle-sidebar="toggleSidebar"
      @go-admin="goAdmin"
      @export="handleExport"
    />

    <!-- 两个侧边栏（分类/标签筛选、批量操作）均为推开式，不使用遮罩；点击主区域不关闭，靠各自 ✕ 或 Esc 关闭 -->

    <!-- 左侧筛选侧边栏：分类(一级) → 标签(二级)（推开式，不覆盖主内容） -->
    <FilterSidebar
      :open="sidebarOpen"
      :sidebar-tag-query="sidebarTagQuery"
      :filtered-tree="filteredTree"
      :expanded="expanded"
      :filter-category="filterCategory"
      :filter-tags="filterTags"
      @close="sidebarOpen = false"
      @update:sidebar-tag-query="sidebarTagQuery = $event"
      @clear-filter="clearFilter"
      @toggle-category="toggleCategory"
      @select-tag="selectTag"
    />

    <!-- 批量操作侧边栏（对当前筛选条件下所有匹配数据生效） -->
    <BatchSidebar
      :open="batchOpen"
      :total-count="totalCount"
      :categories="categories"
      :all-tags="allTags"
      :batch-tag-ids="batchTagIds"
      @close="batchOpen = false"
      @apply="applyBatch"
      @toggle-tag="toggleBatchTag"
      @browse-tags="showAllTag = true"
      @confirm-delete="confirmBatchDelete"
    />

    <!-- 全部标签弹窗：分类别展示 + 搜索，点击标签即在批量侧边栏选中 -->
    <AllTag
      v-if="showAllTag"
      :tags="allTags"
      :categories="categories"
      :selected="batchTagIds"
      @toggle="toggleBatchTag"
      @close="showAllTag = false"
    />
    </template>

    <!-- 新增 / 编辑 弹窗（全局：主页面与管理后台共用） -->
    <BookmarkForm
      :show-form="showForm"
      :editing="editing"
      :submitting="submitting"
      :form="form"
      :form-error="formError"
      :categories="categories"
      :form-tag-options="formTagOptions"
      @close="closeForm"
      @submit="submitForm"
      @url-blur="onUrlBlur"
      @preview-error="onPreviewError"
    />

    <div class="toast" :class="{ show: toastShow }">{{ toastMsg }}</div>

    <!-- 自定义警告/确认弹窗（批量无筛选、一键删除等） -->
    <ConfirmDialog
      v-if="confirmState"
      :title="confirmState.title"
      :message="confirmState.message"
      :danger="confirmState.danger"
      :highlight="confirmState.highlight"
      @confirm="doConfirm"
      @cancel="cancelConfirm"
    />
  </div>
</template>

<style src="./styles/app.css" scoped></style>
