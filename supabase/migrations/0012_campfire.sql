-- =========================================================
-- 焚き火のひとこと（2026年11月）
-- ・広場の焚き火に薪をくべるとき、ひとこと（200字以内）を残せる。焚き火のまわりの村人みんなが読める
-- ・ほかの村人に見えるのは、残してから24時間のあいだだけ（RLS で決める）。本人にも24時間で見えなくなる
-- ・通報を運営が確かめられるよう、データは7日間だけ残し、それより古いものは次に誰かが薪をくべたときに消す
-- ・危機的な言葉を含むものは review で保存して誰にも見せない。運営は hidden にできる
-- ・名前は持たない。アカウントを消すと一緒に消える（on delete cascade）
-- ・何度実行しても同じ結果になる
-- =========================================================
create table if not exists public.campfire_messages (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 200),
  status text not null check (status in ('ok', 'review', 'hidden')),
  created_at timestamptz not null default now()
);
create index if not exists campfire_messages_created on public.campfire_messages (created_at);

alter table public.campfire_messages enable row level security;
revoke all on public.campfire_messages from anon;

-- 24時間以内のもの（ふつうのものと自分のもの）。運営はすべて
drop policy if exists "campfire: 読む" on public.campfire_messages;
create policy "campfire: 読む" on public.campfire_messages for select to authenticated
  using (
    ((status = 'ok' or uid = auth.uid()) and created_at > now() - interval '24 hours')
    or public.is_admin()
  );
drop policy if exists "campfire: 本人が書く" on public.campfire_messages;
create policy "campfire: 本人が書く" on public.campfire_messages for insert to authenticated
  with check (uid = auth.uid() and status in ('ok', 'review'));
drop policy if exists "campfire: 運営が状態を変える" on public.campfire_messages;
create policy "campfire: 運営が状態を変える" on public.campfire_messages for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "campfire: 本人か運営が消す" on public.campfire_messages;
create policy "campfire: 本人か運営が消す" on public.campfire_messages for delete to authenticated
  using (uid = auth.uid() or public.is_admin());

revoke update on public.campfire_messages from authenticated;
grant update (status) on public.campfire_messages to authenticated;

-- 7日より古いひとことを消す（薪をくべるたびに動く）
create or replace function public.campfire_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.campfire_messages where created_at < now() - interval '7 days';
  return null;
end;
$$;
drop trigger if exists campfire_cleanup on public.campfire_messages;
create trigger campfire_cleanup after insert on public.campfire_messages
  for each statement execute function public.campfire_cleanup();

-- 焚き火のひとことも通報できるようにする
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('seed', 'letter', 'cafeAnswer', 'devIdea', 'residentCard', 'libraryReview', 'libraryNote', 'campfireMessage'));
