// drawer.js - 注入当前页的「抽屉」内容脚本（替代原工具栏弹窗）
// 行为：点击工具栏图标 -> 从右侧滑入抽屉；页面保持可见且可交互（与页面平行）。
//       再次点击图标 / 点右上角 ✕ / 按 ESC -> 关闭抽屉；点击页面其它区域不关闭。
// 表单字段：标题、网址（均可编辑）、作者、合集、分类（后端下拉）、标签（后端多选）。

(function () {
  'use strict';

  const DRAWER_ID = '__bm_drawer_root';
  const STYLE_ID = '__bm_drawer_style';
  const DEFAULT_SERVER = 'http://localhost:9000';

  // 字段选取状态（需在顶部声明：早期重复注入分支会调用 closeDrawer->cancelFieldPick）
  let pickState = null;
  // 站点规则提取结果（readSiteRule 在脚本开头即执行，也需顶部声明避免 TDZ）
  let siteRuleData = null;

  // 已打开则切换关闭（点击图标第二次收起）
  if (document.getElementById(DRAWER_ID)) {
    closeDrawer();
    return;
  }

  // ---------- 样式 ----------
  const CSS = [
    '#' + DRAWER_ID + '{',
    '  position:fixed; top:0; right:0; bottom:0;',
    '  width:340px; max-width:90vw;',
    '  background:#fff; color:#222;',
    '  box-shadow:-8px 0 30px rgba(0,0,0,0.18);',
    '  z-index:2147483646;',
    '  font:13px -apple-system,"Segoe UI",Roboto,sans-serif;',
    '  display:flex; flex-direction:column;',
    '  transform:translateX(100%);',
    '  transition:transform .28s cubic-bezier(.22,.61,.36,1);',
    '  pointer-events:auto;',
    '}',
    '#' + DRAWER_ID + '.bm-open{ transform:translateX(0); }',
    '#' + DRAWER_ID + '.bm-hidden{ transform:translateX(100%); pointer-events:none; }',
    '.bm-picking *{ cursor:default !important; }',
    '.bm-header{ background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; padding:14px 16px; display:flex; justify-content:space-between; align-items:center; }',
    '.bm-header h2{ font-size:15px; font-weight:600; }',
    '#' + DRAWER_ID + ' .bm-resize{ position:absolute; top:0; left:-4px; width:8px; height:100%; cursor:ew-resize; z-index:2; }',
    '#' + DRAWER_ID + ' .bm-resize:hover, #' + DRAWER_ID + ' .bm-resize.bm-dragging{ background:rgba(102,126,234,0.28); }',
    '.bm-close{ background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;padding:0 4px; }',
    '.bm-body{ padding:14px 16px; overflow:auto; flex:1; display:flex; flex-direction:column; gap:12px; }',
    '.bm-field{ display:flex; flex-direction:column; gap:5px; font-size:12px; color:#555; }',
    '.bm-label{ font-weight:600; color:#444; }',
    '.bm-input{ width:100%; padding:8px 10px; border:1.5px solid #e0e0e0; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box; background:#fff; color:#222; }',
    '.bm-input:focus{ border-color:#667eea; }',
    '.bm-textarea{ width:100%; padding:8px 10px; border:1.5px solid #e0e0e0; border-radius:8px; font-size:13px; outline:none; box-sizing:border-box; background:#fff; color:#222; resize:vertical; min-height:64px; font-family:inherit; line-height:1.5; }',
    '.bm-textarea:focus{ border-color:#667eea; }',
    '.bm-field-head{ display:flex; align-items:center; justify-content:space-between; }',
    '.bm-pick{ background:#f3f0fb; border:1px solid #d8d0ee; border-radius:6px; cursor:pointer; font-size:12px; padding:1px 8px; line-height:1.7; color:#764ba2; }',
    '.bm-pick:hover{ background:#e7e0f7; }',
    '.bm-pick.active{ background:#764ba2; color:#fff; border-color:#764ba2; }',
    '.bm-cover-preview{ margin-top:6px; max-width:100%; max-height:130px; border-radius:8px; border:1px solid #eee; display:block; background:#f5f5fa; }',
    '.bm-pickbar{ position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:2147483647; background:linear-gradient(135deg,#2d2d3a,#3d3d52); border:1px solid rgba(255,255,255,0.14); color:#fff; padding:9px 14px; border-radius:10px; font:13px -apple-system,"Segoe UI",Roboto,sans-serif; box-shadow:0 6px 20px rgba(0,0,0,0.35); display:flex; align-items:center; gap:10px; max-width:74vw; }',
    '.bm-pickbar span{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:44vw; }',
    '.bm-pickbar button{ font-size:12px; font-weight:600; border:none; border-radius:8px; padding:6px 14px; cursor:pointer; white-space:nowrap; transition:filter .15s, transform .1s, background .15s; }',
    '.bm-pickbar button:active{ transform:translateY(1px); }',
    '.bm-pickbar button.bm-pick-ok{ background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; box-shadow:0 2px 8px rgba(118,75,162,0.5); }',
    '.bm-pickbar button.bm-pick-ok:hover:not(:disabled){ filter:brightness(1.12); }',
    '.bm-pickbar button.bm-pick-ok:disabled{ background:#4f4a5e; color:#c9c3d6; box-shadow:none; cursor:not-allowed; filter:none; }',
    '.bm-pickbar button.bm-pick-cancel{ background:rgba(255,255,255,0.14); color:#fff; border:1px solid rgba(255,255,255,0.4); }',
    '.bm-pickbar button.bm-pick-cancel:hover{ background:rgba(255,255,255,0.26); }',
    '.bm-tags{ border:1.5px solid #e0e0e0; border-radius:8px; padding:8px; max-height:170px; overflow:auto; background:#fafafe; }',
    '.bm-tag-empty{ color:#999; font-size:12px; }',
    '.bm-tag-group{ margin-bottom:8px; }',
    '.bm-tag-group:last-child{ margin-bottom:0; }',
    '.bm-tag-cat{ font-size:11px; color:#888; margin-bottom:5px; font-weight:600; }',
    '.bm-tag-item{ display:flex; align-items:center; gap:6px; padding:3px 2px; font-size:13px; cursor:pointer; border-radius:5px; }',
    '.bm-tag-item:hover{ background:#f0edfb; }',
    '.bm-tag-item input{ margin:0; }',
    '.bm-btn{ width:100%; padding:10px; border:none; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; }',
    '.bm-savebar{ padding:12px 16px 0; background:#fff; flex:none; }',
    '.bm-save{ background:linear-gradient(135deg,#667eea,#764ba2); color:#fff; }',
    '.bm-save:disabled{ opacity:.6; cursor:not-allowed; }',
    '.bm-extract{ background:#fff; color:#764ba2; border:1.5px solid #764ba2; }',
    '.bm-extract:hover{ background:#f3effc; }',
    '.bm-manage{ display:block; text-align:center; color:#667eea; text-decoration:none; font-size:13px; padding:8px; }',
    '.bm-settings{ background:#fff; color:#667eea; border:1.5px solid #667eea; margin-top:2px; }',
    '.bm-settings:hover{ background:#f0edfb; }',
    '.bm-status{ text-align:center; font-size:12px; color:#999; min-height:16px; }',
    '.bm-status.success{ color:#2ed573; }',
    '.bm-status.error{ color:#ff4757; }',
    '.bm-set{ border-top:1px solid #f0f0f0; padding-top:12px; display:flex; align-items:center; gap:8px; }',
    '.bm-set label{ font-size:12px; color:#666; white-space:nowrap; }',
    '.bm-set input{ flex:1; padding:6px 10px; border:1px solid #e0e0e0; border-radius:6px; font-size:12px; outline:none; box-sizing:border-box; }'
  ].join('\n');

  // 每次打开都写入最新样式：页面里可能残留旧代码注入的 <style>（扩展重载后仍在），
  // 若只在不存在时注入，新规则（如 .bm-hidden）将永远不生效 —— 因此一律覆盖更新。
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.documentElement.appendChild(styleEl);
  }
  styleEl.textContent = CSS;

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = DRAWER_ID;
  root.innerHTML =
    '<div class="bm-resize" id="bm-resize" title="拖动调整宽度"></div>' +
    '<div class="bm-header">' +
    '  <h2>📚 收藏当前网页</h2>' +
    '  <button class="bm-close" id="bm-close" title="关闭">✕</button>' +
    '</div>' +
    '<div class="bm-savebar"><button class="bm-btn bm-save" id="bm-save">💾 收藏</button></div>' +
    '<div class="bm-body">' +
    '  <div class="bm-field"><div class="bm-field-head">标题 <button type="button" class="bm-pick" id="bm-pick-title" title="点击页面元素，将文本填入标题">🎯</button></div><input class="bm-input" id="bm-title"></div>' +
    '  <label class="bm-field">网址<input class="bm-input" id="bm-url"></label>' +
    '  <div class="bm-field"><div class="bm-field-head">作者 <button type="button" class="bm-pick" id="bm-pick-author" title="点击页面元素，将文本填入作者">🎯</button></div><input class="bm-input" id="bm-author" placeholder="（可选）"></div>' +
    '  <div class="bm-field"><div class="bm-field-head">合集 <button type="button" class="bm-pick" id="bm-pick-collection" title="点击页面元素，将文本填入合集">🎯</button></div><input class="bm-input" id="bm-collection" placeholder="（可选）"></div>' +
    '  <div class="bm-field"><div class="bm-field-head">发布时间 <button type="button" class="bm-pick" id="bm-pick-pubdate" title="点击页面元素，将文本填入发布时间">🎯</button></div><input class="bm-input" id="bm-pubdate" placeholder="（可选，如 2024-01-15，留空则忽略）"></div>' +
    '  <div class="bm-field"><div class="bm-field-head">封面 <button type="button" class="bm-pick" id="bm-pick-cover" title="点击页面图片，将图片地址填入封面">🎯</button></div><input class="bm-input" id="bm-cover" placeholder="（可选，图片地址）"><img class="bm-cover-preview" id="bm-cover-preview" alt="封面预览" hidden></div>' +
    '  <label class="bm-field">分类' +
    '    <select class="bm-input" id="bm-cat"><option value="">（默认分类）</option></select>' +
    '  </label>' +
    '  <div class="bm-field"><div class="bm-label">标签</div>' +
    '    <div class="bm-tags" id="bm-tags"><div class="bm-tag-empty">加载中…</div></div>' +
    '  </div>' +
    '  <div class="bm-field"><div class="bm-field-head">详情 <button type="button" class="bm-pick" id="bm-pick-detail" title="点击页面元素，将文本填入详情">🎯</button></div><textarea class="bm-textarea" id="bm-detail" placeholder="（可选）简介 "></textarea></div>' +
    '  <a class="bm-manage" id="bm-manage" href="#" target="_blank">📋 打开后台页面</a>' +
    '  <button class="bm-btn bm-settings" id="bm-options">⚙️ 插件规则管理</button>' +
    '  <div class="bm-status" id="bm-status"></div>' +
    '  <div class="bm-set">' +
    '    <label>服务器</label>' +
    '    <input id="bm-server" placeholder="http://localhost:9000">' +
    '  </div>' +
    '  <button class="bm-btn bm-extract" id="bm-extract">🛠️ 提取辅助工具</button>' +
    '</div>';
  document.documentElement.appendChild(root);

  const els = {
    title: root.querySelector('#bm-title'),
    url: root.querySelector('#bm-url'),
    author: root.querySelector('#bm-author'),
    collection: root.querySelector('#bm-collection'),
    pubdate: root.querySelector('#bm-pubdate'),
    cover: root.querySelector('#bm-cover'),
    detail: root.querySelector('#bm-detail'),
    coverPreview: root.querySelector('#bm-cover-preview'),
    pickTitle: root.querySelector('#bm-pick-title'),
    pickAuthor: root.querySelector('#bm-pick-author'),
    pickCollection: root.querySelector('#bm-pick-collection'),
    pickPubdate: root.querySelector('#bm-pick-pubdate'),
    pickCover: root.querySelector('#bm-pick-cover'),
    pickDetail: root.querySelector('#bm-pick-detail'),
    cat: root.querySelector('#bm-cat'),
    tags: root.querySelector('#bm-tags'),
    saveBtn: root.querySelector('#bm-save'),
    extractBtn: root.querySelector('#bm-extract'),
    manageLink: root.querySelector('#bm-manage'),
    optionsBtn: root.querySelector('#bm-options'),
    status: root.querySelector('#bm-status'),
    serverInput: root.querySelector('#bm-server'),
    closeBtn: root.querySelector('#bm-close'),
    resizeEl: root.querySelector('#bm-resize')
  };

  // 标签是否已从后端成功加载（未加载则用免费文本兜底）
  let metaLoaded = false;

  // ---------- 初始化 ----------
  chrome.storage.local.get(['serverUrl', 'drawerWidth'], (res) => {
    const serverUrl = res.serverUrl || DEFAULT_SERVER;
    els.serverInput.value = serverUrl;
    els.manageLink.href = serverUrl;
    // 应用上次保存的抽屉宽度（夹在 240px ~ 90vw 之间）
    const w = clampWidth(res.drawerWidth);
    if (w) {
      root.style.width = w + 'px';
      root.style.maxWidth = '90vw';
    }
  });
  // 标题 / 网址默认可编辑
  els.title.value = document.title || '(无标题)';
  els.url.value = location.href;

  // 站点专属提取规则：读取 site-rules/ 注入到 <html data-bm-site-rule> 的数据并自动填入输入框。
  // 由于 MAIN world 的提取脚本是异步（需读 chrome.storage），属性可能晚于本抽屉注入才写入，
  // 因此先读一次，再在 2 秒内轮询等待，确保拿到规则数据再回填。
  readSiteRule();
  applySiteRule();
  watchSiteRule(Date.now() + 2000);

  els.serverInput.addEventListener('change', () => {
    const v = els.serverInput.value.trim();
    chrome.storage.local.set({ serverUrl: v });
    els.manageLink.href = v;
    loadMeta();
  });
  els.closeBtn.addEventListener('click', closeDrawer);
  els.resizeEl.addEventListener('mousedown', startResize);
  els.saveBtn.addEventListener('click', saveBookmark);
  els.extractBtn.addEventListener('click', startExtract);
  els.optionsBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'openOptions' });
  });
  els.pickTitle.addEventListener('click', () => startFieldPick('title'));
  els.pickAuthor.addEventListener('click', () => startFieldPick('author'));
  els.pickCollection.addEventListener('click', () => startFieldPick('collection'));
  els.pickPubdate.addEventListener('click', () => startFieldPick('pubdate'));
  els.pickCover.addEventListener('click', () => startFieldPick('cover'));
  els.pickDetail.addEventListener('click', () => startFieldPick('detail'));
  els.cover.addEventListener('input', updateCoverPreview);

  // 抽屉内部的交互不触发页面
  root.addEventListener('click', (e) => e.stopPropagation());
  root.addEventListener('mousedown', (e) => e.stopPropagation());

  // 只注册 ESC 关闭；不再监听「外部点击关闭」，点击页面其它区域不会收起抽屉。
  setTimeout(() => {
    document.addEventListener('keydown', onKey, true);
  }, 0);

  // 提取模式结束后（选取元素/关闭面板/取消），把抽屉重新滑回显示
  document.addEventListener('__bm_extract_state', onExtractState, true);

  // 下一帧滑入
  requestAnimationFrame(() => root.classList.add('bm-open'));

  // 打开即拉取分类 / 标签
  loadMeta();

  // ---------- 元数据库（分类 / 标签） ----------
  function serverUrl() {
    return els.serverInput.value.trim() || DEFAULT_SERVER;
  }

  async function fetchJSON(url) {
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  async function loadMeta() {
    try {
      const [cats, tags] = await Promise.all([
        fetchJSON(serverUrl() + '/api/categories'),
        fetchJSON(serverUrl() + '/api/tags')
      ]);
      renderCategories(cats);
      renderTags(tags, cats);
      metaLoaded = true;
      applyRuleTags(); // 规则标签：按名称勾选对应复选框
    } catch (e) {
      showTagFallback();
      applyRuleTags(); // 规则标签：写入兜底文本输入框
    }
  }

  // ---------- 站点专属提取规则（site-rules/ 经 MAIN world 注入，数据在 <html data-bm-site-rule>） ----------

  function readSiteRule() {
    try {
      const raw = document.documentElement.getAttribute('data-bm-site-rule');
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.title) siteRuleData = d;
    } catch (e) {
      console.error('读取站点规则失败:', e);
    }
  }

  // 轮询等待 MAIN world 异步写入的 data-bm-site-rule（提取脚本需读 chrome.storage，晚于本抽屉注入）
  function watchSiteRule(deadline) {
    readSiteRule();
    applySiteRule();
    if (siteRuleData) return;            // 已拿到规则数据，停止轮询
    if (Date.now() < deadline) {
      setTimeout(() => watchSiteRule(deadline), 150);
    }
  }

  // 把规则提取出的字段填入输入框（标题/作者/合集/封面）
  function applySiteRule() {
    if (!siteRuleData) return;
    const d = siteRuleData;
    if (d.title) els.title.value = d.title;
    if (d.author) els.author.value = d.author;
    if (d.collection) els.collection.value = d.collection;
    if (d.cover) {
      els.cover.value = d.cover;
      updateCoverPreview();
    }
    if (d.pubdate) els.pubdate.value = d.pubdate;
    if (d.desc) els.detail.value = d.desc; // 站点简介（如 bilibili）自动填入「详情」框
  }

  // 封面预览：有地址就显示缩略图，空则隐藏
  function updateCoverPreview() {
    const url = els.cover.value.trim();
    if (url) {
      els.coverPreview.src = url;
      els.coverPreview.hidden = false;
    } else {
      els.coverPreview.hidden = true;
      els.coverPreview.removeAttribute('src');
    }
  }

  // 规则标签：后端已加载则按名称勾选复选框，否则填入兜底输入框
  function applyRuleTags() {
    const d = siteRuleData;
    if (!d || !d.tags) return;
    const names = String(d.tags).split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    if (metaLoaded) {
      els.tags.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        const label = cb.closest('label');
        const name = label ? (label.textContent || '').trim() : '';
        if (names.indexOf(name) !== -1) cb.checked = true;
      });
    } else {
      const fb = els.tags.querySelector('#bm-tag-fallback');
      if (fb) fb.value = names.join(',');
    }
  }

  function renderCategories(cats) {
    // 保留默认首项，追加后端分类
    els.cat.innerHTML = '<option value="">（默认分类）</option>';
    (cats || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      els.cat.appendChild(opt);
    });
  }

  function renderTags(tags, cats) {
    const catName = {};
    (cats || []).forEach((c) => { catName[c.id] = c.name; });
    // 按分类分组
    const groups = {};
    (tags || []).forEach((t) => {
      const key = (t.category_id != null && catName[t.category_id]) ? catName[t.category_id] : '默认';
      (groups[key] = groups[key] || []).push(t);
    });
    const names = Object.keys(groups);
    if (names.length === 0) {
      els.tags.innerHTML = '<div class="bm-tag-empty">暂无标签（可在管理页面添加）</div>';
      return;
    }
    els.tags.innerHTML = '';
    names.forEach((gname) => {
      const g = document.createElement('div');
      g.className = 'bm-tag-group';
      const head = document.createElement('div');
      head.className = 'bm-tag-cat';
      head.textContent = gname;
      g.appendChild(head);
      groups[gname]
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .forEach((t) => {
          const label = document.createElement('label');
          label.className = 'bm-tag-item';
          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = t.id;
          cb.dataset.tagId = t.id;
          label.appendChild(cb);
          label.appendChild(document.createTextNode(t.name));
          g.appendChild(label);
        });
      els.tags.appendChild(g);
    });
  }

  // 后端拉取失败时，标签退化为免费文本输入（逗号分隔）
  function showTagFallback() {
    els.tags.innerHTML =
      '<div class="bm-tag-empty" style="margin-bottom:6px">无法加载标签（请确认服务已启动）</div>';
    const inp = document.createElement('input');
    inp.className = 'bm-input';
    inp.id = 'bm-tag-fallback';
    inp.placeholder = '标签（用逗号分隔）';
    els.tags.appendChild(inp);
  }

  function selectedTagIds() {
    return Array.from(els.tags.querySelectorAll('input[type="checkbox"]:checked'))
      .map((cb) => parseInt(cb.value, 10));
  }

  // ---------- 事件 ----------
  function onKey(e) {
    // 字段选取模式下，ESC 由 onPickKey 处理（取消选取），不关闭抽屉
    if (pickState) return;
    if (e.key === 'Escape') closeDrawer();
  }

  // ---------- 字段选取：点击页面元素，将提取文本填入输入框 ----------
  const FIELD_LABEL = { title: '标题', author: '作者', collection: '合集', pubdate: '发布时间', cover: '封面', detail: '详情' };
  const FIELD_INPUT = { title: els.title, author: els.author, collection: els.collection, pubdate: els.pubdate, cover: els.cover, detail: els.detail };
  const FIELD_BTN = { title: els.pickTitle, author: els.pickAuthor, collection: els.pickCollection, pubdate: els.pickPubdate, cover: els.pickCover, detail: els.pickDetail };

  function startFieldPick(field) {
    if (pickState) cancelFieldPick();
    root.classList.add('bm-hidden'); // 选取时隐藏抽屉，露出页面便于点选元素；结束后滑回
    document.documentElement.classList.add('bm-picking'); // 选取期间页面光标统一为箭头
    if (FIELD_BTN[field]) FIELD_BTN[field].classList.add('active');

    const hint = document.createElement('div');
    hint.id = '__bm_pickbar';
    hint.innerHTML =
      '<span id="bm-pick-tip">🎯 正在选取「' + FIELD_LABEL[field] + '」：点击页面上的元素（或按 Q 提取鼠标所指，避免链接跳转）</span>' +
      '<button type="button" class="bm-pick-ok" id="bm-pick-ok" disabled>确定</button>' +
      '<button type="button" class="bm-pick-cancel" id="bm-pick-cancel">取消</button>';
    Object.assign(hint.style, {
      position: 'fixed',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '2147483647',
      background: 'linear-gradient(135deg,#2d2d3a,#3d3d52)',
      border: '1px solid rgba(255,255,255,0.14)',
      color: '#fff',
      padding: '9px 14px',
      borderRadius: '10px',
      font: '13px -apple-system, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      maxWidth: '74vw'
    });
    const okBtn = hint.querySelector('#bm-pick-ok');
    const cancelBtn = hint.querySelector('#bm-pick-cancel');

    // 行内 !important 兜底：防止页面 CSS 把按钮覆盖成白底白字（如全局 button 重置）
    function setBtnStyle(btn, props) {
      Object.keys(props).forEach((k) => btn.style.setProperty(k, props[k], 'important'));
    }
    // 「确定」按钮随 disabled 状态切换配色（禁用=灰、启用=紫色渐变）
    function paintOk() {
      const disabled = okBtn.disabled;
      setBtnStyle(okBtn, {
        background: disabled ? '#4f4a5e' : 'linear-gradient(135deg,#667eea,#764ba2)',
        color: disabled ? '#c9c3d6' : '#ffffff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 2px 8px rgba(118,75,162,0.5)'
      });
    }
    setBtnStyle(cancelBtn, {
      background: 'rgba(255,255,255,0.14)',
      color: '#ffffff',
      border: '1px solid rgba(255,255,255,0.4)',
      borderRadius: '8px',
      fontSize: '12px',
      fontWeight: '600',
      padding: '6px 14px',
      cursor: 'pointer'
    });
    paintOk();

    okBtn.onclick = confirmFieldPick;
    cancelBtn.onclick = () => cancelFieldPick();
    document.documentElement.appendChild(hint);

    pickState = {
      field: field,
      el: null,
      hint: hint,
      okBtn: okBtn,
      hoverEl: null,
      paintOk: paintOk
    };
    document.addEventListener('mousemove', onPickMove, true);
    document.addEventListener('click', onPickClick, true);
    document.addEventListener('keydown', onPickKey, true);
  }

  function clearPickOutline() {
    if (pickState && pickState.hoverEl) {
      pickState.hoverEl.style.outline = pickState.hoverEl.__origOutline || '';
      pickState.hoverEl = null;
    }
    if (pickState && pickState.el && pickState.el !== pickState.hoverEl) {
      pickState.el.style.outline = pickState.el.__origOutline || '';
      pickState.el = null;
    }
  }

  function onPickMove(e) {
    if (!pickState) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === pickState.hoverEl) return;
    if (el.closest && el.closest('#__bm_pickbar')) return; // 忽略提示条（含其内按钮）
    if (el.closest && el.closest('#' + DRAWER_ID)) return; // 忽略抽屉自身
    if (pickState.hoverEl) {
      pickState.hoverEl.style.outline = pickState.hoverEl.__origOutline || '';
    }
    pickState.hoverEl = el;
    pickState.hoverEl.__origOutline = el.style.outline;
    el.style.outline = '2px solid #764ba2';
    el.style.outlineOffset = '1px';
  }

  function onPickClick(e) {
    if (!pickState) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    // 点在提示条上（含「确定/取消」按钮）：放行，不拦截，让按钮正常触发
    if (el.closest && el.closest('#__bm_pickbar')) return;
    e.preventDefault();
    e.stopPropagation();
    if (el.closest && el.closest('#' + DRAWER_ID)) return; // 点在抽屉上不选取
    // 清除上一个选中态的高亮
    if (pickState.el) pickState.el.style.outline = pickState.el.__origOutline || '';
    pickState.el = el;
    pickState.el.__origOutline = el.style.outline;
    el.style.outline = '2px solid #ff4d4f';
    el.style.outlineOffset = '1px';
    // 预览文本（封面预览图片地址，其余预览文字）
    let previewTxt = (el.innerText || el.textContent || '').trim();
    if (pickState.field === 'cover') {
      previewTxt = '';
      if (el.tagName === 'IMG') previewTxt = el.currentSrc || el.src || '';
      if (!previewTxt && el.querySelector) {
        const img = el.querySelector('img');
        if (img) previewTxt = img.currentSrc || img.src || '';
      }
      if (!previewTxt) {
        const bg = getComputedStyle(el).backgroundImage;
        const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
        if (m) previewTxt = m[1];
      }
    }
    const tip = hintEl('#bm-pick-tip');
    if (tip) tip.textContent = '已选择：' + (previewTxt.slice(0, 60) || '(空文本，仍可确定)');
    pickState.okBtn.disabled = false;
    if (pickState.paintOk) pickState.paintOk(); // 启用态配色（紫色渐变）
  }

  function hintEl(id) {
    return pickState && pickState.hint ? pickState.hint.querySelector(id) : null;
  }

  function confirmFieldPick() {
    if (!pickState || !pickState.el) return;
    const field = pickState.field;
    const el = pickState.el;
    const input = FIELD_INPUT[field];
    if (input) {
      if (field === 'cover') {
        // 封面：取图片地址（当前元素为 img → 其 src；否则找内部 img；再退回 CSS 背景图）
        let url = '';
        if (el.tagName === 'IMG') url = el.currentSrc || el.src || '';
        if (!url && el.querySelector) {
          const img = el.querySelector('img');
          if (img) url = img.currentSrc || img.src || '';
        }
        if (!url) {
          const bg = getComputedStyle(el).backgroundImage;
          const m = bg && bg.match(/url\(["']?(.*?)["']?\)/);
          if (m) url = m[1];
        }
        input.value = url.trim();
      } else {
        const txt = (el.innerText || el.textContent || '').trim();
        // 详情取前 2000 字符，其余字段取前 300 字符
        input.value = field === 'detail' ? txt.slice(0, 2000) : txt.slice(0, 300);
      }
    }
    cancelFieldPick();
  }

  function cancelFieldPick() {
    if (!pickState) return;
    clearPickOutline();
    document.removeEventListener('mousemove', onPickMove, true);
    document.removeEventListener('click', onPickClick, true);
    document.removeEventListener('keydown', onPickKey, true);
    if (pickState.hint && pickState.hint.parentNode) pickState.hint.parentNode.removeChild(pickState.hint);
    const btn = FIELD_BTN[pickState.field];
    if (btn) btn.classList.remove('active');
    pickState = null;
    root.classList.remove('bm-hidden'); // 选取结束（确定/取消/ESC）：抽屉滑回显示
    document.documentElement.classList.remove('bm-picking'); // 恢复页面光标
  }

  function onPickKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelFieldPick();
    } else if ((e.key === 'q' || e.key === 'Q') && pickState) {
      // 按 Q：直接提取鼠标悬停元素的数据（无需点击，避免点中链接跳转）
      e.preventDefault();
      e.stopPropagation();
      if (pickState.hoverEl) {
        // 清除旧的点击选中高亮，改用当前悬停元素
        if (pickState.el && pickState.el !== pickState.hoverEl) {
          pickState.el.style.outline = pickState.el.__origOutline || '';
        }
        pickState.el = pickState.hoverEl;
        pickState.hoverEl = null;
        confirmFieldPick();
      }
    }
  }

  // 把值夹到合法宽度范围（返回 number 或 null 表示用默认）
  function clampWidth(v) {
    const n = parseInt(v, 10);
    if (!n || n <= 0) return null;
    const min = 240;
    const max = Math.round(window.innerWidth * 0.9);
    return Math.max(min, Math.min(max, n));
  }

  // 拖动左侧把手调整抽屉宽度
  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    els.resizeEl.classList.add('bm-dragging');
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    const startX = e.clientX;
    const startW = root.getBoundingClientRect().width;

    function onMove(ev) {
      const delta = startX - ev.clientX; // 向左拖 => 变宽
      const w = clampWidth(startW + delta) || startW;
      root.style.width = w + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('mouseup', onUp, true);
      els.resizeEl.classList.remove('bm-dragging');
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      const w = Math.round(root.getBoundingClientRect().width);
      root.style.width = w + 'px';
      chrome.storage.local.set({ drawerWidth: w });
    }
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('mouseup', onUp, true);
  }

  // 提取模式状态广播：提取规则面板在打开期间（opened/picking）抽屉保持隐藏，让出右侧位置；
  // 仅当面板关闭（closed）时抽屉才恢复显示
  function onExtractState(e) {
    const state = e && e.detail && e.detail.state;
    if (state === 'closed') {
      root.classList.remove('bm-hidden'); // 面板关闭：抽屉恢复显示
    } else {
      root.classList.add('bm-hidden'); // opened / picking：提取面板占着右侧位置，抽屉隐藏
    }
  }

  function closeDrawer() {
    cancelFieldPick();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('__bm_extract_state', onExtractState, true);
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  async function saveBookmark() {
    els.saveBtn.disabled = true;
    els.saveBtn.textContent = '收藏中...';
    els.status.className = 'bm-status';
    els.status.textContent = '';

    let categoryId = null;
    if (els.cat.value !== '') categoryId = parseInt(els.cat.value, 10);

    const payload = {
      title: els.title.value.trim(),
      url: els.url.value.trim(),
      author: els.author.value.trim(),
      collection: els.collection.value.trim(),
      favicon: getFavicon(),
      is_video: (siteRuleData && siteRuleData.is_video) || false
    };
    // 发布时间：始终提交（空串表示清空），字段可空
    payload.pubdate = els.pubdate.value.trim();
    // 详情：站点规则 desc 已自动填入「详情」框，这里取用户输入（空串则清空详情）
    payload.detail = els.detail.value;
    if (categoryId !== null) payload.category_id = categoryId;
    // 封面：以输入框为准（站点规则已自动填入，也可手动改）
    const coverVal = els.cover.value.trim();
    if (coverVal) payload.cover = coverVal;
    // 站点规则附带的视频字段（bilibili：时长 / 简介）
    if (siteRuleData) {
      if (siteRuleData.duration) payload.duration = siteRuleData.duration;
    }

    if (metaLoaded) {
      const ids = selectedTagIds();
      if (ids.length) payload.tag_ids = ids;
    } else {
      const fb = els.tags.querySelector('#bm-tag-fallback');
      if (fb) payload.tags = fb.value.trim();
    }

    if (!payload.title || !payload.url) {
      els.status.className = 'bm-status error';
      els.status.textContent = '❌ 标题和网址不能为空';
      els.saveBtn.disabled = false;
      els.saveBtn.textContent = '💾 收藏';
      return;
    }

    try {
      const res = await fetch(serverUrl() + '/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        els.status.className = 'bm-status success';
        els.status.textContent = '✅ ' + (data.message || '收藏成功');
        els.title.value = '';
        els.author.value = '';
        els.collection.value = '';
        els.cover.value = '';
        els.pubdate.value = '';
        els.detail.value = '';
        updateCoverPreview();
        setTimeout(closeDrawer, 1400);
      } else {
        els.status.className = 'bm-status error';
        els.status.textContent = '❌ ' + (data.message || data.error || '收藏失败');
      }
    } catch (e) {
      els.status.className = 'bm-status error';
      els.status.textContent = '❌ 无法连接服务器，请确认服务已启动';
    } finally {
      els.saveBtn.disabled = false;
      els.saveBtn.textContent = '💾 收藏';
    }
  }

  function startExtract() {
    // 先隐藏抽屉（滑出右侧），等选取元素后（extract.js 广播 __bm_extract_state）再滑回显示
    root.classList.add('bm-hidden');
    chrome.runtime.sendMessage({ type: 'startExtract' }, (resp) => {
      if (!resp || !resp.ok) {
        root.classList.remove('bm-hidden'); // 启动失败，抽屉回来
        els.status.className = 'bm-status error';
        els.status.textContent = '❌ 启动提取模式失败：' + ((resp && resp.error) || '未知错误');
        console.error('启动提取模式失败：', resp && resp.error);
      }
    });
  }

  function getFavicon() {
    const link = document.querySelector('link[rel*="icon"]');
    if (link && link.href) {
      try {
        return new URL(link.href, location.href).href;
      } catch (e) {
        return link.href;
      }
    }
    return '';
  }
})();
