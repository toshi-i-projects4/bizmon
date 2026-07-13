/* operator-mode.js
 * 運営（オペレーター）が、各企業の管理者と同じ管理画面（dashboard.html／report.html／
 * category-settings.html／user-invite-*.html／user-edit-*.html／news.html）へ
 * 「対象企業を指定して入室」するための共通ヘルパー。
 *
 * 使い方：
 *   1. operator-companies.html から各画面へ ?opCompanyId=XXXX 付きのリンクで遷移する。
 *   2. 各画面側は、ログインユーザーの role が "operator" だった場合、
 *      BizmonOperatorMode.getOverrideCompanyId() で対象企業IDを取得し、
 *      自分の companyId の代わりにその値を使ってFirestoreへ問い合わせる。
 *   3. 対象企業が確認できたら BizmonOperatorMode.renderBanner(...) を呼び、
 *      画面上部にオレンジ色の運営モードバナーを表示する（視覚的な誤操作防止）。
 *
 * 対応するfirestore.rulesのisOperator()が別途、運営メンバー（users/{uid}.role=="operator"）
 * に対して企業横断の読み書き権限を許可している前提。
 */
(function (global) {
  "use strict";

  function getQueryParam(name) {
    try {
      return new URLSearchParams(location.search).get(name) || "";
    } catch (e) {
      return "";
    }
  }

  function getOverrideCompanyId() {
    return (getQueryParam("opCompanyId") || "").trim();
  }

  function withCompanyParam(url, companyId) {
    var cid = companyId || getOverrideCompanyId();
    if (!cid) return url;
    var sep = url.indexOf("?") >= 0 ? "&" : "?";
    return url + sep + "opCompanyId=" + encodeURIComponent(cid);
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function injectStyle() {
    if (document.getElementById("bizmonOperatorModeStyle")) return;
    var style = document.createElement("style");
    style.id = "bizmonOperatorModeStyle";
    style.textContent = [
      ".bizmon-operator-banner{position:sticky;top:0;z-index:10000;background:linear-gradient(90deg,#f97316,#ea580c);color:#fff;padding:10px 20px;font-size:14px;font-weight:bold;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;box-shadow:0 2px 10px rgba(0,0,0,.18)}",
      ".bizmon-operator-banner .bo-left{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}",
      ".bizmon-operator-banner .bo-badge{background:rgba(255,255,255,.28);border-radius:999px;padding:3px 10px;font-size:12px;white-space:nowrap}",
      ".bizmon-operator-banner a{color:#fff;text-decoration:underline;font-weight:bold;white-space:nowrap}",
      "body.bizmon-operator-mode{padding-top:0!important}",
      "body.bizmon-operator-mode .wrap,body.bizmon-operator-mode .page{margin-top:20px}",
      'body.bizmon-operator-mode .btn,body.bizmon-operator-mode .primary-btn,body.bizmon-operator-mode .table-action-btn,body.bizmon-operator-mode button.primary-btn,body.bizmon-operator-mode #saveBtn,body.bizmon-operator-mode #registerBtn,body.bizmon-operator-mode #acceptBtn{background:#f97316!important}',
      "body.bizmon-operator-mode .btn:hover,body.bizmon-operator-mode .primary-btn:hover,body.bizmon-operator-mode .table-action-btn:hover{background:#ea580c!important}",
      "body.bizmon-operator-mode .btn.secondary{background:#9a3412!important;border-color:#9a3412!important;color:#fff!important}",
      "body.bizmon-operator-mode .top-link,body.bizmon-operator-mode .back-link,body.bizmon-operator-mode .bottom-link,body.bizmon-operator-mode .bottom-back-link,body.bizmon-operator-mode .cat-count-summary{color:#c2410c!important}",
      "body.bizmon-operator-mode th{background:#fff7ed!important}",
      "body.bizmon-operator-mode input:focus,body.bizmon-operator-mode select:focus,body.bizmon-operator-mode textarea:focus{border-color:#f97316!important;box-shadow:0 0 0 3px rgba(249,115,22,.18)!important}"
    ].join("\n");
    document.head.appendChild(style);
  }

  function ensureBannerEl() {
    injectStyle();
    document.body.classList.add("bizmon-operator-mode");
    var existing = document.getElementById("bizmonOperatorBanner");
    if (existing) existing.remove();
    var banner = document.createElement("div");
    banner.id = "bizmonOperatorBanner";
    banner.className = "bizmon-operator-banner";
    document.body.insertBefore(banner, document.body.firstChild);
    return banner;
  }

  function renderBanner(opts) {
    opts = opts || {};
    var banner = ensureBannerEl();
    var companyLabel = opts.companyName
      ? esc(opts.companyName) + "（" + esc(opts.companyId || "") + "）"
      : esc(opts.companyId || "未指定");
    var opFrom = getQueryParam("opFrom");
    var backLinks = opFrom === "dashboard"
      ? '<a href="operator-dashboard.html">←ダッシュボード（運営管理）</a>'
      : '<a href="operator-companies.html">← 企業検索へ戻る</a>' + '<a href="operator-home.html">運営トップへ</a>';
    banner.innerHTML =
      '<span class="bo-left">' +
      '<span class="bo-badge">運営モード</span>' +
      "<span>現在の操作対象企業：<strong>" + companyLabel + "</strong></span>" +
      "</span>" +
      '<span class="bo-left">' +
      backLinks +
      "</span>";
  }

  function renderMissingCompanyNotice(message) {
    var banner = ensureBannerEl();
    banner.innerHTML =
      '<span class="bo-left"><span class="bo-badge">運営モード</span><span>' +
      esc(message || "対象企業が指定されていません。企業検索画面から入り直してください。") +
      "</span></span>" +
      '<span class="bo-left"><a href="operator-companies.html">← 企業検索へ戻る</a></span>';
  }

  global.BizmonOperatorMode = {
    getOverrideCompanyId: getOverrideCompanyId,
    withCompanyParam: withCompanyParam,
    renderBanner: renderBanner,
    renderMissingCompanyNotice: renderMissingCompanyNotice
  };
})(window);
