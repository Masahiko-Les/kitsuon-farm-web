# 吃音農場（Kitsuon Farm）Web版

**このリポジトリはWeb版。** iPhoneアプリ（https://github.com/Masahiko-Les/kitsuon_nojo）を複製し、Expo の Web 出力で同じ体験をブラウザで遊べるようにしたもの。Firebase プロジェクト（kitsuonnojo）と Firestore ルールは iPhone版と共有しているので、両方のユーザーが同じ農場で遊べる。iPhone版の修正は、必要に応じてこちらにも反映する。

### Web版で差し替えている所
- `index.web.js`：Skia は読み込んだ時点で CanvasKit を使うので、先に `public/canvaskit.wasm` を読み込んでからアプリ本体を読み込む（wasm は postinstall で node_modules からコピー）。
- `src/lib/firebase.web.ts`：ブラウザ用の認証（IndexedDB に保存）。設定値は `src/lib/firebase-config.ts` の1か所。
- `src/lib/confirm.ts`：`Alert.alert` は Web で出ないので `window.confirm` を使う。Alert を直接使わないこと。
- `src/screens/farm-screen.tsx`：Web だけ矢印キー/WASD で歩き、Enter/スペースでAボタン。
- `src/app/_layout.tsx`：Web では最大480pxの縦長画面を中央に置く。
- `public/index.html`：Web の HTML テンプレート（lang=ja、拡大しない viewport など）。

### 吃音村カフェ（Web版だけ。https://github.com/Masahiko-Les/Kitsuonmura-cafe から移植）
- 農場のカフェ（BUILDINGS の cafe）に入れる。店内の間取りと座っている村人は `src/lib/game.ts` の `ROOMS.cafe` と `CAFE_GUESTS`、描画は `src/components/farm-map.tsx` の `cafeArt()`。
- マスターに話しかけるか、空いている丸椅子に座ると `/cafe` が開く。会話の流れ・テーマ・質問・お手本・気持ち・通報・「わたしの言葉」・運営画面は、吃音村カフェの仕様のまま（`src/lib/cafe.ts`、`src/lib/cafe-api.ts`、`src/screens/cafe-*.tsx`）。質問の id は回答の保存に使うので変えない。お手本は「運営が用意したお手本の言葉」と必ず表示する。
- 「できたこと」と村のマップ、App Store の評価ダイアログは移植していない。
- データは kitsuonnojo の `cafeAnswers`・`cafeReactions`・`reports`（targetType: cafeAnswer）。ルールは `firestore.rules` の☆の行。iPhone版と共有しているプロジェクトなので、種・手紙・作物のルールは変えない。
- 運営は `admins/{uid}`（Firebase コンソールからだけ作る）。設定画面の下の「村人ID」で uid を確かめる。運営へのメール通知（Cloud Functions）はまだない（Blaze プランが必要）。

### コマンド
- `npm run web`：開発サーバー
- `npm run build:web`：`dist/` に書き出す
- `npm run deploy`：書き出して Firebase Hosting に公開（`--only hosting`。共有している Firestore ルールは上書きしない）

---


吃音のある人が、苦労を「種」として農場に蒔き、ほかの人が優しい言葉の手紙で「水やり」をし、蒔いた人が「ありがとう」を押すと作物が実って2人で分け合う、iPhoneアプリ（将来Androidも）。

`reference/` に、Webで作った試作版がある。体験・文言・ルールはこれを正とし、React Nativeに移植する。

- `reference/test_farm01_local.html`：ローカル保存版（体験の完成形。まず触って確認する）
- `reference/test_farm01/app.js`：Firebase版のロジック
- `reference/test_farm01/firestore.rules`：Firestoreセキュリティルール（そのまま使う）

## 技術構成

| 役割 | 使うもの |
| --- | --- |
| アプリ | Expo（React Native）＋ TypeScript、Expo Router |
| マップ描画 | @shopify/react-native-skia（試作版のCanvas描画を移植） |
| DB | Firebase JS SDK の Firestore |
| 認証 | Firebase Auth の匿名認証。永続化は `initializeAuth` ＋ `getReactNativePersistence(AsyncStorage)` |
| ビルド・提出 | EAS Build / EAS Submit |

Firebase は JS SDK を使い、React Native Firebase（ネイティブモジュール）は使わない。Expo Go で動作確認できる状態を保つ。

## 決まっている仕様

- マップは 16×12 マスの農場。十字ボタンで1マスずつ移動、Aボタンで決定。
- 種は「吃音の苦労」を10行・300字以内。立っているマスに蒔く。1マスに1つ。種IDは `x_y`。
- 他人の種は普段は見えず、2マス以内に近づくと光る。本文は見つけた人だけが読む。
- 水やりは優しい言葉の手紙（10行・300字以内）。1つの種に最大5人、1人1回。手紙はすぐ届く。
- 「ありがとう」を押すと作物が実り、蒔いた人と水やりした人の両方に同じ作物が入る。押さなければ何も届かない。
- 作物は10種類（トマト、にんじん、なす、きゅうり、とうもろこし、じゃがいも、ピーマン、かぼちゃ、いちご、はくさい）。思い出帳で、種の文章と手紙を一緒に読み返せる。
- 未成年と大人のやり取りは分けない。水やりされない種の救済はしない。

## 安心・安全（App Store審査ガイドライン1.2に対応。省略しない）

- NGワード・連絡先（メール、URL、電話番号、SNS ID）のフィルタを、送信前に必ずかける。
- 種・手紙のすべてに通報ボタン。通報された手紙は受信者の画面から即時に消す。
- 手紙をくれた人をブロックできる。ブロック後、その人の手紙は届かない。
- 危機的な言葉（`CRISIS_WORDS`）を含む種は `status: review` で保存して非公開にし、本人に相談窓口を表示する。手紙の場合は送らずに相談窓口を表示する。
- 初回起動時に利用規約とガイドラインへの同意を求める。運営の連絡先をアプリ内に表示する。
- 設定画面に「すべてのデータを削除」を用意する（自分の種・手紙・作物・ユーザー情報を消し、匿名アカウントも削除）。
- 通報は24時間以内に運営が確認する前提で、Cloud Functions から運営へ通知する仕組みを第2段階で入れる。

## 画面

- 名前登録（初回のみ）→ 規約同意 → 農場マップ
- 農場マップ（ヘッダーに村人名・郵便受け・思い出帳・設定）
- モーダル：種を蒔く／種を見つける／水やりの手紙／郵便受け／手紙を読む／収穫／思い出帳／思い出の詳細／相談窓口
- 設定：あそびかた、利用規約、運営への連絡、すべてのデータを削除

## 見た目

試作版の見た目を踏襲する。苔色の背景、生成りの便箋に罫線、ピクセル調のマップ。UIフォントは DotGothic16、手紙の本文は Klee One（expo-font で同梱）。文章を書く欄は、行数ぶんの罫線が引かれた便箋にする。

## 進め方

1. Expo プロジェクト作成、Expo Router、TypeScript の設定。
2. Firebase 初期化と匿名認証、名前登録。
3. Skia でマップを描画し、十字ボタンで歩けるようにする（まずはFirebaseなしで）。
4. 種を蒔く・見つける・水やり・郵便受け・ありがとう・思い出帳を、Firestore とつなぐ。
5. 通報・ブロック・フィルタ・相談窓口・規約同意・データ削除。
6. 実機で2台（または実機とシミュレーター）を使い、蒔く人と水やりする人の両方を試す。
7. EAS Build で TestFlight に配信。

各段階が終わるたびに、動作確認の方法を日本語で説明してから次へ進むこと。

## 約束ごと

- 画面に出る文言はすべて日本語。試作版の言い回しをそのまま使う。
- Firestore への書き込みは、`firestore.rules` が許す形だけにする（水やりはトランザクション、ありがとうはバッチ書き込み）。
- `CRISIS_WORDS` と相談窓口の電話番号は1つのファイルにまとめ、公開前に見直せるようにする。
- 秘密情報はない（Firebaseの設定値は公開されても問題ない）が、`firebaseConfig` は `src/lib/firebase-config.ts` の1か所にまとめる。
