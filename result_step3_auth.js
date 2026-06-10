import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

var authStatus = document.getElementById("authStatus");
var nl = String.fromCharCode(10);

if (authStatus) {
  authStatus.textContent = "STEP3起動：Firebase認証モジュールは実行されました。認証状態を確認しています。";
}

var firebaseConfig = {
  apiKey: "AIzaSyBMm7YmGFo4ZOdlXvsojZ-O40f8Rnf8Lus",
  authDomain: "bizmon-31ffc.firebaseapp.com",
  projectId: "bizmon-31ffc"
};

try {
  var app = initializeApp(firebaseConfig);
  var auth = getAuth(app);

  var authTimer = setTimeout(function () {
    if (authStatus) {
      authStatus.textContent = "STEP3_TIMEOUT：10秒以内にFirebase認証確認が完了しませんでした。login.htmlから再ログインして確認してください。";
    }
  }, 10000);

  onAuthStateChanged(auth, function (user) {
    clearTimeout(authTimer);

    if (!user) {
      if (authStatus) {
        authStatus.textContent = "STEP3_NO_USER：ログイン状態を確認できませんでした。login.htmlへ移動します。";
      }
      location.href = "login.html";
      return;
    }

    if (authStatus) {
      authStatus.textContent = "STEP3_OK：Firebase認証確認に成功しました。" + nl +
        "ログイン中：" + (user.email || "メールアドレスなし") + nl +
        "次の段階でFirestore保存処理を追加します。";
    }
  });
} catch (error) {
  if (authStatus) {
    authStatus.textContent = "STEP3_ERROR：Firebase認証確認中にエラーが発生しました。" + nl +
      "エラー内容：" + (error && error.message ? error.message : String(error));
  }
}
