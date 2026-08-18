<script setup>
defineProps({
  total: { type: Number, default: 0 },
  today: { type: Number, default: 0 }
})
</script>

<template>
  <div class="stats">
    <div class="stat-card">
      <div class="num">{{ total }}</div>
      <div class="label">总收藏数</div>
    </div>
    <div class="stat-card">
      <div class="num">{{ today }}</div>
      <div class="label">今日新增</div>
    </div>
  </div>
</template>

<style scoped>
.stats {
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
}
.stat-card {
  flex: 1;
  background: var(--card);
  border-radius: 12px;
  padding: 20px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.stat-card .num {
  font-size: 32px;
  font-weight: 700;
  color: var(--primary);
}
.stat-card .label {
  font-size: 14px;
  color: var(--muted);
  margin-top: 4px;
}
</style>
