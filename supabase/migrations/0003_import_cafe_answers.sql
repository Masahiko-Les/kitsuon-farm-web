-- =========================================================
-- 吃音村カフェ：村人の言葉を取り込む（10シリーズ・30件）
-- 運営が受け取った、実際の村人の言葉。アカウントがないので uid は空、書き手は author_key で区別する。
-- 状態は pending（確認待ち）。アプリの「運営：カフェの言葉の確認」で承認すると public になり、カフェに出る。
-- 先に 0002_imported_answers.sql を実行しておくこと。何度実行しても二重には入らない。
-- =========================================================
insert into public.cafe_answers (uid, author_key, session_id, theme_id, question_id, text, status, created_at)
select null, v.author_key, v.session_id, v.theme_id, v.question_id, v.text, 'pending', v.created_at
from (values
  -- stutter シリーズ1｜職場の電話 Q1
  ('import-stutter-1', 'import-stutter-1', 'stutter', 'stutter-1', '仕事で電話に出たとき、会社名を言おうとして言葉が出ませんでした。相手を待たせていると思うと、余計に緊張してしまいます。', timestamptz '2026-11-10 12:00:00+09' + interval '0 seconds'),
  -- stutter シリーズ1｜職場の電話 Q2
  ('import-stutter-1', 'import-stutter-1', 'stutter', 'stutter-2', '電話が終わったあと、うまく話せなかったことばかり考えずに、ちゃんと対応できたことを考えるようにしています。', timestamptz '2026-11-10 12:00:00+09' + interval '1 seconds'),
  -- stutter シリーズ1｜職場の電話 Q3
  ('import-stutter-1', 'import-stutter-1', 'stutter', 'stutter-3', '今日もよく頑張ったね。言葉が詰まっても、ちゃんと仕事はできているよ。', timestamptz '2026-11-10 12:00:00+09' + interval '2 seconds'),
  -- stutter シリーズ2｜大学での発表 Q1
  ('import-stutter-2', 'import-stutter-2', 'stutter', 'stutter-1', '大学の授業で発表したとき、途中で言葉が出なくなりました。周りの人は普通に話せるのに、どうして自分だけこんなに苦労するんだろうと思いました。', timestamptz '2026-11-10 12:00:00+09' + interval '3 seconds'),
  -- stutter シリーズ2｜大学での発表 Q2
  ('import-stutter-2', 'import-stutter-2', 'stutter', 'stutter-2', '好きな音楽を聴いているときは、吃音のことを少し忘れられます。何も考えずに音楽に浸れる時間が好きです。', timestamptz '2026-11-10 12:00:00+09' + interval '4 seconds'),
  -- stutter シリーズ2｜大学での発表 Q3
  ('import-stutter-2', 'import-stutter-2', 'stutter', 'stutter-3', '発表、逃げずに最後までできたじゃん。頑張ったね。', timestamptz '2026-11-10 12:00:00+09' + interval '5 seconds'),
  -- stutter シリーズ3｜初対面の人との食事 Q1
  ('import-stutter-3', 'import-stutter-3', 'stutter', 'stutter-1', '初対面の人と食事をしたとき、吃音が気になりました。でも、以前よりも自分の話したいことを話せた気がして、少し嬉しかったです。', timestamptz '2026-11-10 12:00:00+09' + interval '6 seconds'),
  -- stutter シリーズ3｜初対面の人との食事 Q2
  ('import-stutter-3', 'import-stutter-3', 'stutter', 'stutter-2', '最近は、話し始める前に吃音があることを伝えるようにしています。隠さなくてもいいと思えると、少し楽になります。', timestamptz '2026-11-10 12:00:00+09' + interval '7 seconds'),
  -- stutter シリーズ3｜初対面の人との食事 Q3
  ('import-stutter-3', 'import-stutter-3', 'stutter', 'stutter-3', '少しずつだけど、自分のことを好きになれている気がする。その調子でいいよ。', timestamptz '2026-11-10 12:00:00+09' + interval '8 seconds'),
  -- stutter シリーズ4｜友人グループ Q1
  ('import-stutter-4', 'import-stutter-4', 'stutter', 'stutter-1', '友達数人で話しているとき、会話のテンポが速くて入れませんでした。言いたいことはあったけれど、結局黙ってしまいました。', timestamptz '2026-11-10 12:00:00+09' + interval '9 seconds'),
  -- stutter シリーズ4｜友人グループ Q2
  ('import-stutter-4', 'import-stutter-4', 'stutter', 'stutter-2', '大人数よりも二人で話すときの方が安心できます。言葉を待ってくれる友達と話していると、ほっとします。', timestamptz '2026-11-10 12:00:00+09' + interval '10 seconds'),
  -- stutter シリーズ4｜友人グループ Q3
  ('import-stutter-4', 'import-stutter-4', 'stutter', 'stutter-3', 'もう少し自分の気持ちを大切にしてあげてね。無理して周りに合わせなくてもいいよ。', timestamptz '2026-11-10 12:00:00+09' + interval '11 seconds'),
  -- stutter シリーズ5｜日常の買い物 Q1
  ('import-stutter-5', 'import-stutter-5', 'stutter', 'stutter-1', 'コンビニで注文するときに言葉が詰まって、店員さんに聞き返されました。余計に焦ってしまって、嫌な気持ちになりました。', timestamptz '2026-11-10 12:00:00+09' + interval '12 seconds'),
  -- stutter シリーズ5｜日常の買い物 Q2
  ('import-stutter-5', 'import-stutter-5', 'stutter', 'stutter-2', '今のところ、特に工夫は見つかっていません。家で一人で過ごしているときが、一番気楽かもしれません。', timestamptz '2026-11-10 12:00:00+09' + interval '13 seconds'),
  -- stutter シリーズ5｜日常の買い物 Q3
  ('import-stutter-5', 'import-stutter-5', 'stutter', 'stutter-3', '普通に話せるようになりたい。いつか吃音のことを気にせず過ごせたらいいな。', timestamptz '2026-11-10 12:00:00+09' + interval '14 seconds'),
  -- chat シリーズ1｜読書 Q1
  ('import-chat-1', 'import-chat-1', 'chat', 'chat-1', '読書が好きです。特に小説を読むことが多いです。休日にカフェでゆっくり本を読む時間が好きです。', timestamptz '2026-11-10 12:00:00+09' + interval '15 seconds'),
  -- chat シリーズ1｜読書 Q2
  ('import-chat-1', 'import-chat-1', 'chat', 'chat-2', '自分とは違う人生を体験できるところです。本を読んでいると、新しい考え方に出会えて、世界が少し広がるような気がします。', timestamptz '2026-11-10 12:00:00+09' + interval '16 seconds'),
  -- chat シリーズ1｜読書 Q3
  ('import-chat-1', 'import-chat-1', 'chat', 'chat-3', '一人旅をしてみたいです。知らない街を歩いたり、喫茶店で本を読んだりして、のんびり過ごしてみたいです。', timestamptz '2026-11-10 12:00:00+09' + interval '17 seconds'),
  -- chat シリーズ2｜料理 Q1
  ('import-chat-2', 'import-chat-2', 'chat', 'chat-1', '料理が好きです。最近はスパイスカレーを作ることにハマっています。', timestamptz '2026-11-10 12:00:00+09' + interval '18 seconds'),
  -- chat シリーズ2｜料理 Q2
  ('import-chat-2', 'import-chat-2', 'chat', 'chat-2', '自分でいろいろ工夫したことが、味になって返ってくるところが面白いです。失敗することもありますが、それも含めて楽しいです。', timestamptz '2026-11-10 12:00:00+09' + interval '19 seconds'),
  -- chat シリーズ2｜料理 Q3
  ('import-chat-2', 'import-chat-2', 'chat', 'chat-3', '家庭菜園をやってみたいです。自分で育てた野菜を収穫して、それを使って料理を作れたら楽しそうです。', timestamptz '2026-11-10 12:00:00+09' + interval '20 seconds'),
  -- chat シリーズ3｜ゲーム Q1
  ('import-chat-3', 'import-chat-3', 'chat', 'chat-1', 'ゲームが好きです。特に、どうぶつの森みたいなのんびりしたゲームが好きです。', timestamptz '2026-11-10 12:00:00+09' + interval '21 seconds'),
  -- chat シリーズ3｜ゲーム Q2
  ('import-chat-3', 'import-chat-3', 'chat', 'chat-2', '自分のペースで自由に過ごせるところです。ゲームの中で他の人と交流するのも、現実とは違った安心感があります。', timestamptz '2026-11-10 12:00:00+09' + interval '22 seconds'),
  -- chat シリーズ3｜ゲーム Q3
  ('import-chat-3', 'import-chat-3', 'chat', 'chat-3', 'キャンプに行くのを楽しみにしています。自然の中で焚き火を眺めながら、ゆっくり過ごしてみたいです。', timestamptz '2026-11-10 12:00:00+09' + interval '23 seconds'),
  -- chat シリーズ4｜散歩と写真 Q1
  ('import-chat-4', 'import-chat-4', 'chat', 'chat-1', '散歩しながら写真を撮るのが好きです。近所を歩いて、花や夕焼けを撮ったりしています。', timestamptz '2026-11-10 12:00:00+09' + interval '24 seconds'),
  -- chat シリーズ4｜散歩と写真 Q2
  ('import-chat-4', 'import-chat-4', 'chat', 'chat-2', '普段は見過ごしてしまうような小さな発見があるところです。同じ道でも季節によって景色が違うので面白いです。', timestamptz '2026-11-10 12:00:00+09' + interval '25 seconds'),
  -- chat シリーズ4｜散歩と写真 Q3
  ('import-chat-4', 'import-chat-4', 'chat', 'chat-3', '山登りに挑戦してみたいです。山頂から朝日を見るのが憧れです。', timestamptz '2026-11-10 12:00:00+09' + interval '26 seconds'),
  -- chat シリーズ5｜食べること Q1
  ('import-chat-5', 'import-chat-5', 'chat', 'chat-1', 'これといった趣味はないのですが、おいしいものを食べるのは好きです。特にラーメンが好きです。', timestamptz '2026-11-10 12:00:00+09' + interval '27 seconds'),
  -- chat シリーズ5｜食べること Q2
  ('import-chat-5', 'import-chat-5', 'chat', 'chat-2', 'おいしいものを食べていると、余計なことを考えずに済みます。それだけで、今日はいい日だったなと思えることがあります。', timestamptz '2026-11-10 12:00:00+09' + interval '28 seconds'),
  -- chat シリーズ5｜食べること Q3
  ('import-chat-5', 'import-chat-5', 'chat', 'chat-3', '近所の市民プールに行って、久しぶりに泳いでみたいです。体を動かす趣味も見つけたいと思っています。', timestamptz '2026-11-10 12:00:00+09' + interval '29 seconds')
) as v (author_key, session_id, theme_id, question_id, text, created_at)
where not exists (
  select 1 from public.cafe_answers a where a.session_id = v.session_id and a.question_id = v.question_id
);

-- 確認：30 と出れば全部入っている
select count(*) as 取り込んだ言葉 from public.cafe_answers where author_key like 'import-%';
