-- =========================================================
-- 吃音農場 Web版：データベースの初期設定（Supabase）
-- Supabase の SQL Editor にこのファイルをまるごと貼って、Run を押してください。
--
-- ・守りはすべて RLS（行ごとの権限）と、列ごとの権限で行う。アプリに秘密の鍵はない。
-- ・複数の行をまとめて書く操作（種を蒔く・水やり・ありがとう・手紙の通報・データ削除）は、
--   Postgres の関数（RPC）にして、途中で失敗しても半端な状態が残らないようにする。
-- ・村人のデータは auth.users につないでいて、アカウントを消すと一緒に消える（on delete cascade）。
-- ・村人名は、種・手紙・作物に書き込むときに profiles から読む（アプリから送られた名前は使わない）。
-- =========================================================

-- ---------- 共通 ----------

-- 運営。Table Editor か SQL で、運営の村人ID（設定画面の下に表示）を1行入れる。アプリからは書けない
create table public.admins (
  uid uuid primary key references auth.users (id) on delete cascade
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where uid = auth.uid());
$$;

-- 村人
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  villager_name text not null check (char_length(villager_name) between 1 and 12),
  terms_version int not null default 0,
  created_at timestamptz not null default now(),
  agreed_at timestamptz
);

-- ブロック（owner_uid が blocked_uid をブロックした）
create table public.blocks (
  owner_uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_uid uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_uid, blocked_uid)
);

-- ---------- 農場 ----------

-- 種（位置と状態）。ID は「x_y」で、1マスに1つだけ
create table public.seeds (
  id text primary key,
  owner_uid uuid not null references auth.users (id) on delete cascade,
  owner_name text not null,
  map_id text not null,
  x int not null,
  y int not null,
  status text not null check (status in ('public', 'review', 'hidden')),
  water_count int not null default 0 check (water_count between 0 and 5),
  waterers uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  check (id = x::text || '_' || y::text)
);
create index seeds_status on public.seeds (status);
create index seeds_owner on public.seeds (owner_uid);

-- 種の本文。見つけた人だけが読む
create table public.seed_bodies (
  seed_id text primary key references public.seeds (id) on delete cascade,
  owner_uid uuid not null,
  text text not null check (char_length(text) between 1 and 600)
);

-- 水やりの手紙。ID は「種ID_送り主uid」
create table public.letters (
  id text primary key,
  seed_id text not null,
  to_uid uuid not null references auth.users (id) on delete cascade,
  to_name text not null,
  from_uid uuid not null references auth.users (id) on delete cascade,
  from_name text not null,
  seed_text text not null default '',
  text text not null check (char_length(text) between 1 and 600),
  status text not null default 'unread' check (status in ('unread', 'read', 'thanked', 'reported')),
  created_at timestamptz not null default now()
);
create index letters_to on public.letters (to_uid);
create index letters_from on public.letters (from_uid);

-- 作物。ID は手紙の ID と同じ。「ありがとう」と同時に作られ、2人の思い出帳に入る
create table public.crops (
  id text primary key,
  letter_id text not null,
  seed_id text not null,
  crop_type text not null,
  owner_uids uuid[] not null,
  sower_uid uuid not null,
  sower_name text not null,
  waterer_uid uuid not null,
  waterer_name text not null,
  seed_text text not null default '',
  letter_text text not null,
  harvested_at timestamptz not null default now()
);
create index crops_owners on public.crops using gin (owner_uids);
create index crops_sower on public.crops (sower_uid);
create index crops_waterer on public.crops (waterer_uid);

-- 通報（種・手紙・カフェの言葉）
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('seed', 'letter', 'cafeAnswer')),
  target_id text not null,
  reporter_uid uuid not null default auth.uid(),
  handled boolean not null default false,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index reports_type on public.reports (target_type);

-- ---------- 吃音村カフェ ----------

-- カフェの回答。名前は持たない。session_id が同じ回答が3問1シリーズ
create table public.cafe_answers (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id text not null,
  theme_id text not null,
  question_id text not null,
  text text not null check (char_length(text) between 1 and 600),
  status text not null check (status in ('draft', 'pending', 'public', 'private', 'review')),
  created_at timestamptz not null default now()
);
create index cafe_answers_theme on public.cafe_answers (theme_id, status);
create index cafe_answers_uid on public.cafe_answers (uid);
create index cafe_answers_session on public.cafe_answers (session_id);

-- 回答に届けた気持ち。ID は「回答ID_送り主uid」で、1人1つ（選び直しは kind だけ変わる）
create table public.cafe_reactions (
  id text primary key,
  answer_id uuid not null references public.cafe_answers (id) on delete cascade,
  to_uid uuid not null references auth.users (id) on delete cascade,
  from_uid uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('empathy', 'courage', 'discovery', 'thanks')),
  created_at timestamptz not null default now()
);
create index cafe_reactions_to on public.cafe_reactions (to_uid);
create index cafe_reactions_from on public.cafe_reactions (from_uid);

-- =========================================================
-- 権限（RLS）
-- =========================================================
alter table public.admins enable row level security;
alter table public.profiles enable row level security;
alter table public.blocks enable row level security;
alter table public.seeds enable row level security;
alter table public.seed_bodies enable row level security;
alter table public.letters enable row level security;
alter table public.crops enable row level security;
alter table public.reports enable row level security;
alter table public.cafe_answers enable row level security;
alter table public.cafe_reactions enable row level security;

-- ログインしていない人（anon）には何も見せない。匿名サインインした村人は authenticated
revoke all on all tables in schema public from anon;

-- 運営かどうかは、自分の行だけ確かめられる
create policy "admins: 自分の行" on public.admins for select to authenticated
  using (uid = auth.uid());

-- 村人。村人名はほかの村人に見せない（種・手紙には書き込み時に写している）
create policy "profiles: 本人が読む" on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles: 本人が作る" on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles: 本人が直す" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "blocks: 本人だけ" on public.blocks for all to authenticated
  using (owner_uid = auth.uid()) with check (owner_uid = auth.uid());

-- 種：公開中のものと自分のものが見える。作るのは sow_seed、水やりは water_seed だけ
create policy "seeds: 公開中か自分の種" on public.seeds for select to authenticated
  using (status = 'public' or owner_uid = auth.uid());
create policy "seeds: 自分の種を消す" on public.seeds for delete to authenticated
  using (owner_uid = auth.uid());

create policy "seed_bodies: 自分の種か公開中の種" on public.seed_bodies for select to authenticated
  using (owner_uid = auth.uid()
    or exists (select 1 from public.seeds s where s.id = seed_id and s.status = 'public'));

-- 手紙：送った人と受け取った人だけ。受け取った人は「既読」にできる（ありがとう・通報は RPC）
create policy "letters: 送った人と受け取った人" on public.letters for select to authenticated
  using (to_uid = auth.uid() or from_uid = auth.uid());
create policy "letters: 受け取った人が既読にする" on public.letters for update to authenticated
  using (to_uid = auth.uid() and status in ('unread', 'read'))
  with check (to_uid = auth.uid() and status = 'read');
create policy "letters: 送った人と受け取った人が消す" on public.letters for delete to authenticated
  using (to_uid = auth.uid() or from_uid = auth.uid());
revoke insert, update on public.letters from authenticated;
grant update (status) on public.letters to authenticated;

-- 作物：2人の持ち主だけ。作るのは say_thanks だけ
create policy "crops: 持ち主" on public.crops for select to authenticated
  using (auth.uid() = any (owner_uids));
create policy "crops: 持ち主が消す" on public.crops for delete to authenticated
  using (auth.uid() = any (owner_uids));

-- 通報：本人が作れる。運営は読めて、「確認済み」の印だけつけられる
create policy "reports: 本人が通報する" on public.reports for insert to authenticated
  with check (reporter_uid = auth.uid());
create policy "reports: 運営が読む" on public.reports for select to authenticated
  using (public.is_admin());
create policy "reports: 運営が確認済みにする" on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and handled = true);
revoke update on public.reports from authenticated;
grant update (handled, handled_at) on public.reports to authenticated;

-- 種・本文・作物は RPC からだけ書く
revoke insert, update on public.seeds, public.seed_bodies, public.crops from authenticated;

-- カフェの回答
create policy "cafe_answers: 公開中・自分の・運営" on public.cafe_answers for select to authenticated
  using (status = 'public' or uid = auth.uid() or public.is_admin());
create policy "cafe_answers: 本人が残す" on public.cafe_answers for insert to authenticated
  with check (uid = auth.uid() and status in ('draft', 'review'));
create policy "cafe_answers: 本人か運営が状態を変える" on public.cafe_answers for update to authenticated
  using (uid = auth.uid() or public.is_admin())
  with check (uid = auth.uid() or public.is_admin());
create policy "cafe_answers: 本人か運営が消す" on public.cafe_answers for delete to authenticated
  using (uid = auth.uid() or public.is_admin());
revoke update on public.cafe_answers from authenticated;
grant update (status) on public.cafe_answers to authenticated;

-- 状態の変え方。本人：何でも private に、draft を pending に。運営：public か private に。
-- 本人は public にできず、運営が private にした言葉を pending に戻すこともできない
create function public.check_cafe_status() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if; -- SQL Editor（運営の手作業）
  if new.status = old.status then return new; end if;
  if public.is_admin() and new.status in ('public', 'private') then return new; end if;
  if old.uid = auth.uid() and new.status = 'private' then return new; end if;
  if old.uid = auth.uid() and old.status = 'draft' and new.status = 'pending' then return new; end if;
  raise exception 'not allowed';
end;
$$;
create trigger cafe_answers_status before update on public.cafe_answers
  for each row execute function public.check_cafe_status();

-- 気持ち：公開中の、ほかの村人の言葉にだけ届けられる。選び直しも同じ条件で確かめる
create policy "cafe_reactions: 送った人と受け取った人" on public.cafe_reactions for select to authenticated
  using (to_uid = auth.uid() or from_uid = auth.uid());
create policy "cafe_reactions: 届ける" on public.cafe_reactions for insert to authenticated
  with check (
    from_uid = auth.uid()
    and to_uid <> auth.uid()
    and id = answer_id::text || '_' || auth.uid()::text
    and exists (select 1 from public.cafe_answers a where a.id = answer_id and a.status = 'public' and a.uid = to_uid)
  );
create policy "cafe_reactions: 選び直す" on public.cafe_reactions for update to authenticated
  using (from_uid = auth.uid())
  with check (
    from_uid = auth.uid()
    and to_uid <> auth.uid()
    and id = answer_id::text || '_' || auth.uid()::text
    and exists (select 1 from public.cafe_answers a where a.id = answer_id and a.status = 'public' and a.uid = to_uid)
  );
create policy "cafe_reactions: 送った人と受け取った人が消す" on public.cafe_reactions for delete to authenticated
  using (to_uid = auth.uid() or from_uid = auth.uid());

-- =========================================================
-- RPC（アプリから supabase.rpc で呼ぶ）
-- 条件に合わないときは、短い英単語の例外を出す。アプリはそれを見て文言を出し分ける。
-- =========================================================

-- 自分の村人名（なければ 'no profile'）
create function public.my_name() returns text
language plpgsql stable security definer set search_path = public as $$
declare n text;
begin
  select villager_name into n from public.profiles where id = auth.uid();
  if n is null then raise exception 'no profile'; end if;
  return n;
end;
$$;

-- 種を蒔く。種と本文を一緒に作る。そのマスにもう種があれば 'taken'
create function public.sow_seed(p_x int, p_y int, p_text text, p_status text, p_map_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  sid text := p_x::text || '_' || p_y::text;
begin
  if me is null then raise exception 'auth'; end if;
  if p_status not in ('public', 'review') then raise exception 'bad status'; end if;
  begin
    insert into public.seeds (id, owner_uid, owner_name, map_id, x, y, status)
      values (sid, me, public.my_name(), p_map_id, p_x, p_y, p_status);
  exception when unique_violation then
    raise exception 'taken';
  end;
  insert into public.seed_bodies (seed_id, owner_uid, text) values (sid, me, p_text);
end;
$$;

-- 水やり。自分以外の公開中の種に、1人1回、最大5人まで（game.ts の MAX_WATERERS と同じ）。
-- 種の持ち主にブロックされていたら届けない
create function public.water_seed(p_seed_id text, p_text text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  s public.seeds;
  body text;
begin
  if me is null then raise exception 'auth'; end if;
  select * into s from public.seeds where id = p_seed_id for update;
  if not found or s.status <> 'public' or s.owner_uid = me then raise exception 'gone'; end if;
  if me = any (s.waterers) then raise exception 'already'; end if;
  if s.water_count >= 5 then raise exception 'full'; end if;
  if exists (select 1 from public.blocks where owner_uid = s.owner_uid and blocked_uid = me) then
    raise exception 'blocked';
  end if;
  select text into body from public.seed_bodies where seed_id = s.id;
  update public.seeds set water_count = water_count + 1, waterers = waterers || me where id = s.id;
  insert into public.letters (id, seed_id, to_uid, to_name, from_uid, from_name, seed_text, text)
    values (s.id || '_' || me::text, s.id, s.owner_uid, s.owner_name, me, public.my_name(), coalesce(body, ''), p_text);
end;
$$;

-- ありがとう。手紙を thanked にして、2人の作物を作る
create function public.say_thanks(p_letter_id text, p_crop_type text)
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
end;
$$;

-- 手紙を通報する。受信者の画面からすぐ消えるよう、手紙を reported にする
create function public.report_letter(p_letter_id text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  l public.letters;
begin
  if me is null then raise exception 'auth'; end if;
  select * into l from public.letters where id = p_letter_id and to_uid = me for update;
  if not found or l.status not in ('unread', 'read') then raise exception 'gone'; end if;
  insert into public.reports (target_type, target_id, reporter_uid) values ('letter', l.id, me);
  update public.letters set status = 'reported' where id = l.id;
end;
$$;

-- すべてのデータを削除。作物（持ち主の配列なのでつながっていない）を消してから、アカウントを消す。
-- ほかのデータは auth.users の削除と一緒に消える（on delete cascade）。通報の記録は運営の確認のため残す
create function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth'; end if;
  delete from public.crops where me = any (owner_uids);
  delete from auth.users where id = me;
end;
$$;

-- RPC はログインした村人だけが呼べる
revoke execute on function public.is_admin(), public.my_name(), public.sow_seed(int, int, text, text, text),
  public.water_seed(text, text), public.say_thanks(text, text), public.report_letter(text),
  public.delete_my_account() from public, anon;
grant execute on function public.is_admin(), public.my_name(), public.sow_seed(int, int, text, text, text),
  public.water_seed(text, text), public.say_thanks(text, text), public.report_letter(text),
  public.delete_my_account() to authenticated;

-- =========================================================
-- Realtime（種・手紙・作物・ブロックの変化をすぐ画面に反映する）。RLS が効くので、見えるものだけが届く
-- =========================================================
alter publication supabase_realtime add table public.seeds, public.letters, public.crops, public.blocks;
