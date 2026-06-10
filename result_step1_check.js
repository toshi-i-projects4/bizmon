(function () {
  var el = document.getElementById("saveStatus");
  if (el) {
    el.textContent = "STEP1_EXTERNAL_CHECK_EXECUTED：外部JSの中身が実行されました。次に結果表示処理を戻せます。";
  }
  if (typeof window.resultStep1CheckLoaded === "function") {
    window.resultStep1CheckLoaded();
  }
})();
