import type { CropDoc, Seed } from "./farm-api";

/* =========================================================
   村長が蒔いた種（はじめて村に来た人の、初めての水やりの練習）
   - 新しい村人（名前を登録して同意した人）にだけ、水やりするまで広場の南に出る
   - 手紙は誰にも届かず、サーバーにも保存しない。花と思い出は、その人の端末にだけ残す
   - 種の場所に本物の種があるときは、次の候補の場所に出す
   ========================================================= */

export const MAYOR_UID = "mayor";
export const mayorSeedKey = (uid: string) => `kitsuon-mayor-seed-${uid}`;

// 出す場所の候補（広場の南。はじめに立つ場所のすぐそば）
export const MAYOR_SEED_SPOTS = [
  { x: 15, y: 18 }, { x: 17, y: 18 }, { x: 14, y: 17 }, { x: 18, y: 17 },
];

export const MAYOR_SEED_TEXT =
  "わしも子どものころから吃音があってな。村の寄り合いで自分の名前を言おうとすると、最初の音がどうしても出てこんかった。笑われるのがこわくて、ずっと黙っておったんじゃ。";

export type MayorSeedState =
  | { state: "none" }
  | { state: "pending" }
  | { state: "done"; x: number; y: number; letter: string; bloom: string; at: string };

// 地図に置く種（Seed の形にそろえる）。咲いたあとは bloom が入る
export const mayorSeedOf = (x: number, y: number, bloom: string | null): Seed => ({
  id: `${x}_${y}`, ownerUid: MAYOR_UID, ownerName: "村長", mapId: "main", x, y,
  status: "public", waterCount: bloom ? 1 : 0, waterers: [], bloom,
});

// 思い出帳に入れる思い出（CropDoc の形にそろえる）
export const mayorCropOf = (uid: string, name: string, s: Extract<MayorSeedState, { state: "done" }>): CropDoc => ({
  id: `mayor_${uid}`, letterId: `mayor_${uid}`, seedId: `${s.x}_${s.y}`, cropType: s.bloom, ownerUids: [uid],
  sowerUid: MAYOR_UID, sowerName: "村長", watererUid: uid, watererName: name,
  seedText: MAYOR_SEED_TEXT, letterText: s.letter, harvestedAt: s.at,
});
