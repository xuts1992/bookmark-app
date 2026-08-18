// site-rules/bilibili.js - 哔哩哔哩视频页专属提取规则
// 只需实现 match / extract(rule, data) 两个方法并注册，公共逻辑见 extension/site-rule-base.js 的 BmSiteRule。
//   rule  = 父类从 chrome.storage.local 读到的保存规则（当前 hostname 无保存规则时为 null）
//   data  = 父类用 rule 里的 XPath 提取出的原始文本映射；无保存规则时为空对象 {}
(function () {
  'use strict';

  class BilibiliRule extends BmSiteRule {
    get name() { return 'bilibili'; }
    get brand() { return '#fb7299'; }

    // 匹配 bilibili 视频页：https://www.bilibili.com/video/BVxxxx 或 /video/avxxxx
    match(url) {
      return /^https?:\/\/(www\.)?bilibili\.com\/video\//i.test(url);
    }

    // 组装最终结果：保存规则经 XPath 提取的字段优先；缺失字段回退到 B 站 __INITIAL_STATE__
    extract(rule, data) {
      var fb = this._parseBilibili() || {};
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
        duration: pick('duration'),
        tags: pick('tags'),
        is_video: pick('is_video')
      };
      if (!src.title) return null;
      return {
        title: src.title || '',
        author: src.author || '',
        collection: src.collection || '',          // 合集/专栏
        cover: src.cover || '',                     // 封面
        pubdate: src.pubdate ? BmSiteRule.fmtPubdate(src.pubdate) : '',
        desc: src.desc || '',                        // 简介（可作详情）
        duration: src.duration != null ? String(src.duration) : '',
        tags: src.tags || '',
        is_video: true
      };
    }

    // 兜底：无保存规则时，直接解析 B 站页面全局变量 __INITIAL_STATE__
    _parseBilibili() {
      var state = window.__INITIAL_STATE__;
      if (!state || !state.videoData) return null;
      var v = state.videoData;
      var sections = state.sectionsInfo || {};
      var tags = (v.tags || [])
        .map(function (t) { return (t && (t.tag_name || t.tag || t.name)) || ''; })
        .filter(Boolean)
        .join(',');
      return {
        title: v.title || '',
        author: (v.owner && v.owner.name) || '',
        collection: sections.title || '',
        cover: v.pic || '',
        pubdate: v.pubdate != null ? v.pubdate : '',
        desc: v.desc || '',
        duration: v.duration != null ? v.duration : '',
        tags: tags,
        is_video: true
      };
    }
  }

  BmSiteRule.register(new BilibiliRule());
})();
