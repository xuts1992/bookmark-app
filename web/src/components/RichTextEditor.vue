<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: '在这里输入详情内容…' }
})
const emit = defineEmits(['update:modelValue'])

const editor = ref(null)

function setContent(html) {
  if (editor.value && editor.value.innerHTML !== (html || '')) {
    editor.value.innerHTML = html || ''
  }
}
onMounted(() => setContent(props.modelValue))
watch(() => props.modelValue, (v) => setContent(v))

function onInput() {
  emit('update:modelValue', editor.value ? editor.value.innerHTML : '')
}
// 工具栏按钮用 mousedown.prevent 防止点击时编辑器失焦导致选区丢失
function exec(cmd, val) {
  editor.value && editor.value.focus()
  document.execCommand(cmd, false, val || null)
  onInput()
}
function addLink() {
  const url = window.prompt('请输入链接地址', 'https://')
  if (url) exec('createLink', url)
}
function addImage() {
  const url = window.prompt('请输入图片地址', 'https://')
  if (url) exec('insertImage', url)
}

const tools = [
  { cmd: 'bold', label: 'B', title: '加粗', style: 'font-weight:700' },
  { cmd: 'italic', label: 'I', title: '斜体', style: 'font-style:italic' },
  { cmd: 'underline', label: 'U', title: '下划线', style: 'text-decoration:underline' },
  { cmd: 'strikeThrough', label: 'S', title: '删除线', style: 'text-decoration:line-through' },
  { cmd: 'formatBlock', val: 'H2', label: 'H2', title: '大标题' },
  { cmd: 'formatBlock', val: 'H3', label: 'H3', title: '小标题' },
  { cmd: 'insertUnorderedList', label: '• 列表', title: '无序列表' },
  { cmd: 'insertOrderedList', label: '1. 列表', title: '有序列表' },
  { cmd: 'formatBlock', val: 'BLOCKQUOTE', label: '❝', title: '引用' },
  { cmd: 'formatBlock', val: 'PRE', label: '</>', title: '代码块' }
]
</script>

<template>
  <div class="rte">
    <div class="rte-toolbar">
      <button
        v-for="t in tools"
        :key="t.title"
        type="button"
        class="rte-btn"
        :title="t.title"
        :style="t.style"
        @mousedown.prevent="exec(t.cmd, t.val)"
      >{{ t.label }}</button>
      <button type="button" class="rte-btn" title="链接" @mousedown.prevent="addLink">🔗</button>
      <button type="button" class="rte-btn" title="图片" @mousedown.prevent="addImage">🖼</button>
      <button type="button" class="rte-btn" title="清除格式" @mousedown.prevent="exec('removeFormat')">⌫</button>
    </div>
    <div
      ref="editor"
      class="rte-content"
      contenteditable="true"
      :data-placeholder="placeholder"
      @input="onInput"
    ></div>
  </div>
</template>

<style scoped>
.rte {
  border: 1px solid var(--border, #e3e3ec);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
}
.rte-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 8px;
  background: #f7f8fc;
  border-bottom: 1px solid var(--border, #e3e3ec);
  position: sticky;
  top: 0;
}
.rte-btn {
  min-width: 30px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border, #e3e3ec);
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #444;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.rte-btn:hover {
  background: #eef0fb;
  color: var(--primary, #5a5fce);
}
.rte-content {
  min-height: 280px;
  max-height: 56vh;
  overflow-y: auto;
  padding: 14px 16px;
  font-size: 15px;
  line-height: 1.7;
  color: #333;
  outline: none;
}
.rte-content:empty::before {
  content: attr(data-placeholder);
  color: #bbb;
}
.rte-content :deep(img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 6px 0;
}
.rte-content :deep(a) {
  color: var(--primary, #5a5fce);
}
.rte-content :deep(pre) {
  background: #f4f4f7;
  padding: 12px 14px;
  border-radius: 8px;
  overflow-x: auto;
  font-size: 13px;
}
.rte-content :deep(blockquote) {
  margin: 8px 0;
  padding: 4px 14px;
  border-left: 3px solid var(--primary, #5a5fce);
  color: #666;
  background: #f7f8fc;
}
</style>
