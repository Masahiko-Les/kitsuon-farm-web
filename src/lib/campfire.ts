import type { Timestamp } from "./farm-api";
import { must, supabase } from "./supabase";

/* =========================================================
   焚き火のひとこと（広場の焚き火。supabase/migrations/0012）
   - 薪をくべるとき、ひとこと（200字以内）を残せる。焚き火のまわりの掲示板のように、村人みんなが読める
   - 見えるのは残してから24時間だけ（データベースの RLS で決める）
   - 名前は出さない。危機的な言葉を含むものは review で、誰にも見せずに運営が確認する
   ========================================================= */

export const CAMPFIRE_MAX = 200;
export const CAMPFIRE_HOURS = 24;
// 通報して隠したひとこと（端末に保存）
export const CAMPFIRE_HIDDEN_KEY = "kitsuon-campfire-hidden";

export type FireStatus = "ok" | "review" | "hidden";
export type FireMessage = { id: string; uid: string; text: string; status: FireStatus; createdAt: Timestamp | null };
const toMessage = (r: Record<string, unknown>): FireMessage => ({
  id: r.id as string, uid: r.uid as string, text: r.text as string, status: r.status as FireStatus, createdAt: r.created_at as string,
});

const since = () => new Date(Date.now() - CAMPFIRE_HOURS * 3600 * 1000).toISOString();

// 24時間以内のひとこと（ふつうのものと自分のもの）。新しいものから
export async function loadFire(uid: string): Promise<FireMessage[]> {
  const rows = must(await supabase.from("campfire_messages").select("*")
    .gt("created_at", since()).or(`status.eq.ok,uid.eq.${uid}`)
    .order("created_at", { ascending: false }).limit(200)) ?? [];
  return rows.map(toMessage).filter((m) => m.status !== "hidden" || m.uid === uid);
}

// 焚き火の大きさに使う、24時間以内にくべられた薪の数
export async function loadFireCount(): Promise<number> {
  const { count, error } = await supabase.from("campfire_messages").select("id", { count: "exact", head: true })
    .gt("created_at", since()).eq("status", "ok");
  if (error) throw error;
  return count ?? 0;
}

export async function addFireMessage(uid: string, text: string, status: "ok" | "review") {
  must(await supabase.from("campfire_messages").insert({ uid, text, status }));
}

export async function reportFireMessage(uid: string, id: string) {
  must(await supabase.from("reports").insert({ target_type: "campfireMessage", target_id: id, reporter_uid: uid }));
}

// 「3時間前」のような、残してからの時間
export function agoText(at: Timestamp | null): string {
  if (!at) return "";
  const ms = Date.now() - new Date(at as string).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "たったいま";
  if (min < 60) return `${min}分前`;
  return `${Math.floor(min / 60)}時間前`;
}

/* ---------- 運営 ---------- */
export async function loadFireReview(): Promise<FireMessage[]> {
  const rows = must(await supabase.from("campfire_messages").select("*").eq("status", "review").order("created_at", { ascending: true })) ?? [];
  return rows.map(toMessage);
}
export async function setFireStatus(id: string, status: FireStatus) {
  must(await supabase.from("campfire_messages").update({ status }).eq("id", id));
}
export async function deleteFireMessage(id: string) {
  must(await supabase.from("campfire_messages").delete().eq("id", id));
}
export type FireReportGroup = { targetId: string; reportIds: string[]; message: FireMessage | null };
export async function loadFireReports(): Promise<FireReportGroup[]> {
  const open = must(await supabase.from("reports").select("id, target_id").eq("target_type", "campfireMessage").eq("handled", false)) ?? [];
  const byTarget = new Map<string, string[]>();
  for (const r of open) byTarget.set(r.target_id as string, [...(byTarget.get(r.target_id as string) ?? []), r.id as string]);
  const ids = [...byTarget.keys()];
  const msgs = ids.length ? (must(await supabase.from("campfire_messages").select("*").in("id", ids)) ?? []).map(toMessage) : [];
  return ids.map((targetId) => ({ targetId, reportIds: byTarget.get(targetId)!, message: msgs.find((m) => m.id === targetId) ?? null }));
}
