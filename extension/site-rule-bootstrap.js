// extension/site-rule-bootstrap.js
// 引导脚本（框架文件，放在 extension/ 根目录）。
// 注意：Chrome 不允许扩展文件名以 _ 开头，故文件名不能用 _bootstrap.js。
// 必须在所有规则文件之后注入，以便注册表已收集完所有规则实例。
if (typeof BmSiteRule !== 'undefined') {
  BmSiteRule.bootstrap();
}
