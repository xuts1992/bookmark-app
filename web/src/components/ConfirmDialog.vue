<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  title: { type: String, default: '提示' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '继续' },
  cancelText: { type: String, default: '取消' },
  danger: { type: Boolean, default: false },
  // 消息中需要标红加粗的子串（如「3 条书签」），纯文本匹配，不渲染 HTML
  highlight: { type: String, default: '' }
})
const emit = defineEmits(['confirm', 'cancel'])

// 把 message 按 highlight 拆段：命中部分用 .confirm-strong（标红加粗），其余普通文本
const msgParts = computed(() => {
  if (!props.highlight) return []
  const parts = []
  const segs = props.message.split(props.highlight)
  segs.forEach((seg, i) => {
    if (seg) parts.push({ text: seg, hl: false })
    if (i < segs.length - 1) parts.push({ text: props.highlight, hl: true })
  })
  return parts
})

// 防连点：弹窗刚出现的一小段时间内忽略所有点击，避免鼠标连点的第二下误触「继续/取消」
const armed = ref(false)
onMounted(() => {
  setTimeout(() => { armed.value = true }, 250)
})
function onConfirm() {
  if (!armed.value) return
  emit('confirm')
}
function onCancel() {
  if (!armed.value) return
  emit('cancel')
}
function onMask() {
  if (!armed.value) return
  emit('cancel')
}
</script>

<template>
  <div class="confirm-mask" @click.self="onMask">
    <div class="confirm-box">
      <div class="confirm-title">{{ title }}</div>
      <div class="confirm-msg">
        <template v-if="highlight">
          <template v-for="(part, i) in msgParts" :key="i">
            <span v-if="part.hl" class="confirm-strong">{{ part.text }}</span>
            <template v-else>{{ part.text }}</template>
          </template>
        </template>
        <template v-else>{{ message }}</template>
      </div>
      <div class="confirm-actions">
        <button class="confirm-cancel" :disabled="!armed" @click="onCancel">{{ cancelText }}</button>
        <button class="confirm-ok" :class="{ danger }" :disabled="!armed" @click="onConfirm">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.confirm-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10010;
}
.confirm-box {
  background: var(--card);
  width: 420px;
  max-width: 90vw;
  border-radius: 14px;
  padding: 22px 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.confirm-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 12px;
}
.confirm-msg {
  font-size: 14px;
  color: var(--muted);
  line-height: 1.7;
  margin-bottom: 18px;
  white-space: pre-line;
}
/* 消息中需要强调的部分（如「N 条书签」）：标红加粗 */
.confirm-strong {
  color: var(--danger);
  font-weight: 700;
}
.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.confirm-cancel {
  background: #f0f0f0;
  color: #555;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
}
.confirm-cancel:hover {
  background: #e6e6e6;
}
.confirm-ok {
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.confirm-ok:hover {
  opacity: 0.9;
}
.confirm-ok.danger {
  background: #ff5a5f;
}
.confirm-ok.danger:hover {
  background: #e8454a;
}
/* 防连点禁用态：弹窗刚出现时按钮暂不可点 */
.confirm-cancel:disabled,
.confirm-ok:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
</style>
