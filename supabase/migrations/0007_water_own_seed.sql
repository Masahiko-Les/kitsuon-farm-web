-- =========================================================
-- 種を蒔いた人も、自分の種に水やりできるようにする（2026年11月）
-- ・自分への水やりは1回だけ。「1つの種に最大100人」の枠には数えない（water_count・waterers は増やさない）
-- ・手紙はほかの村人の手紙と同じように、自分の郵便受けに届く。「ありがとう」で花が咲く（say_thanks はそのまま）
-- ・1つの種に水やりできる人数の上限を、5人から100人にする（1人1回はそのまま。game.ts の MAX_WATERERS と同じ）
-- ・何度実行しても同じ結果になる
-- =========================================================
alter table public.seeds drop constraint if exists seeds_water_count_check;
alter table public.seeds add constraint seeds_water_count_check check (water_count between 0 and 100);

create or replace function public.water_seed(p_seed_id text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  s public.seeds;
  body text;
  lid text;
begin
  if me is null then raise exception 'auth'; end if;
  select * into s from public.seeds where id = p_seed_id for update;
  if not found or s.status <> 'public' then raise exception 'gone'; end if;
  lid := s.id || '_' || me::text;
  select text into body from public.seed_bodies where seed_id = s.id;

  -- 自分の種：枠の外で1回だけ
  if s.owner_uid = me then
    if exists (select 1 from public.letters where id = lid) then raise exception 'already'; end if;
    insert into public.letters (id, seed_id, to_uid, to_name, from_uid, from_name, seed_text, text)
      values (lid, s.id, me, s.owner_name, me, public.my_name(), coalesce(body, ''), p_text);
    return;
  end if;

  -- ほかの村人の種：1人1回、最大100人まで（game.ts の MAX_WATERERS と同じ）。持ち主にブロックされていたら届けない
  if me = any (s.waterers) then raise exception 'already'; end if;
  if s.water_count >= 100 then raise exception 'full'; end if;
  if exists (select 1 from public.blocks where owner_uid = s.owner_uid and blocked_uid = me) then
    raise exception 'blocked';
  end if;
  update public.seeds set water_count = water_count + 1, waterers = waterers || me where id = s.id;
  insert into public.letters (id, seed_id, to_uid, to_name, from_uid, from_name, seed_text, text)
    values (lid, s.id, s.owner_uid, s.owner_name, me, public.my_name(), coalesce(body, ''), p_text);
end;
$$;
