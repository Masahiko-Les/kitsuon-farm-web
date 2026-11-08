// Firebaseコンソール > プロジェクトの設定 > マイアプリ で表示される値に置き換えてください。
// この値は公開されても問題ありません（守りは firestore.rules で行います）。
// iPhone版（kitsuon_nojo）と同じプロジェクトを使うので、両方のユーザーが同じ農場で遊べます。
export const firebaseConfig = {
  apiKey: "AIzaSyCw70CqCojGGuUSrdC50oCGz1bxWyXO1y4",
  authDomain: "kitsuonnojo.firebaseapp.com",
  projectId: "kitsuonnojo",
  storageBucket: "kitsuonnojo.firebasestorage.app",
  messagingSenderId: "706557087517",
  appId: "1:706557087517:web:6a65cf1896c595a4b15bf4",
  measurementId: "G-WP9W0Q6JZZ",
};

export const isConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");
