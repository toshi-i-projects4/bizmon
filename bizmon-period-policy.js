/*
  ビズもん：前月制限ロジック 完全版
  ------------------------------------------------------------
  目的：
    ・カレンダー上の○×履歴は残す
    ・問題本文、選択肢、正解、解説などの詳細表示は「前月1日以降」に制限する
    ・index.html / result.html / calendar-result.html など複数画面で共通利用する

  基本仕様：
    今日が 2026-06-15 の場合
      詳細表示可能：2026-05-01 ～ 2026-06-15
      詳細表示不可：2026-04-30 以前

  読み込み例：
    <script src="bizmon-period-policy.js"></script>

  使用例：
    if (!window.BizmonPeriodPolicy.canOpenDetail("2026-04-30")) {
      alert(window.BizmonPeriodPolicy.getBlockedMessage());
      return;
    }
*/
(function () {
  'use strict';

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function toDateKey(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return '';
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function parseDateKey(value) {
    var s = String(value || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    // 2026-02-31 のような不正日付を除外
    if (toDateKey(d) !== s) return null;
    return d;
  }

  function normalizeDateKey(value) {
    var s = String(value || '').trim();
    if (!s) return '';
    s = s.replace(/^\uFEFF/, '');
    var m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m) {
      return m[1] + '-' + pad2(m[2]) + '-' + pad2(m[3]);
    }
    return s;
  }

  function todayKey(today) {
    return toDateKey(today || new Date());
  }

  function getPreviousMonthStart(today) {
    var d = today || new Date();
    return new Date(d.getFullYear(), d.getMonth() - 1, 1);
  }

  function getPreviousMonthEnd(today) {
    var d = today || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 0);
  }

  function getThisMonthStart(today) {
    var d = today || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function getThisMonthEnd(today) {
    var d = today || new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  }

  function getDetailAllowedRange(today) {
    var d = today || new Date();
    return {
      startKey: toDateKey(getPreviousMonthStart(d)),
      endKey: toDateKey(d)
    };
  }

  function canOpenDetail(dateKey, today) {
    var key = normalizeDateKey(dateKey);
    if (!parseDateKey(key)) return false;
    var range = getDetailAllowedRange(today || new Date());
    return key >= range.startKey && key <= range.endKey;
  }

  function getBlockedMessage(today) {
    var range = getDetailAllowedRange(today || new Date());
    return 'この日の問題・解説の詳細表示期間は終了しています。\n'
      + '詳細表示できるのは ' + range.startKey + ' 以降のデータです。\n'
      + 'カレンダー上の○×履歴は確認できますが、過去の問題・解説が必要な場合は管理者へお問い合わせください。';
  }

  function getMonthRange(year, monthIndexZeroBased) {
    var y = Number(year);
    var m = Number(monthIndexZeroBased);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return { startKey: '', endKey: '' };
    var start = new Date(y, m, 1);
    var end = new Date(y, m + 1, 0);
    return {
      startKey: toDateKey(start),
      endKey: toDateKey(end)
    };
  }

  function getCurrentMonthRange(today) {
    var d = today || new Date();
    return {
      startKey: toDateKey(getThisMonthStart(d)),
      endKey: toDateKey(d)
    };
  }

  function getPreviousMonthRange(today) {
    var d = today || new Date();
    return {
      startKey: toDateKey(getPreviousMonthStart(d)),
      endKey: toDateKey(getPreviousMonthEnd(d))
    };
  }

  function addDays(date, days) {
    var d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + Number(days));
    return d;
  }

  function getLastDaysRange(days, today) {
    var n = Math.max(1, Number(days) || 1);
    var d = today || new Date();
    return {
      startKey: toDateKey(addDays(d, -(n - 1))),
      endKey: toDateKey(d)
    };
  }

  function daysDiffInclusive(startKey, endKey) {
    var sKey = normalizeDateKey(startKey);
    var eKey = normalizeDateKey(endKey);
    var s = parseDateKey(sKey);
    var e = parseDateKey(eKey);
    if (!s || !e) return null;
    return Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  }

  function isWithinMaxDays(startKey, endKey, maxDays) {
    var days = daysDiffInclusive(startKey, endKey);
    if (days === null) return false;
    return days >= 1 && days <= Number(maxDays || 100);
  }

  window.BizmonPeriodPolicy = {
    VERSION: '2026-06-15-complete',

    // 基本日付処理
    pad2: pad2,
    toDateKey: toDateKey,
    parseDateKey: parseDateKey,
    normalizeDateKey: normalizeDateKey,
    todayKey: todayKey,

    // 詳細表示制限
    getDetailAllowedRange: getDetailAllowedRange,
    canOpenDetail: canOpenDetail,
    getBlockedMessage: getBlockedMessage,

    // 月単位・期間指定
    getMonthRange: getMonthRange,
    getCurrentMonthRange: getCurrentMonthRange,
    getPreviousMonthRange: getPreviousMonthRange,
    getLastDaysRange: getLastDaysRange,
    daysDiffInclusive: daysDiffInclusive,
    isWithinMaxDays: isWithinMaxDays,

    // 互換用
    getPreviousMonthStartKey: function (today) { return toDateKey(getPreviousMonthStart(today || new Date())); },
    getPreviousMonthEndKey: function (today) { return toDateKey(getPreviousMonthEnd(today || new Date())); },
    getThisMonthStartKey: function (today) { return toDateKey(getThisMonthStart(today || new Date())); },
    getThisMonthEndKey: function (today) { return toDateKey(getThisMonthEnd(today || new Date())); }
  };
})();
