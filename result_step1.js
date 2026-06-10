(function () {
  var saveStatus = document.getElementById("saveStatus");
  if (!saveStatus) {
    return;
  }

  saveStatus.textContent = "STEP1_EXTERNAL起動：外部JavaScriptは実行されました。localStorage確認中...";

  try {
    var questionText = localStorage.getItem("questionText") || "";
    var resultText = localStorage.getItem("result") || "";
    var selectedChoice = localStorage.getItem("selectedChoice") || "";
    var correctChoice = localStorage.getItem("correctChoice") || "";
    var explanationText = localStorage.getItem("explanation") || "";

    document.getElementById("question").innerText = questionText ? "問題：" + questionText : "問題情報がありません。";
    document.getElementById("result").innerText = resultText ? "判定：" + resultText : "判定結果がありません。";
    document.getElementById("detail").innerText = (selectedChoice && correctChoice)
      ? "あなたの回答：" + selectedChoice + " / 正解：" + correctChoice
      : "回答情報がありません。";
    document.getElementById("explanation").innerText = explanationText ? "解説：" + explanationText : "解説はありません。";

    saveStatus.textContent =
      "STEP1_EXTERNAL_OK：外部JavaScriptで結果表示に成功しました。
" +
      "result=" + (resultText || "未取得") + " / selectedChoice=" + (selectedChoice || "未取得") + " / correctChoice=" + (correctChoice || "未取得") + "
" +
      "次の段階で、この外部JS方式のままFirebase認証確認を追加します。";
  } catch (error) {
    saveStatus.textContent =
      "STEP1_EXTERNAL_ERROR：外部JavaScriptは実行されましたが、処理中にエラーが発生しました。
" +
      "エラー内容：" + (error && error.message ? error.message : String(error));
  }
})();
