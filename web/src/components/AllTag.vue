<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  // 全部标签：[{ id, name, category_id }]
  tags: { type: Array, required: true },
  // 全部分类：[{ id, name }]
  categories: { type: Array, required: true },
  // 已选中的标签 id 列表
  selected: { type: Array, required: true }
})
const emit = defineEmits(['toggle', 'close'])

const query = ref('')

// 按名称搜索过滤（不区分大小写）
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.tags
  return props.tags.filter((t) => t.name.toLowerCase().includes(q))
})

// 按分类分组（保留分类顺序），无分类的归入「默认」
const grouped = computed(() => {
  const byCat = new Map()
  for (const c of props.categories) byCat.set(c.id, { cat: c, tags: [] })
  const uncat = { cat: { id: 0, name: '默认' }, tags: [] }
  for (const t of filtered.value) {
    const g = byCat.get(t.category_id)
    if (g) g.tags.push(t)
    else uncat.tags.push(t)
  }
  const result = []
  for (const c of props.categories) {
    const g = byCat.get(c.id)
    if (g && g.tags.length) result.push(g)
  }
  if (uncat.tags.length) result.push(uncat)
  return result
})

function isSel(id) {
  return props.selected.includes(id)
}
function onTag(t) {
  emit('toggle', t.id)
}
</script>

<template>
  <div class="alltag-mask" @click.self="emit('close')">
    <div class="alltag">
      <div class="alltag-head">
        <span class="alltag-title">全部标签</span>
        <button class="alltag-close" @click="emit('close')" aria-label="关闭">✕</button>
      </div>
      <div class="alltag-search">
        <input
          type="text"
          v-model="query"
          placeholder="搜索标签..."
          autofocus
        />
        <button v-if="query" class="alltag-clear" @click="query = ''" aria-label="清空">✕</button>
      </div>
      <div class="alltag-body">
        <div class="alltag-cat" v-for="g in grouped" :key="g.cat.id">
          <div class="alltag-cat-name">{{ g.cat.name }}</div>
          <div class="alltag-tags">
            <button
              v-for="t in g.tags"
              :key="t.id"
              class="alltag-tag"
              :class="{ active: isSel(t.id) }"
              @click="onTag(t)"
            ># {{ t.name }}</button>
          </div>
        </div>
        <div class="alltag-empty" v-if="grouped.length === 0">未找到匹配标签</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.alltag-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 600;
  animation: alltag-fade 0.18s ease;
}
@keyframes alltag-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
.alltag {
  width: 520px;
  max-width: 92vw;
  max-height: 82vh;
  background: var(--card, #fff);
  border-radius: 14px;
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.alltag-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid #eee;
}
.alltag-title {
  font-size: 16px;
  font-weight: 700;
}
.alltag-close {
  border: none;
  background: #f1f1f1;
  color: #555;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.alltag-close:hover {
  background: #e3e3e3;
}
.alltag-search {
  position: relative;
  padding: 12px 18px;
  border-bottom: 1px solid #f0f0f0;
}
.alltag-search input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 34px 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
}
.alltag-search input:focus {
  border-color: #2bb3a3;
}
.alltag-clear {
  position: absolute;
  right: 28px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #999;
  cursor: pointer;
  font-size: 14px;
}
.alltag-body {
  padding: 8px 18px 18px;
  overflow-y: auto;
}
.alltag-cat {
  margin-top: 14px;
}
.alltag-cat-name {
  font-size: 13px;
  font-weight: 700;
  color: #888;
  margin-bottom: 8px;
}
.alltag-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.alltag-tag {
  border: 1px solid #d9d9d9;
  background: #f7f7f7;
  color: #444;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.alltag-tag:hover {
  border-color: #2bb3a3;
  color: #2bb3a3;
}
.alltag-tag.active {
  background: #2bb3a3;
  border-color: #2bb3a3;
  color: #fff;
}
.alltag-empty {
  text-align: center;
  color: #999;
  padding: 30px 0;
  font-size: 14px;
}
</style>
