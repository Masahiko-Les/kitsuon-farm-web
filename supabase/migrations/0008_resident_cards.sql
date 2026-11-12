-- =========================================================
-- 住民票（村役場の窓口で書く。1人1枚）
-- ・入力項目は KitsuonmuraWeb_ver2 の住民票にならう（自己紹介・好きなこと・吃音のタイプ・言いにくい音・言いにくい言葉・
--   出やすい場面・出にくい場面・対処法・吃音史）。どれも書かなくてよい
-- ・村人名は profiles から写す（トリガー）。住民票では変えられない
-- ・本人が「ほかの村人に見せる」（is_public）を選んだものだけ、ほかの村人が読める
-- ・status：ok（ふつう）／review（公開を選んでいて、危機的な言葉を含む。運営が確認するまで誰にも見せない）／
--   hidden（通報などで運営が非公開にした。本人が直しても hidden のまま。戻せるのは運営だけ）
-- ・運営が読めるのは、公開を選んでいる住民票だけ（本人だけの住民票は運営にも見せない）
-- ・アカウントを消すと一緒に消える（on delete cascade）
-- ・何度実行しても同じ結果になる
-- =========================================================
create table if not exists public.resident_cards (
  uid uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  villager_name text not null default '',
  is_public boolean not null default false,
  status text not null default 'ok' check (status in ('ok', 'review', 'hidden')),
  bio text not null default '' check (char_length(bio) <= 300),
  favorite_things text not null default '' check (char_length(favorite_things) <= 300),
  stutter_types text[] not null default '{}'
    check (stutter_types <@ array['難発', '連発', '伸発', 'その他']::text[]),
  difficult_sounds text[] not null default '{}' check (cardinality(difficult_sounds) <= 80),
  difficult_words text[] not null default '{}'
    check (cardinality(difficult_words) <= 20 and char_length(array_to_string(difficult_words, '')) <= 400),
  difficult_situations text not null default '' check (char_length(difficult_situations) <= 300),
  easy_situations text not null default '' check (char_length(easy_situations) <= 300),
  coping_strategies text not null default '' check (char_length(coping_strategies) <= 300),
  stutter_history text not null default '' check (char_length(stutter_history) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists resident_cards_public on public.resident_cards (is_public, status, updated_at);

-- 村人名を写し、更新日時を入れる。hidden は運営だけが付け外しできる
create or replace function public.resident_card_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select villager_name into new.villager_name from public.profiles where id = new.uid;
  new.villager_name := coalesce(new.villager_name, '');
  new.updated_at := now();
  if not public.is_admin() then
    if tg_op = 'UPDATE' and old.status = 'hidden' then
      new.status := 'hidden';
    elsif new.status = 'hidden' then
      raise exception 'hidden';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists resident_card_guard on public.resident_cards;
create trigger resident_card_guard before insert or update on public.resident_cards
  for each row execute function public.resident_card_guard();

alter table public.resident_cards enable row level security;
revoke all on public.resident_cards from anon;

drop policy if exists "resident_cards: 自分・公開中・運営" on public.resident_cards;
create policy "resident_cards: 自分・公開中・運営" on public.resident_cards for select to authenticated
  using (uid = auth.uid() or (is_public and status = 'ok') or (is_public and public.is_admin()));
drop policy if exists "resident_cards: 本人が作る" on public.resident_cards;
create policy "resident_cards: 本人が作る" on public.resident_cards for insert to authenticated
  with check (uid = auth.uid() and status in ('ok', 'review'));
drop policy if exists "resident_cards: 本人か運営が直す" on public.resident_cards;
create policy "resident_cards: 本人か運営が直す" on public.resident_cards for update to authenticated
  using (uid = auth.uid() or (is_public and public.is_admin()))
  with check (uid = auth.uid() or public.is_admin());
drop policy if exists "resident_cards: 本人が消す" on public.resident_cards;
create policy "resident_cards: 本人が消す" on public.resident_cards for delete to authenticated
  using (uid = auth.uid());

-- 住民票も通報できるようにする（target_id は住民票の uid）
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('seed', 'letter', 'cafeAnswer', 'devIdea', 'residentCard'));
