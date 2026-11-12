import type { CropDoc, Seed } from "./farm-api";
import { isDesertSeedId } from "./game";
import { MAYOR_UID, type MayorSeedState } from "./mayor-seed";
import { supabase } from "./supabase";

/* =========================================================
   村長からもらったバッジ（思い出帳に並べる。8種類）
   - 村でできることを、はじめてやったときに村長が渡す（BadgeModal）
   - もらったかどうかは、村や書いたもの（種・花・カフェ・住民票・図書館）から決める。端末にはもらった日だけを保存する
   - 保存がまだない端末（バッジができる前からの村人）は、いままでのぶんを村長の話なしで入れる
   - id は保存に使うので変えない。絵は src/components/badge-icon.tsx
   ========================================================= */

export const BADGES = [
  { id: "first-step", name: "はじめの一歩のバッジ", how: "村長の種に水やりした" },
  { id: "sow", name: "種まきのバッジ", how: "はじめて種を蒔いた" },
  { id: "water", name: "水やりのバッジ", how: "はじめてほかの村人の種に水やりした" },
  { id: "bloom", name: "花のバッジ", how: "はじめて「ありがとう」で花が咲いた" },
  { id: "challenge", name: "挑戦のバッジ", how: "砂漠に挑戦の種を蒔いた" },
  { id: "cafe", name: "カフェのバッジ", how: "カフェで言葉を残した" },
  { id: "resident", name: "住民のバッジ", how: "住民票を書いた" },
  { id: "book", name: "本のバッジ", how: "図書館で感想かノートを書いた" },
] as const;
export type BadgeId = (typeof BADGES)[number]["id"];
export const badgeById = (id: string) => BADGES.find((b) => b.id === id) ?? BADGES[0];

// もらったバッジ（id → もらった日時）。村人ごとに端末へ保存する
export type Earned = Partial<Record<BadgeId, string>>;
export const badgesKey = (uid: string) => `kitsuon-badges-${uid}`;

// 村のデータ（いつも手元にあるもの）から決まるバッジ
export function localBadges(d: {
  uid: string; mySeeds: Map<string, Seed>; publicSeeds: Map<string, Seed>; crops: CropDoc[];
  mayorSeed: MayorSeedState; mayorDesertSeed: MayorSeedState;
}): Set<BadgeId> {
  const got = new Set<BadgeId>();
  const { uid } = d;
  if (d.mayorSeed.state === "done" || d.mayorDesertSeed.state === "done") got.add("first-step");
  const mine = [...d.mySeeds.values()];
  const sownCrops = d.crops.filter((c) => c.sowerUid === uid);
  if (mine.length > 0 || sownCrops.length > 0) got.add("sow");
  if (mine.some((s) => isDesertSeedId(s.id)) || sownCrops.some((c) => isDesertSeedId(c.seedId))) got.add("challenge");
  const wateredOthers = [...d.publicSeeds.values()].some((s) => s.ownerUid !== uid && (s.waterers || []).includes(uid))
    || d.crops.some((c) => c.watererUid === uid && c.sowerUid !== uid && c.sowerUid !== MAYOR_UID);
  if (wateredOthers) got.add("water");
  if (d.crops.some((c) => c.sowerUid !== MAYOR_UID)) got.add("bloom");
  return got;
}

// サーバーに聞かないとわからないバッジ（カフェ・住民票・図書館）。まだもらっていないものだけ聞く
export async function serverBadges(uid: string, need: BadgeId[]): Promise<Set<BadgeId>> {
  const got = new Set<BadgeId>();
  const has = async (table: string) => {
    const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true }).eq("uid", uid);
    if (error) throw error;
    return (count ?? 0) > 0;
  };
  const jobs: Promise<void>[] = [];
  if (need.includes("cafe")) jobs.push(has("cafe_answers").then((v) => { if (v) got.add("cafe"); }));
  if (need.includes("resident")) {
    jobs.push((async () => {
      const { count, error } = await supabase.from("resident_cards").select("uid", { count: "exact", head: true }).eq("uid", uid);
      if (error) throw error;
      if ((count ?? 0) > 0) got.add("resident");
    })());
  }
  if (need.includes("book")) {
    jobs.push(Promise.all([has("library_reviews"), has("library_notes")]).then(([r, n]) => { if (r || n) got.add("book"); }));
  }
  await Promise.all(jobs);
  return got;
}
