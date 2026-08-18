// extract.js - 注入页面（content script 上下文）
// 功能：点击页面元素 → 高亮描边 → 生成 CSS 选择器 / XPath / 字段名 → 悬浮面板
//       支持：编辑选择器、提取文本(querySelectorAll 拼 innerText)、复制、保存规则到浏览器本地 storage、读取已存规则

(function () {
  'use strict';

  let picking = false;
  let hoverEl = null;
  let panelEl = null;
  let hintEl = null;

  const HILITE = '2px solid #ff4d4f';

  // 字段下拉选项：value=存储键，label=中文显示名（保存到 storage 的 title 字段）
  const FIELD_LABELS = { title: '标题', author: '作者', pubdate: '发布时间', collection: '合集', desc: '详情', cover: '封面' };

  // ---------- 选择器算法 ----------
  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  // 绝对路径（保证可定位，作为兜底）
  function getCssPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      let idx = 0;
      let sib = node;
      while (sib) {
        if (sib.nodeType === 1 && sib.nodeName === node.nodeName) idx++;
        sib = sib.previousElementSibling;
      }
      const tag = node.nodeName.toLowerCase();
      parts.unshift(idx > 1 ? tag + ':nth-of-type(' + idx + ')' : tag);
      node = node.parentElement;
      if (node && node.nodeType === 9) break;
    }
    return parts.join(' > ');
  }

  // 优先 id / class，尽量短且唯一；失败回退绝对路径
  function getOptimizedSelector(el) {
    if (el.id) {
      const s = '#' + cssEscape(el.id);
      if (document.querySelectorAll(s).length === 1) return s;
    }
    if (el.classList && el.classList.length) {
      const classes = Array.from(el.classList);
      for (let i = classes.length; i >= 1; i--) {
        const combo = classes.slice(0, i).map((c) => '.' + cssEscape(c)).join('');
        if (document.querySelectorAll(combo).length === 1) return combo;
      }
    }
    const chain = [];
    let node = el;
    while (node && node !== document.documentElement) {
      let token;
      if (node.id) {
        token = '#' + cssEscape(node.id);
      } else if (node.classList && node.classList.length) {
        token = node.nodeName.toLowerCase() + '.' + cssEscape(node.classList[0]);
      } else {
        let idx = 0;
        let sib = node;
        while (sib) {
          if (sib.nodeType === 1 && sib.nodeName === node.nodeName) idx++;
          sib = sib.previousElementSibling;
        }
        token = node.nodeName.toLowerCase() + ':nth-of-type(' + (idx || 1) + ')';
      }
      chain.unshift(token);
      const sel = chain.join(' ');
      if (document.querySelectorAll(sel).length === 1) return sel;
      node = node.parentElement;
    }
    return getCssPath(el);
  }

  function getXPath(el) {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      let idx = 1;
      let sib = node.previousSibling;
      while (sib) {
        if (sib.nodeType === 1 && sib.nodeName === node.nodeName) idx++;
        sib = sib.previousSibling;
      }
      const tag = node.nodeName.toLowerCase();
      parts.unshift(idx > 1 ? tag + '[' + idx + ']' : tag);
      node = node.parentNode;
      if (node && node.nodeType === 9) break;
    }
    return '/' + parts.join('/');
  }

  // ---------- 样式注入 ----------
  function injectStyles() {
    // 每次注入都覆盖最新样式：页面可能残留旧代码的 <style>（扩展重载后仍在），否则新规则不生效
    let s = document.getElementById('extractor-style');
    if (!s) {
      s = document.createElement('style');
      s.id = 'extractor-style';
      document.documentElement.appendChild(s);
    }
    s.textContent = [
      'html.bm-ext-picking *{cursor:default !important;}',
      '#extractor-panel label{font-size:12px;color:#666;margin-top:4px;}',
      '#extractor-panel input[type=text]{width:100%;padding:7px 9px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;}',
      '#extractor-panel input[type=text]:focus{border-color:#764ba2;}',
      '#extractor-panel .ext-row{display:flex;gap:6px;}',
      '#extractor-panel .ext-row > button:not([id^="ext-copy"]){flex:1;}',
      '#extractor-panel .ext-row-right{justify-content:flex-end;}',
      '#extractor-panel .ext-row input{flex:1;}',
      '#extractor-panel button{font-size:13px;border:none;border-radius:8px;padding:7px 10px;cursor:pointer;background:#f3f3f7;color:#444;}',
      '#extractor-panel button:hover{background:#e9e9f0;}',
      '#extractor-panel .ext-primary{background:#764ba2;color:#fff;}',
      '#extractor-panel .ext-primary:hover{background:#5f3d8c;}',
      '#extractor-panel .ext-secondary{background:#fff;color:#764ba2;border:1.5px solid #764ba2;}',
      '#extractor-panel .ext-secondary:hover{background:#f3effc;}',
      '#extractor-panel .ext-head{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px;margin-bottom:2px;cursor:move;user-select:none;}',
      '#extractor-panel .ext-x{background:none;color:#999;font-size:14px;padding:2px 6px;}',
      '#extractor-panel .ext-x:hover{color:#333;background:none;}',
      '#extractor-panel textarea{width:100%;height:160px;padding:9px;border:1px solid #e0e0e0;border-radius:8px;font-size:12px;outline:none;box-sizing:border-box;resize:vertical;white-space:pre-wrap;}',
      '#extractor-panel select.ext-select{width:100%;padding:7px 9px;border:1px solid #e0e0e0;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box;background:#fff;}',
      '#extractor-panel select.ext-select:focus{border-color:#764ba2;}',
      '#extractor-panel .ext-toast{font-size:12px;color:#764ba2;min-height:16px;opacity:0;transition:opacity .3s;}'
    ].join('\n');
    document.documentElement.appendChild(s);
  }

  // ---------- 提示条 ----------
  function showHint() {
    if (hintEl) return;
    hintEl = document.createElement('div');
    hintEl.id = 'extractor-hint';
    hintEl.innerHTML =
      '<span>🎯 点击页面任意元素以生成提取规则</span>' +
      '<button type="button" id="ext-hint-load">📂 读取已存规则</button>' +
      '<button type="button" id="ext-hint-close">✕</button>';
    Object.assign(hintEl.style, {
      position: 'fixed',
      top: '10px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: '#2d2d3a',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: '8px',
      font: '13px -apple-system, "Segoe UI", sans-serif',
      boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px'
    });
    hintEl.querySelector('#ext-hint-load').onclick = (e) => {
      e.stopPropagation();
      loadSaved();
    };
    hintEl.querySelector('#ext-hint-close').onclick = (e) => {
      e.stopPropagation();
      stopPicking();
      hideHint();
      notifyExtract('closed'); // 取消提取：抽屉滑回显示
    };
    document.documentElement.appendChild(hintEl);
  }
  function hideHint() {
    if (hintEl) {
      hintEl.remove();
      hintEl = null;
    }
  }

  // ---------- 选点 ----------
  // 向抽屉广播提取模式状态（opened=已选元素弹出面板 / closed=面板关闭或取消），抽屉据此滑回显示
  function notifyExtract(state) {
    try {
      document.dispatchEvent(new CustomEvent('__bm_extract_state', { detail: { state: state } }));
    } catch (e) {}
  }
  function startPicking() {
    if (picking) return;
    picking = true;
    document.documentElement.classList.add('bm-ext-picking'); // 选点期间页面光标统一为箭头
    showHint();
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }
  function stopPicking() {
    picking = false;
    document.documentElement.classList.remove('bm-ext-picking'); // 恢复页面光标
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    if (hoverEl) {
      hoverEl.style.outline = hoverEl.__origOutline || '';
      hoverEl = null;
    }
  }
  function onMove(e) {
    if (!picking) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === hoverEl) return;
    if (el.closest && (el.closest('#extractor-panel') || el.closest('#extractor-hint'))) return; // 忽略面板/提示条
    if (el.closest && el.closest('#__bm_drawer_root')) return; // 忽略右侧抽屉，避免选中抽屉内部元素
    if (hoverEl) hoverEl.style.outline = hoverEl.__origOutline || '';
    hoverEl = el;
    hoverEl.__origOutline = el.style.outline;
    el.style.outline = HILITE;
    el.style.outlineOffset = '1px';
    e.preventDefault();
  }
  function onClick(e) {
    if (!picking) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    // 面板/提示条内的按钮（✕、读取已存等）：放行，不拦截，让按钮正常触发
    if (el.closest && (el.closest('#extractor-panel') || el.closest('#extractor-hint'))) return;
    e.preventDefault();
    e.stopPropagation();
    if (el.closest && el.closest('#__bm_drawer_root')) return; // 点在抽屉上不生成规则
    stopPicking();
    hideHint();
    buildPanel(el);
    notifyExtract('opened'); // 已选取元素并弹出面板：抽屉滑回显示
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      if (panelEl) {
        closePanel();
      } else {
        stopPicking();
        hideHint();
        notifyExtract('closed'); // ESC 取消提取：抽屉滑回显示
      }
    }
  }

  // ---------- 面板 ----------
  function buildPanel(el) {
    if (panelEl) panelEl.remove();
    const css = el ? getOptimizedSelector(el) : '';
    const xpath = el ? getXPath(el) : '';
    const preview = el ? (el.innerText || '').trim().slice(0, 800) : '';

    panelEl = document.createElement('div');
    panelEl.id = 'extractor-panel';
    panelEl.innerHTML =
      '<div class="ext-head"><span>🎯 提取规则</span><button type="button" class="ext-x">✕</button></div>' +
      '<label style="display:none">CSS 选择器（可编辑）</label>' +
      '<div class="ext-row" style="display:none"><input type="text" id="ext-css" /><button type="button" id="ext-copy">复制</button></div>' +
      '<label>XPath（可编辑）</label>' +
      '<div class="ext-row"><input type="text" id="ext-xpath" />' +
      '<button type="button" id="ext-copy-xpath">复制</button></div>' +
      '<label>字段</label>' +
      '<select id="ext-field" class="ext-select">' +
      '  <option value="title">标题</option>' +
      '  <option value="author">作者</option>' +
      '  <option value="pubdate">发布时间</option>' +
      '  <option value="collection">合集</option>' +
      '  <option value="desc">详情</option>' +
      '  <option value="cover">封面</option>' +
      '</select>' +
      '<div class="ext-row">' +
      '<button type="button" id="ext-extract">📄 提取文本</button>' +
      '<button type="button" id="ext-load">📂 读取已存</button>' +
      '<button type="button" id="ext-save" class="ext-primary">💾 保存规则</button>' +
      '</div>' +
      '<div class="ext-row ext-row-right">' +
      '<button type="button" id="ext-continue" class="ext-secondary">➕ 点击后选取</button>' +
      '</div>' +
      '<label>预览 / 提取结果</label>' +
      '<textarea id="ext-result" readonly></textarea>' +
      '<div class="ext-toast" id="ext-toast"></div>';

    const style = {
      position: 'fixed',
      top: '0',
      // 右侧定位：右边缘距离窗口最右边留一个滚动条宽度的间距（clientWidth = innerWidth - 滚动条宽）
      left: (document.documentElement.clientWidth - 340) + 'px',
      right: 'auto',
      width: '340px',
      height: '100vh',
      zIndex: '2147483647',
      background: '#fff',
      color: '#222',
      border: 'none',
      borderLeft: '1px solid #e3e3ec',
      borderRadius: '0',
      boxShadow: '-8px 0 30px rgba(0,0,0,0.18)', // 与抽屉一致的左侧阴影
      font: '13px -apple-system, "Segoe UI", sans-serif',
      padding: '14px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      maxHeight: '100vh',
      overflow: 'auto'
    };
    Object.assign(panelEl.style, style);

    document.documentElement.appendChild(panelEl);

    const cssInput = panelEl.querySelector('#ext-css');
    const xpathInput = panelEl.querySelector('#ext-xpath');
    const fieldInput = panelEl.querySelector('#ext-field');
    const resultEl = panelEl.querySelector('#ext-result');
    cssInput.value = css;
    xpathInput.value = xpath;
    resultEl.value = preview;

    panelEl.querySelector('.ext-x').onclick = closePanel;
    panelEl.querySelector('#ext-copy').onclick = () => copyText(cssInput.value);
    panelEl.querySelector('#ext-copy-xpath').onclick = () => copyText(xpathInput.value);
    panelEl.querySelector('#ext-extract').onclick = doExtract;
    panelEl.querySelector('#ext-load').onclick = loadSaved;
    panelEl.querySelector('#ext-save').onclick = () => { saveRule(); closePanel(); }; // 保存当前字段规则并收起面板
    panelEl.querySelector('#ext-continue').onclick = continuePicking; // 保存当前字段规则后，继续选元素为其他字段存规则

    // 面板打开时单独挂 ESC 监听：关闭面板（stopPicking 已移除选点期监听，必须由面板自身监听）
    document.addEventListener('keydown', onPanelKey, true);

    // 面板可拖动（标题栏为把手）
    makeDraggable(panelEl, panelEl.querySelector('.ext-head'));

    // 阻止面板内点击冒泡到页面
    panelEl.addEventListener('click', (e) => e.stopPropagation());
    panelEl.addEventListener('mousemove', (e) => e.stopPropagation());
  }

  function closePanel() {
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
      document.removeEventListener('keydown', onPanelKey, true); // 清理面板级 ESC 监听
      notifyExtract('closed'); // 面板关闭：抽屉滑回显示
    }
  }

  // 面板打开期间按下 ESC：关闭面板
  function onPanelKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closePanel();
    }
  }

  // 继续：保存当前字段规则后，收起面板并重新进入选点模式（抽屉再次隐藏，便于为其他字段选元素）
  function continuePicking() {
    saveRule(); // 先保存当前字段规则
    if (panelEl) {
      panelEl.remove();
      panelEl = null;
    }
    document.removeEventListener('keydown', onPanelKey, true);
    notifyExtract('picking'); // 通知抽屉重新隐藏，准备选下一个元素
    startPicking(); // 重新进入选点（含提示条、监听）
  }

  // 面板拖动：以 handle（标题栏）为把手，限制在视口内
  function makeDraggable(panel, handle) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest && e.target.closest('button')) return; // 不拦截标题栏上的关闭按钮
      dragging = true;
      const rect = panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      document.addEventListener('mousemove', onDragMove, true);
      document.addEventListener('mouseup', onDragEnd, true);
      e.preventDefault();
    });
    function onDragMove(e) {
      if (!dragging) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const sb = window.innerWidth - document.documentElement.clientWidth; // 滚动条宽度
      let x = e.clientX - offsetX;
      let y = e.clientY - offsetY;
      // 拖动边界：左不越界，右不盖到滚动条（最大右边缘 = clientWidth，即 innerWidth - sb）
      x = Math.max(0, Math.min(x, document.documentElement.clientWidth - w));
      y = Math.max(0, Math.min(y, window.innerHeight - h));
      panel.style.left = x + 'px';
      panel.style.top = y + 'px';
      e.preventDefault();
    }
    function onDragEnd() {
      dragging = false;
      document.removeEventListener('mousemove', onDragMove, true);
      document.removeEventListener('mouseup', onDragEnd, true);
    }
  }

  function doExtract() {
    const css = panelEl.querySelector('#ext-css').value.trim();
    const fieldKey = panelEl.querySelector('#ext-field').value || 'title';
    const field = FIELD_LABELS[fieldKey] || fieldKey;
    const resultEl = panelEl.querySelector('#ext-result');
    if (!css) {
      toast('请先填写 CSS 选择器');
      return;
    }
    let nodes;
    try {
      nodes = document.querySelectorAll(css);
    } catch (err) {
      toast('选择器无效：' + err.message);
      return;
    }
    if (nodes.length === 0) {
      resultEl.value = '（未匹配到任何元素）';
      return;
    }
    const lines = [];
    nodes.forEach((n, i) => {
      const txt = (n.innerText || n.textContent || '').trim();
      if (txt) lines.push(txt);
    });
    const out = '【' + field + '】共 ' + nodes.length + ' 条匹配\n\n' + lines.join('\n\n');
    resultEl.value = out;
    toast('已提取 ' + nodes.length + ' 条');
  }

  function copyText(txt) {
    if (!txt) return;
    navigator.clipboard.writeText(txt).then(
      () => toast('已复制'),
      () => toast('复制失败')
    );
  }

  function loadSaved() {
    // 从浏览器本地 storage 读取当前网址(host)已存规则，按下拉所选字段回填
    const fieldKey = panelEl ? panelEl.querySelector('#ext-field').value : 'title';
    const label = FIELD_LABELS[fieldKey] || fieldKey;
    const host = location.hostname;
    chrome.storage.local.get([host], (res) => {
      let map = {};
      if (res[host]) {
        try { map = JSON.parse(res[host]); } catch (e) { map = {}; }
      }
      const r = (typeof map === 'object' && map) ? map[fieldKey] : null;
      if (r) {
        if (!panelEl) buildPanel(null);
        panelEl.querySelector('#ext-css').value = r.css || '';
        panelEl.querySelector('#ext-xpath').value = r.xpath || '';
        toast('已载入「' + label + '」规则');
      } else {
        if (!panelEl) buildPanel(null);
        toast('当前网址暂无「' + label + '」已存规则');
      }
    });
  }

  function saveRule() {
    const css = panelEl.querySelector('#ext-css').value.trim();
    const xpath = panelEl.querySelector('#ext-xpath').value.trim();
    const fieldKey = panelEl.querySelector('#ext-field').value;
    if (!css) {
      toast('请先生成或填写 CSS 选择器');
      return;
    }
    if (!fieldKey) {
      toast('请选择字段');
      return;
    }
    const label = FIELD_LABELS[fieldKey] || fieldKey;
    const host = location.hostname;
    // 按网址(host)存放：value 为 JSON 字符串，字段 → {css, xpath, title}
    chrome.storage.local.get([host], (res) => {
      let map = {};
      if (res[host]) {
        try { map = JSON.parse(res[host]); } catch (e) { map = {}; }
      }
      if (typeof map !== 'object' || !map) map = {};
      map[fieldKey] = { css: css, xpath: xpath, title: label };
      chrome.storage.local.set({ [host]: JSON.stringify(map) }, () => {
        toast('✅ 已保存「' + label + '」规则 → ' + host);
      });
    });
  }

  function toast(msg) {
    if (!panelEl) return;
    const t = panelEl.querySelector('#ext-toast');
    if (!t) return;
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t.__timer);
    t.__timer = setTimeout(() => {
      t.style.opacity = '0';
    }, 1800);
  }

  // 注入后先展示提取规则面板（空），由用户点「点击后选取」再进入选点模式
  injectStyles();
  buildPanel(null);
})();
