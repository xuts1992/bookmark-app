import { ref, nextTick } from 'vue'
import { readFiltersFromURL, writeFiltersToURL } from './filters.js'

// 管理后台路由（main 收藏首页 / admin 管理后台 / detail 详情页），使用 path 路由
// （/admin、/admin/bookmarks、/admin/category、/admin/tag、/admin/settings、
//  /page/{id} 详情页），支持浏览器前进后退与深链接。
// state 由 useApp 提供（含 searchQuery/filterCategory/filterTags/displayMode/
// loadData/recomputePerPage/detailId/loadDetail 等），路由切换时据此恢复筛选并重载。
export function useAdminRoute(state) {
  const view = ref('main')
  const lastMainPath = ref('/')
  // 把 view / lastMainPath 挂到共享 state 上，供 filters.js 读写
  state.view = view
  state.lastMainPath = lastMainPath

  function viewFromPath() {
    const p = location.pathname.replace(/\/+$/, '')
    if (p.startsWith('/admin')) return 'admin'
    // 详情页：/page/{id}（数字 id）
    const m = p.match(/^\/page\/(\d+)$/)
    if (m) {
      state.detailId.value = Number(m[1])
      return 'detail'
    }
    state.detailId.value = null
    return 'main'
  }
  function goAdmin() {
    if (viewFromPath() !== 'admin') {
      history.pushState(null, '', '/admin')
    }
    view.value = 'admin'
  }
  function goMain() {
    if (viewFromPath() !== 'main') {
      history.pushState(null, '', lastMainPath.value)
    }
    view.value = 'main'
    state.detailId.value = null
    readFiltersFromURL(state)
    nextTick(() => {
      if (state.displayMode.value === 'video') state.recomputePerPage()
      state.loadData()
    })
  }
  function syncRoute() {
    const prevDetailId = state.detailId.value
    const v = viewFromPath()
    // 详情页：即使 view 已是 detail，只要 id 变化（/page/3 → /page/5）也要重新加载
    if (v === 'detail') {
      if (view.value === 'detail' && state.detailId.value === prevDetailId) return
      view.value = 'detail'
      state.loadDetail(state.detailId.value)
      return
    }
    if (v === view.value) return // 视图未变化（main 的筛选已在加载时解析），不重复加载
    view.value = v
    if (v === 'main') {
      readFiltersFromURL(state)
      nextTick(() => {
        if (state.displayMode.value === 'video') state.recomputePerPage()
        state.loadData()
      })
    }
  }

  return { view, goAdmin, goMain, syncRoute, viewFromPath }
}
