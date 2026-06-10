import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

var authStatus = document.getElementById("authStatus");
var nl = String.fromCharCode(10);

function setAuthStatus(text) {
  if (authStatus) {
    authStatus.textContent = text;
  }
}

setAuthStatus("STEP4起動：Firebase認証とFirestore保存モジュールは実行されました。認証状態を確認しています。");

var firebaseConfig = {
  apiKey: "AIzaSyBMm7YmGFo4ZOdlXvsojZ-O40f8Rnf8Lus",
  authDomain: "bizmon-31ffc.firebaseapp.com",
  projectId: "bizmon-31ffc"
};

function getTodayKey() {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, "0");
  var d = String(now.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + d;
}

function normalizeResult(text) {
  if (text === "正解") {
    return "correct";
  }
  if (text === "不正解") {
    return "incorrect";
  }
  return "unknown";
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      setTimeout(function () {
        reject(new Error("timeout: " + ms + "ms"));
      }, ms);
    })
  ]);
}

async function saveQuizResult(user, db) {
  var dateKey = getTodayKey();
  var questionText = localStorage.getItem("questionText") || "";
  var resultText = localStorage.getItem("result") || "";
  var selectedChoice = localStorage.getItem("selectedChoice") || "";
  var correctChoice = localStorage.getItem("correctChoice") || "";
  var explanationText = localStorage.getItem("explanation") || "";
  var normalizedResult = normalizeResult(resultText);

  if (!resultText) {
    setAuthStatus("STEP4_NO_RESULT：判定結果がないため、Firestoreには保存しませんでした。");
    return;
  }

  var docId = user.uid + "_" + dateKey;
  var ref = doc(db, "quizResults", docId);

  var payload = {
    uid: user.uid,
    email: user.email || "",
    date: dateKey,
    result: normalizedResult,
    resultText: resultText,
    selectedChoice: selectedChoice,
    correctChoice: correctChoice,
    questionText: questionText,
    explanation: explanationText,
    updatedAt: serverTimestamp()
  };

  try {
    setAuthStatus("STEP4保存中：Firestoreへ結果を保存しています。" + nl +
      "保存先：quizResults / " + docId);

    await withTimeout(setDoc(ref, payload, { merge: true }), 10000);

    setAuthStatus("STEP4_OK：Firestoreへ結果を保存しました。" + nl +
      "ログイン中：" + (user.email || "メールアドレスなし") + nl +
      "保存先：quizResults / " + docId + nl +
      "同じ日にやり直した場合は、最後の結果で上書きされます。");
  } catch (error) {
    setAuthStatus("STEP4_ERROR：Firestoreへの保存に失敗しました。" + nl +
      "エラー内容：" + (error && error.message ? error.message : String(error)) + nl +
      "保存先：quizResults / " + docId + nl +
      "Firestore Databaseの有効化とセキュリティルールを確認してください。");
  }
}

try {
  var app = initializeApp(firebaseConfig);
  var auth = getAuth(app);
  var db = getFirestore(app);

  var authTimer = setTimeout(function () {
    setAuthStatus("STEP4_TIMEOUT：10秒以内にFirebase認証確認が完了しませんでした。login.htmlから再ログインして確認してください。");
  }, 10000);

  onAuthStateChanged(auth, function (user) {
    clearTimeout(authTimer);

    if (!user) {
      setAuthStatus("STEP4_NO_USER：ログイン状態を確認できませんでした。login.htmlへ移動します。");
      location.href = "login.html";
      return;
    }

    setAuthStatus("STEP4認証OK：Firebase認証確認に成功しました。Firestore保存を開始します。" + nl +
      "ログイン中：" + (user.email || "メールアドレスなし"));
    saveQuizResult(user, db);
  });
} catch (error) {
  setAuthStatus("STEP4_INIT_ERROR：FirebaseまたはFirestoreの初期化中にエラーが発生しました。" + nl +
    "エラー内容：" + (error && error.message ? error.message : String(error)));
}
