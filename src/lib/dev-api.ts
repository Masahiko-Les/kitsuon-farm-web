import type { Timestamp } from "./farm-api";
import { must, supabase } from "./supabase";

/* =========================================================
   開発局のアイデア（吃音村を良くするための、村人の意見）
   - 書くと pending。運営が確かめて public にしたものだけが、ほかの村人の黒板に並ぶ
   - 書いた本人には、自分のアイデアが「確認中」として見える
   - 危機的な言葉を含むものは review で保存し、誰の黒板にも出さない
   - 名前は持たない。黒板には「村人のアイデア」として並べる
   ========================================================= */

// 通報して隠したアイデア（端末に保存）
export const DEV_HIDDEN_KEY = "kitsuon-dev-hidden";
// 黒板に並べる数
const BOARD_LIMIT = 100;

export type IdeaStatus = "pending" | "public" | "private" | "review";
export type DevIdea = { id: string; uid: string; text: string; status: IdeaStatus; createdAt?: Timestamp | null };

const toIdea = (r: Record<string, unknown>): DevIdea => ({
  id: r.id as string, uid: r.uid as string, text: r.text as string, status: r.status as IdeaStatus, createdAt: r.created_at as string,
});

export async function addIdea(uid: string, text: string, status: "pending" | "review") {
  must(await supabase.from("dev_ideas").insert({ uid, text, status }));
}

// 黒板：承認されたアイデアと、自分のアイデア（承認しなかったもの・要確認のものは除く）。新しいものから
export async function loadBoard(uid: string): Promise<DevIdea[]> {
  const rows = must(await supabase.from("dev_ideas").select("*")
    .or(`status.eq.public,and(uid.eq.${uid},status.eq.pending)`)
    .order("created_at", { ascending: false }).limit(BOARD_LIMIT)) ?? [];
  return rows.map(toIdea);
}

export async function reportIdea(uid: string, ideaId: string) {
  must(await supabase.from("reports").insert({ target_type: "devIdea", target_id: ideaId, reporter_uid: uid }));
}

/* ---------- 運営 ---------- */
export async function loadIdeasByStatus(status: IdeaStatus): Promise<DevIdea[]> {
  const rows = must(await supabase.from("dev_ideas").select("*").eq("status", status).order("created_at", { ascending: true })) ?? [];
  return rows.map(toIdea);
}

export async function setIdeaStatus(id: string, status: "public" | "private") {
  must(await supabase.from("dev_ideas").update({ status }).eq("id", id));
}

export async function deleteIdea(id: string) {
  must(await supabase.from("dev_ideas").delete().eq("id", id));
}

export type IdeaReportGroup = { idea: DevIdea | null; targetId: string; reportIds: string[] };
export async function loadIdeaReports(): Promise<IdeaReportGroup[]> {
  const open = must(await supabase.from("reports").select("id, target_id").eq("target_type", "devIdea").eq("handled", false)) ?? [];
  const byTarget = new Map<string, string[]>();
  for (const r of open) byTarget.set(r.target_id as string, [...(byTarget.get(r.target_id as string) ?? []), r.id as string]);
  const ids = [...byTarget.keys()];
  const ideas = ids.length ? (must(await supabase.from("dev_ideas").select("*").in("id", ids)) ?? []).map(toIdea) : [];
  return ids.map((targetId) => ({ targetId, reportIds: byTarget.get(targetId)!, idea: ideas.find((i) => i.id === targetId) ?? null }));
}
