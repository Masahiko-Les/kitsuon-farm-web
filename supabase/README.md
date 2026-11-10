# Supabase と Vercel の準備（はじめに一度だけ）

## 1. Supabase のプロジェクトを作る
1. https://supabase.com/dashboard で「New project」。
   - Name：kitsuon-farm（自由）
   - Database Password：自動生成のままでよい（アプリでは使わない。念のため控えておく）
   - Region：**Northeast Asia (Tokyo)**（プライバシーポリシーに東京と書いているため）
2. できあがるまで数分待つ。

## 2. 匿名サインインを有効にする
- 左の Authentication → Sign In / Providers（または Providers）→「Allow anonymous sign-ins」をオンにして保存。

## 3. テーブルを作る
- 左の SQL Editor →「New query」に `migrations/0001_init.sql` の中身をまるごと貼り、Run。
- 「Success. No rows returned」と出れば完了。

## 4. URL と公開用キーをアプリに入れる
- 上の「Connect」か、Project Settings → API Keys / Data API で次の2つを確かめる。
  - Project URL（`https://xxxx.supabase.co`）
  - 公開用キー（`sb_publishable_...`、または anon public キー）
- `src/lib/supabase.ts` の `SUPABASE_URL` と `SUPABASE_KEY` に入れる。
- **service_role / secret キーは絶対に入れない**（RLS を素通りできる鍵）。

## 5. 運営を登録する（カフェの言葉の確認画面を使う人）
1. Web版を開き、設定画面のいちばん下の「村人ID」をコピーする。
2. Supabase の SQL Editor で次を実行する（ID を置き換える）。
   ```sql
   insert into public.admins (uid) values ('ここに村人ID');
   ```
3. Web版を開き直すと、設定に「運営：カフェの言葉の確認」が出る。

## 6. Vercel で公開する
1. https://vercel.com/new で GitHub の `Masahiko-Les/kitsuon-farm-web` を Import。
2. Framework Preset は「Other」。ビルドの設定は `vercel.json` に書いてあるので、そのまま Deploy。
3. 以後は main に push するたびに自動で公開される。
