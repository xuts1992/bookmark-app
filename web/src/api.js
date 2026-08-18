// 与后端通信的 API 封装。
// 开发时（Vite 3000）通过 vite proxy 把 /api 转发到 Go 9000；
// 构建后（Go 9000 同源）直接请求 /api，无需额外配置。
const BASE = '/api'

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const e = await res.json()
      msg = e.error || msg
    } catch (_) {}
    throw new Error(msg)
  }
  // 204 无内容
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  health: () => request('GET', '/health'),
  list: (limit = 10, offset = 0, categoryId = null, tagIds = [], isVideo = false, favorite = false) => {
    let path = `/bookmarks?limit=${limit}&offset=${offset}`
    if (categoryId) path += `&category_id=${categoryId}`
    for (const t of tagIds || []) path += `&tag_id=${t}`
    if (isVideo) path += `&is_video=1`
    if (favorite) path += `&favorite=1`
    return request('GET', path)
  },
  search: (q, limit = 10, offset = 0, categoryId = null, tagIds = [], isVideo = false, favorite = false) => {
    let path = `/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
    if (categoryId) path += `&category_id=${categoryId}`
    for (const t of tagIds || []) path += `&tag_id=${t}`
    if (isVideo) path += `&is_video=1`
    if (favorite) path += `&favorite=1`
    return request('GET', path)
  },
  stats: () => request('GET', '/stats'),
  // 分类 / 标签
  categories: () => request('GET', '/categories'),
  createCategory: (name) => request('POST', '/categories', { name }),
  updateCategory: (id, name) => request('PUT', `/categories/${id}`, { name }),
  deleteCategory: (id) => request('DELETE', `/categories/${id}`),
  tags: (categoryId = null) => {
    let path = '/tags'
    if (categoryId) path += `?category_id=${categoryId}`
    return request('GET', path)
  },
  createTag: (name, categoryId = null) => request('POST', '/tags', { name, category_id: categoryId }),
  updateTag: (id, name, categoryId = null) => request('PUT', `/tags/${id}`, { name, category_id: categoryId }),
  deleteTag: (id) => request('DELETE', `/tags/${id}`),
  add: (data) => request('POST', '/bookmarks', data),
  get: (id) => request('GET', `/bookmarks/${id}`),
  update: (id, data) => request('PUT', `/bookmarks/${id}`, data),
  favorite: (id, v) => request('PUT', `/bookmarks/${id}/favorite`, { favorite: v }),
  updateDetail: (id, content) => request('PUT', `/bookmarks/${id}/detail`, { content }),
  remove: (id) => request('DELETE', `/bookmarks/${id}`),
  // 批量操作：对「当前筛选条件」下所有匹配的书签生效（filter + 操作）
  batch: (payload) => request('POST', '/bookmarks/batch', payload),
  // 资源同步设置
  settings: () => request('GET', '/settings'),
  updateSettings: (data) => request('PUT', '/settings', data)
}
