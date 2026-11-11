-- =========================================================
-- 咲いた花を、村のマップに出す（村人みんなに見える）
-- ・種に bloom（咲いた花の id）を持たせる。最初の「ありがとう」で決まり、そのあとは変わらない
-- ・アプリからは書けない（seeds の insert/update は 0001 で取り上げてある）。書くのは say_thanks の中だけ
-- ・何度実行しても同じ結果になる
-- =========================================================
alter table public.seeds add column if not exists bloom text check (char_length(bloom) between 1 and 30);

-- ありがとう。手紙を thanked にして、2人に花を届け、種に咲いた花を記録する
create or replace function public.say_thanks(p_letter_id text, p_crop_type text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  l public.letters;
begin
  if me is null then raise exception 'auth'; end if;
  if char_length(coalesce(p_crop_type, '')) not between 1 and 30 then raise exception 'bad crop'; end if;
  select * into l from public.letters where id = p_letter_id and to_uid = me for update;
  if not found or l.status not in ('unread', 'read') then raise exception 'gone'; end if;
  update public.letters set status = 'thanked' where id = l.id;
  insert into public.crops (id, letter_id, seed_id, crop_type, owner_uids, sower_uid, sower_name,
      waterer_uid, waterer_name, seed_text, letter_text)
    values (l.id, l.id, l.seed_id, p_crop_type, array[me, l.from_uid], me, public.my_name(),
      l.from_uid, l.from_name, l.seed_text, l.text);
  update public.seeds set bloom = p_crop_type where id = l.seed_id and owner_uid = me and bloom is null;
end;
$$;

-- これまでに「ありがとう」で咲いた種にも、いちばん最初の花を入れる
update public.seeds s set bloom = c.crop_type
from (
  select distinct on (seed_id) seed_id, sower_uid, crop_type from public.crops order by seed_id, harvested_at
) c
where s.id = c.seed_id and s.owner_uid = c.sower_uid and s.bloom is null;
