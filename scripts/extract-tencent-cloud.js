// extract-tencent-cloud.js
// 腾讯云开发者社区（cloud.tencent.com/developer/article/xxxx）文章提取脚本
// 用法：打开目标文章页，按 F12 打开控制台，把本脚本整体粘贴运行。
// 输出：在控制台打印 标题 / 作者 / 合集(专栏) / 正文，并存入 window.__article 供后续使用。

(function () {
  'use strict';

  // 按优先级取第一个命中的元素（带空文本过滤）
  function pick(selectors, scope) {
    const root = scope || document;
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el && (el.textContent || '').trim()) return el;
    }
    return null;
  }

  const result = {};

  // 1. 标题
  const titleEl = pick(['h1.title-text', 'h1', 'meta[property="og:title"]']);
  result.title = titleEl
    ? (titleEl.tagName === 'META' ? titleEl.content : titleEl.textContent).trim()
    : '';

  // 2. 作者
  const authorEl = pick([
    '.mod-article-source__name span',
    '.author-info__name',
    '.author-info__name .name-text'
  ]);
  result.author = authorEl ? authorEl.textContent.trim() : '';

  // 3. 合集 / 专栏（“文章被收录于专栏：”处的链接文本）
  const colEl = pick([
    '.cdc-special-guide-name',
    '.cdc-special-guide-first-text',
    '.cdc-special-guide-first a'
  ]);
  result.column = colEl ? colEl.textContent.trim() : '';

  // 4. 正文（markdown 渲染区，保留段落换行）
  const contentEl = pick(['.mod-content__markdown', '.mod-content', 'article', '#articleContent']);
  result.content = contentEl ? contentEl.innerText.trim() : '';

  // ---------- 打印 ----------
  const sep = '%c══════════ 文章提取结果 ══════════';
  console.log(sep, 'color:#764ba2;font-weight:bold;font-size:14px');
  console.log('%c📌 标题：', 'font-weight:bold', result.title || '(未找到)');
  console.log('%c👤 作者：', 'font-weight:bold', result.author || '(未找到)');
  console.log('%c📚 合集/专栏：', 'font-weight:bold', result.column || '(未找到)');
  console.log('%c📄 正文（共 ' + result.content.length + ' 字）：', 'font-weight:bold');
  console.log(result.content || '(未找到)');
  console.log(sep, 'color:#764ba2;font-weight:bold;font-size:14px');

  // 存到 window 上，后续可直接用 window.__article 取数据
  window.__article = result;
  return result;
})();
