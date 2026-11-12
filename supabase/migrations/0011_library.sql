-- =========================================================
-- 図書館（2026年11月）
-- ・library_books：司書に伝えた「並べたい本」の希望。運営（村長）が public にしたものだけ、棚に並ぶ
--   最初から棚にある本はアプリの中（src/lib/library.ts）にあり、ここには入れない
-- ・library_reviews：吃音の本の棚の本への感想。book_id は最初からある本の id（"s-kiyoshiko" など）か、library_books の id
-- ・library_notes：テーブルのノート。心に残った文章と、そのときの心境や状況
-- ・感想とノートはすぐ並ぶ（ok）。危機的な言葉を含むものは review で保存して誰にも見せない。運営は hidden にできる
-- ・どれも名前は持たない。アカウントを消すと一緒に消える（on delete cascade）
-- ・何度実行しても同じ結果になる
-- =========================================================
create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  shelf text not null check (shelf in ('stutter', 'heart')),
  title text not null check (char_length(title) between 1 and 60),
  author text not null default '' check (char_length(author) <= 40),
  reason text not null default '' check (char_length(reason) <= 600),
  status text not null check (status in ('pending', 'public', 'private', 'review')),
  created_at timestamptz not null default now()
);
create index if not exists library_books_status on public.library_books (status, created_at);

create table if not exists public.library_reviews (
  id uuid primary key default gen_random_uuid(),
  book_id text not null check (char_length(book_id) between 1 and 64),
  uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 600),
  status text not null check (status in ('ok', 'review', 'hidden')),
  created_at timestamptz not null default now()
);
create index if not exists library_reviews_book on public.library_reviews (book_id, created_at);

create table if not exists public.library_notes (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  quote text not null check (char_length(quote) between 1 and 600),
  feeling text not null default '' check (char_length(feeling) <= 600),
  status text not null check (status in ('ok', 'review', 'hidden')),
  created_at timestamptz not null default now()
);
create index if not exists library_notes_status on public.library_notes (status, created_at);

alter table public.library_books enable row level security;
alter table public.library_reviews enable row level security;
alter table public.library_notes enable row level security;
revoke all on public.library_books, public.library_reviews, public.library_notes from anon;

-- 本の希望：棚に並んだもの・自分の希望・運営
drop policy if exists "library_books: 棚・自分の・運営" on public.library_books;
create policy "library_books: 棚・自分の・運営" on public.library_books for select to authenticated
  using (status = 'public' or uid = auth.uid() or public.is_admin());
drop policy if exists "library_books: 本人が希望する" on public.library_books;
create policy "library_books: 本人が希望する" on public.library_books for insert to authenticated
  with check (uid = auth.uid() and status in ('pending', 'review'));
drop policy if exists "library_books: 運営が状態を変える" on public.library_books;
create policy "library_books: 運営が状態を変える" on public.library_books for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and status in ('public', 'private'));
drop policy if exists "library_books: 本人か運営が消す" on public.library_books;
create policy "library_books: 本人か運営が消す" on public.library_books for delete to authenticated
  using (uid = auth.uid() or public.is_admin());

-- 感想：ふつうのもの・自分の・運営
drop policy if exists "library_reviews: 読む" on public.library_reviews;
create policy "library_reviews: 読む" on public.library_reviews for select to authenticated
  using (status = 'ok' or uid = auth.uid() or public.is_admin());
drop policy if exists "library_reviews: 本人が書く" on public.library_reviews;
create policy "library_reviews: 本人が書く" on public.library_reviews for insert to authenticated
  with check (uid = auth.uid() and status in ('ok', 'review'));
drop policy if exists "library_reviews: 運営が状態を変える" on public.library_reviews;
create policy "library_reviews: 運営が状態を変える" on public.library_reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "library_reviews: 本人か運営が消す" on public.library_reviews;
create policy "library_reviews: 本人か運営が消す" on public.library_reviews for delete to authenticated
  using (uid = auth.uid() or public.is_admin());

-- ノート：ふつうのもの・自分の・運営
drop policy if exists "library_notes: 読む" on public.library_notes;
create policy "library_notes: 読む" on public.library_notes for select to authenticated
  using (status = 'ok' or uid = auth.uid() or public.is_admin());
drop policy if exists "library_notes: 本人が書く" on public.library_notes;
create policy "library_notes: 本人が書く" on public.library_notes for insert to authenticated
  with check (uid = auth.uid() and status in ('ok', 'review'));
drop policy if exists "library_notes: 運営が状態を変える" on public.library_notes;
create policy "library_notes: 運営が状態を変える" on public.library_notes for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "library_notes: 本人か運営が消す" on public.library_notes;
create policy "library_notes: 本人か運営が消す" on public.library_notes for delete to authenticated
  using (uid = auth.uid() or public.is_admin());

-- 書き換えられるのは状態だけ（運営）
revoke update on public.library_books, public.library_reviews, public.library_notes from authenticated;
grant update (status) on public.library_books, public.library_reviews, public.library_notes to authenticated;

-- 感想とノートも通報できるようにする
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('seed', 'letter', 'cafeAnswer', 'devIdea', 'residentCard', 'libraryReview', 'libraryNote'));
