<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { api } from '../api.js'

const emit = defineEmits(['edit', 'add'])

const loading = ref(false)

// 子页 path 映射：分类 /admin/category、标签 /admin/tag、设置 /admin/settings、回收站 /admin/trash
// （已移除「书签」页 /admin/bookmarks）
const tabPaths = {
  categories: '/admin/category',
  tags: '/admin/tag',
  settings: '/admin/settings',
  trash: '/admin/trash'
}
// 根据当前路径推导激活的子页（支持深链接与浏览器前进后退）
function tabFromPath() {
  const seg = location.pathname.replace(/\/+$/, '').split('/').pop() || ''
  if (seg === 'tag') return 'tags'
  if (seg === 'category') return 'categories'
  if (seg === 'settings') return 'settings'
  if (seg === 'trash') return 'trash'
  return 'categories' // /admin 或 /admin/bookmarks 均归为分类（书签页已移除）
}
const tab = ref(tabFromPath())

// 切换到指定子页：更新本地 tab 并改写地址栏 path（pushState，不刷新页面）
function goTab(name) {
  tab.value = name
  if (name === 'trash') loadTrash()
  const path = tabPaths[name]
  if (location.pathname.replace(/\/+$/, '') !== path) {
    history.pushState({ tab: name }, '', path)
  }
}
function onPopState() {
  tab.value = tabFromPath()
}

const bookmarks = ref([])
const categories = ref([])
const tags = ref([])
const trashItems = ref([])
// 默认配置中受保护（不可删除）的分类/标签：{ categories: ['默认'], tags: [{category, name}] }
const protectedList = ref({ categories: [], tags: [] })

const cName = ref('')
const tName = ref('')
const tCat = ref(null)

const editingCat = ref(null)
const editingCatName = ref('')
const editingTag = ref(null)
const editingTagName = ref('')
const editingTagCat = ref(null)

const toast = ref('')
let toastTimer = null
function showToast(m) {
  toast.value = m
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2000)
}

// 资源同步设置
const settings = ref({ sync_enabled: false, sync_interval_minutes: 60 })
const savingSettings = ref(false)
async function loadSettings() {
  try {
    const s = await api.settings()
    settings.value = {
      sync_enabled: !!s.sync_enabled,
      sync_interval_minutes: s.sync_interval_minutes > 0 ? s.sync_interval_minutes : 60
    }
  } catch (e) {
    showToast('读取设置失败：' + e.message)
  }
}
async function saveSettings() {
  savingSettings.value = true
  try {
    const s = await api.updateSettings({
      sync_enabled: settings.value.sync_enabled,
      sync_interval_minutes: settings.value.sync_interval_minutes
    })
    settings.value = {
      sync_enabled: !!s.sync_enabled,
      sync_interval_minutes: s.sync_interval_minutes > 0 ? s.sync_interval_minutes : 60
    }
    showToast(s.sync_enabled ? '已启用定时同步' : '已关闭定时同步')
  } catch (e) {
    showToast('保存失败：' + e.message)
  } finally {
    savingSettings.value = false
  }
}

async function loadAll() {
  loading.value = true
  try {
    const [b, c, t, p] = await Promise.all([api.list(2000, 0), api.categories(), api.tags(), api.protected()])
    bookmarks.value = b.items
    categories.value = c
    tags.value = t
    protectedList.value = p
  } catch (e) {
    showToast('加载失败：' + e.message)
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  loadAll()
  loadSettings()
  if (tab.value === 'trash') loadTrash()
  window.addEventListener('popstate', onPopState)
})
onUnmounted(() => {
  window.removeEventListener('popstate', onPopState)
})

const catCount = (id) => bookmarks.value.filter((b) => (b.category_id ?? null) === id).length
const tagCount = (id) => bookmarks.value.filter((b) => (b.tag_list || []).some((t) => t.id === id)).length
const catName = (id) => {
  const c = categories.value.find((x) => x.id === id)
  return c ? c.name : '默认'
}

// 分类操作
async function addCategory() {
  const n = cName.value.trim()
  if (!n) return
  try {
    await api.createCategory(n)
    cName.value = ''
    showToast('已添加分类')
    await loadAll()
  } catch (e) {
    showToast(e.message)
  }
}
function startEditCat(c) {
  editingCat.value = c.id
  editingCatName.value = c.name
}
async function saveEditCat() {
  const n = editingCatName.value.trim()
  if (!n) return
  try {
    await api.updateCategory(editingCat.value, n)
    editingCat.value = null
    showToast('已更新')
    await loadAll()
  } catch (e) {
    showToast(e.message)
  }
}
async function deleteCat(c) {
  // 删除前先查询：分类是否在默认配置（tags.toml / default-tags.toml）中 → 禁止删除
  if (protectedList.value.categories.includes(c.name)) {
    showToast(`「${c.name}」在默认配置中，不允许删除（需先编辑配置文件）`)
    return
  }
  if (!confirm(`确认删除分类「${c.name}」？其下书签将移至「默认」，标签将被删除。`)) return
  try {
    await api.deleteCategory(c.id)
    showToast('已删除')
    await loadAll()
  } catch (e) {
    showToast(e.message)
  }
}

// 标签操作
async function addTag() {
  const n = tName.value.trim()
  if (!n) return
  try {
    await api.createTag(n, tCat.value)
    tName.value = ''
    showToast('已添加标签')
    await loadAll()
  } catch (e) {
    showToast(e.message)
  }
}
function startEditTag(t) {
  editingTag.value = t.id
  editingTagName.value = t.name
  editingTagCat.value = t.category_id ?? null
}
async function saveEditTag() {
  const n = editingTagName.value.trim()
  if (!n) return
  try {
    await api.updateTag(editingTag.value, n, editingTagCat.value)
    editingTag.value = null
    showToast('已更新')
    await loadAll()
  } catch (e) {
    showToast(e.message)
  }
}
async function deleteTag(t) {
  // 删除前先查询：标签是否在默认配置（tags.toml / default-tags.toml）中 → 禁止删除
  const inConfig = protectedList.value.tags.some(
    (p) => p.category === catName(t.category_id) && p.name === t.name
  )
  if (inConfig) {
    showToast(`标签「${t.name}」在默认配置中，不允许删除（需先编辑配置文件）`)
    return
  }
  if (!confirm(`确认删除标签「${t.name}」？`)) return
  try {
    await api.deleteTag(t.id)
    showToast('已删除')
    await loadAll()
  } catch (e) {
    showToast(e.message)
  }
}

// —— 回收站 ——
async function loadTrash() {
  try {
    const d = await api.trash()
    trashItems.value = d.items
  } catch (e) {
    showToast('回收站加载失败：' + e.message)
  }
}
async function restoreItem(id) {
  try {
    await api.restoreTrash(id)
    showToast('已恢复')
    await loadTrash()
    await loadAll() // 同步书签计数
  } catch (e) {
    showToast('恢复失败：' + e.message)
  }
}
async function purgeItem(b) {
  if (!confirm(`彻底删除「${b.title}」？此操作不可恢复！`)) return
  try {
    await api.purgeTrash(b.id)
    showToast('已彻底删除')
    await loadTrash()
  } catch (e) {
    showToast('删除失败：' + e.message)
  }
}
</script>

<template>
  <div class="admin">
    <header class="admin-head">
      <button class="back" @click="emit('back')">← 返回收藏</button>
      <h1>⚙️ 管理后台</h1>
      <button class="add-bookmark" @click="emit('add')">+ 添加书签</button>
    </header>

    <nav class="tabs">
      <button :class="{ active: tab === 'categories' }" @click="goTab('categories')">
        分类 ({{ categories.length }})
      </button>
      <button :class="{ active: tab === 'tags' }" @click="goTab('tags')">
        标签 ({{ tags.length }})
      </button>
      <button :class="{ active: tab === 'settings' }" @click="goTab('settings')">
        设置
      </button>
      <button :class="{ active: tab === 'trash' }" @click="goTab('trash')">
        🗑️ 回收站 ({{ trashItems.length }})
      </button>
    </nav>

    <!-- 分类管理 -->
    <section v-if="tab === 'categories'" class="panel">
      <div class="add-row">
        <input v-model="cName" type="text" placeholder="新分类名称" @keyup.enter="addCategory" />
        <button class="btn-primary" @click="addCategory">+ 添加分类</button>
      </div>
      <div class="list">
        <div class="row" v-for="c in categories" :key="c.id">
          <span class="c-title">
            <template v-if="editingCat === c.id">
              <input v-model="editingCatName" class="edit-input" @keyup.enter="saveEditCat" />
            </template>
            <template v-else>
              <b>{{ c.name }}</b>
            </template>
          </span>
          <span class="c-cat">{{ catCount(c.id) }} 个书签</span>
          <span class="c-tags"></span>
          <span class="c-act">
            <template v-if="editingCat === c.id">
              <button class="lnk" @click="saveEditCat">保存</button>
              <button class="lnk danger" @click="editingCat = null">取消</button>
            </template>
            <template v-else>
              <button class="lnk" @click="startEditCat(c)">重命名</button>
              <button class="lnk danger" @click="deleteCat(c)" :disabled="c.name === '默认'">
                {{ c.name === '默认' ? '默认' : '删除' }}
              </button>
            </template>
          </span>
        </div>
        <div class="empty" v-if="!categories.length">暂无分类</div>
      </div>
    </section>

    <!-- 标签管理 -->
    <section v-if="tab === 'tags'" class="panel">
      <div class="add-row">
        <input v-model="tName" type="text" placeholder="新标签名称" @keyup.enter="addTag" />
        <select v-model="tCat">
          <option :value="null">默认</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
        <button class="btn-primary" @click="addTag">+ 添加标签</button>
      </div>
      <div class="list">
        <div class="row" v-for="t in tags" :key="t.id">
          <span class="c-title">
            <template v-if="editingTag === t.id">
              <input v-model="editingTagName" class="edit-input" @keyup.enter="saveEditTag" />
            </template>
            <template v-else>
              <b># {{ t.name }}</b>
            </template>
          </span>
          <span class="c-cat">
            <template v-if="editingTag === t.id">
              <select v-model="editingTagCat">
                <option :value="null">默认</option>
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </template>
            <template v-else>{{ catName(t.category_id) }}</template>
          </span>
          <span class="c-tags">{{ tagCount(t.id) }} 个书签</span>
          <span class="c-act">
            <template v-if="editingTag === t.id">
              <button class="lnk" @click="saveEditTag">保存</button>
              <button class="lnk danger" @click="editingTag = null">取消</button>
            </template>
            <template v-else>
              <button class="lnk" @click="startEditTag(t)">重命名</button>
              <button class="lnk danger" @click="deleteTag(t)">删除</button>
            </template>
          </span>
        </div>
        <div class="empty" v-if="!tags.length">暂无标签</div>
      </div>
    </section>

    <!-- 设置 -->
    <section v-if="tab === 'settings'" class="panel">
      <h2 class="set-title">⏱️ 资源同步设置</h2>
      <p class="set-desc">
        开启后，服务会按设定间隔自动把全部书签的图标与视频封面同步下载到本地资源目录，避免远程图标失效导致断图。
      </p>
      <label class="switch-row">
        <input type="checkbox" v-model="settings.sync_enabled" />
        <span>同步下载封面和图标</span>
      </label>
      <div class="interval-row" v-if="settings.sync_enabled">
        <span>每</span>
        <input
          type="number"
          min="1"
          v-model.number="settings.sync_interval_minutes"
        />
        <span>分钟同步一次</span>
      </div>
      <div class="set-actions">
        <button class="btn-primary" @click="saveSettings" :disabled="savingSettings">
          {{ savingSettings ? '保存中...' : '保存设置' }}
        </button>
      </div>
    </section>

    <!-- 回收站 -->
    <section v-if="tab === 'trash'" class="panel">
      <h2 class="set-title">🗑️ 回收站</h2>
      <p class="set-desc">删除的书签暂存在这里，可随时恢复；「彻底删除」后不可找回。</p>
      <div class="list" v-if="trashItems.length">
        <div class="row head">
          <span class="c-title">标题</span>
          <span class="c-cat">分类</span>
          <span class="c-tags">标签</span>
          <span class="c-act">操作</span>
        </div>
        <div class="row" v-for="b in trashItems" :key="b.id">
          <span class="c-title">
            <a :href="b.url" target="_blank" rel="noopener">{{ b.title }}</a>
            <small>删除于 {{ b.deleted_at }}</small>
          </span>
          <span class="c-cat">{{ b.category }}</span>
          <span class="c-tags">{{ b.tags.join(', ') || '—' }}</span>
          <span class="c-act">
            <button class="lnk" @click="restoreItem(b.id)">恢复</button>
            <button class="lnk danger" @click="purgeItem(b)">彻底删除</button>
          </span>
        </div>
      </div>
      <div class="empty" v-else>回收站是空的</div>
    </section>

    <div class="toast" :class="{ show: toast }">{{ toast }}</div>
  </div>
</template>

<style scoped>
.admin {
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}
.admin-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  padding: 16px 22px;
  border-radius: 14px;
  margin-bottom: 16px;
}
.admin-head h1 {
  font-size: 20px;
}
.back,
.add-bookmark {
  background: rgba(255, 255, 255, 0.18);
  border: none;
  color: #fff;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 14px;
  transition: background 0.2s;
}
.back:hover,
.add-bookmark:hover {
  background: rgba(255, 255, 255, 0.3);
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tabs button {
  background: var(--card);
  border: 1px solid #e6e6f0;
  color: var(--muted);
  padding: 9px 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}
.tabs button.active {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}
.panel {
  background: var(--card);
  border-radius: 14px;
  padding: 16px 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}
.search-row,
.add-row {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}
.search-row input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
}
.search-row input:focus {
  border-color: var(--primary);
}
.add-row input {
  flex: 1;
  padding: 10px 14px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
}
.add-row input:focus {
  border-color: var(--primary);
}
.add-row select,
.c-cat select {
  padding: 9px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 13px;
  outline: none;
  background: #fff;
}
.btn-primary {
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  transition: opacity 0.2s;
}
.btn-primary:hover {
  opacity: 0.9;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  transition: background 0.15s;
}
.row:not(.head):hover {
  background: #f7f7fc;
}
.row.head {
  font-size: 12px;
  color: #aaa;
  font-weight: 700;
  border-bottom: 1px solid #eee;
  margin-bottom: 4px;
}
.c-title {
  flex: 2;
  min-width: 0;
}
.c-title a {
  color: var(--text);
  text-decoration: none;
  font-weight: 600;
  font-size: 14px;
}
.c-title a:hover {
  color: var(--primary);
}
.c-title small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-cat {
  flex: 1;
  font-size: 13px;
  color: var(--text);
}
.c-tags {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  font-size: 13px;
  color: var(--muted);
}
.mini {
  background: #eef0fb;
  color: #5a5fce;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
}
.c-act {
  flex: 1;
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
.lnk {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 13px;
  padding: 5px 10px;
  border-radius: 6px;
  transition: background 0.2s;
}
.lnk:hover {
  background: #f0f3ff;
}
.lnk.danger {
  color: var(--danger);
}
.lnk.danger:hover {
  background: #fff5f5;
}
.lnk:disabled {
  color: #ccc;
  cursor: not-allowed;
}
.edit-input {
  padding: 6px 10px;
  border: 2px solid var(--primary);
  border-radius: 8px;
  font-size: 13px;
  width: 100%;
  outline: none;
}
.muted {
  color: #bbb;
}
.empty {
  text-align: center;
  padding: 40px;
  color: #bbb;
}
.set-title {
  font-size: 18px;
  margin: 0 0 8px;
  color: var(--text);
}
.set-desc {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  margin: 0 0 18px;
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
  margin-bottom: 16px;
}
.switch-row input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--primary);
}
.interval-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  color: var(--text);
  margin-bottom: 20px;
}
.interval-row input {
  width: 90px;
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
}
.interval-row input:focus {
  border-color: var(--primary);
}
.set-actions {
  display: flex;
  gap: 10px;
}
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background: #333;
  color: #fff;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 14px;
  opacity: 0;
  transform: translateY(-10px);
  transition: all 0.3s;
  z-index: 9999;
}
.toast.show {
  opacity: 1;
  transform: translateY(0);
}
</style>
