// group-analysis-shared.js
// ビズけあ：集団分析結果（全体）／集団分析結果（部署別）の2ページで共有する集計・描画ロジック。
// DOM操作は行わず、集計・HTML片の生成・Firestoreからのスナップショット取得のみを担当する
// （document.getElementById等は呼び出し側の各ページのスクリプトで行う）。

import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { MODULES, OPTIONAL_MODULE_ORDER, NEW_SCALES, NEW_SCALE_GROUPS, NEW_SCALE_GROUP_ORDER, GENDER_OPTIONS, AGE_GROUP_OPTIONS, TENURE_GROUP_OPTIONS, EMPLOYMENT_TYPE_OPTIONS } from "./stress-check-data.js";

export function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
export function pct(n, total) { return total ? Math.round((n / total) * 1000) / 10 : 0; }

export const SCALE_CAT_LABELS = { A: "A：仕事の量的負担・裁量など", B: "B：心身のストレス反応", C: "C：周囲のサポート不足" };

// =============================================================================
// 集計
// =============================================================================
export function groupStats(arr) {
  const n = arr.length;
  const highCount = arr.filter((x) => x.highStress).length;
  const bandHighPct = {};
  ["A", "B", "C"].forEach((cat) => {
    const highN = arr.filter((x) => x["band" + cat] === "high").length;
    bandHighPct[cat] = n ? (highN / n) * 100 : 0;
  });
  return { n, highCount, highPct: n ? (highCount / n) * 100 : 0, bandHighPct };
}

// items配列から、A/B/Cバンド集計・追加モジュールのバンド集計・新尺度のバンド集計をまとめて求める。
// aggregate()（全体集計）と、部署・属性の部分集合（グループ深掘り表示）の両方から呼び出す共通ロジック。
export function computeBandSummary(items) {
  const bandCounts = { A: { low: 0, mid: 0, high: 0 }, B: { low: 0, mid: 0, high: 0 }, C: { low: 0, mid: 0, high: 0 } };
  const moduleBandCounts = {};
  const newScaleBandCounts = {};
  items.forEach((it) => {
    ["A", "B", "C"].forEach((cat) => {
      const b = it["band" + cat];
      if (b && bandCounts[cat][b] != null) bandCounts[cat][b]++;
    });
    const omb = it.optionalModuleBands || {};
    Object.keys(omb).forEach((mid) => {
      moduleBandCounts[mid] = moduleBandCounts[mid] || { low: 0, mid: 0, high: 0 };
      const b = omb[mid];
      if (moduleBandCounts[mid][b] != null) moduleBandCounts[mid][b]++;
    });
    const nsb = it.newScaleBands || {};
    Object.keys(nsb).forEach((sid) => {
      newScaleBandCounts[sid] = newScaleBandCounts[sid] || { low: 0, mid: 0, high: 0 };
      const b = nsb[sid];
      if (newScaleBandCounts[sid][b] != null) newScaleBandCounts[sid][b]++;
    });
  });
  return { bandCounts, moduleBandCounts, newScaleBandCounts };
}

export function aggregate(items) {
  const { bandCounts, moduleBandCounts, newScaleBandCounts } = computeBandSummary(items);
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

  return { overall: groupStats(items), bandCounts, byDept, byAttr, moduleBandCounts, newScaleBandCounts };
}

// =============================================================================
// Firestore：サイクル一覧・過去スナップショットの取得
// =============================================================================
// companies/{companyId}/stressCheckCycles を新しい順に取得し、
// { id, fiscalYear, roundNumber, label } の配列で返す。
export async function fetchAllCyclesMeta(db, companyId) {
  const snap = await getDocs(query(collection(db, "companies", companyId, "stressCheckCycles")));
  const list = snap.docs.map((d) => {
    const c = d.data();
    return { id: d.id, fiscalYear: Number(c.fiscalYear) || 0, roundNumber: Number(c.roundNumber) || 0, label: `${esc(c.fiscalYear)}年度 第${esc(c.roundNumber)}回` };
  });
  list.sort((a, b) => (b.fiscalYear - a.fiscalYear) || (b.roundNumber - a.roundNumber));
  return list;
}

// 指定サイクルの匿名集計データ（groupAnalysisContributions）を取得する。
export async function fetchCycleItems(db, companyId, cycleId) {
  const snap = await getDocs(query(collection(db, "groupAnalysisContributions", cycleId, "items"), where("companyId", "==", companyId)));
  return snap.docs.map((d) => d.data());
}

// 直近5回（受検データがあるもの）のスナップショットを、古い→新しい順に返す。
// 各要素：{ cycleId, label, enrolledCount, enrolledByAttr, agg }
// enrolledByAttr：{ gender: {male: 12, ...}, ageGroup: {...}, tenureGroup: {...}, employmentType: {...} }
// （サイクルごとに発行された招待＝在籍労働者数を、属性ごとに集計したもの）
export async function fetchCycleSnapshots(db, companyId, allCyclesMeta, maxCount) {
  maxCount = maxCount || 5;
  const snapshots = [];
  for (const c of allCyclesMeta) {
    if (snapshots.length >= maxCount) break;
    const items = await fetchCycleItems(db, companyId, c.id);
    if (!items.length) continue; // 未実施・未集計のサイクルは推移から除外
    let enrolledCount = null;
    const enrolledByAttr = { gender: {}, ageGroup: {}, tenureGroup: {}, employmentType: {} };
    try {
      const invSnap = await getDocs(query(collection(db, "companies", companyId, "stressCheckInvites"), where("cycleId", "==", c.id)));
      enrolledCount = invSnap.size;
      invSnap.docs.forEach((d) => {
        const inv = d.data();
        ["gender", "ageGroup", "tenureGroup", "employmentType"].forEach((attr) => {
          const v = inv[attr];
          if (!v) return;
          enrolledByAttr[attr][v] = (enrolledByAttr[attr][v] || 0) + 1;
        });
      });
    } catch (e) {
      console.error(e);
      enrolledCount = null;
    }
    snapshots.push({ cycleId: c.id, label: c.label, enrolledCount, enrolledByAttr, agg: aggregate(items) });
  }
  snapshots.reverse();
  return snapshots;
}

// =============================================================================
// 汎用の折れ線グラフ（SVG）：数値ラベルをグラフ上に表示する
// =============================================================================
function formatChartVal(v, unit) {
  if (unit === "%") return v.toFixed(1) + "%";
  if (unit === "人") return Math.round(v) + "人";
  return String(Math.round(v * 10) / 10);
}

export function buildLineChartSVG(points, series, opts) {
  opts = opts || {};
  const unit = opts.unit || "";
  const W = opts.width || 640, H = opts.height || 260;
  const padL = 46, padR = 16, padT = 20, padB = 44;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const allVals = points.flatMap((p) => series.map((s) => Number(p.values[s.key]) || 0));
  let yMax;
  if (opts.yMax != null) {
    yMax = opts.yMax;
  } else {
    const rawMax = Math.max(0, ...allVals);
    const step = rawMax <= 10 ? 2 : rawMax <= 30 ? 5 : rawMax <= 100 ? 10 : rawMax <= 500 ? 50 : 100;
    yMax = Math.max(step, Math.ceil((rawMax * 1.15) / step) * step);
  }
  const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;
  function xAt(i) { return padL + (points.length > 1 ? i * stepX : plotW / 2); }
  function yAt(v) { return padT + plotH - (Math.max(0, Math.min(yMax, v)) / yMax) * plotH; }

  let gridSvg = "", yLabels = "";
  for (let g = 0; g <= 4; g++) {
    const val = (yMax / 4) * g;
    const y = yAt(val);
    gridSvg += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    yLabels += `<text x="${padL - 8}" y="${y + 4}" font-size="10" fill="#64748b" text-anchor="end">${Math.round(val)}${unit === "人" ? "" : unit}</text>`;
  }

  let xLabels = "";
  points.forEach((p, i) => {
    xLabels += `<text x="${xAt(i)}" y="${H - padB + 18}" font-size="10.5" fill="#64748b" text-anchor="middle">${esc(p.label)}</text>`;
  });

  let seriesSvg = "";
  series.forEach((s, si) => {
    const pathPts = points.map((p, i) => `${xAt(i)},${yAt(Number(p.values[s.key]) || 0)}`).join(" ");
    seriesSvg += `<polyline points="${pathPts}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
    points.forEach((p, i) => {
      const v = Number(p.values[s.key]) || 0;
      const isCurrent = opts.highlightTest ? opts.highlightTest(p) : false;
      const r = isCurrent ? 5.5 : 3.5;
      const cx = xAt(i), cy = yAt(v);
      seriesSvg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}" stroke="#fff" stroke-width="${isCurrent ? 2 : 1}"><title>${esc(p.label)}　${esc(s.label)}：${formatChartVal(v, unit)}</title></circle>`;
      if (opts.showValueLabels !== false) {
        const dy = si % 2 === 0 ? -9 : 16;
        seriesSvg += `<text x="${cx}" y="${cy + dy}" font-size="10" fill="${s.color}" text-anchor="middle" font-weight="700" paint-order="stroke" stroke="#fff" stroke-width="3">${formatChartVal(v, unit)}</text>`;
      }
    });
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(opts.ariaLabel || "推移グラフ")}">${gridSvg}${yLabels}${seriesSvg}${xLabels}</svg>`;
}

export function buildLegend(series) {
  return `<div class="radar-legend">${series.map((s) => `<div><span class="legend-dot" style="background:${s.color}"></span>${esc(s.label)}</div>`).join("")}</div>`;
}

export function needsMorePointsHtml(n) {
  return `<div class="desc">推移グラフを表示するには2回以上の実施データが必要です（現在${n}回分）。次回以降の実施データがたまると、ここに折れ線グラフで表示されます。</div>`;
}

export const BAND_SERIES = [
  { key: "low", label: "low（低い）", color: "#0ca30c", width: 2 },
  { key: "mid", label: "mid（やや高い）", color: "#fab219", width: 2 },
  { key: "high", label: "high（高い）", color: "#d03b3b", width: 2 },
];

export function bandTrendPointsForCat(snapshots, cat, itemsFn) {
  return snapshots.map((s) => {
    const bc = itemsFn ? computeBandSummary(itemsFn(s)).bandCounts[cat] : s.agg.bandCounts[cat];
    const total = bc.low + bc.mid + bc.high;
    return { cycleId: s.cycleId, label: s.label, values: { low: pct(bc.low, total), mid: pct(bc.mid, total), high: pct(bc.high, total) } };
  });
}

// snapshots配列から、任意のバンド集計（{low,mid,high}）を取り出す関数getCountsを使って
// 折れ線グラフ用のポイント配列を作る汎用ヘルパー（追加モジュール・新尺度の推移表示で使用）。
function genericBandTrendPoints(snapshots, getCounts) {
  return snapshots.map((s) => {
    const bc = getCounts(s) || { low: 0, mid: 0, high: 0 };
    const total = bc.low + bc.mid + bc.high;
    return { cycleId: s.cycleId, label: s.label, values: { low: pct(bc.low, total), mid: pct(bc.mid, total), high: pct(bc.high, total) } };
  });
}

// =============================================================================
// 追加モジュール／新尺度セット バンド表示（HTML片）
// =============================================================================
export function buildModuleBarsHtml(moduleBandCounts) {
  const moduleIds = OPTIONAL_MODULE_ORDER.filter((id) => moduleBandCounts[id]);
  if (!moduleIds.length) return "";
  let html = "";
  moduleIds.forEach((id) => { html += renderBandBar(MODULES[id].label, moduleBandCounts[id]); });
  return html;
}

// 全社の追加モジュールの傾向を、直近5回（cycleSnapshots）の折れ線グラフで表示するHTML片を作る。
// 該当する追加モジュールのデータが1つもなければ空文字を返す（呼び出し側でパネルごと非表示にする）。
export function buildModuleTrendHtml(cycleSnapshots, currentCycleId) {
  const snapshots = cycleSnapshots || [];
  const moduleIds = OPTIONAL_MODULE_ORDER.filter((id) => snapshots.some((s) => s.agg.moduleBandCounts[id]));
  if (!moduleIds.length) return "";
  if (snapshots.length < 2) return needsMorePointsHtml(snapshots.length);
  let html = '<div class="mini-charts-grid">';
  moduleIds.forEach((id) => {
    const points = genericBandTrendPoints(snapshots, (s) => s.agg.moduleBandCounts[id]);
    html += `<div><h4 class="subhead">${esc(MODULES[id].label)}</h4>${buildLineChartSVG(points, BAND_SERIES, { unit: "%", width: 320, height: 200, ariaLabel: MODULES[id].label + "の推移" , highlightTest: (p) => p.cycleId === currentCycleId })}</div>`;
  });
  html += "</div>" + buildLegend(BAND_SERIES);
  return html;
}

// 全社の職場環境・組織との関わり（新尺度セット）を、直近5回（cycleSnapshots）の折れ線グラフで表示するHTML片を作る。
// 該当する尺度のデータが1つもなければ空文字を返す（呼び出し側でパネルごと非表示にする）。
export function buildNewScaleTrendHtml(cycleSnapshots, currentCycleId) {
  const snapshots = cycleSnapshots || [];
  const presentIds = new Set();
  snapshots.forEach((s) => { Object.keys(s.agg.newScaleBandCounts).forEach((id) => presentIds.add(id)); });
  const presentScales = NEW_SCALES.filter((s) => presentIds.has(s.id));
  if (!presentScales.length) return "";
  if (snapshots.length < 2) return needsMorePointsHtml(snapshots.length);
  let html = "";
  NEW_SCALE_GROUP_ORDER.forEach((groupKey) => {
    const scalesInGroup = presentScales.filter((s) => s.group === groupKey);
    if (!scalesInGroup.length) return;
    html += `<h3 class="subhead">${esc(NEW_SCALE_GROUPS[groupKey])}</h3><div class="mini-charts-grid">`;
    scalesInGroup.forEach((s) => {
      const points = genericBandTrendPoints(snapshots, (snap) => snap.agg.newScaleBandCounts[s.id]);
      html += `<div><h4 class="subhead">${esc(s.label)}</h4>${buildLineChartSVG(points, BAND_SERIES, { unit: "%", width: 320, height: 200, ariaLabel: s.label + "の推移", highlightTest: (p) => p.cycleId === currentCycleId })}</div>`;
    });
    html += "</div>" + buildLegend(BAND_SERIES);
  });
  return html;
}

export function buildNewScaleBarsHtml(newScaleBandCounts) {
  const presentScales = NEW_SCALES.filter((s) => newScaleBandCounts[s.id]);
  if (!presentScales.length) return "";
  let html = "";
  NEW_SCALE_GROUP_ORDER.forEach((groupKey) => {
    const scalesInGroup = presentScales.filter((s) => s.group === groupKey);
    if (!scalesInGroup.length) return;
    html += `<h4 class="subhead">${esc(NEW_SCALE_GROUPS[groupKey])}</h4>`;
    scalesInGroup.forEach((s) => { html += renderBandBar(s.label, newScaleBandCounts[s.id]); });
  });
  return html;
}

// =============================================================================
// 描画：尺度別バンド分布バー
// =============================================================================
export function renderBandBar(label, counts) {
  const total = counts.low + counts.mid + counts.high;
  const lo = pct(counts.low, total), mid = pct(counts.mid, total), hi = pct(counts.high, total);
  const summaryText = `high ${hi}%（mid ${mid}% / low ${lo}%、n=${total}）`;
  let html = `<div class="band-bar"><div class="cat-label">${esc(label)}</div><div class="band-track">`;
  if (lo > 0) html += `<div class="band-seg low" style="width:${lo}%" title="low：${lo}%（${counts.low}人）"></div>`;
  if (mid > 0) html += `<div class="band-seg mid" style="width:${mid}%" title="mid：${mid}%（${counts.mid}人）"></div>`;
  if (hi > 0) html += `<div class="band-seg high" style="width:${hi}%" title="high：${hi}%（${counts.high}人）"></div>`;
  html += `<div class="band-track-label">${esc(summaryText)}</div>`;
  html += `</div></div>`;
  return html;
}

// =============================================================================
// 描画：部署別テーブル（今回）
// =============================================================================
export function sortDeptRows(rows) {
  rows.sort((a, b) => {
    const aSup = a.stats.n < 10, bSup = b.stats.n < 10;
    if (aSup !== bSup) return aSup ? 1 : -1;
    if (aSup && bSup) return a.name.localeCompare(b.name, "ja");
    return b.stats.highPct - a.stats.highPct;
  });
  return rows;
}

export function renderDeptTable(levelLabel, rows, companyHighPct) {
  if (!rows.length) return "";
  let html = `<h3 class="subhead">${esc(levelLabel)}</h3><div class="table-wrap"><table><thead><tr><th>部署名</th><th>人数</th><th>高ストレス割合</th><th>A：業務負担 high%</th><th>B：ストレス反応 high%</th><th>C：サポート不足 high%</th><th>判定</th></tr></thead><tbody>`;
  rows.forEach((r) => {
    if (r.stats.n < 10) {
      html += `<tr><td>${esc(r.name)}</td><td>${r.stats.n}人</td><td colspan="4" style="color:var(--muted)">件数不足のため非表示（10人未満）</td><td><span class="badge warn">件数不足</span></td></tr>`;
    } else {
      const badge = r.stats.highPct > companyHighPct ? `<span class="badge ng">平均より高い</span>` : `<span class="badge ok">平均以下</span>`;
      html += `<tr><td>${esc(r.name)}</td><td>${r.stats.n}人</td><td>${r.stats.highPct.toFixed(1)}%</td><td>${r.stats.bandHighPct.A.toFixed(1)}%</td><td>${r.stats.bandHighPct.B.toFixed(1)}%</td><td>${r.stats.bandHighPct.C.toFixed(1)}%</td><td>${badge}</td></tr>`;
    }
  });
  html += "</tbody></table></div>";
  return html;
}

// =============================================================================
// 描画：属性別テーブル（今回）
// =============================================================================
export const ATTR_META = [
  { key: "gender", label: "性別", options: GENDER_OPTIONS },
  { key: "ageGroup", label: "年代", options: AGE_GROUP_OPTIONS },
  { key: "tenureGroup", label: "勤続年数", options: TENURE_GROUP_OPTIONS },
  { key: "employmentType", label: "雇用形態", options: EMPLOYMENT_TYPE_OPTIONS },
];

export function renderAttrTable(meta, byAttrMap, companyHighPct) {
  const rows = meta.options
    .map((opt) => ({ label: opt.label, stats: groupStats(byAttrMap[opt.value] || []) }))
    .filter((r) => r.stats.n > 0);
  if (!rows.length) return "";
  let html = `<h3 class="subhead">${esc(meta.label)}</h3><div class="table-wrap"><table><thead><tr><th>${esc(meta.label)}</th><th>人数</th><th>高ストレス割合</th><th>判定</th></tr></thead><tbody>`;
  rows.forEach((r) => {
    if (r.stats.n < 10) {
      html += `<tr><td>${esc(r.label)}</td><td>${r.stats.n}人</td><td style="color:var(--muted)">件数不足のため非表示</td><td><span class="badge warn">件数不足</span></td></tr>`;
    } else {
      const badge = r.stats.highPct > companyHighPct ? `<span class="badge ng">平均より高い</span>` : `<span class="badge ok">平均より低い</span>`;
      html += `<tr><td>${esc(r.label)}</td><td>${r.stats.n}人</td><td>${r.stats.highPct.toFixed(1)}%</td><td>${badge}</td></tr>`;
    }
  });
  html += "</tbody></table></div>";
  return html;
}

// =============================================================================
// 描画：レーダーチャート（A・B・Cのhigh%を軸にした部署比較・今回）
// =============================================================================
export const RADAR_AXES = [
  { key: "A", label: "A：業務負担" },
  { key: "B", label: "B：ストレス反応" },
  { key: "C", label: "C：サポート不足" },
];
export const RADAR_SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
export const CATEGORY_LINE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#9333ea", "#0891b2", "#65a30d", "#db2777"];

function polarPoint(axisIndex, value, cx, cy, maxR) {
  const angle = ((-90 + axisIndex * 120) * Math.PI) / 180;
  const r = (Math.max(0, Math.min(100, value)) / 100) * maxR;
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export function buildRadarSVG(seriesList) {
  const cx = 150, cy = 150, maxR = 105;
  let grid = "";
  [25, 50, 75, 100].forEach((level) => {
    const pts = RADAR_AXES.map((ax, i) => polarPoint(i, level, cx, cy, maxR).join(",")).join(" ");
    grid += `<polygon points="${pts}" fill="none" stroke="#e1e0d9" stroke-width="1"/>`;
  });
  let axisLines = "", axisLabels = "";
  RADAR_AXES.forEach((ax, i) => {
    const [x, y] = polarPoint(i, 100, cx, cy, maxR);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#c3c2b7" stroke-width="1"/>`;
    const [lx, ly] = polarPoint(i, 122, cx, cy, maxR);
    const anchor = Math.abs(lx - cx) < 5 ? "middle" : lx > cx ? "start" : "end";
    axisLabels += `<text x="${lx}" y="${ly}" font-size="11" fill="#52514e" text-anchor="${anchor}" dominant-baseline="middle">${esc(ax.label)}</text>`;
  });
  let seriesSvg = "";
  seriesList.forEach((s) => {
    const pts = RADAR_AXES.map((ax, i) => polarPoint(i, s.values[ax.key], cx, cy, maxR).join(",")).join(" ");
    seriesSvg += `<polygon points="${pts}" fill="${s.color}" fill-opacity="0.12" stroke="${s.color}" stroke-width="2" stroke-dasharray="${s.dashed ? "4,3" : "none"}"><title>${esc(s.name)}</title></polygon>`;
    RADAR_AXES.forEach((ax, i) => {
      const [x, y] = polarPoint(i, s.values[ax.key], cx, cy, maxR);
      seriesSvg += `<circle cx="${x}" cy="${y}" r="4" fill="${s.color}" stroke="#fcfcfb" stroke-width="2"><title>${esc(s.name)}：${esc(ax.label)} ${s.values[ax.key].toFixed(1)}%</title></circle>`;
    });
  });
  return `<svg viewBox="0 0 300 300" width="300" height="300" role="img" aria-label="部署別レーダーチャート">${grid}${axisLines}${seriesSvg}${axisLabels}</svg>`;
}

export function renderRadarLegend(seriesList) {
  let html = '<div class="radar-legend">';
  seriesList.forEach((s) => {
    html += `<div><span class="legend-dot" style="background:${s.color}"></span>${esc(s.name)}　A:${s.values.A.toFixed(1)}% / B:${s.values.B.toFixed(1)}% / C:${s.values.C.toFixed(1)}%</div>`;
  });
  html += "</div>";
  return html;
}

// =============================================================================
// グループ深掘り表示（部署ドリルダウン／属性カテゴリの詳細で共用）
// 直近5回の推移（人数・割合・バンド）＋ 今回の全社平均比較 ＋ 追加モジュール・新尺度
// cfg: { label, trendItemsFn(snapshot)->items, currentItemsFn()->items|null, companyCurrentHighPct, cycleSnapshots, currentCycleId }
// =============================================================================
export function buildGroupDeepDiveHtml(cfg) {
  const label = cfg.label;
  const snapshots = cfg.cycleSnapshots;
  let html = "";

  if (snapshots && snapshots.length >= 2) {
    const points = snapshots.map((s) => ({ cycleId: s.cycleId, label: s.label, st: groupStats(cfg.trendItemsFn(s)) }));

    if (!cfg.skipTrendCharts) {
      const countPoints = points.map((p) => ({ cycleId: p.cycleId, label: p.label, values: { respondent: p.st.n, high: p.st.highCount } }));
      const countSeries = [
        { key: "respondent", label: "受検者数", color: "#2a78d6", width: 2.5 },
        { key: "high", label: "高ストレス者数", color: "#d03b3b", width: 2.5 },
      ];
      html += `<h3 class="subhead">${esc(label)}：受検者数・高ストレス者数の推移</h3>`
        + buildLineChartSVG(countPoints, countSeries, { unit: "人", height: 220, ariaLabel: label + "の人数推移", highlightTest: (p) => p.cycleId === cfg.currentCycleId })
        + buildLegend(countSeries);

      const ratioPoints = points.map((p) => ({ cycleId: p.cycleId, label: p.label, values: { highPct: p.st.highPct, A: p.st.bandHighPct.A, B: p.st.bandHighPct.B, C: p.st.bandHighPct.C } }));
      const ratioSeries = [
        { key: "highPct", label: "高ストレス者割合", color: "#0f172a", width: 3 },
        { key: "A", label: "A：仕事の負担 high（高い）割合", color: "#2a78d6", width: 1.5 },
        { key: "B", label: "B：ストレス反応 high（高い）割合", color: "#eb6834", width: 1.5 },
        { key: "C", label: "C：サポート不足 high（高い）割合", color: "#1baf7a", width: 1.5 },
      ];
      html += `<h3 class="subhead">${esc(label)}：高ストレス者割合・尺度別割合の推移</h3>`
        + buildLineChartSVG(ratioPoints, ratioSeries, { unit: "%", height: 220, ariaLabel: label + "の割合推移", highlightTest: (p) => p.cycleId === cfg.currentCycleId })
        + buildLegend(ratioSeries);
    }

    let bandHtml = '<div class="mini-charts-grid">';
    ["A", "B", "C"].forEach((cat) => {
      const bandPoints = bandTrendPointsForCat(snapshots, cat, cfg.trendItemsFn);
      bandHtml += `<div><h4 class="subhead">${esc(SCALE_CAT_LABELS[cat])}</h4>${buildLineChartSVG(bandPoints, BAND_SERIES, { unit: "%", width: 320, height: 200, ariaLabel: label + SCALE_CAT_LABELS[cat] })}</div>`;
    });
    bandHtml += "</div>" + buildLegend(BAND_SERIES);
    html += `<h3 class="subhead">${esc(label)}：尺度別バンド（低い／やや高い／高い）の推移</h3>${bandHtml}`;
  } else {
    html += needsMorePointsHtml(snapshots ? snapshots.length : 0);
  }

  const currentItems = cfg.currentItemsFn ? cfg.currentItemsFn() : null;
  if (currentItems) {
    const st = groupStats(currentItems);
    if (cfg.companyCurrentHighPct != null) {
      let badge;
      if (st.n < 10) {
        badge = `<span class="badge warn">件数不足（10人未満）のため比較を省略</span>`;
      } else {
        const diff = st.highPct - cfg.companyCurrentHighPct;
        badge = diff > 0.5 ? `<span class="badge ng">全社平均より+${diff.toFixed(1)}pt高い</span>`
          : diff < -0.5 ? `<span class="badge ok">全社平均より${Math.abs(diff).toFixed(1)}pt低い</span>`
          : `<span class="badge ok">全社平均とほぼ同水準</span>`;
      }
      const pctText = st.n < 10 ? "件数不足のため非表示" : st.highPct.toFixed(1) + "%";
      html += `<div class="avg-note">${esc(label)}の今回の高ストレス者割合：${pctText}（n=${st.n}）　${badge}</div>`;
    }
    const bs = computeBandSummary(currentItems);
    const moduleHtml = buildModuleBarsHtml(bs.moduleBandCounts);
    const newScaleHtml = buildNewScaleBarsHtml(bs.newScaleBandCounts);
    if (moduleHtml) html += `<h3 class="subhead">${esc(label)}：追加モジュールの傾向（今回）</h3>${moduleHtml}`;
    if (newScaleHtml) html += `<h3 class="subhead">${esc(label)}：職場環境・組織との関わり（今回、80項目版）</h3>${newScaleHtml}`;
  }

  return html;
}

// =============================================================================
// 部署名の一覧（スナップショット横断・選択肢生成用）
// =============================================================================
export function collectGroupNames(cycleSnapshots, level) {
  const set = new Set();
  (cycleSnapshots || []).forEach((s) => {
    Object.keys(s.agg.byDept[level] || {}).forEach((n) => { if (n && n !== "（部署未設定）") set.add(n); });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
}
