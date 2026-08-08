// survey-group-analysis-shared.js
// ビズけあ：サーベイ分析結果（全体／部署別／属性別）の3ページで共有する集計・描画ロジック。
// DOM操作は行わず、集計・HTML片の生成・Firestoreからのスナップショット取得のみを担当する
// （document.getElementById等は呼び出し側の各ページのスクリプトで行う）。
//
// ストレスチェックの集団分析（group-analysis-shared.js）はhigh/mid/lowのバンド判定を単位にするが、
// 従業員サーベイの設問は5件法・頻度4件法の生値そのものが分析対象のため、「平均点＋回答分布
// （1〜5の割合）」を集計単位にしている（2026年8月「サーベイ分析結果」新設時の設計方針）。

import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { ATTR_META } from "./group-analysis-shared.js";

export { ATTR_META };

export function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function pct(n, total) { return total ? Math.round((n / total) * 1000) / 10 : 0; }

// 厚生労働省マニュアルの推奨に準じ、部署・属性グループはこの人数未満だと詳細を表示しない
// （group-analysis-shared.js・survey-shared.jsのDEEPDIVE_MIN_Nと同じ基準）。
export const MIN_N = 10;

// =============================================================================
// Firestore：サイクル一覧・匿名集計データ・在籍者数の取得
// =============================================================================
export async function fetchAllSurveyCyclesMeta(db, companyId) {
  const snap = await getDocs(query(collection(db, "companies", companyId, "surveyCycles")));
  const list = snap.docs.map((d) => {
    const c = d.data();
    return {
      id: d.id,
      fiscalYear: Number(c.fiscalYear) || 0,
      roundNumber: Number(c.roundNumber) || 0,
      label: `${esc(c.fiscalYear)}年度 第${esc(c.roundNumber)}回`,
      surveyMode: c.surveyMode || "named",
      deepDiveQuestions: Array.isArray(c.deepDiveQuestions) ? c.deepDiveQuestions : [],
    };
  });
  list.sort((a, b) => (b.fiscalYear - a.fiscalYear) || (b.roundNumber - a.roundNumber));
  return list;
}

// 指定サイクルの匿名集計データ（surveyGroupAnalysisContributions）を取得する。
export async function fetchSurveyCycleItems(db, companyId, cycleId) {
  const snap = await getDocs(query(collection(db, "surveyGroupAnalysisContributions", cycleId, "items"), where("companyId", "==", companyId)));
  return snap.docs.map((d) => d.data());
}

// サイクルごとに発行された配信リンク（＝在籍対象者数）を取得する。
export async function fetchSurveyEnrolledCount(db, companyId, cycleId) {
  const snap = await getDocs(query(collection(db, "companies", companyId, "surveyInvites"), where("cycleId", "==", cycleId)));
  return snap.size;
}

// =============================================================================
// 集計：設問ごとの平均点・回答分布
// =============================================================================
// items（匿名集計データの配列）から、指定itemIdの数値回答をすべて集める
// （定点観測はfixedAnswers、深堀はdeepDiveAnswersに入っているため両方を見る）。
export function collectValues(items, itemId) {
  const vals = [];
  items.forEach((it) => {
    (it.fixedAnswers || []).forEach((a) => { if (a.itemId === itemId && typeof a.value === "number") vals.push(a.value); });
    (it.deepDiveAnswers || []).forEach((a) => { if (a.itemId === itemId && typeof a.value === "number") vals.push(a.value); });
  });
  return vals;
}

// 1設問あたりの { n, avg, dist:[1点の人数,2点,3点,4点,5点] } を返す（5件法・頻度4件法とも1〜5の値）。
export function questionStats(items, itemId) {
  const vals = collectValues(items, itemId);
  const n = vals.length;
  const dist = [0, 0, 0, 0, 0];
  vals.forEach((v) => { const i = Math.round(v) - 1; if (i >= 0 && i < 5) dist[i]++; });
  const avg = n ? vals.reduce((a, b) => a + b, 0) / n : 0;
  return { n, avg, dist };
}

// グループ（全社・部署・属性）の代表値：回答者ごとに定点観測（fixedQuestionIds）の平均点を出し、
// その平均をグループの代表値にする（設問数の違いに影響されにくくするため、設問ごとの単純平均ではなく
// 「回答者ごとの平均の平均」にしている）。
export function overallAvgStats(items, fixedQuestionIds) {
  const perRespondent = items.map((it) => {
    const vals = (it.fixedAnswers || [])
      .filter((a) => fixedQuestionIds.includes(a.itemId) && typeof a.value === "number")
      .map((a) => a.value);
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }).filter((v) => v != null);
  const n = perRespondent.length;
  const avg = n ? perRespondent.reduce((a, b) => a + b, 0) / n : 0;
  return { n, avg };
}

// items配列を、部署1〜3・属性（性別／年代／勤続年数／雇用形態）ごとにグルーピングする。
export function aggregateSurveyGroups(items) {
  const byDept = [{}, {}, {}];
  const byAttr = { gender: {}, ageGroup: {}, tenureGroup: {}, employmentType: {} };
  items.forEach((it) => {
    const d1 = it.department1 || "（部署未設定）";
    (byDept[0][d1] = byDept[0][d1] || []).push(it);
    if (it.department2) (byDept[1][it.department2] = byDept[1][it.department2] || []).push(it);
    if (it.department3) (byDept[2][it.department3] = byDept[2][it.department3] || []).push(it);
    ["gender", "ageGroup", "tenureGroup", "employmentType"].forEach((attr) => {
      const v = it[attr];
      if (!v) return;
      (byAttr[attr][v] = byAttr[attr][v] || []).push(it);
    });
  });
  return { byDept, byAttr };
}

// =============================================================================
// 描画：設問ごとの回答分布バー（1〜5の割合＋平均点）
// =============================================================================
const DIST_COLORS = ["#dbeafe", "#93c5fd", "#60a5fa", "#3b82f6", "#1d4ed8"];

export function renderQuestionBar(label, stat) {
  const total = stat.n;
  if (!total) {
    return `<div class="q-bar"><div class="q-bar-label">${esc(label)}</div><div class="desc" style="margin:2px 0 0">回答データがありません。</div></div>`;
  }
  if (total < MIN_N) {
    return `<div class="q-bar"><div class="q-bar-label">${esc(label)}</div><div class="desc" style="margin:2px 0 0">対象人数が10人未満のため非表示（n=${total}）</div></div>`;
  }
  let segs = "";
  stat.dist.forEach((c, i) => {
    const p = pct(c, total);
    if (p > 0) segs += `<div class="q-seg" style="width:${p}%;background:${DIST_COLORS[i]}" title="${i + 1}点：${p}%（${c}人）"></div>`;
  });
  return `<div class="q-bar">
    <div class="q-bar-label">${esc(label)}</div>
    <div class="q-bar-track">${segs}</div>
    <div class="q-bar-summary">平均 ${stat.avg.toFixed(2)}点（n=${total}）</div>
  </div>`;
}

export function renderQuestionBarLegend() {
  return `<div class="q-bar-legend">
    ${[1, 2, 3, 4, 5].map((v, i) => `<div><span class="legend-dot" style="background:${DIST_COLORS[i]}"></span>${v}点</div>`).join("")}
  </div>`;
}

// =============================================================================
// 描画：部署別／属性別テーブル（定点観測 平均点で比較）
// =============================================================================
export function sortSurveyGroupRows(rows) {
  rows.sort((a, b) => {
    const aSup = a.stats.n < MIN_N, bSup = b.stats.n < MIN_N;
    if (aSup !== bSup) return aSup ? 1 : -1;
    if (aSup && bSup) return a.name.localeCompare(b.name, "ja");
    return b.stats.avg - a.stats.avg;
  });
  return rows;
}

function compareBadge(avg, companyAvg) {
  const diff = avg - companyAvg;
  if (Math.abs(diff) < 0.05) return `<span class="badge">全社平均とほぼ同水準</span>`;
  return diff > 0 ? `<span class="badge">全社平均より+${diff.toFixed(2)}高い</span>` : `<span class="badge">全社平均より${diff.toFixed(2)}低い</span>`;
}

export function renderSurveyDeptTable(levelLabel, rows, companyAvg) {
  if (!rows.length) return "";
  let html = `<h3 class="subhead">${esc(levelLabel)}</h3><div class="table-wrap"><table><thead><tr><th>部署名</th><th>人数</th><th>定点観測 平均点</th><th>全社平均との比較</th></tr></thead><tbody>`;
  rows.forEach((r) => {
    if (r.stats.n < MIN_N) {
      html += `<tr><td>${esc(r.name)}</td><td>${r.stats.n}人</td><td colspan="2" style="color:var(--muted)">件数不足のため非表示（10人未満）</td></tr>`;
    } else {
      html += `<tr><td>${esc(r.name)}</td><td>${r.stats.n}人</td><td>${r.stats.avg.toFixed(2)}点</td><td>${compareBadge(r.stats.avg, companyAvg)}</td></tr>`;
    }
  });
  html += "</tbody></table></div>";
  return html;
}

// byAttrMapは { 属性値: items配列 }。fixedQuestionIdsを渡して、呼び出し側の都度の計算を避け、
// この関数の中で一貫してoverallAvgStats()を使って平均点を算出する。
export function renderSurveyAttrTable(meta, byAttrMap, companyAvg, fixedQuestionIds) {
  const rows = meta.options
    .map((opt) => ({ label: opt.label, stats: overallAvgStats(byAttrMap[opt.value] || [], fixedQuestionIds) }))
    .filter((r) => r.stats.n > 0);
  if (!rows.length) return "";
  let html = `<h3 class="subhead">${esc(meta.label)}</h3><div class="table-wrap"><table><thead><tr><th>${esc(meta.label)}</th><th>人数</th><th>定点観測 平均点</th><th>全社平均との比較</th></tr></thead><tbody>`;
  rows.forEach((r) => {
    if (r.stats.n < MIN_N) {
      html += `<tr><td>${esc(r.label)}</td><td>${r.stats.n}人</td><td colspan="2" style="color:var(--muted)">件数不足のため非表示（10人未満）</td></tr>`;
    } else {
      html += `<tr><td>${esc(r.label)}</td><td>${r.stats.n}人</td><td>${r.stats.avg.toFixed(2)}点</td><td>${compareBadge(r.stats.avg, companyAvg)}</td></tr>`;
    }
  });
  html += "</tbody></table></div>";
  return html;
}
