<script setup>
// 逻辑已抽到 src/composables：useApp（主逻辑）、useAdminRoute（admin 路由）、filters（URL 筛选持久化）
// 这里仅做薄壳：引入 useApp 并解构模板所需的全部绑定。模板保持原样。
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import BookmarkItem from './components/BookmarkItem.vue'
import VideoGrid from './components/VideoGrid.vue'
import AdminView from './components/AdminView.vue'
import DetailView from './components/DetailView.vue'
import AllTag from './components/AllTag.vue'
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
  batchOpen, toggleBatch, batchApply, refresh
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

// 批量侧边栏的本地 UI 状态
const batchCategory = ref(null)   // 设置分类：null=不修改，0=默认，否则分类 id
const batchTagMode = ref('add')   // 标签操作模式：add / remove
const batchTagIds = ref([])       // 选中的标签 id
const showAllTag = ref(false)     // 是否弹出「全部标签」选择窗
// 切换某个标签的选中状态（批量侧边栏与 AllTag 弹窗共用）
function toggleBatchTag(id) {
  const i = batchTagIds.value.indexOf(id)
  if (i >= 0) batchTagIds.value.splice(i, 1)
  else batchTagIds.value.push(id)
}
// 已选标签对象列表（用于在侧边栏展示名称）
const selectedTagList = computed(() =>
  batchTagIds.value.map((id) => allTags.value.find((t) => t.id === id)).filter(Boolean)
)
function confirmBatchDelete() {
  if (window.confirm(`确定要删除当前筛选条件下的全部 ${totalCount} 条书签吗？此操作不可恢复！`)) {
    batchApply({ delete: true })
  }
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

    <!-- 左侧刷新按钮：点击重新加载书签/分类/统计；位于批量按钮上方 -->
    <button
      class="refresh-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      :disabled="batchOpen"
      @click="refresh"
      title="刷新"
      aria-label="刷新"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
      </svg>
    </button>

    <!-- 左侧批量操作按钮：点击打开批量侧边栏；位于收藏按钮上方 -->
    <button
      class="batch-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      :disabled="sidebarOpen"
      @click="toggleBatch"
      title="批量操作"
      aria-label="批量操作"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      </svg>
    </button>

    <!-- 左侧收藏按钮：点击筛选「只看常用」；位于侧边栏按钮上方 -->
    <button
      class="favorite-fab"
      :class="{ shifted: sidebarOpen || batchOpen, active: filterFavorite }"
      @click="toggleFavoriteFilter"
      title="只看常用"
      aria-label="只看常用"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M12 17.27l5.18 3.15c.42.26.97-.1.86-.57l-1.37-5.94 4.6-3.99c.39-.34.18-.97-.36-.99l-6.05-.52-2.36-5.58c-.2-.47-.84-.47-1.04 0L9.14 8.31l-6.05.52c-.54.02-.75.65-.36.99l4.6 3.99-1.37 5.94c-.11.47.44.83.86.57L12 17.27z" />
      </svg>
    </button>

    <!-- 左侧圆形按钮：点击从左侧滑出筛选侧边栏 -->
    <button
      class="sidebar-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      :disabled="batchOpen"
      @click="toggleSidebar"
      title="筛选分类 / 标签"
      aria-label="打开筛选侧边栏"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11z" />
      </svg>
    </button>

    <!-- 左侧管理按钮：点击跳转管理后台 -->
    <button
      class="admin-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      @click="goAdmin"
      title="管理后台"
      aria-label="打开管理后台"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.21.09.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
      </svg>
    </button>

    <!-- 两个侧边栏（分类/标签筛选、批量操作）均为推开式，不使用遮罩；点击主区域不关闭，靠各自 ✕ 或 Esc 关闭 -->

    <!-- 左侧筛选侧边栏：分类(一级) → 标签(二级)（推开式，不覆盖主内容） -->
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-head">
        <span class="sidebar-title">分类 / 标签</span>
        <button class="sidebar-close" @click="sidebarOpen = false" aria-label="关闭">✕</button>
      </div>
      <div class="sidebar-body">
        <div class="sidebar-search">
          <input
            type="text"
            v-model="sidebarTagQuery"
            placeholder="搜索标签..."
          />
          <button
            v-if="sidebarTagQuery"
            class="sidebar-search-clear"
            @click="sidebarTagQuery = ''"
            aria-label="清空搜索"
            title="清空"
          >✕</button>
        </div>
        <button class="tree-cat all" :class="{ active: !filterCategory && filterTags.length === 0 }" @click="clearFilter">
          全部书签
        </button>
        <div class="tree-node" v-for="cat in filteredTree" :key="cat.id">
          <div class="tree-cat-row">
            <button
              type="button"
              class="tree-toggle"
              @click="toggleCategory(cat.id)"
              :aria-label="expanded[cat.id] ? '收起' : '展开'"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" :class="{ rotated: expanded[cat.id] }">
                <path fill="currentColor" d="M9 6l6 6-6 6z" />
              </svg>
            </button>
            <span
              class="tree-cat label"
              @click="toggleCategory(cat.id)"
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
              @click="selectTag(t)"
            >
              # {{ t.name }}
            </button>
            <span v-if="cat.tags.length === 0" class="tree-tag-empty">暂无标签</span>
          </div>
        </div>
        <div class="sidebar-empty" v-if="filteredTree.length === 0 && sidebarTagQuery">未找到匹配标签</div>
      </div>
    </aside>

    <!-- 批量操作侧边栏（仿标签侧边栏）：对当前筛选条件下所有匹配数据生效 -->
    <aside class="sidebar batch-sidebar" :class="{ open: batchOpen }">
      <div class="sidebar-head">
        <span class="sidebar-title">批量操作</span>
        <button class="sidebar-close" @click="batchOpen = false" aria-label="关闭">✕</button>
      </div>
      <div class="sidebar-body batch-body">
        <p class="batch-hint">将对当前筛选条件下的 <b>{{ totalCount }}</b> 条书签生效（作用于全部匹配，不仅是当前页展示）。</p>

        <!-- 设置分类 -->
        <div class="batch-section">
          <div class="batch-section-title">设置分类</div>
          <select class="batch-select" v-model="batchCategory">
            <option :value="null">（不修改）</option>
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            <option :value="0">默认</option>
          </select>
          <button class="batch-apply" :disabled="batchCategory === null" @click="batchApply({ set_category: batchCategory })">应用分类</button>
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
              @click="toggleBatchTag(t.id)"
            ># {{ t.name }} ✕</button>
          </div>
          <div class="batch-tag-empty" v-else>尚未选择标签</div>
          <!-- 打开全部标签弹窗的按钮（图标） -->
          <button class="batch-browsetags" @click="showAllTag = true">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58s1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41s-.23-1.06-.59-1.42zM6.5 8C5.67 8 5 7.33 5 6.5S5.67 5 6.5 5 8 5.67 8 6.5 7.33 8 6.5 8z" />
            </svg>
            浏览全部标签
          </button>
          <button
            class="batch-apply"
            :disabled="batchTagIds.length === 0"
            @click="batchTagMode === 'add' ? batchApply({ add_tags: batchTagIds }) : batchApply({ remove_tags: batchTagIds })"
          >{{ batchTagMode === 'add' ? '添加标签' : '移除标签' }}</button>
        </div>

        <!-- 一键收藏 -->
        <div class="batch-section">
          <div class="batch-section-title">收藏</div>
          <button class="batch-apply wide" @click="batchApply({ favorite: true })">★ 全部标记为收藏</button>
          <button class="batch-apply wide" @click="batchApply({ favorite: false })">☆ 全部取消收藏</button>
        </div>

        <!-- 一键删除 -->
        <div class="batch-section">
          <div class="batch-section-title">删除</div>
          <button class="batch-danger" @click="confirmBatchDelete">🗑 一键删除（不可恢复）</button>
        </div>
      </div>
    </aside>

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
    <div class="modal-mask" v-if="showForm" @click.self="closeForm">
      <div class="modal">
        <div class="modal-title">{{ editing ? '编辑书签' : '添加书签' }}</div>
        <form @submit.prevent="submitForm">
          <label>
            标题 *
            <input v-model="form.title" type="text" placeholder="例如：GitHub" />
          </label>
          <label>
            网址 * (URL)
            <input v-model="form.url" type="text" placeholder="https://..." />
          </label>
          <label>
            图标 (可选)
            <input v-model="form.favicon" type="text" placeholder="https://.../favicon.ico" @blur="onUrlBlur" />
            <img v-if="form.favicon.trim()" :src="form.favicon" class="field-preview" alt="图标预览" @error="onPreviewError" />
          </label>
          <label>
            作者 (可选)
            <input v-model="form.author" type="text" placeholder="作者 / 来源" />
          </label>
          <label>
            合集 (可选)
            <input v-model="form.collection" type="text" placeholder="所属合集 / 系列" />
          </label>
          <label>
            封面图 (可选)
            <input v-model="form.cover" type="text" placeholder="https://.../cover.jpg" />
            <img v-if="form.cover.trim()" :src="form.cover" class="field-preview cover" alt="封面预览" @error="onPreviewError" />
          </label>
          <div class="video-flag-row">
            <label class="video-flag">
              <input type="checkbox" v-model="form.isVideo" />
              标记为视频（在「视频」视图中以 Bilibili 风格卡片展示）
            </label>
            <label class="duration-field" v-if="form.isVideo">
              时长 (可选)
              <input v-model="form.duration" type="text" placeholder="如 12:34" />
            </label>
          </div>
          <label>
            分类 (可选)
            <select v-model="form.categoryId">
              <option :value="null">默认</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <div class="tag-picker">
            <div class="tag-picker-title">标签 (可多选)</div>
            <div class="tag-options">
              <label v-for="t in formTagOptions" :key="t.id" class="tag-check">
                <input type="checkbox" :value="t.id" v-model="form.tagIds" />
                {{ t.name }}
              </label>
              <span v-if="formTagOptions.length === 0" class="tag-empty">该分类下暂无标签</span>
            </div>
          </div>
          <div class="form-error" v-if="formError">{{ formError }}</div>
          <div class="modal-actions">
            <button type="button" class="btn-cancel" @click="closeForm">取消</button>
            <button type="submit" class="btn-submit" :disabled="submitting">
              {{ submitting ? '保存中...' : (editing ? '保存修改' : '添加') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <div class="toast" :class="{ show: toastShow }">{{ toastMsg }}</div>
  </div>
</template>

<style src="./styles/app.css" scoped></style>
