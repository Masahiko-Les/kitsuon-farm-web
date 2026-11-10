import { MAP_ID, TERMS_VERSION } from "./game";
import { must, supabase } from "./supabase";

/* =========================================================
   農場のデータ（Supabase）
   - テーブルの列は snake_case、アプリの型は camelCase。変換はこのファイルの中でだけ行う。
   - 種を蒔く・水やり・ありがとう・手紙の通報・データ削除は、Postgres の関数（RPC）で行う
     （supabase/migrations/0001_init.sql）。条件に合わないと 'gone' などの例外が Error になって届く。
   - 村人名は RPC の中で profiles から読む。name を受け取る関数は、呼び出し側を変えないために残している。
   ========================================================= */

// 日時は ISO 文字列（timestamptz）
export type Timestamp = string;

export type Seed = {
  id: string;
  ownerUid: string;
  ownerName: string;
  mapId: string;
  x: number;
  y: number;
  status: "public" | "review" | "hidden";
  waterCount: number;
  waterers: string[];
  createdAt?: Timestamp | null;
};

export type Letter = {
  id: string;
  seedId: string;
  toUid: string;
  toName: string;
  fromUid: string;
  fromName: string;
  seedText: string;
  text: string;
  status: "unread" | "read" | "thanked" | "reported";
  createdAt?: Timestamp | null;
};

export type CropDoc = {
  id: string;
  letterId: string;
  seedId: string;
  cropType: string;
  ownerUids: string[];
  sowerUid: string;
  sowerName: string;
  watererUid: string;
  watererName: string;
  seedText: string;
  letterText: string;
  harvestedAt?: Timestamp | null;
};

export type UserDoc = { villagerName: string; termsVersion?: number };

export const millis = (ts?: Timestamp | null) => {
  const t = ts ? Date.parse(ts) : NaN;
  return Number.isNaN(t) ? Date.now() : t;
};
export const dateText = (ts?: Timestamp | null) => {
  const d = new Date(millis(ts));
  return `${d.getMonth() + 1}月${d.getDate()}日`;
};

/* ---------- 行 → アプリの型 ---------- */
type Row = Record<string, unknown>;
export const toSeed = (r: Row): Seed => ({
  id: r.id as string,
  ownerUid: r.owner_uid as string,
  ownerName: r.owner_name as string,
  mapId: r.map_id as string,
  x: r.x as number,
  y: r.y as number,
  status: r.status as Seed["status"],
  waterCount: (r.water_count as number) ?? 0,
  waterers: (r.waterers as string[]) ?? [],
  createdAt: r.created_at as string,
});
export const toLetter = (r: Row): Letter => ({
  id: r.id as string,
  seedId: r.seed_id as string,
  toUid: r.to_uid as string,
  toName: r.to_name as string,
  fromUid: r.from_uid as string,
  fromName: r.from_name as string,
  seedText: (r.seed_text as string) ?? "",
  text: r.text as string,
  status: r.status as Letter["status"],
  createdAt: r.created_at as string,
});
export const toCrop = (r: Row): CropDoc => ({
  id: r.id as string,
  letterId: r.letter_id as string,
  seedId: r.seed_id as string,
  cropType: r.crop_type as string,
  ownerUids: (r.owner_uids as string[]) ?? [],
  sowerUid: r.sower_uid as string,
  sowerName: r.sower_name as string,
  watererUid: r.waterer_uid as string,
  watererName: r.waterer_name as string,
  seedText: (r.seed_text as string) ?? "",
  letterText: r.letter_text as string,
  harvestedAt: r.harvested_at as string,
});

/* ---------- 一覧の読み込み（state/farm.tsx の購読から呼ぶ） ---------- */
export async function loadPublicSeeds(): Promise<Seed[]> {
  return (must(await supabase.from("seeds").select("*").eq("status", "public")) ?? []).map(toSeed);
}
export async function loadMySeeds(uid: string): Promise<Seed[]> {
  return (must(await supabase.from("seeds").select("*").eq("owner_uid", uid)) ?? []).map(toSeed);
}
export async function loadLettersTo(uid: string): Promise<Letter[]> {
  return (must(await supabase.from("letters").select("*").eq("to_uid", uid)) ?? []).map(toLetter);
}
export async function loadCrops(uid: string): Promise<CropDoc[]> {
  return (must(await supabase.from("crops").select("*").contains("owner_uids", [uid])) ?? []).map(toCrop);
}
export async function loadBlocks(uid: string): Promise<string[]> {
  return (must(await supabase.from("blocks").select("blocked_uid").eq("owner_uid", uid)) ?? [])
    .map((r) => r.blocked_uid as string);
}
export async function loadIsAdmin(uid: string): Promise<boolean> {
  return (must(await supabase.from("admins").select("uid").eq("uid", uid)) ?? []).length > 0;
}

/* ---------- 村人 ---------- */
export async function loadUser(uid: string): Promise<UserDoc | null> {
  const r = must(await supabase.from("profiles").select("villager_name, terms_version").eq("id", uid).maybeSingle());
  return r ? { villagerName: r.villager_name as string, termsVersion: r.terms_version as number } : null;
}

export async function registerName(uid: string, name: string) {
  must(await supabase.from("profiles").upsert({ id: uid, villager_name: name }));
}

export async function agreeTerms(uid: string, name: string) {
  must(await supabase.from("profiles").upsert({
    id: uid, villager_name: name, terms_version: TERMS_VERSION, agreed_at: new Date().toISOString(),
  }));
}

/* ---------- 種 ---------- */
// そのマスにもう種があれば Error('taken')
export async function sowSeed(_uid: string, _name: string, x: number, y: number, text: string, status: "public" | "review") {
  must(await supabase.rpc("sow_seed", { p_x: x, p_y: y, p_text: text, p_status: status, p_map_id: MAP_ID }));
}

export async function readSeedText(id: string): Promise<string> {
  const r = must(await supabase.from("seed_bodies").select("text").eq("seed_id", id).maybeSingle());
  return (r?.text as string) ?? "";
}

// 自分が水やりのときに送った手紙（送った本人は読める）
export async function readMyLetter(seedId: string, uid: string): Promise<Letter | null> {
  const r = must(await supabase.from("letters").select("*").eq("id", `${seedId}_${uid}`).maybeSingle());
  return r ? toLetter(r) : null;
}

/* ---------- 水やり（RPC。種をロックして、1人1回・最大5人を確かめる） ---------- */
// 'gone' / 'already' / 'full' / 'blocked' の Error になることがある
export async function waterSeed(_uid: string, _name: string, seed: Seed, _seedText: string, text: string) {
  must(await supabase.rpc("water_seed", { p_seed_id: seed.id, p_text: text }));
}

/* ---------- 手紙 ---------- */
export async function markRead(letter: Letter) {
  must(await supabase.from("letters").update({ status: "read" }).eq("id", letter.id));
}

// ありがとう（RPC。手紙を thanked にして、2人の作物を作る）
export async function sayThanks(_uid: string, _name: string, letter: Letter, cropType: string) {
  must(await supabase.rpc("say_thanks", { p_letter_id: letter.id, p_crop_type: cropType }));
}

/* ---------- 通報・ブロック ---------- */
export async function reportSeed(uid: string, seedId: string) {
  must(await supabase.from("reports").insert({ target_type: "seed", target_id: seedId, reporter_uid: uid }));
}

export async function reportLetter(_uid: string, letter: Letter) {
  must(await supabase.rpc("report_letter", { p_letter_id: letter.id }));
}

export async function blockUser(uid: string, otherUid: string) {
  must(await supabase.from("blocks").upsert({ owner_uid: uid, blocked_uid: otherUid }, { ignoreDuplicates: true }));
}

/* ---------- すべてのデータを削除 ---------- */
// 作物を消してからアカウントを消す（ほかのデータはアカウントと一緒に消える）。そのあとログアウトする
export async function deleteEverything(_uid: string) {
  must(await supabase.rpc("delete_my_account"));
  await supabase.auth.signOut({ scope: "local" });
}
