// options.js - 插件存储管理页（chrome.storage.local 的简单增删改查）
'use strict';

const rowsEl = document.getElementById('rows');
const statusEl = document.getElementById('status');

let current = {}; // 最近一次读取的完整数据

function toast(msg, ok) {
  statusEl.textContent = msg;
  statusEl.className = ok === false ? 'error' : 'ok';
  clearTimeout(toast.__t);
  toast.__t = setTimeout(() => {
    statusEl.textContent = '';
    statusEl.className = '';
  }, 2500);
}

// 格式化展示值：对象/数组直接美化；字符串若本身是 JSON（如提取规则）也美化缩进便于阅读
function formatValue(v) {
  if (typeof v === 'object' && v !== null) {
    return JSON.stringify(v, null, 2);
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return JSON.stringify(JSON.parse(t), null, 2);
      } catch (e) {
        /* 不是合法 JSON，原样显示 */
      }
    }
  }
  return String(v);
}

// 渲染全部键值
function render(data) {
  current = data || {};
  rowsEl.innerHTML = '';
  const keys = Object.keys(current).sort();
  if (!keys.length) {
    rowsEl.innerHTML = '<div class="empty">暂无存储数据</div>';
    return;
  }
  keys.forEach((k) => {
    const row = document.createElement('div');
    row.className = 'row';

    const label = document.createElement('div');
    label.className = 'key';
    label.textContent = k;
    label.title = k;

    const input = document.createElement('textarea');
    input.className = 'val';
    input.dataset.key = k;
    input.spellcheck = false;
    input.value = formatValue(current[k]);
    input.title = '点击展开/收起完整内容';
    // 点击文本框：展开到完整内容高度；再次点击：缩回原高度
    input.addEventListener('click', () => {
      const on = !input.classList.contains('expanded');
      if (on) {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
        input.classList.add('expanded');
      } else {
        input.style.height = '';
        input.classList.remove('expanded');
      }
    });
    // 展开状态下编辑内容时，高度跟随内容增长
    input.addEventListener('input', () => {
      if (input.classList.contains('expanded')) {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
      }
    });

    const del = document.createElement('button');
    del.className = 'del';
    del.textContent = '删除';
    del.dataset.key = k;

    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(del);
    rowsEl.appendChild(row);
  });
}

async function load() {
  try {
    const data = await chrome.storage.local.get(null);
    render(data);
  } catch (e) {
    toast('读取失败：' + e.message, false);
  }
}

// 保存全部（尽量保留原有类型：数字键存数字，其余存字符串）
document.getElementById('save').addEventListener('click', async () => {
  const obj = {};
  rowsEl.querySelectorAll('.row').forEach((row) => {
    const input = row.querySelector('.val');
    const key = input.dataset.key;
    let raw = input.value.trim();
    const oldVal = current[key];
    if (typeof oldVal === 'number') {
      const n = parseInt(raw, 10);
      obj[key] = Number.isFinite(n) ? n : raw;
    } else if (typeof oldVal === 'boolean') {
      obj[key] = raw === 'true';
    } else if (typeof oldVal === 'object' && oldVal !== null) {
      try {
        obj[key] = JSON.parse(raw);
      } catch (e) {
        obj[key] = raw;
      }
    } else {
      obj[key] = raw;
    }
  });
  try {
    await chrome.storage.local.set(obj);
    toast('✅ 已保存');
    load();
  } catch (e) {
    toast('保存失败：' + e.message, false);
  }
});

// 删除单个键
rowsEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('.del');
  if (!btn) return;
  const key = btn.dataset.key;
  if (!confirm('确定删除键「' + key + '」？')) return;
  try {
    await chrome.storage.local.remove(key);
    toast('✅ 已删除 ' + key);
    load();
  } catch (e) {
    toast('删除失败：' + e.message, false);
  }
});

// 清空全部
document.getElementById('clear').addEventListener('click', async () => {
  if (!confirm('确定清空 chrome.storage.local 全部数据？此操作不可恢复！')) return;
  try {
    await chrome.storage.local.clear();
    toast('✅ 已清空');
    load();
  } catch (e) {
    toast('清空失败：' + e.message, false);
  }
});

// 导出规则：把 chrome.storage.local 全部数据序列化为 JSON 文件下载
document.getElementById('export').addEventListener('click', async () => {
  try {
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmark-rules-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('✅ 已导出规则到 JSON 文件');
  } catch (e) {
    toast('导出失败：' + e.message, false);
  }
});

// 导入规则：选择 JSON 文件，合并写入 chrome.storage.local（文件中的键覆盖同名键）
const importFileEl = document.getElementById('importFile');
document.getElementById('import').addEventListener('click', () => importFileEl.click());
importFileEl.addEventListener('change', async () => {
  const file = importFileEl.files && importFileEl.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('文件格式不正确（应为对象）');
    }
    await chrome.storage.local.set(data);
    toast('✅ 已导入规则');
    load();
  } catch (e) {
    toast('导入失败：' + e.message, false);
  } finally {
    importFileEl.value = '';
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') load();
});

load();
