<script setup>
defineProps({
  showForm: { type: Boolean, default: false },
  editing: { type: Boolean, default: false },
  submitting: { type: Boolean, default: false },
  form: { type: Object, default: () => ({}) },
  formError: { type: String, default: '' },
  categories: { type: Array, default: () => [] },
  formTagOptions: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'submit', 'url-blur', 'preview-error'])
</script>

<template>
  <!-- 新增 / 编辑 弹窗（全局：主页面与管理后台共用） -->
  <div class="modal-mask" v-if="showForm" @click.self="emit('close')">
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">{{ editing ? '编辑书签' : '添加书签' }}</div>
        <button type="button" class="modal-close" @click="emit('close')" aria-label="关闭" title="关闭">✕</button>
      </div>
      <form @submit.prevent="emit('submit')">
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
          <input v-model="form.favicon" type="text" placeholder="https://.../favicon.ico" @blur="emit('url-blur')" />
          <img v-if="form.favicon.trim()" :src="form.favicon" class="field-preview" alt="图标预览" @error="emit('preview-error')" />
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
          <img v-if="form.cover.trim()" :src="form.cover" class="field-preview cover" alt="封面预览" @error="emit('preview-error')" />
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
          <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
          <button type="submit" class="btn-submit" :disabled="submitting">
            {{ submitting ? '保存中...' : (editing ? '保存修改' : '添加') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 表单：标记为视频 + 时长 */
.video-flag-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
}
.video-flag {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text);
  background: #f4f4fb;
  border: 1px solid #e3e3f0;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  margin: 0;
}
.video-flag input {
  width: auto;
  margin: 0;
}
.duration-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--muted);
  margin: 0;
}
.modal .video-flag input {
  width: auto;
  margin: 0;
}
.modal .duration-field input {
  width: 120px;
  margin-top: 0;
  padding: 8px 10px;
}
.tag-picker {
  margin-bottom: 14px;
}
.tag-picker-title {
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 8px;
}
.tag-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.tag-check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  color: var(--text);
  background: #f4f4fb;
  border: 1px solid #e3e3f0;
  padding: 6px 10px;
  border-radius: 999px;
  cursor: pointer;
  margin: 0;
}
.tag-check input {
  width: auto;
  margin: 0;
}
.tag-empty {
  font-size: 12px;
  color: #bbb;
}
/* 弹窗 */
.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}
.modal {
  background: var(--card);
  width: 600px;
  max-width: 92vw;
  max-height: 88vh;
  overflow-y: auto;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.modal-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}
.modal-close {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: #f0f0f0;
  color: #888;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.modal-close:hover {
  background: #e0e0e0;
  color: #333;
}
.modal label {
  display: block;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 14px;
}
/* 表单内图标/封面预览 */
.field-preview {
  display: block;
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: 8px;
  margin-top: 8px;
  border: 1px solid #eee;
  background: #f5f5f5;
}
.field-preview.cover {
  width: 96px;
  height: 54px;
  border-radius: 6px;
}
.modal input {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.3s;
}
.modal textarea {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 10px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.3s;
}
.modal textarea:focus,
.modal input:focus {
  border-color: var(--primary);
}
.form-error {
  color: var(--danger);
  font-size: 13px;
  margin-bottom: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 4px;
}
.btn-cancel {
  background: #f0f0f0;
  color: #555;
  border: none;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 14px;
  cursor: pointer;
}
.btn-cancel:hover {
  background: #e6e6e6;
}
.btn-submit {
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 10px 18px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.btn-submit:hover {
  opacity: 0.9;
}
.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
