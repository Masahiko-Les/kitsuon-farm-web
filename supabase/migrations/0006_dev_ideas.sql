-- =========================================================
-- 開発局のアイデア（吃音村を良くするための、村人の意見）
-- ・村人は書くだけ（pending）。運営が確かめて public にしたものだけが、ほかの村人の黒板に並ぶ
-- ・書いた本人には、自分のアイデアが「確認中」として見える
-- ・危機的な言葉を含むものは review で保存し、誰の黒板にも出さない
-- ・名前は持たない。アカウントを消すと一緒に消える（on delete cascade）
-- ・何度実行しても同じ結果になる
-- =========================================================
create table if not exists public.dev_ideas (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 600),
  status text not null check (status in ('pending', 'public', 'private', 'review')),
  created_at timestamptz not null default now()
);
create index if not exists dev_ideas_status on public.dev_ideas (status, created_at);
create index if not exists dev_ideas_uid on public.dev_ideas (uid);

alter table public.dev_ideas enable row level security;
revoke all on public.dev_ideas from anon;

drop policy if exists "dev_ideas: 公開中・自分の・運営" on public.dev_ideas;
create policy "dev_ideas: 公開中・自分の・運営" on public.dev_ideas for select to authenticated
  using (status = 'public' or uid = auth.uid() or public.is_admin());
drop policy if exists "dev_ideas: 本人が書く" on public.dev_ideas;
create policy "dev_ideas: 本人が書く" on public.dev_ideas for insert to authenticated
  with check (uid = auth.uid() and status in ('pending', 'review'));
-- 状態を変えるのは運営だけ（承認する public か、承認しない private）
drop policy if exists "dev_ideas: 運営が状態を変える" on public.dev_ideas;
create policy "dev_ideas: 運営が状態を変える" on public.dev_ideas for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and status in ('public', 'private'));
drop policy if exists "dev_ideas: 本人か運営が消す" on public.dev_ideas;
create policy "dev_ideas: 本人か運営が消す" on public.dev_ideas for delete to authenticated
  using (uid = auth.uid() or public.is_admin());
revoke update on public.dev_ideas from authenticated;
grant update (status) on public.dev_ideas to authenticated;

-- 黒板のアイデアも通報できるようにする
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('seed', 'letter', 'cafeAnswer', 'devIdea'));
