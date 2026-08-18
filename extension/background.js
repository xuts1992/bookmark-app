// background.js - Service Worker (Manifest V3)
// 用于处理扩展安装、右键菜单等后台任务

chrome.runtime.onInstalled.addListener(() => {
  // 创建右键菜单：收藏当前页面
  chrome.contextMenus.create({
    id: 'save-bookmark',
    title: '收藏到网页收藏助手',
    contexts: ['page']
  });
});

// 站点专属提取规则：自动扫描 site-rules/ 目录，无需人工维护文件列表。
//   - scripts/gen-site-rules.mjs 扫描 site-rules/*.js（排除 _ 开头的文件），
//     生成 site-rules/manifest.json 规则清单；
//   - 框架文件 site-rule-base.js / site-rule-bootstrap.js 放在 extension/ 根目录
//     （注意：Chrome 不允许扩展文件名以 _ 开头，故不能用 _base.js / _bootstrap.js）；
//   - 本项目 build.bat 已集成该生成步骤，每次构建自动重新扫描；
//   - 后台在此 fetch 清单，按 [site-rule-base.js, ...rules, site-rule-bootstrap.js] 顺序注入：
//       site-rule-base.js 定义父类 BmSiteRule 并挂到 window；
//       各规则文件继承 BmSiteRule、实现 match/extract、调用 BmSiteRule.register 注册；
//       site-rule-bootstrap.js 依次运行所有已注册规则（写 <html data-bm-site-rule> 等）。
// 新增站点规则：只在 site-rules/ 丢一个 .js 文件即可，无需改动本文件。
let siteRuleFilesCache = null;
async function listSiteRuleFiles() {
  if (siteRuleFilesCache) return siteRuleFilesCache;
  try {
    const res = await fetch(chrome.runtime.getURL('site-rules/manifest.json'));
    if (!res.ok) throw new Error('manifest.json 读取失败: ' + res.status);
    const data = await res.json();
    siteRuleFilesCache = Array.isArray(data.rules) ? data.rules : [];
  } catch (e) {
    console.warn('[网页收藏助手] 读取站点规则清单失败，本次不注入规则:', e);
    siteRuleFilesCache = [];
  }
  return siteRuleFilesCache;
}

// 点击工具栏图标：去掉 default_popup 后由这里接管
// 1) 先以 MAIN world 注入站点规则（能读到页面全局变量，如 bilibili 的 window.__INITIAL_STATE__）；
// 2) 再注入抽屉（content script，隔离世界）。
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  try {
    const ruleFiles = await listSiteRuleFiles();
    // 注入顺序：基类 → 各规则 → 引导；即便没有规则文件，基类+引导也无害
    const files = ['site-rule-base.js', ...ruleFiles, 'site-rule-bootstrap.js'];

    // 站点规则以 MAIN world 注入（需读取页面全局变量，如 window.__INITIAL_STATE__），
    // 但 MAIN world 内 chrome.storage 不可用（仅在隔离世界/后台可用）。
    // 故先由后台读取浏览器保存的提取规则，再以 MAIN world 注入一个脚本，
    // 把规则挂到 window.__bmStorageRules，供 site-rule-base.js 的 _loadSavedRule 读取。
    let savedRules = {};
    try {
      savedRules = await new Promise((resolve) => {
        chrome.storage.local.get(null, (obj) => resolve((obj && typeof obj === 'object') ? obj : {}));
      });
    } catch (e) { savedRules = {}; }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (rules) => { window.__bmStorageRules = rules; },
      args: [savedRules]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: files,
      world: 'MAIN'
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['drawer.js']
    });
  } catch (e) {
    console.error('打开抽屉失败:', e);
  }
});

// 右键菜单点击处理
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'save-bookmark') {
    const result = await chrome.storage.local.get(['serverUrl']);
    const serverUrl = result.serverUrl || 'http://localhost:9000';

    try {
      const res = await fetch(serverUrl + '/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tab.title || '(无标题)',
          url: tab.url,
          favicon: tab.favIconUrl || '',
          tags: ''
        })
      });
      const data = await res.json();
      // 通过 chrome.notifications 提示用户（需要 notifications 权限）
      console.log('右键收藏结果:', data);
    } catch (e) {
      console.error('右键收藏失败:', e);
    }
  }
});

// ---------- 提取模式 / 选项页 消息 ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'startExtract') {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      sendResponse({ ok: false, error: 'no tab' });
      return;
    }
    chrome.scripting
      .executeScript({ target: { tabId: tabId }, files: ['extract.js'] })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: e.message }));
    return true; // 异步返回响应
  }
  if (msg.type === 'openOptions') {
    chrome.runtime.openOptionsPage().then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, error: e.message })
    );
    return true; // 异步返回响应
  }
});

// 提取规则现已由插件直接写入浏览器本地 storage（chrome.storage.local）：
//   key = 当前网址 hostname（如 www.bilibili.com），value = JSON 字符串（字段 → {css,xpath,title}）。
// 不再与后端交互，故后台不再处理 saveExtractRule / getExtractRule 消息。
