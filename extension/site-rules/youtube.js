// site-rules/youtube.js - YouTube 视频页专属提取规则
// 只需实现 match / extract(rule, data) 两个方法并注册，公共逻辑见 extension/site-rule-base.js 的 BmSiteRule。
//   rule  = 父类从 chrome.storage.local 读到的保存规则（当前 hostname 无保存规则时为 null）
//   data  = 父类用 rule 里的 XPath 提取出的原始文本映射；无保存规则时为空对象 {}
// 匹配页面：https://www.youtube.com/watch?v=xxx 或 https://youtu.be/xxx
(function () {
  'use strict';

  class YoutubeRule extends BmSiteRule {
    get name() { return 'YouTube'; }
    get brand() { return '#ff0000'; }

    // 匹配 YouTube 视频页（watch?v= 或 youtu.be 短链，含 www./m. 前缀）
    match(url) {
      return /^https?:\/\/((www|m)\.)?(youtube\.com\/watch\?[^#]*\bv=|youtu\.be\/)/i.test(url);
    }

    // 组装最终结果：保存规则经 XPath 提取的字段优先；缺失字段回退到 DOM 解析（_parseDOM）
    extract(rule, data) {
      var fb = this._parseDOM() || {};
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
        collection: src.collection || '',
        cover: this._cleanCover(src.cover),
        pubdate: this._fmtPubdate(src.pubdate),
        desc: src.desc || '',
        duration: src.duration,
        tags: src.tags || '',
        is_video: true
      };
    }



    // 最后兜底：解析页面 DOM（标题 h1 / 作者 / og:image / 时长 meta）
    _parseDOM() {
      var titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') || document.querySelector('h1.title') || document.querySelector('h1');
      var authorEl = document.querySelector('#owner yt-formatted-string a') || document.querySelector('#channel-name a');
      var descEl = document.querySelector('#description-inline-expander span');
      var og = document.querySelector('.ytThumbnailViewModelImage img');
      var durEl = document.querySelector('.ytp-time-contents .ytp-time-duration  '); // content 形如 PT1H2M3S
      var pubdateEl = document.querySelector('#info-strings yt-formatted-string.ytd-video-primary-info-renderer'); // 如「2026年8月17日」
      // debugger;
      return {
        title: titleEl ? (titleEl.outerText || '').trim() : '',
        author: authorEl ? authorEl.outerText.trim() : '',
        collection: '',
        cover: og ? (og.src || '') : '',
        pubdate: pubdateEl ? (pubdateEl.outerText || '') : '',
        desc: descEl ? (descEl.outerText || '').trim() : '',
        duration:durEl.outerText ,
        tags: '',
        is_video: true
      };
    }

    // ISO 8601 时长（PT1H2M3S）转秒数
    _isoDurationToSec(d) {
      if (!d) return '';
      var m = String(d).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!m) return '';
      var s = (parseInt(m[1] || 0, 10) * 3600) + (parseInt(m[2] || 0, 10) * 60) + parseInt(m[3] || 0, 10);
      return s > 0 ? String(s) : '';
    }

    // 秒数 → "H:MM:SS" 或 "M:SS"
    _fmtDuration(sec) {
      var n = parseInt(sec, 10);
      if (!n || n <= 0) return '';
      var h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60), s = n % 60;
      var pad = function (x) { return (x < 10 ? '0' : '') + x; };
      return h > 0 ? (h + ':' + pad(m) + ':' + pad(s)) : (m + ':' + pad(s));
    }

    // 发布日期解析 → 统一为 YYYY-MM-DD：
    //   支持「2026年8月17日」「2026年08月17日」「2026-08-17」「2026/8/17」以及
    //   ISO 串「2026-08-12T20:00:14-07:00」（自动取日期部分）；无法解析则原样返回
    _fmtPubdate(d) {
      if (!d) return '';
      var s = String(d).trim();
      var m = s.match(/(\d{4})[年\-/.](\d{1,2})[月\-/.](\d{1,2})日?/);
      if (m) {
        var p = function (x) { return (x < 10 ? '0' : '') + x; };
        return m[1] + '-' + p(parseInt(m[2], 10)) + '-' + p(parseInt(m[3], 10));
      }
      return s;
    }

    // 封面 URL 去掉问号后的参数（YouTube 缩略图常带 ?sqp=...&rs=...）
    _cleanCover(u) {
      if (!u) return '';
      var s = String(u);
      var i = s.indexOf('?');
      return i > 0 ? s.slice(0, i) : s;
    }
  }

  BmSiteRule.register(new YoutubeRule());
})();
