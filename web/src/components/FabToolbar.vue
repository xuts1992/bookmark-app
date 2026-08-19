<script setup>
defineProps({
  sidebarOpen: { type: Boolean, default: false },
  batchOpen: { type: Boolean, default: false },
  filterFavorite: { type: Boolean, default: false }
})
const emit = defineEmits(['refresh', 'toggle-batch', 'toggle-favorite-filter', 'toggle-sidebar', 'go-admin', 'export'])
</script>

<template>
  <div class="fab-toolbar">
    <!-- 刷新：重新加载书签/分类/统计 -->
    <button
      class="refresh-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      :disabled="batchOpen"
      @click="emit('refresh')"
      title="刷新"
      aria-label="刷新"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
      </svg>
    </button>

    <!-- 批量操作 -->
    <button
      class="batch-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      :disabled="sidebarOpen"
      @click="emit('toggle-batch')"
      title="批量操作"
      aria-label="批量操作"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
      </svg>
    </button>

    <!-- 只看常用 -->
    <button
      class="favorite-fab"
      :class="{ shifted: sidebarOpen || batchOpen, active: filterFavorite }"
      @click="emit('toggle-favorite-filter')"
      title="只看常用"
      aria-label="只看常用"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M12 17.27l5.18 3.15c.42.26.97-.1.86-.57l-1.37-5.94 4.6-3.99c.39-.34.18-.97-.36-.99l-6.05-.52-2.36-5.58c-.2-.47-.84-.47-1.04 0L9.14 8.31l-6.05.52c-.54.02-.75.65-.36.99l4.6 3.99-1.37 5.94c-.11.47.44.83.86.57L12 17.27z" />
      </svg>
    </button>

    <!-- 筛选分类/标签 -->
    <button
      class="sidebar-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      :disabled="batchOpen"
      @click="emit('toggle-sidebar')"
      title="筛选分类 / 标签"
      aria-label="打开筛选侧边栏"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11z" />
      </svg>
    </button>

    <!-- 管理后台 -->
    <button
      class="admin-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      @click="emit('go-admin')"
      title="管理后台"
      aria-label="打开管理后台"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.03 7.03 0 00-1.62-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.71 8.84a.5.5 0 00.12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.21.09.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z" />
      </svg>
    </button>

    <!-- 导出：导出当前筛选条件下的书签（JSON 下载） -->
    <button
      class="export-fab"
      :class="{ shifted: sidebarOpen || batchOpen }"
      @click="emit('export')"
      title="导出"
      aria-label="导出书签"
    >
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* 左侧圆形按钮 */
.sidebar-fab {
  position: fixed;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: var(--primary);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(102, 126, 234, 0.4);
  z-index: 600;
  transition: opacity 0.2s, transform 0.15s, background 0.2s, left 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.sidebar-fab:hover {
  background: #5566d6;
}
.sidebar-fab:active {
  transform: translateY(-50%) scale(0.94);
}
.sidebar-fab.shifted {
  left: 296px;
}
/* 左侧管理按钮（齿轮图标）：点击跳转后台管理页 */
.admin-fab {
  position: fixed;
  left: 16px;
  top: calc(50% + 60px);
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #2d3142;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(45, 49, 66, 0.4);
  z-index: 600;
  transition: opacity 0.2s, transform 0.15s, background 0.2s, left 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.admin-fab:hover {
  background: #3d4258;
}
.admin-fab:active {
  transform: translateY(-50%) scale(0.94);
}
.admin-fab.shifted {
  left: 296px;
}
/* 左侧导出按钮（下载箭头图标）：位于管理按钮下方，导出当前筛选条件下的书签 */
.export-fab {
  position: fixed;
  left: 16px;
  top: calc(50% + 120px);
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #34c759;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(52, 199, 89, 0.42);
  z-index: 600;
  transition: opacity 0.2s, transform 0.15s, background 0.2s, left 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.export-fab:hover {
  background: #2bb34c;
}
.export-fab:active {
  transform: translateY(-50%) scale(0.94);
}
.export-fab.shifted {
  left: 296px;
}
/* 左侧收藏按钮（星标图标）：位于筛选侧边栏按钮上方。未激活态浅色，激活态实色 */
.favorite-fab {
  position: fixed;
  left: 16px;
  top: calc(50% - 60px);
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #fff3d6;
  color: #ffb31a;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(255, 179, 26, 0.2);
  z-index: 600;
  transition: opacity 0.2s, transform 0.15s, background 0.2s, color 0.2s, left 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.favorite-fab:hover {
  background: #ffe6ad;
  color: #ffa000;
}
.favorite-fab:active {
  transform: translateY(-50%) scale(0.94);
}
.favorite-fab.active {
  background: #ffb31a;
  color: #fff;
  box-shadow: 0 6px 22px rgba(255, 143, 0, 0.6);
}
.favorite-fab.shifted {
  left: 296px;
}
/* 左侧批量操作按钮（铅笔图标）：位于收藏按钮上方 */
.batch-fab {
  position: fixed;
  left: 16px;
  top: calc(50% - 120px);
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #2bb3a3;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(43, 179, 163, 0.42);
  z-index: 600;
  transition: opacity 0.2s, transform 0.15s, background 0.2s, left 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.batch-fab:hover {
  background: #239c8e;
}
.batch-fab:active {
  transform: translateY(-50%) scale(0.94);
}
.batch-fab.shifted {
  left: 296px;
}
/* 左侧刷新按钮（循环箭头图标）：位于批量按钮上方，点击重新加载数据 */
.refresh-fab {
  position: fixed;
  left: 16px;
  top: calc(50% - 180px);
  transform: translateY(-50%);
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #3aa0ff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(58, 160, 255, 0.42);
  z-index: 600;
  transition: opacity 0.2s, transform 0.15s, background 0.2s, left 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.refresh-fab:hover {
  background: #2b8de8;
}
.refresh-fab:active {
  transform: translateY(-50%) scale(0.94);
}
.refresh-fab.shifted {
  left: 296px;
}
/* 侧边栏互斥：打开筛选侧边栏时批量按钮禁用；打开批量侧边栏时刷新/筛选按钮禁用 */
.batch-fab:disabled,
.refresh-fab:disabled,
.sidebar-fab:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
.batch-fab:disabled:hover {
  background: #2bb3a3;
}
.refresh-fab:disabled:hover {
  background: #3aa0ff;
}
.sidebar-fab:disabled:hover {
  background: var(--primary);
}
.batch-fab:disabled:active,
.refresh-fab:disabled:active,
.sidebar-fab:disabled:active {
  transform: translateY(-50%);
}
</style>
