-- =========================================================
-- 種を蒔いた人の村人名を、誰にも渡さない（2026年11月）
-- ・種（seeds.owner_name）、手紙の宛名（letters.to_name）、花の記録（crops.sower_name）を空にする
-- ・これから書き込まれるものも、トリガーで空にする（sow_seed・water_seed・say_thanks はそのまま）
-- ・手紙を書いた人の名前（letters.from_name・crops.waterer_name）は残す（郵便受けとブロックに使う）
-- ・何度実行しても同じ結果になる
-- =========================================================
create or replace function public.blank_sower_name()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'seeds' then new.owner_name := '';
  elsif tg_table_name = 'letters' then new.to_name := '';
  elsif tg_table_name = 'crops' then new.sower_name := '';
  end if;
  return new;
end;
$$;

drop trigger if exists blank_sower_name on public.seeds;
create trigger blank_sower_name before insert or update on public.seeds
  for each row execute function public.blank_sower_name();
drop trigger if exists blank_sower_name on public.letters;
create trigger blank_sower_name before insert or update on public.letters
  for each row execute function public.blank_sower_name();
drop trigger if exists blank_sower_name on public.crops;
create trigger blank_sower_name before insert or update on public.crops
  for each row execute function public.blank_sower_name();

update public.seeds set owner_name = '' where owner_name <> '';
update public.letters set to_name = '' where to_name <> '';
update public.crops set sower_name = '' where sower_name <> '';
