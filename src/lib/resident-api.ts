import type { Timestamp } from "./farm-api";
import { must, supabase } from "./supabase";

/* =========================================================
   住民票（村役場の窓口で書く。1人1枚。supabase/migrations/0008）
   - 入力項目は KitsuonmuraWeb_ver2 の住民票にならう。どれも書かなくてよい
   - 村人名はデータベースが profiles から写す（住民票では変えられない）
   - 本人が「ほかの村人に見せる」を選んだものだけ、ほかの村人が読める
   - status：ok／review（公開を選んでいて、危機的な言葉を含む。運営の確認待ち）／hidden（運営が非公開にした）
   ========================================================= */

// 通報して隠した住民票（端末に保存）
export const RESIDENT_HIDDEN_KEY = "kitsuon-resident-hidden";

export const STUTTER_TYPES = ["難発", "連発", "伸発", "その他"] as const;
export const SOUND_ROWS: string[][] = [
  ["あ", "い", "う", "え", "お"],
  ["か", "き", "く", "け", "こ"],
  ["が", "ぎ", "ぐ", "げ", "ご"],
  ["さ", "し", "す", "せ", "そ"],
  ["ざ", "じ", "ず", "ぜ", "ぞ"],
  ["た", "ち", "つ", "て", "と"],
  ["だ", "ぢ", "づ", "で", "ど"],
  ["な", "に", "ぬ", "ね", "の"],
  ["は", "ひ", "ふ", "へ", "ほ"],
  ["ば", "び", "ぶ", "べ", "ぼ"],
  ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"],
  ["ま", "み", "む", "め", "も"],
  ["や", "ゆ", "よ"],
  ["ら", "り", "る", "れ", "ろ"],
  ["わ", "を", "ん"],
];
// 言いにくい言葉：1つ20文字まで、20個まで
export const WORD_MAX = 20;
export const WORDS_MAX = 20;
// 書く欄はどれも300字まで（0008 と同じ）
export const NOTE_MAX = 300;

// 自由に書く欄（並び順は住民票の表示順）
export const NOTE_FIELDS = [
  { key: "bio", label: "自己紹介", placeholder: "" },
  { key: "favoriteThings", label: "好きなこと・大切にしていること", placeholder: "" },
  { key: "difficultSituations", label: "吃音が出やすい場面", placeholder: "" },
  { key: "easySituations", label: "吃音が出にくい場面", placeholder: "" },
  { key: "copingStrategies", label: "自分の対処法", placeholder: "" },
  { key: "stutterHistory", label: "自分の吃音史", placeholder: "初めて吃音に気づいた時のことから、今までの吃音について書ける範囲で書いてください" },
] as const;
export type NoteKey = (typeof NOTE_FIELDS)[number]["key"];

export type CardStatus = "ok" | "review" | "hidden";
export type ResidentCard = Record<NoteKey, string> & {
  uid: string;
  villagerName: string;
  isPublic: boolean;
  status: CardStatus;
  stutterTypes: string[];
  difficultSounds: string[];
  difficultWords: string[];
  updatedAt?: Timestamp | null;
};
export type CardInput = Omit<ResidentCard, "uid" | "villagerName" | "status" | "updatedAt">;

export const emptyCard = (): CardInput => ({
  isPublic: false, bio: "", favoriteThings: "", stutterTypes: [], difficultSounds: [], difficultWords: [],
  difficultSituations: "", easySituations: "", copingStrategies: "", stutterHistory: "",
});

const toCard = (r: Record<string, unknown>): ResidentCard => ({
  uid: r.uid as string,
  villagerName: r.villager_name as string,
  isPublic: r.is_public as boolean,
  status: r.status as CardStatus,
  bio: r.bio as string,
  favoriteThings: r.favorite_things as string,
  stutterTypes: (r.stutter_types as string[]) ?? [],
  difficultSounds: (r.difficult_sounds as string[]) ?? [],
  difficultWords: (r.difficult_words as string[]) ?? [],
  difficultSituations: r.difficult_situations as string,
  easySituations: r.easy_situations as string,
  copingStrategies: r.coping_strategies as string,
  stutterHistory: r.stutter_history as string,
  updatedAt: r.updated_at as string,
});

// 何か書いてあるか（何もない住民票は一覧に出さない）
export const hasContent = (c: CardInput) =>
  NOTE_FIELDS.some((f) => c[f.key].trim() !== "") || c.stutterTypes.length + c.difficultSounds.length + c.difficultWords.length > 0;

export async function loadMyCard(uid: string): Promise<ResidentCard | null> {
  const row = must(await supabase.from("resident_cards").select("*").eq("uid", uid).maybeSingle());
  return row ? toCard(row) : null;
}

export async function saveMyCard(uid: string, c: CardInput, status: "ok" | "review") {
  must(await supabase.from("resident_cards").upsert({
    uid,
    is_public: c.isPublic,
    status,
    bio: c.bio.trim(),
    favorite_things: c.favoriteThings.trim(),
    stutter_types: c.stutterTypes,
    difficult_sounds: c.difficultSounds,
    difficult_words: c.difficultWords,
    difficult_situations: c.difficultSituations.trim(),
    easy_situations: c.easySituations.trim(),
    coping_strategies: c.copingStrategies.trim(),
    stutter_history: c.stutterHistory.trim(),
  }));
}

// 吃音村の人口（住民票を書いた人数。本人だけが読める住民票も数える。0009）
export async function loadResidentCount(): Promise<number> {
  return must(await supabase.rpc("resident_count")) as number;
}

export async function deleteMyCard(uid: string) {
  must(await supabase.from("resident_cards").delete().eq("uid", uid));
}

// 村人の住民票：公開を選んでいて、ふつうの状態のもの。新しく直したものから
export async function loadPublicCards(): Promise<ResidentCard[]> {
  const rows = must(await supabase.from("resident_cards").select("*")
    .eq("is_public", true).eq("status", "ok").order("updated_at", { ascending: false }).limit(200)) ?? [];
  return rows.map(toCard);
}

export async function loadCard(uid: string): Promise<ResidentCard | null> {
  const row = must(await supabase.from("resident_cards").select("*").eq("uid", uid).maybeSingle());
  return row ? toCard(row) : null;
}

export async function reportCard(uid: string, cardUid: string) {
  must(await supabase.from("reports").insert({ target_type: "residentCard", target_id: cardUid, reporter_uid: uid }));
}

/* ---------- 運営 ---------- */
export async function loadReviewCards(): Promise<ResidentCard[]> {
  const rows = must(await supabase.from("resident_cards").select("*")
    .eq("is_public", true).eq("status", "review").order("updated_at", { ascending: true })) ?? [];
  return rows.map(toCard);
}

export async function setCardStatus(uid: string, status: "ok" | "hidden") {
  must(await supabase.from("resident_cards").update({ status }).eq("uid", uid));
}

export type CardReportGroup = { card: ResidentCard | null; targetId: string; reportIds: string[] };
export async function loadCardReports(): Promise<CardReportGroup[]> {
  const open = must(await supabase.from("reports").select("id, target_id").eq("target_type", "residentCard").eq("handled", false)) ?? [];
  const byTarget = new Map<string, string[]>();
  for (const r of open) byTarget.set(r.target_id as string, [...(byTarget.get(r.target_id as string) ?? []), r.id as string]);
  const ids = [...byTarget.keys()];
  const cards = ids.length ? (must(await supabase.from("resident_cards").select("*").in("uid", ids)) ?? []).map(toCard) : [];
  return ids.map((targetId) => ({ targetId, reportIds: byTarget.get(targetId)!, card: cards.find((c) => c.uid === targetId) ?? null }));
}
