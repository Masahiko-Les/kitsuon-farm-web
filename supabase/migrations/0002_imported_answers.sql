-- =========================================================
-- 吃音村：アカウントのない村人の言葉を、カフェに取り込めるようにする
-- （例：以前のアプリやアンケートで集め、本人が公開に同意した言葉）
--
-- ・cafe_answers.uid を空でもよいことにする。取り込んだ言葉は uid が空で、author_key で書き手を区別する
--   （カフェは「1人1シリーズまで」読ませるので、その区別に使う）。
-- ・uid が空の言葉には、気持ちを届けられない（cafe_reactions は to_uid が必要。アプリでもボタンを出さない）。
-- ・アプリから作る言葉は、これまでどおり uid = 本人でなければ作れない（RLS は変えない）。
-- =========================================================
alter table public.cafe_answers alter column uid drop not null;
alter table public.cafe_answers add column author_key text;
alter table public.cafe_answers add constraint cafe_answers_has_author
  check (uid is not null or author_key is not null);
