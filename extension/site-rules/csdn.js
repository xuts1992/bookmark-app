// site-rules/csdn.js - CSDN 博客文章页专属提取规则
// 只需实现 match / extract(rule, data) 两个方法并注册，公共逻辑见 extension/site-rule-base.js 的 BmSiteRule。
//   rule  = 父类从 chrome.storage.local 读到的保存规则（当前 hostname 无保存规则时为 null）
//   data  = 父类用 rule 里的 XPath 提取出的原始文本映射；无保存规则时为空对象 {}
(function () {
  'use strict';

  class CSDNRule extends BmSiteRule {
    get name() { return 'CSDN'; }
    get brand() { return '#e6282b'; }

    // 匹配 CSDN 博客文章页：https://blog.csdn.net/{用户}/article/details/{id}
    match(url) {
      return /^https?:\/\/(blog\.)?csdn\.net\/[^/]+\/article\/details\//i.test(url);
    }

    // 组装最终结果：保存规则经 XPath 提取的字段优先；缺失字段回退到 JSON-LD / DOM 解析
    extract(rule, data) {
      var fb = this._parseCSDN() || {};
      var pick = function (k) {
        return (data && data[k] != null && data[k] !== '') ? data[k] : fb[k];
      };
      var src = {
        title: pick('title'),
        author: pick('author'),
        collection: pick('collection'),
        cover: pick('cover'),
        pubdate: pick('pubdate'),
        desc: pick('desc'),
        content: pick('content')
      };
      if (!src.title) return null;
      return {
        title: src.title || '',
        author: src.author || '',
        collection: src.collection || '',
        cover: src.cover || '',
        pubdate: src.pubdate || '',
        desc: src.desc || '',
        duration: '',
        tags: '',
        is_video: false,
        content: src.content || ''
      };
    }

    // 兜底：无保存规则时，解析 JSON-LD / 页面 DOM
    _parseCSDN() {
      // 读取 JSON-LD 中的发布时间（CSDN 文章页一般有 application/ld+json）
      var ld = {};
      try {
        var ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (var i = 0; i < ldScripts.length; i++) {
          var parsed = JSON.parse(ldScripts[i].textContent);
          var items = Array.isArray(parsed) ? parsed : [parsed];
          for (var k = 0; k < items.length; k++) {
            if (items[k] && items[k].datePublished) { ld = items[k]; break; }
          }
          if (ld && ld.datePublished) break;
        }
      } catch (e) {}

      var titleEl = document.querySelector('h1.title-article');
      var authorEl = document.querySelector('.user-info .profile-intro-name-boxTop a span');
      var colEl = document.querySelector('a.article-column');
      var descEl = document.querySelector('meta[name="description"]');
      var contentEl = document.getElementById('content_views');

      return {
        title: titleEl ? (titleEl.textContent || '').trim() : '',
        author: authorEl ? authorEl.textContent.trim() : '',
        collection: colEl ? colEl.textContent.trim() : '',
        cover: '',                                   // CSDN 文章页无 og:image
        pubdate: (ld && ld.datePublished) ? String(ld.datePublished) : '',
        desc: descEl ? (descEl.content || '').trim() : '',
        content: contentEl ? (contentEl.innerText || contentEl.textContent || '').trim() : ''
      };
    }
  }

  BmSiteRule.register(new CSDNRule());
})();
