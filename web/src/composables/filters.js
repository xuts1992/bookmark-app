// 主页筛选状态（搜索 q / 分类 cat / 标签 tags / 视图 view）持久化到 URL query，
// 刷新或深链接后仍能恢复筛选结果。仅作用于 main 视图。
// 这些函数是无状态的纯工具：读取/写入传入的 state 对象（其字段均为 ref）。

export function readFiltersFromURL(state) {
  const params = new URLSearchParams(location.search)
  state.searchQuery.value = params.get('q') || ''
  state.displayMode.value = params.get('view') === 'video' ? 'video' : 'list'
  const cat = params.get('cat')
  state.filterCategory.value = cat ? Number(cat) : null
  const tags = params.get('tags')
  state.filterTags.value = tags ? tags.split(',').filter(Boolean).map(Number) : []
  state.filterFavorite.value = params.get('fav') === '1'
}

export function writeFiltersToURL(state) {
  if (state.view.value !== 'main') return
  const params = new URLSearchParams()
  if (state.displayMode.value === 'video') params.set('view', 'video')
  const q = state.searchQuery.value.trim()
  if (q) params.set('q', q)
  if (state.filterCategory.value != null) params.set('cat', String(state.filterCategory.value))
  if (state.filterTags.value.length) params.set('tags', state.filterTags.value.join(','))
  if (state.filterFavorite.value) params.set('fav', '1')
  const qs = params.toString()
  const base = location.pathname.replace(/\/+$/, '') || '/'
  state.lastMainPath.value = qs ? base + '?' + qs : base
  history.replaceState(null, '', state.lastMainPath.value)
}
