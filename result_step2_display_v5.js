var saveStatus = document.getElementById("saveStatus");
var nl = String.fromCharCode(10);

if (saveStatus) {
  saveStatus.textContent = "STEP2_V5起動：外部JavaScriptは実行されました。結果情報を読み取ります。";
}

try {
  var questionText = localStorage.getItem("questionText") || "";
  var resultText = localStorage.getItem("result") || "";
  var selectedChoice = localStorage.getItem("selectedChoice") || "";
  var correctChoice = localStorage.getItem("correctChoice") || "";
  var explanationText = localStorage.getItem("explanation") || "";

  var questionEl = document.getElementById("question");
  var resultEl = document.getElementById("result");
  var detailEl = document.getElementById("detail");
  var explanationEl = document.getElementById("explanation");

  if (questionEl) {
    if (questionText) {
      questionEl.innerText = "問題：" + questionText;
    } else {
      questionEl.innerText = "問題情報がありません。";
    }
  }

  if (resultEl) {
    if (resultText) {
      resultEl.innerText = "判定：" + resultText;
    } else {
      resultEl.innerText = "判定結果がありません。";
    }
  }

  if (detailEl) {
    if (selectedChoice && correctChoice) {
      detailEl.innerText = "あなたの回答：" + selectedChoice + " / 正解：" + correctChoice;
    } else if (selectedChoice) {
      detailEl.innerText = "あなたの回答：" + selectedChoice + " / 正解情報がありません。";
    } else {
      detailEl.innerText = "回答情報がありません。";
    }
  }

  if (explanationEl) {
    if (explanationText) {
      explanationEl.innerText = "解説：" + explanationText;
    } else {
      explanationEl.innerText = "解説はありません。";
    }
  }

  if (saveStatus) {
    saveStatus.textContent = "STEP2_V5_OK：外部JavaScriptで結果表示に成功しました。" + nl +
      "判定=" + (resultText || "未取得") + " / あなたの回答=" + (selectedChoice || "未取得") + " / 正解=" + (correctChoice || "未取得") + nl +
      "次の段階：Firebase認証確認を実行中です。";
  }
} catch (error) {
  if (saveStatus) {
    saveStatus.textContent = "STEP2_V5_ERROR：結果表示処理中にエラーが発生しました。" + nl +
      "エラー内容：" + (error && error.message ? error.message : String(error));
  }
}
