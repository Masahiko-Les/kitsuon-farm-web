import type { CropDoc, Seed } from "./farm-api";

/* =========================================================
   村長が蒔いた種（はじめて村に来た人の、初めての水やりの練習。砂漠にもある）
   - 新しい村人（名前を登録して同意した人）にだけ、水やりするまで広場の南に出る
   - 手紙は誰にも届かず、サーバーにも保存しない。花と思い出は、その人の端末にだけ残す
   - 種の場所に本物の種があるときは、次の候補の場所に出す
   - 砂漠：砂漠に初めて蒔こうとした人（前からいる村人も）に、村長の話のあと、すぐそばの砂に「村長の挑戦の種」を出す
   ========================================================= */

export const MAYOR_UID = "mayor";
// farm：村の草地（新しい村人に）／desert：砂漠の挑戦の種（砂漠で初めて蒔こうとした人に）
export type MayorKind = "farm" | "desert";
export const mayorSeedKey = (uid: string, kind: MayorKind = "farm") =>
  kind === "farm" ? `kitsuon-mayor-seed-${uid}` : `kitsuon-mayor-desert-seed-${uid}`;

// 出す場所の候補（広場の南。はじめに立つ場所のすぐそば）
export const MAYOR_SEED_SPOTS = [
  { x: 15, y: 18 }, { x: 17, y: 18 }, { x: 14, y: 17 }, { x: 18, y: 17 },
];

export const MAYOR_SEED_TEXT =
  "わしも子どものころから吃音があってな。自分の名前を言おうとすると、最初の音がどうしても出てこんかった。笑われるのがこわくて、ずっと黙っておったんじゃ。でも今は声が出なくても、いいと思うことができるようになった。吃音村でそう感じてもらえたらよいなと思っておる。";

// 砂漠に初めて蒔こうとしたとき、すぐそばの砂に出す村長の挑戦の種
export const MAYOR_DESERT_SEED_TEXT =
  "わしは若いころ、村の集まりで、自分から手をあげて話してみたんじゃ。最初の音はやっぱりつまったが、みんな最後まで待ってくれた。うまく言えたかより、言ってみたことが、わしの小さな挑戦じゃった。";
export const mayorSeedText = (kind: MayorKind) => (kind === "farm" ? MAYOR_SEED_TEXT : MAYOR_DESERT_SEED_TEXT);
export const mayorSeedName = (kind: MayorKind) => (kind === "farm" ? "村長の種" : "村長の挑戦の種");

// pending の x・y は砂漠の種だけ（村の種は MAYOR_SEED_SPOTS から選ぶ）
export type MayorSeedState =
  | { state: "none" }
  | { state: "pending"; x?: number; y?: number }
  | { state: "done"; x: number; y: number; letter: string; bloom: string; at: string };

// 地図に置く種（Seed の形にそろえる）。咲いたあとは bloom が入る
export const mayorSeedOf = (x: number, y: number, bloom: string | null): Seed => ({
  id: `${x}_${y}`, ownerUid: MAYOR_UID, ownerName: "村長", mapId: "main", x, y,
  status: "public", waterCount: bloom ? 1 : 0, waterers: [], bloom,
});

// 思い出帳に入れる思い出（CropDoc の形にそろえる）
export const mayorCropOf = (uid: string, name: string, kind: MayorKind, s: Extract<MayorSeedState, { state: "done" }>): CropDoc => ({
  id: `mayor-${kind}_${uid}`, letterId: `mayor-${kind}_${uid}`, seedId: `${s.x}_${s.y}`, cropType: s.bloom, ownerUids: [uid],
  sowerUid: MAYOR_UID, sowerName: "村長", watererUid: uid, watererName: name,
  seedText: mayorSeedText(kind), letterText: s.letter, harvestedAt: s.at,
});
