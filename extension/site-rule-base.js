// extension/site-rule-base.js
// ============================================================================
// 站点提取规则的公共父类（框架文件，放在 extension/ 根目录；site-rules/ 只放规则文件）。
// 注意：Chrome 不允许扩展文件名以 _ 开头，故文件名不能用 _base.js。
//
// 用户新建一条规则，只需做三件事：
//   1) 在 site-rules/ 下新建一个 .js 文件（不要用 _ 开头，否则不会被自动扫描到）；
//   2) 定义 class XxxRule extends BmSiteRule，实现两个方法：
//        match(url)  —— 判断 url 是否属于本站点（返回 true / false）；
//        extract(rule, data)
//                      —— 组装并返回最终提取对象。参数说明见下。
//      还可选覆盖 get name()（控制台打印用的站点名）、get brand()（打印配色）。
//   3) 文件末尾调用 BmSiteRule.register(new XxxRule()) 注册。
//
// 公共逻辑（全部由父类统一完成，用户无需关心）：
//   bootstrap() 统一编排（无论当前页是否有规则文件都会执行）：
//     1) 先从 chrome.storage.local 读取「按 hostname 保存的提取规则」；
//     2) 若读到保存规则，用其中的 XPath（优先）对页面提取各字段原始文本 data，并逐字段打印；
//     3) 再找 match(url) 命中的规则文件：命中则把 (rule, data) 交给子类的 extract(rule, data)；
//        未命中也无妨——只要浏览器有保存规则，就用 data 直接生成通用结果填充；
//        既没有匹配规则文件、浏览器也没有保存规则，才打印「没找到」。
//     4) 把结果写入 <html data-bm-site-rule>、挂 window.__extract、控制台彩色打印。
//
// extract(rule, data) 的两个入参：
//   rule —— 从 storage 读到的规则对象（如 {title:{css,xpath,title}, author:{...}, ...}）；
//           若当前 hostname 尚未保存任何规则，则为 null。
//   data —— 父类用 rule 里的 XPath 对页面提取出的原始文本映射
//           （形如 {title:'...', author:'...', pubdate:'...', collection:'...', ...}）；
//           即使没有匹配的规则文件，只要浏览器保存过规则，data 也会被填充；
//           仅包含 rule 中确实存在选择器的字段；无保存规则时为空对象 {}。
//   子类应返回最终对象，可用字段：title, author, collection, cover, pubdate,
//                        desc, duration, tags, is_video, content（缺失字段用空字符串 ''）。
//   若 subclass 想在无保存规则时仍能自动提取，可在 extract 内自行兜底解析。
//
// 注入顺序（由 background.js 自动安排）：
//   site-rule-base.js  →  各规则文件  →  site-rule-bootstrap.js
// site-rule-bootstrap.js 会依次运行所有已注册规则。
// ============================================================================
(function () {
  'use strict';

  class BmSiteRule {
    // 子类必须覆盖：判断 url 是否归本规则管
    match(url) { return false; }

    // 子类必须覆盖：组装最终结果（rule=保存的规则, data=XPath 提取的原始文本）
    extract(rule, data) { return null; }

    // 子类可覆盖：控制台打印用的站点名
    get name() { return 'site'; }

    // 子类可覆盖：控制台打印配色
    get brand() { return '#764ba2'; }

    // 公共：运行本规则。正常由 bootstrap() 统一编排——框架先读浏览器保存规则 + XPath 提取，
    // 再把 (rule, data) 传入本方法，此时 savedRule/data 由调用方提供，不再单独读 storage。
    // 调试调用（BmSiteRule.runRule）可不传参，本方法自行从 storage 加载 + 提取。
    // 注意：因可能读 chrome.storage.local，本方法为异步。
    async run(savedRule, data) {
      // 兼容调试：未传入保存规则时，自行加载并 XPath 提取
      if (savedRule === undefined) {
        savedRule = await this._loadSavedRule();
        data = savedRule ? this._extractByXpath(savedRule) : {};
      }

      // match 检查（调试直接调用时需要；bootstrap 已预筛匹配项，正常不会进入 false 分支）
      try {
        if (!this.match(location.href)) {
          console.log('%c[网页收藏助手] ' + this.name + ' 没找到（当前页不匹配）', 'color:#999');
          return false;
        }
      } catch (e) { return false; }

      // 交给子类组装最终结果
      let result;
      try {
        result = this.extract(savedRule, data);
      } catch (e) {
        console.error('[网页收藏助手] ' + this.name + ' extract() 抛错:', e);
        return false;
      }
      if (!result) {
        console.warn('[网页收藏助手] ' + this.name + ' extract() 返回空');
        return false;
      }
      if (!result.title) {
        console.warn('[网页收藏助手] ' + this.name + ' 提取结果标题为空，抽屉可能不回填');
      }

      // 写入 <html data-bm-site-rule> + 挂 window.__extract + 打印
      BmSiteRule.applyResult(this.name, this.brand, savedRule, data, result);
      return true;
    }

    // 公共：从 chrome.storage.local 读取当前 hostname 保存的规则（实例版，委托静态方法）
    _loadSavedRule() { return BmSiteRule._loadSavedRule(); }

    // 公共：用规则里的选择器（优先 XPath）对页面提取各字段原始文本（实例版，委托静态方法）
    _extractByXpath(rule) { return BmSiteRule._extractByXpathStatic(rule, this.name, this.brand); }

    // 公共：对单个 XPath 求值并返回首个节点的文本（实例版，委托静态方法）
    _xpathText(xpath) { return BmSiteRule._xpathTextStatic(xpath); }

    // 公共：彩色打印提取结果（实例版，委托静态方法）
    _log(data) { BmSiteRule._logStatic(data, this.name, this.brand); }
  }

  // 工具方法：Unix 秒级时间戳 → 本地可读日期 "YYYY-MM-DD HH:MM"。
  // 入参非数字（已是可读字符串，如 "2023-01-01"）时原样返回。
  BmSiteRule.fmtPubdate = function (ts) {
    if (!ts) return '';
    var n = Number(ts);
    if (n) {
      var d = new Date(n * 1000);
      var p = function (x) { return (x < 10 ? '0' : '') + x; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
        ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    return String(ts);
  };

  // ---- 静态公共方法：存储读取 / XPath 提取 / 结果写入 / 通用组装 ----

  // 静态：取后台注入的已保存规则映射（完整对象：{hostname: JSON字符串}）
  // 站点规则运行在 MAIN world，chrome.storage 不可用；后台已在点击工具栏时
  // 把 chrome.storage.local 的全部内容写入 window.__bmStorageRules（见 background.js）。
  BmSiteRule._getSavedMap = function () {
    try {
      if (typeof window !== 'undefined' && window.__bmStorageRules && typeof window.__bmStorageRules === 'object') {
        return window.__bmStorageRules;
      }
    } catch (e) {}
    return null;
  };

  // 静态：从已保存规则中取当前 hostname 的规则（解析其 JSON 字符串）
  BmSiteRule._loadSavedRule = function () {
    var host = location.hostname;
    return new Promise(function (resolve) {
      try {
        var all = BmSiteRule._getSavedMap();
        if (!all) {
          // 回退：极少数场景（如未点工具栏直接调试）尝试隔离世界的 chrome.storage
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return chrome.storage.local.get(host, function (obj) {
              var raw = obj && obj[host];
              if (!raw) return resolve(null);
              try {
                var p = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                resolve(p && typeof p === 'object' ? p : null);
              } catch (e) { resolve(null); }
            });
          }
          return resolve(null);
        }
        var raw = all[host];
        if (!raw) return resolve(null);
        try {
          var parsed = (typeof raw === 'string') ? JSON.parse(raw) : raw;
          resolve(parsed && typeof parsed === 'object' ? parsed : null);
        } catch (e) { resolve(null); }
      } catch (e) { resolve(null); }
    });
  };

  // 静态：用规则里的选择器（优先 XPath）对页面提取各字段原始文本，逐字段打印
  BmSiteRule._extractByXpathStatic = function (rule, name, brand) {
    var data = {};
    var fields = ['title', 'author', 'pubdate', 'collection', 'cover', 'tags', 'desc', 'duration', 'content', 'is_video'];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      var sel = rule[f];
      if (!sel) continue;
      var xpath = sel.xpath || sel.css; // 优先使用 XPath
      if (!xpath) continue;
      var txt = BmSiteRule._xpathTextStatic(xpath);
      if (txt != null && txt !== '') {
        data[f] = txt;
        console.log('%c[网页收藏助手] ' + name + ' 提取 [' + f + ']', 'color:' + brand, txt);
      }
    }
    return data;
  };

  // 静态：对单个 XPath 求值并返回首个节点的文本
  BmSiteRule._xpathTextStatic = function (xpath) {
    try {
      var res = document.evaluate(
        xpath, document, null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      if (res.snapshotLength > 0) {
        var node = res.snapshotItem(0);
        var t = node && (node.textContent != null ? node.textContent : (node.nodeValue || ''));
        return (t || '').trim();
      }
    } catch (e) {}
    return null;
  };

  // 静态：彩色打印提取结果
  BmSiteRule._logStatic = function (data, name, brand) {
    console.group('%c[网页收藏助手] ' + name + ' 提取结果', 'color:' + brand + ';font-weight:bold');
    console.log('标题     :', data.title);
    console.log('作者     :', data.author || '(无)');
    console.log('合集     :', data.collection || '(无)');
    console.log('发布时间 :', data.pubdate || '(无)');
    console.log('标签     :', data.tags || '(无)');
    console.log('封面     :', data.cover || '(无)');
    if (data.duration) console.log('时长(秒) :', data.duration);
    if (data.desc) console.log('简介     :', data.desc.slice(0, 200));
    if (typeof data.content === 'string') console.log('正文(字) :', data.content.length);
    console.log('完整对象 :', data);
    console.groupEnd();
  };

  // 静态：写入 <html data-bm-site-rule> + 挂 window.__extract + 派发就绪事件 + 打印
  BmSiteRule.applyResult = function (name, brand, rule, data, result) {
    try {
      document.documentElement.setAttribute('data-bm-site-rule', JSON.stringify(result));
      // 通知抽屉（可能已注入）重新读取并回填输入框
      document.dispatchEvent(new CustomEvent('bm-site-rule-ready'));
    } catch (e) {
      console.error('[网页收藏助手] ' + name + ' 写入 data-bm-site-rule 失败:', e);
    }
    try {
      window.__extract = function () { return result; };
      window.__lastSiteRule = { name: name, rule: rule, data: data, result: result };
    } catch (e) {}
    BmSiteRule._logStatic(result, name, brand);
  };

  // 静态：无匹配规则文件时，把浏览器 XPath 提取到的原始文本直接组装成结果
  BmSiteRule.buildGeneric = function (rule, data) {
    return {
      title: data.title || '',
      author: data.author || '',
      collection: data.collection || '',
      cover: data.cover || '',
      pubdate: data.pubdate ? BmSiteRule.fmtPubdate(data.pubdate) : '',
      desc: data.desc || '',
      duration: data.duration || '',
      tags: data.tags || '',
      content: data.content || '',
      is_video: data.is_video === 'true' || data.is_video === true
    };
  };

  // 注册表
  BmSiteRule.__rules = [];
  BmSiteRule.__byName = {}; // name → 实例，便于控制台按名调试
  BmSiteRule.register = function (rule) {
    if (!(rule instanceof BmSiteRule)) {
      console.warn('[网页收藏助手] register 失败：参数不是 BmSiteRule 实例', rule);
      return;
    }
    // 同名去重：脚本可能因重复注入（多次点击工具栏 / 重载扩展）被多次执行，
    // 先移除 __rules 中所有同名旧实例，再追加本次实例，保证每个 name 唯一，
    // 避免 rules() 返回数量 > 实际文件数。
    for (var i = BmSiteRule.__rules.length - 1; i >= 0; i--) {
      if (BmSiteRule.__rules[i].name === rule.name) {
        BmSiteRule.__rules.splice(i, 1);
      }
    }
    BmSiteRule.__rules.push(rule);
    BmSiteRule.__byName[rule.name] = rule;
  };
  // 引导：框架统一编排——无论当前页是否有规则文件都会执行：
  //   1) 先从 chrome.storage.local 读取按 hostname 保存的 XPath 规则；
  //   2) 若读到，用 XPath 对页面提取各字段原始文本 data（逐字段打印）；
  //   3) 再找 match(url) 命中的规则文件：有则把 (rule, data) 交给子类 extract；
  //      无规则文件但有保存规则 → 用 data 生成通用结果填充；
  //      既无规则文件又无保存规则 → 打印「没找到」。
  BmSiteRule.bootstrap = function () {
    var names = BmSiteRule.__rules.map(function (r) { return r.name; });
    console.log('%c[网页收藏助手] 加载规则：共 ' + names.length + ' 条', 'color:#764ba2;font-weight:bold', names);
	//console.log(chrome.storage.local.get(), 'loadrule')
    return BmSiteRule._loadSavedRule().then(function (savedRule) {
      // 1) + 2) 先从浏览器找 XPath 规则并提取数据（不论是否有规则文件都先做）
      var data = {};
      if (savedRule) {
        console.log('%c[网页收藏助手] 浏览器保存规则 [' + location.hostname + ']', 'color:#2a7', savedRule);
        data = BmSiteRule._extractByXpathStatic(savedRule, 'browser', '#2a7');
      }

      // 3) 找匹配当前页的规则文件
      var matched = BmSiteRule.__rules.filter(function (r) {
        try { return !!r.match(location.href); } catch (e) { return false; }
      });

      if (matched.length > 0) {
        // 有规则文件 → 把 (rule, data) 交给子类 extract(rule, data)
        return Promise.all(matched.map(function (r) {
          try { return Promise.resolve(r.run(savedRule, data)); }
          catch (e) { return Promise.resolve(false); }
        }));
      }

      // 无规则文件：有保存规则则生成通用结果；否则打印没找到
      if (savedRule) {
        console.log('%c[网页收藏助手] 当前页无匹配规则文件，使用浏览器保存规则提取', 'color:#2a7');
        var generic = BmSiteRule.buildGeneric(savedRule, data);
        BmSiteRule.applyResult('browser', '#2a7', savedRule, data, generic);
        return [true];
      }

      console.log('%c[网页收藏助手] 没找到任何匹配当前页的规则，且浏览器无保存规则', 'color:#999');
      return [false];
    });
  };

  // ===================== 控制台调试 API =====================
  // 在 F12 控制台调试父子类的便捷方法（挂在 BmSiteRule 上）：
  //   BmSiteRule.rules()               列出所有已注册规则名
  //   BmSiteRule.get(name)             按名取规则实例（如 BmSiteRule.get('bilibili')）
  //   BmSiteRule.showSaved([host])     打印某 host 在 storage 里保存的提取规则（默认当前 host）
  //   BmSiteRule.inspect(name)         对当前页完整检视某规则：match / 保存规则 / XPath数据 / extract 结果（异步，返回快照）
  //   BmSiteRule.inspectCurrent()      找到当前页匹配的规则并检视
  //   BmSiteRule.runRule(name)         重新运行某规则并刷新 window.__lastSiteRule
  // 实例方法可直接调：BmSiteRule.get('bilibili').match(url)、._extractByXpath(rule)、.extract(rule, data)
  // 全局短别名：window.__bm === BmSiteRule；window.__bmRules 为实例数组；window.__lastSiteRule 为最近一次运行快照
  BmSiteRule.rules = function () {
    return BmSiteRule.__rules.map(function (r) { return r.name; });
  };
  BmSiteRule.get = function (name) {
    return BmSiteRule.__byName[name] || null;
  };
  BmSiteRule.showSaved = function (host) {
    var h = host || location.hostname;
    var all = BmSiteRule._getSavedMap();
    if (!all) {
      console.warn('[网页收藏助手] 未找到 window.__bmStorageRules，请先点击工具栏图标以加载浏览器保存的规则');
      return Promise.resolve(null);
    }
    var raw = all[h];
    console.log('%c[网页收藏助手] 保存规则 [' + h + ']', 'font-weight:bold', raw || '(无)');
    return Promise.resolve(raw || null);
  };
  BmSiteRule.inspect = function (name) {
    var r = BmSiteRule.get(name);
    if (!r) {
      console.warn('[网页收藏助手] 未找到规则:', name, '  已注册:', BmSiteRule.rules());
      return Promise.resolve(null);
    }
    var match = r.match(location.href);
    console.group('%c[网页收藏助手] 检视规则: ' + r.name, 'color:' + r.brand + ';font-weight:bold');
    console.log('match(当前页) :', match);
    return Promise.resolve(r._loadSavedRule()).then(function (saved) {
      console.log('保存规则      :', saved || '(无)');
      var data = saved ? r._extractByXpath(saved) : {};
      console.log('XPath 提取数据:', data);
      var result = r.extract(saved, data);
      console.log('extract 结果  :', result);
      console.groupEnd();
      return { name: r.name, match: match, saved: saved, data: data, result: result };
    });
  };
  BmSiteRule.inspectCurrent = function () {
    var r = null;
    for (var i = 0; i < BmSiteRule.__rules.length; i++) {
      try { if (BmSiteRule.__rules[i].match(location.href)) { r = BmSiteRule.__rules[i]; break; } } catch (e) {}
    }
    if (!r) {
      console.warn('[网页收藏助手] 当前页无匹配规则。已注册:', BmSiteRule.rules());
      return Promise.resolve(null);
    }
    return BmSiteRule.inspect(r.name);
  };
  BmSiteRule.runRule = function (name) {
    var r = BmSiteRule.get(name);
    if (!r) {
      console.warn('[网页收藏助手] 未找到规则:', name);
      return Promise.resolve(false);
    }
    return Promise.resolve(r.run()).then(function (ok) {
      console.log('[网页收藏助手] 运行 ' + name + ':', ok ? '命中' : '未命中/无数据');
      return ok;
    });
  };

  // 暴露到全局，供后续注入的规则文件（继承 / 注册）使用，以及控制台调试
  window.BmSiteRule = BmSiteRule;
  window.__bm = BmSiteRule;                 // 短别名
  window.__bmRules = BmSiteRule.__rules;    // 已注册实例数组
})();
