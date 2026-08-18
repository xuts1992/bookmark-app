import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { api } from '../api.js'
import { useAdminRoute } from './useAdminRoute.js'
import { readFiltersFromURL, writeFiltersToURL } from './filters.js'

// 应用主逻辑（原 App.vue 的 <script setup> 抽出）。
// 组合「数据加载/筛选/搜索/视图」与「admin 路由」「URL 筛选持久化」，
// 返回模板需要的所有响应式状态与方法。
export function useApp() {
  const bookmarks = ref([])
  const total = ref(0)
  const today = ref(0)
  const loading = ref(true)
  const searchQuery = ref('')
  const toastMsg = ref('')
  const toastShow = ref(false)

  let toastTimer = null
  function showToast(msg) {
    toastMsg.value = msg
    toastShow.value = true
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toastShow.value = false), 2000)
  }

  // 表单（新增 / 编辑 共用）
  const showForm = ref(false)
  const editing = ref(null) // null=新增，否则为正在编辑的书签
  const submitting = ref(false)
  const form = ref({ id: null, title: '', url: '', favicon: '', author: '', collection: '', cover: '', isVideo: false, duration: '', categoryId: null, tagIds: [] })
  const formError = ref('')

  // 分类与标签（表单下拉/多选 & 侧边栏筛选树）
  const categories = ref([])
  const allTags = ref([])
  const filterCategory = ref(null)    // 筛选：分类 id，null=全部
  const filterTags = ref([])          // 筛选：标签 id 数组（多选，AND：须同时拥有全部标签）
  const filterFavorite = ref(false)   // 筛选：仅显示收藏（星标）的数据

  // 侧边栏（左侧筛选抽屉）
  const sidebarOpen = ref(false)
  const sidebarTagQuery = ref('') // 侧边栏内按标签名搜索
  const expanded = ref({}) // 各分类的展开状态（默认展开，点击分类可折叠/展开，但不可作为筛选选中）

  // 批量操作抽屉
  const batchOpen = ref(false)

  // 首页展示模式：list（列表）= 默认书签列表；video（视频）= Bilibili 风格视频网格
  const displayMode = ref('list')

  // 详情页（/page/{id}）：detailId 为当前查看的 id，detailBookmark 为其完整数据
  const detailId = ref(null)
  const detailBookmark = ref(null)
  const detailLoading = ref(false)

  // 分页
  const perPage = ref(10)
  const currentOffset = ref(0)
  const totalCount = ref(0)

  // 由 categories + allTags 构建两级树：分类(一级) → 标签(二级)
  const tree = computed(() => {
    return categories.value.map((cat) => ({
      id: cat.id,
      name: cat.name,
      tags: allTags.value.filter((t) => (t.category_id || null) === cat.id)
    }))
  })

  // 侧边栏标签搜索：按标签名过滤
  const filteredTree = computed(() => {
    const q = sidebarTagQuery.value.trim().toLowerCase()
    return tree.value
      .map((cat) => ({
        ...cat,
        tags: q ? cat.tags.filter((t) => t.name.toLowerCase().includes(q)) : cat.tags
      }))
      .filter((cat) => (q ? cat.tags.length > 0 : true))
  })

  // 当前选中的分类 / 标签 名称（用于筛选指示条）
  const activeCatLabel = computed(() => {
    if (!filterCategory.value) return ''
    const c = categories.value.find((x) => x.id === filterCategory.value)
    return c ? c.name : ''
  })
  const activeTagLabels = computed(() =>
    filterTags.value
      .map((id) => allTags.value.find((t) => t.id === id))
      .filter(Boolean)
  )

  async function loadMeta() {
    try {
      const [cats, tags] = await Promise.all([api.categories(), api.tags()])
      // 将「默认」分类排到最前面，其余保持原顺序（稳定的分区排序）
      categories.value = cats.slice().sort((a, b) => {
        const rank = (x) => (x.name === '默认' ? 0 : 1)
        return rank(a) - rank(b)
      })
      allTags.value = tags
      expandAllCategories()
    } catch (_) {}
  }

  // 刷新：重新拉取书签列表、分类/标签元数据与统计
  async function refresh() {
    try {
      await Promise.all([loadData(), loadMeta(), refreshStats()])
    } catch (_) {}
  }

  // 表单中按已选分类过滤可勾选的标签
  const formTagOptions = computed(() => {
    const cid = form.value.categoryId
    if (!cid) return allTags.value
    return allTags.value.filter((t) => t.category_id === cid)
  })

  function openAdd() {
    editing.value = null
    form.value = { id: null, title: '', url: '', favicon: '', author: '', collection: '', cover: '', isVideo: false, duration: '', categoryId: null, tagIds: [] }
    formError.value = ''
    showForm.value = true
  }

  function openEdit(b) {
    editing.value = b
    form.value = {
      id: b.id,
      title: b.title,
      url: b.url,
      favicon: b.favicon || '',
      author: b.author || '',
      collection: b.collection || '',
      cover: b.cover || '',
      isVideo: !!b.is_video,
      duration: b.duration || '',
      categoryId: b.category_id ?? null,
      tagIds: (b.tag_list || []).map((t) => t.id)
    }
    formError.value = ''
    showForm.value = true
  }

  function closeForm() {
    showForm.value = false
    editing.value = null
  }

  // URL 输入框失焦时：若未填写图标，则自动按域名填充 favicon 地址（后端会下载到本地）
  function onUrlBlur() {
    const u = form.value.url.trim()
    if (u && !form.value.favicon.trim()) {
      try {
        const host = new URL(u).hostname
        if (host) form.value.favicon = `https://${host}/favicon.ico`
      } catch (_) {}
    }
  }
  // 预览图加载失败时隐藏，避免破图
  function onPreviewError(e) {
    e.target.style.display = 'none'
  }

  async function submitForm() {
    const payload = {
      title: form.value.title.trim(),
      url: form.value.url.trim(),
      favicon: form.value.favicon.trim(),
      author: form.value.author.trim(),
      collection: form.value.collection.trim(),
      cover: form.value.cover.trim(),
      is_video: form.value.isVideo,
      duration: form.value.duration.trim(),
      category_id: form.value.categoryId || null,
      tag_ids: form.value.tagIds
    }
    if (!payload.title || !payload.url) {
      formError.value = '标题和网址不能为空'
      return
    }
    submitting.value = true
    formError.value = ''
    try {
      if (editing.value) {
        await api.update(editing.value.id, payload)
        showToast('更新成功')
      } else {
        await api.add(payload)
        currentOffset.value = 0
        showToast('收藏成功')
      }
      closeForm()
      await loadMeta()
      await loadData()
      await refreshStats()
    } catch (e) {
      formError.value = e.message || '操作失败'
    } finally {
      submitting.value = false
    }
  }

  // 当前展示列表（分页后由后端返回当前页数据）
  const displayList = computed(() => bookmarks.value)

  const pageNum = computed(() => Math.floor(currentOffset.value / perPage.value) + 1)
  const pageTotal = computed(() => Math.max(1, Math.ceil(totalCount.value / perPage.value)))

  // 加载当前页：有搜索词调 /search，否则调 /list，都带 limit/offset 与分类/标签过滤
  async function loadData() {
    loading.value = true
    try {
      const q = searchQuery.value.trim()
      const cat = filterCategory.value
      const tags = filterTags.value
      const isVideo = displayMode.value === 'video'
      const fav = filterFavorite.value
      let data
      if (q) {
        data = await api.search(q, perPage.value, currentOffset.value, cat, tags, isVideo, fav)
      } else {
        data = await api.list(perPage.value, currentOffset.value, cat, tags, isVideo, fav)
      }
      bookmarks.value = data.items
      totalCount.value = data.total
      // 若当前偏移超出范围（如删除了最后一页的数据），回退到上一页重新加载
      if (currentOffset.value > 0 && currentOffset.value >= data.total) {
        currentOffset.value = Math.max(0, data.total - perPage.value)
        data = q
          ? await api.search(q, perPage.value, currentOffset.value, cat, tags, isVideo, fav)
          : await api.list(perPage.value, currentOffset.value, cat, tags, isVideo, fav)
        bookmarks.value = data.items
      }
    } catch (e) {
      showToast('无法连接服务器：' + e.message)
    } finally {
      loading.value = false
    }
  }

  // 总收藏数 / 今日新增 取自全局统计接口（与分页无关）
  async function refreshStats() {
    try {
      const s = await api.stats()
      total.value = s.total
      today.value = s.today
    } catch (_) {}
  }

  // 翻页后滚动到顶部
  async function goPage(delta) {
    const next = currentOffset.value + delta * perPage.value
    if (next < 0 || next >= totalCount.value) return
    currentOffset.value = next
    await loadData()
    await nextTick()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const prevPage = () => goPage(-1)
  const nextPage = () => goPage(1)

  async function onSearch() {
    currentOffset.value = 0
    await loadData()
    writeFiltersToURL(state)
  }

  // 清空搜索框（点击右侧 x 号）
  function clearSearch() {
    searchQuery.value = ''
    currentOffset.value = 0
    loadData()
    writeFiltersToURL(state)
  }

  // 分类下拉（搜索框旁）：切换分类即筛选，并清空已选标签（分类与多标签筛选互斥）
  function onCategoryChange() {
    filterTags.value = []
    currentOffset.value = 0
    loadData()
    writeFiltersToURL(state)
  }
  function selectTag(tag) {
    // 多标签模式：点击切换选中；不再强制绑定其所属分类，便于跨分类组合与 AND 筛选
    filterCategory.value = null
    const i = filterTags.value.indexOf(tag.id)
    if (i === -1) filterTags.value.push(tag.id)
    else filterTags.value.splice(i, 1)
    currentOffset.value = 0
    loadData()
    writeFiltersToURL(state)
  }
  function clearFilter() {
    filterCategory.value = null
    filterTags.value = []
    filterFavorite.value = false
    currentOffset.value = 0
    loadData()
    writeFiltersToURL(state)
  }
  // 切换「仅看收藏」筛选（星标）：点击主页面收藏按钮触发
  function toggleFavoriteFilter() {
    filterFavorite.value = !filterFavorite.value
    currentOffset.value = 0
    loadData()
    writeFiltersToURL(state)
  }
  // 切换单条书签的收藏状态：乐观更新本地数据，并同步详情页对象
  async function toggleFavorite(id) {
    let target = bookmarks.value.find((x) => x.id === id)
    if (!target && detailBookmark.value && detailBookmark.value.id === id) {
      target = detailBookmark.value
    }
    if (!target) return
    const next = !target.is_favorite
    // 取消收藏时先确认，避免误触
    if (!next && !window.confirm('确定取消收藏吗？')) {
      return
    }
    try {
      await api.favorite(id, next)
      target.is_favorite = next
      // 若当前正处于「仅看收藏」且刚取消收藏，则该条应立即移出列表
      if (filterFavorite.value && !next) {
        bookmarks.value = bookmarks.value.filter((x) => x.id !== id)
        totalCount.value = Math.max(0, totalCount.value - 1)
      }
      showToast(next ? '已收藏 ★' : '已取消收藏')
    } catch (e) {
      showToast('操作失败：' + e.message)
    }
  }
  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }
  // 打开/关闭批量操作抽屉
  function toggleBatch() {
    batchOpen.value = !batchOpen.value
  }
  // 当前主页筛选条件（与 list/search 接口一致），批量操作据此作用于全部匹配数据
  function currentFilter() {
    return {
      category_id: filterCategory.value,
      tag_ids: filterTags.value,
      is_video: displayMode.value === 'video',
      q: searchQuery.value.trim(),
      favorite: filterFavorite.value
    }
  }
  // 批量操作：将操作叠加到当前筛选条件上，作用于「所有匹配」的数据（非当前页展示）
  async function batchApply(ops) {
    try {
      const payload = Object.assign({ filter: currentFilter() }, ops)
      const data = await api.batch(payload)
      const n = data.affected || 0
      showToast((data.message || '批量操作完成') + (n ? `（${n} 条）` : ''))
      // 关闭抽屉并刷新当前页数据
      batchOpen.value = false
      if (ops.delete) {
        sidebarOpen.value = false
      }
      currentOffset.value = 0
      await loadData()
      writeFiltersToURL(state)
    } catch (e) {
      showToast('批量操作失败：' + e.message)
    }
  }

  // 打开详情页：pushState 到 /page/{id}，并加载该书签完整数据
  function goDetail(id) {
    detailId.value = id
    history.pushState(null, '', '/page/' + id)
    view.value = 'detail'
    loadDetail(id)
  }
  // 按 id 拉取单个书签详情（含分类/标签/详情正文）
  async function loadDetail(id) {
    detailLoading.value = true
    detailBookmark.value = null
    try {
      const data = await api.get(id)
      detailBookmark.value = data.bookmark
    } catch (e) {
      showToast('加载详情失败：' + e.message)
    } finally {
      detailLoading.value = false
    }
  }
  // 富文本编辑器保存详情正文：调用专用接口并更新本地详情数据
  async function saveDetail(content) {
    const id = detailId.value
    if (!id) return
    try {
      const data = await api.updateDetail(id, content)
      detailBookmark.value = data.bookmark
      showToast('详情已保存')
    } catch (e) {
      showToast('保存详情失败：' + e.message)
    }
  }
  // 默认展开所有分类（首次加载后由 loadMeta 触发）
  function expandAllCategories() {
    const map = {}
    for (const c of categories.value) map[c.id] = true
    expanded.value = map
  }
  // 切换某个分类的折叠/展开状态（分类不可选中，仅用于折叠标签）
  function toggleCategory(id) {
    expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
  }

  async function onDelete(id) {
    if (!confirm('确认删除这个书签？')) return
    try {
      await api.remove(id)
      showToast('删除成功')
      await loadData()
      await refreshStats()
    } catch (e) {
      showToast('删除失败：' + e.message)
    }
  }

  // 测量视频网格当前每行实际渲染的列数（读取计算后的 grid-template-columns）
  function measureColumns() {
    const grid = document.querySelector('.video-grid')
    if (!grid) return 5
    const t = getComputedStyle(grid).gridTemplateColumns
    const n = t.split(' ').filter((s) => s.trim()).length
    return n >= 1 ? n : 1
  }
  // 根据列数自动设定每页拉取条数：视频视图 = 列数 × 2；列表视图固定 10
  function recomputePerPage() {
    if (displayMode.value !== 'video') {
      perPage.value = 10
      return
    }
    perPage.value = Math.max(1, measureColumns() * 2)
  }
  let resizeTimer = null
  // 视口尺寸变化导致每行列数变化时，自动重算每页条数并回到第一页重载
  function onResize() {
    if (displayMode.value !== 'video') return
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const next = Math.max(1, measureColumns() * 2)
      if (next !== perPage.value) {
        perPage.value = next
        currentOffset.value = 0
        loadData()
      }
    }, 150)
  }
  async function setDisplayMode(m) {
    if (displayMode.value === m) return
    displayMode.value = m
    currentOffset.value = 0
    await nextTick()
    recomputePerPage()
    await loadData()
    writeFiltersToURL(state)
  }

  // 键盘翻页：PageUp 上一页 / PageDown 下一页（输入框内不触发）
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || ''
    if (e.key === 'Escape' && sidebarOpen.value) {
      sidebarOpen.value = false
      return
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    if (e.key === 'PageUp') {
      e.preventDefault()
      prevPage()
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      nextPage()
    }
  }

  // 共享状态对象：供 admin 路由与 URL 筛选持久化读写
  const state = {
    searchQuery,
    filterCategory,
    filterTags,
    filterFavorite,
    displayMode,
    perPage,
    currentOffset,
    totalCount,
    loadData,
    recomputePerPage,
    detailId,
    loadDetail,
    saveDetail
  }
  const { view, goAdmin, goMain, syncRoute, viewFromPath } = useAdminRoute(state)

  onMounted(async () => {
    // 先按 URL 决定视图（admin / detail / main）
    view.value = viewFromPath()
    if (view.value === 'detail') {
      loadDetail(detailId.value)
    } else if (view.value === 'main') {
      readFiltersFromURL(state)
      await nextTick()
      if (displayMode.value === 'video') recomputePerPage()
      loadData()
    }
    refreshStats()
    loadMeta()
    window.addEventListener('keydown', onKey)
    window.addEventListener('popstate', syncRoute)
    window.addEventListener('resize', onResize)
    syncRoute()
  })
  onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('popstate', syncRoute)
    window.removeEventListener('resize', onResize)
  })

  return {
    // 状态
    bookmarks, total, today, loading,
    searchQuery, toastMsg, toastShow,
    showForm, editing, submitting, form, formError,
    categories, allTags, filterCategory, filterTags, filterFavorite,
    sidebarOpen, sidebarTagQuery, expanded,
    batchOpen, toggleBatch, batchApply,
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
    toggleFavoriteFilter, toggleFavorite,
    saveDetail, refresh
  }
}
