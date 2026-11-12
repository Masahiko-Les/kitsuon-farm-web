-- =========================================================
-- 吃音村の人口（住民票を書いた人数）。村役場の係員が伝える
-- ・本人だけが読める住民票も数える。返すのは人数だけで、中身や誰かは返さない
-- ・何度実行しても同じ結果になる
-- =========================================================
create or replace function public.resident_count()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.resident_cards;
$$;
revoke execute on function public.resident_count() from public, anon;
grant execute on function public.resident_count() to authenticated;
