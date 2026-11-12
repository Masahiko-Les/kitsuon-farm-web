# 吃音村（Kitsuon Farm）Web版

※ 2026年11月にアプリ名を「吃音農場」から「吃音村」に変えた。iPhone版はいまも「吃音農場」。画面に出す名前は「吃音村」にそろえる。

**このリポジトリはWeb版。** iPhoneアプリ（https://github.com/Masahiko-Les/kitsuon_nojo）を複製し、Expo の Web 出力で同じ体験をブラウザで遊べるようにしたもの。**データと認証は Supabase、配信は Vercel**（2026年11月に Firebase から移行）。iPhone版は Firebase（kitsuonnojo）のままなので、iPhone版とWeb版は別々の農場。iPhone版の画面や文言の修正は、必要に応じてこちらにも反映する。

### Web版で差し替えている所
- `index.web.js`：Skia は読み込んだ時点で CanvasKit を使うので、先に `public/canvaskit.wasm` を読み込んでからアプリ本体を読み込む（wasm は postinstall で node_modules からコピー）。
- `src/lib/supabase.ts`：Supabase のクライアント。URL と公開用キーはここの1か所（公開されても問題ない値。守りは RLS）。未入力のあいだはおためしモード。
- `src/lib/confirm.ts`：`Alert.alert` は Web で出ないので `window.confirm` を使う。Alert を直接使わないこと。
- `src/screens/farm-screen.tsx`：Web だけ矢印キー/WASD で歩き、Enter/スペースでAボタン。
- `src/app/_layout.tsx`：Web では最大480pxの縦長画面を中央に置く。
- `public/index.html`：Web の HTML テンプレート（lang=ja、拡大しない viewport など）。

### 自分の種への水やり（Web版だけ）
- 種を蒔いた人も、自分の種に1回だけ水やりできる（自分の種のモーダルの「自分に水やりする」）。「最大100人」の枠には数えない（water_count・waterers は増えない）。`supabase/migrations/0007` の `water_seed`。
- 手紙は自分の郵便受けに「自分から」で届き、「ありがとう」で花が咲く（crops は sower と waterer が同じ人）。自分への手紙には通報・ブロックを出さず、水やりした側の「ありがとう」の知らせも出さない。

### 吃音村カフェ（Web版だけ。https://github.com/Masahiko-Les/Kitsuonmura-cafe から移植）
- 農場のカフェ（BUILDINGS の cafe）に入れる。店内の間取りと座っている村人は `src/lib/game.ts` の `ROOMS.cafe` と `CAFE_GUESTS`、描画は `src/components/farm-map.tsx` の `cafeArt()`。
- マスターに話しかけるか、空いている丸椅子に座ると `/cafe` が開く。会話の流れ・テーマ・質問・気持ち・通報・「わたしの言葉」・運営画面は、吃音村カフェの仕様のまま（`src/lib/cafe.ts`、`src/lib/cafe-api.ts`、`src/screens/cafe-*.tsx`）。質問の id は回答の保存に使うので変えない。
- 運営が用意したお手本の言葉は置かない（2026年11月に削除）。読ませるのは村人の言葉だけで、まだ誰もいない質問ではマスターのひとことだけで次へ進む。運営が作った言葉を村人の言葉として載せない。
- アカウントのない村人の言葉（本人の同意を得て運営が受け取ったもの）は、`supabase/migrations/0003` のように uid を空・author_key つきで取り込み、運営画面で承認する。気持ちは届けられない。
- 「できたこと」と村のマップ、App Store の評価ダイアログは移植していない。
- データは Supabase の `cafe_answers`・`cafe_reactions`・`reports`（target_type: cafeAnswer）。
- 運営は `admins` テーブルに村人IDを入れた人（Supabase のダッシュボードからだけ書ける）。設定画面の下の「村人ID」で確かめる。運営へのメール通知はまだない。

### 村の地形（Web版だけ。2026年11月に作り直した）
- `MAP`（`src/lib/game.ts`）は 48×26 マス。西は海、北西の丘（崖 X）の上にラジオ局（まっすぐな石段 ^ で下りる）、そのふもとに大きな風車（村の目じるし）、北東は砂漠（D。端は砂嵐 W）、中央は焚き火（O）とベンチ（L）の広場で、その真北に村役場、東と南東は柵の畑、南西に港の待合所と桟橋。
- 焚き火のまわりのベンチ（L）は、向かってAを押すと座れる（焚き火のほうを向く。歩けば立ち上がる）。座っている姿はほかの村人にも見える（`village.ts` の `validSpot` で L を受け付ける）。
- 砂漠にはサボテン（C）と岩山（K）、開発局。風車と灯台は入れない建物（`BUILDINGS`）。マップの外は、端が砂漠側なら砂嵐、それ以外は海（`tileAt`）。
- 種の ID は場所（x_y）なので、地形を変えると今ある種が道や海の上に来る。作り直したときは `supabase/migrations/0005` で種・手紙・花の記録を消した。

### 砂漠の「挑戦の種」（Web版だけ）
- 村の北東の砂漠（`tileAt` が "D"）では、苦労ではなく「挑戦」（これからのことも、やってみたことも）を種として蒔ける。水やり・ありがとう・通報・ブロックなどの仕組みは農場とまったく同じ。
- 挑戦の種かどうかは種の場所（ID の「x_y」）で決める（`isDesert` / `isDesertSeedId` / `seedNameOf`。`src/lib/game.ts`）。データベースに印は持たない。
- 「ありがとう」で咲くのは砂漠の花 `DESERT_CROPS`（10種類。id は `desert-` で始まる）。思い出帳には「砂漠の図鑑」として並べる。

### 花（Web版だけ。2026年11月に作物から変えた）
- 「ありがとう」で実るのは野菜ではなく花。農場は `CROPS`（チューリップなど10種類）、砂漠は `DESERT_CROPS`（サボテンの花など10種類）で、種類を分ける（`src/lib/game.ts`）。iPhone版は野菜のまま。
- 絵は絵文字ではなく16ドットのドット絵（`src/components/flowers.ts`）。画面には `FlowerIcon`（`flower-icon.tsx`）で、ドットを整数倍に広げた PNG として出す。大きさは16の倍数（32・48・96）にする。
- 型・テーブル・列の名前は「作物」のまま（`crops.crop_type`）。花にする前の id（tomato など）は、`cropById` の中で同じ並び順の花に読みかえる。
- 咲いた花は、村のマップのその種のマスに、村人みんなに見えるように咲く。種の `bloom` 列（`supabase/migrations/0004`）に、最初の「ありがとう」で `say_thanks` が花の id を入れる。描画は `farm-map.tsx` の `drawBloom`（輪郭なしのドット絵）。

### 村役場（Web版だけ）
- 農場の村役場（BUILDINGS の hall）に入れる。間取りは `ROOMS.hall`、描画は `farm-map.tsx` の `hallArt()`。
- 奥の壁に掲示板（N）。向かってAを押すと、吃音についての情報（`src/lib/bulletin.ts`）を読める。医療・制度にかかわる内容なので、公開前と定期的に見直す。
- カウンターの係員（タヌキ）に話しかけると、住民登録の窓口（`ClerkModal`）。住民登録はまだ準備中で、案内だけを出す。

### 開発局（Web版だけ）
- 砂漠の開発局（BUILDINGS の dev）に入れる。間取りは `ROOMS.dev`、描画は `farm-map.tsx` の `devArt()`。
- 作業机のフクロウ（V）に話しかけると `DevStaffModal`。「ある」を選ぶと、吃音村を良くするためのアイデアを書ける（300字以内。NGワード・連絡先のフィルタ、危機的な言葉は review で保存して相談窓口）。
- 奥の壁の黒板（G）で `BlackboardModal`。運営が承認したアイデア（public）と自分のアイデア（確認中）を、名前を出さずに並べる。ほかの村人のアイデアには通報ボタン（通報すると自分の黒板から消える）。
- データは Supabase の `dev_ideas`（`supabase/migrations/0006`）と `reports`（target_type: devIdea）。承認・要確認・通報は、設定の「運営：開発局のアイデアの確認」（`/dev-admin`）。

### 村長（Web版だけ）
- 村のマップを、道（P）の上だけゆっくり歩く長老（人間）。動きは `farm-screen.tsx`（2〜3秒ごとに1マス、ときどき休む）、絵は `farm-map.tsx` の `drawMayor`。
- 村人は村長のいるマスに入れず、村長も村人のいるマスには入らない。向かい合ってAを押すと `MayorModal`（村長「よう元気か」）。

### ほかの村人（Web版だけ）
- 同じ時間に開いている村人の歩く姿が、村のマップ・カフェ・村役場で見える（自分の家の中はひとり）。見えるだけで、名前もやり取りもない。ぶつからずにすれ違う。
- 仕組みは `src/state/village.ts`。Supabase Realtime の Presence（誰がいるか・立ち止まった場所）と Broadcast（1マス歩くごと）。データベースは使わない。
- 送るのは場所（x・y・向き）だけ。uid と名前は送らず、開くたびに作る使い捨ての ID で区別する。受け取った値は、歩けるマスかを確かめてから使う。
- チャンネルは場所ごと（`village:farm:1` など）。通信量を抑えるため、1つの村は `VILLAGE_CAP`（10人）まで。いっぱいなら次の番号の村に入る。タブが裏に回ると村から出る。
- 服の色は ID から決めた6通り（`farm-map.tsx` の `LOOKS`）。自分は青い服のまま。

### コマンド
- `npm run web`：開発サーバー
- `npm run build:web`：`dist/` に書き出す
- 公開：GitHub の main に push すると、Vercel（プロジェクト kitsuonmura）が `npm run build:web` を実行して https://kitsuonmura.vercel.app に公開する（`vercel.json`）

### データベース（Supabase）
- スキーマ・RLS・RPC・Realtime は `supabase/migrations/` の SQL がすべて。変えるときは新しい番号のファイルを足し、SQL Editor で実行する。準備の手順は `supabase/README.md`。
- 列は snake_case、アプリの型は camelCase。変換は `src/lib/farm-api.ts` と `src/lib/cafe-api.ts` の中だけで行う。
- 種を蒔く（`sow_seed`）・水やり（`water_seed`）・ありがとう（`say_thanks`）・手紙の通報（`report_letter`）・データ削除（`delete_my_account`）は RPC。条件に合わないと 'taken' 'gone' 'already' 'full' 'blocked' の例外が Error になって届く。村人名は RPC の中で profiles から読む。
- 手紙の既読・カフェの状態・通報の確認済みは、列ごとの権限で status などの列だけ更新できる。カフェの状態の変え方はトリガー（`check_cafe_status`）で確かめる。
- 画面の更新は Supabase Realtime（seeds・letters・crops・blocks）。変化が届いたら一覧を読み直す（`src/state/farm.tsx`）。

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
| DB | Supabase（Postgres。RLS で守る） |
| 認証 | Supabase Auth の匿名サインイン。セッションは AsyncStorage（Web では localStorage） |
| ビルド・提出 | EAS Build / EAS Submit |

（ここから下は iPhone版から引き継いだ説明。Firebase・Firestore と書いてある所は、Web版では Supabase に読み替える）

## 決まっている仕様

- マップは 16×12 マスの農場。十字ボタンで1マスずつ移動、Aボタンで決定。
- 種は「吃音の苦労」を10行・300字以内。立っているマスに蒔く。1マスに1つ。種IDは `x_y`。
- 他人の種は普段は見えず、2マス以内に近づくと光る。本文は見つけた人だけが読む。
- 水やりは優しい言葉の手紙（10行・300字以内）。1つの種に最大5人、1人1回（Web版は2026年11月から最大100人。`MAX_WATERERS` と `0007`）。手紙はすぐ届く。
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
- データベースへの書き込みは、`supabase/migrations/` の RLS と RPC が許す形だけにする（まとめて書く操作は RPC）。
- `CRISIS_WORDS` と相談窓口の電話番号は1つのファイルにまとめ、公開前に見直せるようにする。
- 秘密情報はない（Supabase の URL と公開用キーは公開されても問題ない）が、`src/lib/supabase.ts` の1か所にまとめる。service_role キーは絶対にアプリに入れない。
