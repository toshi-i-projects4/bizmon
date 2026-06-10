(function () {
  var saveStatus = document.getElementById("saveStatus");
  if (!saveStatus) {
    return;
  }

  saveStatus.textContent = "STEP2起動：外部JavaScriptは実行されました。結果情報を表示します。";

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

    questionEl.innerText = questionText ? "問題：" + questionText : "問題情報がありません。";
    resultEl.innerText = resultText ? "判定：" + resultText : "判定結果がありません。";
    detailEl.innerText = (selectedChoice && correctChoice)
      ? "あなたの回答：" + selectedChoice + " / 正解：" + correctChoice
      : "回答情報がありません。";
    explanationEl.innerText = explanationText ? "解説：" + explanationText : "解説はありません。";

    saveStatus.textContent =
      "STEP2_OK：外部JavaScriptで結果表示に成功しました。
" +
      "判定=" + (resultText || "未取得") + " / あなたの回答=" + (selectedChoice || "未取得") + " / 正解=" + (correctChoice || "未取得") + "
" +
      "次の段階でFirebase認証確認を追加します。";
  } catch (error) {
    saveStatus.textContent =
      "STEP2_ERROR：結果表示処理中にエラーが発生しました。
" +
      "エラー内容：" + (error && error.message ? error.message : String(error));
  }
})();
