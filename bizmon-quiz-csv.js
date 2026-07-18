// bizmon-quiz-csv.js
// quizResults ドキュメントの正誤判定・表示用整形・CSV変換ロジックを一箇所にまとめた共有モジュール。
// report.html と user-edit-single.html（バックアップデータ出力機能）から読み込んで使用する。
// 既知の課題・改善候補 No.1（共通ロジックの未接続による3重実装）と同種の問題を
// 繰り返さないため、quizResults まわりのロジックはこのファイルを唯一の実装とすること。

export function firstNonEmpty() {
  for (let i = 0; i < arguments.length; i++) {
    const v = arguments[i];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function normalizeChoice(v) {
  return firstNonEmpty(v).toUpperCase();
}

export function isCorrectQuizResult(r) {
  if (r && r.isCorrect === true) return true;
  if (r && r.isCorrect === false) return false;
  const x = String((r && (r.result || r.judgement || r.resultText)) || '').toLowerCase();
  if (x.includes('incorrect') || x.includes('wrong') || x.includes('不正解') || x.includes('×')) return false;
  if (x.includes('correct') || x.includes('正解') || x.includes('○')) return true;
  const s = normalizeChoice(r && (r.selectedChoice || r.selectedAnswer || r.userAnswer));
  const c = normalizeChoice(r && (r.correctChoice || r.correctAnswer));
  return !!(s && c && s === c);
}

export function choiceA(r) { return firstNonEmpty(r.choiceA, r.a); }
export function choiceB(r) { return firstNonEmpty(r.choiceB, r.b); }
export function choiceC(r) { return firstNonEmpty(r.choiceC, r.c); }
export function selectedAnswer(r) { return firstNonEmpty(r.selectedChoice, r.selectedAnswer, r.userAnswer) || '未取得'; }
export function correctAnswer(r) { return firstNonEmpty(r.correctChoice, r.correctAnswer) || '未取得'; }

export const QUIZ_RESULT_CSV_HEADERS = ['日付', '社員コード', '氏名', 'メールアドレス', '部署', '役職', '備考', '正誤', '大項目', '問題', '選択肢A', '選択肢B', '選択肢C', '回答', '解答', '解説', '問題ID'];

export function quizResultToCsvRow(r) {
  const ok = isCorrectQuizResult(r);
  return [
    r.dateKey || r.date || '',
    firstNonEmpty(r.employeeCode, r.employeeNo, r.staffCode),
    firstNonEmpty(r.name, r.displayName),
    firstNonEmpty(r.email),
    firstNonEmpty(r.department),
    firstNonEmpty(r.position),
    firstNonEmpty(r.note),
    ok ? '正解' : '不正解',
    firstNonEmpty(r.category1, r.largeCategory, r.mainCategory),
    firstNonEmpty(r.questionText, r.question),
    choiceA(r), choiceB(r), choiceC(r),
    selectedAnswer(r), correctAnswer(r),
    firstNonEmpty(r.explanation, r.commentary),
    firstNonEmpty(r.questionId, r.id)
  ];
}

export function csvCell(v) {
  return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}

// rows: quizResults ドキュメントの配列（{id, ...data()} 形式）
// 戻り値: BOM付きCSV文字列（Excelでの文字化けを防ぐ）
export function buildQuizResultsCsv(rows) {
  const lines = [QUIZ_RESULT_CSV_HEADERS.map(csvCell).join(',')];
  (rows || []).forEach(r => lines.push(quizResultToCsvRow(r).map(csvCell).join(',')));
  return '﻿' + lines.join('\n');
}

export function downloadCsvFile(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
