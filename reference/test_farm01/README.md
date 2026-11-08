# 試作農園 test_farm01

吃音村とは接点を持たない、単独の試作Webアプリです。HTML・CSS・JavaScriptだけで動き、ビルドは不要です。データはFirebase（匿名認証＋Firestore）に保存します。

## ファイル

| ファイル | 役割 |
| --- | --- |
| index.html | 画面の骨組み |
| style.css | 見た目 |
| app.js | マップ、種まき、水やり、手紙、作物、通報・ブロック |
| firebase-config.js | Firebaseの接続情報（自分の値に書き換える） |
| firestore.rules | Firestoreのセキュリティルール |

## 1. Firebaseの準備

吃音村と混ざらないよう、新しいFirebaseプロジェクトを作るのがおすすめです（例：kitsuon-test-farm01）。

1. Firebaseコンソールでプロジェクトを作成する。
2. 「プロジェクトの設定」→「マイアプリ」でウェブアプリを追加し、表示された設定値を `firebase-config.js` に貼る。
3. 「Authentication」→「ログイン方法」で「匿名」を有効にする。
4. 「Authentication」→「設定」→「承認済みドメイン」に `www.kitsuonmura.com` と `kitsuonmura.com` を追加する。
5. 「Firestore Database」を作成する（ロケーションは asia-northeast1 など）。
6. 「ルール」タブに `firestore.rules` の中身を貼り付けて「公開」する。

複合インデックスは不要です。

## 2. kitsuonmura.com/test_farm01 に置く

`test_farm01` フォルダごと、Vercelで公開しているプロジェクトの「静的ファイルを置く場所」に入れます。中のファイルは `/test_farm01/...` という絶対パスで互いを読み込むので、フォルダ名は変えないでください。

### Next.js の場合

1. `public/test_farm01/` にファイルを置く。
2. `next.config.js`（または `.mjs`）に、`/test_farm01` を `index.html` に向ける設定を足す。既存の設定がある場合は中身を合わせる。

```js
const nextConfig = {
  async rewrites() {
    return [
      { source: "/test_farm01", destination: "/test_farm01/index.html" },
      { source: "/test_farm01/", destination: "/test_farm01/index.html" },
    ];
  },
};
module.exports = nextConfig;
```

### Vite・素のHTMLなどの場合

1. `public/test_farm01/`（素のHTMLならルート直下の `test_farm01/`）にファイルを置く。
2. プロジェクト直下の `vercel.json` に次を足す。

```json
{
  "rewrites": [
    { "source": "/test_farm01", "destination": "/test_farm01/index.html" }
  ]
}
```

デプロイ後、`https://www.kitsuonmura.com/test_farm01` を開いて村人名の登録画面が出れば成功です。

## 3. 手元で試す

`test_farm01` フォルダの「ひとつ上」の階層で次を実行し、`http://localhost:3000/test_farm01/` を開きます。

```
npx serve .
```

2人分の体験を試すときは、通常ウィンドウとシークレットウィンドウで開くと、別の村人として遊べます。

## 4. 運営の確認作業（Firebaseコンソール）

| 確認すること | 場所 | 対応 |
| --- | --- | --- |
| つらい気持ちが書かれた種 | seeds で status が review のもの | 問題なければ status を public に変える。本文は seedBodies の同じID |
| 通報 | reports | targetType と targetId で対象を確認し、必要なら種の status を hidden に、手紙を削除する |
| 迷惑な村人 | users | 該当ユーザーの種・手紙を削除する（Authenticationからユーザー削除も可） |

## 5. 試作版としての制限

- 文章チェック（NGワード・連絡先・危機的な言葉）はブラウザ側だけで行っているため、技術的には回避できます。本公開前にCloud Functionsなどサーバー側のチェックを足してください。
- 「種の文章は見つけた人だけが読める」は画面上の仕組みです。ルール上は、ログインした村人なら公開中の種の本文を読めます。
- 匿名認証はブラウザに紐づくため、ブラウザのデータを消すと別の村人になります。
- 危機的な言葉の一覧と相談窓口の番号・受付時間は、公開前に必ず見直してください（app.js の `CRISIS_WORDS` と `showSupport`）。
- 手紙を書く側が危機的な言葉を書いた場合は、手紙を送らずに相談窓口を表示します（仕様書では未定だった部分の仮の動き）。
- Firebaseの設定値はブラウザに公開されても問題ありません。守りは firestore.rules が担います。本公開時は App Check の導入も検討してください。

## 仕様の対応表

| 仕様書の決定 | 実装 |
| --- | --- |
| 1つの種に最大5人まで | ルールで waterCount < 5 を強制 |
| 手紙はすぐ届く | 水やりと同時に letters に作成 |
| 水やりされない種の救済なし | 特別な処理なし |
| 「ありがとう」を押さないと何も届かない | 作物は「ありがとう」時にだけ作成 |
| 種の文章は見つけた人だけ | 2マス以内に近づくと光り、その上で調べると本文を取得 |
| 危機的な内容の種は非公開で管理者確認 | status: review で保存し、本人に相談窓口を表示 |
| 未成年と大人を分けない | 分けていない |
