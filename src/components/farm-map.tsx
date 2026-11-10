import { Canvas, Group, Picture, Skia, type SkCanvas, type SkPaint, type SkPicture, createPicture } from "@shopify/react-native-skia";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, PixelRatio, StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import type { Seed } from "@/lib/farm-api";
import {
  type Area, BUILDINGS, type Building, CAFE_GUESTS, HALL_GUESTS, COLS, DESERT_DEPTH, type Dir, HARBOR, ON_SEA, ROOMS, ROWS, type RoomId, TILE,
  VIEW_TILES_ACROSS, keyOf, roomTileAt, tileAt,
} from "@/lib/game";
import { drawAnimal } from "./animals";
import { hiFarmer, hiFence, hiFlower, hiGrass, hiHouse, hiMailbox, hiMayor, hiPath, hiSeed, hiSoil, hiSparkle, hiSprout, hiTree, hiWater } from "./hires";

export const MOVE_MS = 150;
const W = COLS * TILE; // マップ全体
const H = ROWS * TILE;
// 画面に映す範囲（マップの画素単位）と、村人を置く高さ（画面の上からの割合）
type ViewSize = { w: number; h: number; focusY: number };
const MARGIN = 2; // マップの外にも海を何マスぶん見せるか
const NORTH = (DESERT_DEPTH + MARGIN) * TILE; // 北は砂漠の先の砂嵐まで見せる
// 南の海は広めに見せる。南の岸辺に立っても、桟橋と船が下の操作部に隠れないように
const SOUTH_TILES = 10;
const SOUTH = SOUTH_TILES * TILE;

export type SeedKind = "mine" | "mine-review" | "watered" | "full" | "open" | null;

// x, y は行き先のマス。fromX, fromY から moveStart に歩き出し、MOVE_MS かけて着く。
// walkStart〜walkUntil のあいだは足踏みのコマを進める（続けて歩くとコマがつながる）
export type Player = {
  x: number; y: number; dir: Dir; fromX: number; fromY: number; moveStart: number; walkStart: number; walkUntil: number;
};
export type Effect = { type: "water" | "sow"; x: number; y: number; start: number; duration: number };

// 描画ループが毎フレーム読むもの。React の再描画を待たずに参照する。
export type Scene = {
  area: Area;
  player: Player;
  mayor: Player; // 村のマップを道に沿ってゆっくり歩く村長
  seeds: Seed[];
  kindOf: (s: Seed) => SeedKind;
  hasUnread: boolean;
};

// 種を蒔いた・水やりしたときの演出。モーダルからも呼べるようにここで持つ
let effects: Effect[] = [];
export function addEffect(type: Effect["type"], x: number, y: number) {
  effects.push({ type, x, y, start: performance.now(), duration: type === "water" ? 1400 : 700 });
}

/* ---------- 塗り ---------- */
const paints = new Map<string, SkPaint>();
function paint(color: string) {
  let p = paints.get(color);
  if (!p) {
    p = Skia.Paint();
    p.setColor(Skia.Color(color));
    p.setAntiAlias(false);
    paints.set(color, p);
  }
  return p;
}

let cv: SkCanvas;
function rect(x: number, y: number, w: number, h: number, c: string) {
  cv.drawRect(Skia.XYWHRect(x, y, w, h), paint(c));
}
const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/* ---------- タイル ---------- */
function drawGrass(X: number, Y: number, tx: number, ty: number) {
  hiGrass(rect, X, Y, tx, ty);
}
function drawSoil(X: number, Y: number, tx = 0, ty = 0) {
  hiSoil(rect, X, Y, tx, ty);
}
function drawPath(X: number, Y: number, tx: number, ty: number) {
  const not = (x: number, y: number) => tileAt(x, y) !== "P";
  hiPath(rect, X, Y, tx, ty, { up: not(tx, ty - 1), down: not(tx, ty + 1), left: not(tx - 1, ty), right: not(tx + 1, ty) });
}
function drawWater(X: number, Y: number, tx: number, t: number) {
  hiWater(rect, X, Y, tx, t, tileAt(tx, Math.round(Y / TILE) - 1) !== "~");
}
function drawSea(X: number, Y: number, tx: number, ty: number) {
  rect(X, Y, 16, 16, "#3b7fae");
  // 陸と接する辺に、砂浜と白い波
  const land = (x: number, y: number) => !ON_SEA.has(tileAt(x, y));
  if (land(tx, ty - 1)) { rect(X, Y, 16, 3, "#e9d9a6"); rect(X, Y + 3, 16, 1, "#e8f4f8"); }
  if (land(tx, ty + 1)) { rect(X, Y + 13, 16, 3, "#e9d9a6"); rect(X, Y + 12, 16, 1, "#e8f4f8"); }
  if (land(tx - 1, ty)) { rect(X, Y, 3, 16, "#e9d9a6"); rect(X + 3, Y, 1, 16, "#e8f4f8"); }
  if (land(tx + 1, ty)) { rect(X + 13, Y, 3, 16, "#e9d9a6"); rect(X + 12, Y, 1, 16, "#e8f4f8"); }
}
function drawSeaWave(X: number, Y: number, tx: number, ty: number, t: number) {
  const o = (Math.floor(t / 420 + tx * 5 + ty * 3) % 10) + 3;
  rect(X + o - 2, Y + 6, 3, 1, "#7fc0e0");
  rect(X + ((o + 5) % 10) + 2, Y + 10, 2, 1, "#7fc0e0");
}
function drawDesert(X: number, Y: number, tx: number, ty: number) {
  rect(X, Y, 16, 16, "#e3c98a");
  const h = hash(tx, ty);
  // 砂の波紋と小石
  rect(X + (h % 6) + 1, Y + 4 + ((h >> 4) % 3), 6, 1, "#cfb070");
  rect(X + ((h >> 7) % 6) + 7, Y + 10 + ((h >> 10) % 3), 5, 1, "#cfb070");
  if (h % 5 === 0) rect(X + ((h >> 12) % 12) + 2, Y + ((h >> 15) % 12) + 2, 2, 1, "#a8895a");
}
function drawStorm(X: number, Y: number) {
  rect(X, Y, 16, 16, "#c9a46a");
}
function drawStormWind(X: number, Y: number, tx: number, ty: number, t: number) {
  // 横に流れる風の筋
  for (let i = 0; i < 3; i++) {
    const o = Math.floor(t / 60 + tx * 16 + i * 23 + ty * 7) % 32;
    rect(X + o - 8, Y + 3 + i * 5, 7, 1, "#efe0b8");
  }
}
function drawTree(X: number, Y: number, tx: number, ty: number) {
  drawGrass(X, Y, tx, ty);
  hiTree(rect, X, Y);
}
function drawFence(X: number, Y: number, tx: number, ty: number) {
  drawGrass(X, Y, tx, ty);
  hiFence(rect, X, Y);
}
function drawMailbox(X: number, Y: number, tx: number, ty: number, hasUnread: boolean) {
  drawGrass(X, Y, tx, ty);
  hiMailbox(rect, X, Y, hasUnread);
}
/* ---------- 建物 ---------- */
// 扉は村人1人ぶん（1マス）の大きさで、扉のマスにぴったり収める。X, Y は扉のマスの左上
function drawDoor(X: number, Y: number, wood: string, frame: string) {
  rect(X + 2, Y + 1, 12, 15, frame);
  rect(X + 3, Y + 2, 10, 14, wood);
  rect(X + 3, Y + 2, 10, 1, "rgba(255,255,255,0.18)");
  rect(X + 4, Y + 4, 8, 4, "rgba(0,0,0,0.12)"); // 扉の飾り板
  rect(X + 11, Y + 10, 1, 2, "#f2d04b"); // 取っ手
}
// 建物の左上を (X, Y)、扉のマスを建物の中の (dx, dy) マス目として描く
const doorAt = (X: number, Y: number, dx: number, dy: number) => [X + dx * TILE, Y + dy * TILE] as const;

function drawHouse(X: number, Y: number) {
  hiHouse(rect, X, Y);
}
function drawCafe(X: number, Y: number) {
  rect(X + 1, Y + 10, 46, 22, "#f3e3c3");
  rect(X + 2, Y, 44, 2, "#7d5838");
  rect(X, Y + 2, 48, 9, "#6b4a2e");
  // 看板（コーヒーカップ）
  rect(X + 20, Y + 3, 9, 7, "#f6efd9");
  rect(X + 22, Y + 5, 4, 3, "#6b4a2e");
  rect(X + 26, Y + 6, 1, 1, "#6b4a2e");
  // しましまのひさし
  for (let i = 0; i < 12; i++) rect(X + i * 4, Y + 11, 4, 4, i % 2 ? "#f6efd9" : "#c4473a");
  // 左右の窓
  for (const wx of [3, 35]) {
    rect(X + wx, Y + 18, 10, 9, "#7fb6d6");
    rect(X + wx + 5, Y + 18, 1, 9, "#f3e3c3");
  }
  drawDoor(...doorAt(X, Y, 1, 1), "#7a5235", "#5a3e2b");
}
function drawLibrary(X: number, Y: number) {
  rect(X + 1, Y + 10, 46, 22, "#b5714a");
  for (const r of [14, 19, 24, 29]) rect(X + 1, Y + r, 46, 1, "#9a5d3c");
  rect(X, Y + 1, 48, 10, "#3f6f8a");
  rect(X, Y + 4, 48, 1, "#335c73");
  rect(X, Y + 7, 48, 1, "#335c73");
  rect(X + 4, Y + 16, 8, 10, "#7fb6d6");
  rect(X + 36, Y + 16, 8, 10, "#7fb6d6");
  // 看板（本）
  rect(X + 19, Y + 11, 10, 5, "#f6efd9");
  rect(X + 21, Y + 12, 3, 3, "#c4473a");
  rect(X + 24, Y + 12, 3, 3, "#3f6fb0");
  drawDoor(...doorAt(X, Y, 1, 1), "#5a3e2b", "#3f2b1e");
}
function drawHall(X: number, Y: number) {
  rect(X + 1, Y + 16, 62, 32, "#ece6d8");
  // 三角屋根と時計
  for (let i = 0; i < 8; i++) rect(X + 28 - i * 3, Y + 3 + i, 8 + i * 6, 1, "#5d6470");
  rect(X, Y + 10, 64, 7, "#5d6470");
  rect(X + 28, Y + 4, 8, 8, "#f6efd9");
  rect(X + 31, Y + 5, 1, 4, "#2f2a24");
  rect(X + 31, Y + 8, 3, 1, "#2f2a24");
  // 2階の窓
  for (const wx of [5, 21, 37, 53]) rect(X + wx, Y + 20, 6, 7, "#7fb6d6");
  rect(X + 1, Y + 30, 62, 2, "#d6cfbf");
  // 1階の窓（扉のマス以外）
  for (const wx of [5, 37, 53]) rect(X + wx, Y + 35, 6, 7, "#7fb6d6");
  drawDoor(...doorAt(X, Y, 1, 2), "#7a5235", "#5a3e2b");
}
function drawHarbor(X: number, Y: number) {
  rect(X + 1, Y + 12, 30, 20, "#f2efe6");
  rect(X, Y + 1, 32, 12, "#2f6f8f");
  for (let i = 0; i < 3; i++) rect(X, Y + 4 * i + 3, 32, 1, "#255a75");
  // 看板（いかり）
  rect(X + 19, Y + 3, 9, 8, "#f6efd9");
  rect(X + 23, Y + 4, 1, 6, "#2f6f8f");
  rect(X + 21, Y + 5, 5, 1, "#2f6f8f");
  rect(X + 20, Y + 8, 7, 1, "#2f6f8f");
  rect(X + 20, Y + 7, 1, 1, "#2f6f8f");
  rect(X + 26, Y + 7, 1, 1, "#2f6f8f");
  // 丸窓
  rect(X + 21, Y + 18, 6, 6, "#255a75");
  rect(X + 22, Y + 19, 4, 4, "#7fb6d6");
  rect(X + 1, Y + 28, 30, 1, "#d9d3c4");
  drawDoor(...doorAt(X, Y, 0, 1), "#3f6f8a", "#2a4a5c");
}
function drawRadio(X: number, Y: number) {
  rect(X + 1, Y + 12, 30, 20, "#e6dccb");
  rect(X, Y + 9, 32, 4, "#a8473a");
  rect(X, Y + 12, 32, 1, "#86372d");
  // 屋根の上のアンテナ塔
  rect(X + 22, Y - 4, 1, 13, "#7d8790");
  rect(X + 27, Y - 4, 1, 13, "#7d8790");
  for (let i = 0; i < 4; i++) rect(X + 22, Y - 3 + i * 3, 6, 1, "#9aa4ad");
  rect(X + 24, Y - 8, 2, 4, "#7d8790");
  rect(X + 24, Y - 10, 2, 2, "#e0453a");
  // 窓と「放送中」のランプ
  rect(X + 19, Y + 18, 9, 7, "#7fb6d6");
  rect(X + 19, Y + 15, 9, 2, "#2f2a24");
  rect(X + 22, Y + 15, 3, 2, "#e0453a");
  drawDoor(...doorAt(X, Y, 0, 1), "#7a5235", "#5a3e2b");
}
function drawDev(X: number, Y: number) {
  rect(X + 1, Y + 8, 46, 24, "#cfd8dc");
  rect(X, Y + 5, 48, 4, "#455a64");
  rect(X, Y + 8, 48, 1, "#37474f");
  // 看板（歯車）
  rect(X + 20, Y, 9, 9, "#f6efd9");
  rect(X + 22, Y + 2, 5, 5, "#607d8b");
  rect(X + 24, Y + 1, 1, 7, "#607d8b");
  rect(X + 21, Y + 4, 7, 1, "#607d8b");
  rect(X + 24, Y + 4, 1, 1, "#f6efd9");
  // 2階と1階の窓
  for (const wx of [4, 12, 20, 28, 36]) rect(X + wx, Y + 11, 6, 4, "#7fb6d6");
  rect(X + 1, Y + 16, 46, 1, "#b0bec5");
  for (const wx of [4, 36]) {
    rect(X + wx, Y + 19, 8, 8, "#7fb6d6");
    rect(X + wx, Y + 23, 8, 1, "#cfd8dc");
  }
  drawDoor(...doorAt(X, Y, 1, 1), "#78909c", "#455a64");
}
const BUILDING_ART: Record<string, (X: number, Y: number) => void> = {
  house: drawHouse, cafe: drawCafe, library: drawLibrary, hall: drawHall, harbor: drawHarbor, radio: drawRadio, dev: drawDev,
};

// 桟橋：板張りの道が海へのびる
function drawPier() {
  const { x, y, h } = HARBOR.pier;
  const X = x * TILE, Y = y * TILE;
  rect(X + 1, Y, 14, h * TILE, "#b08850");
  for (let i = 0; i < h * 4; i++) rect(X + 1, Y + i * 4 + 3, 14, 1, "#8a6a3c");
  rect(X + 1, Y, 1, h * TILE, "#8a6a3c");
  rect(X + 14, Y, 1, h * TILE, "#8a6a3c");
  // 杭
  for (let i = 0; i < h; i++) {
    rect(X, Y + i * TILE + 12, 2, 4, "#5a3e2b");
    rect(X + 14, Y + i * TILE + 12, 2, 4, "#5a3e2b");
  }
}
// 船：桟橋の右に、へさきを右に向けて停まっている
function drawShip() {
  const { x, y } = HARBOR.ship;
  const X = x * TILE, Y = y * TILE;
  // 船体（へさきに向かって細くなる）
  rect(X + 1, Y + 16, 38, 8, "#f6efd9");
  rect(X + 39, Y + 16, 4, 6, "#f6efd9");
  rect(X + 43, Y + 16, 3, 4, "#f6efd9");
  rect(X + 3, Y + 24, 35, 3, "#c4473a");
  rect(X + 38, Y + 22, 4, 3, "#c4473a");
  rect(X + 1, Y + 16, 45, 1, "#d9d3c4");
  rect(X + 5, Y + 27, 31, 1, "#2c6a96"); // 水面の影
  // 船室と窓
  rect(X + 8, Y + 7, 20, 9, "#ffffff");
  rect(X + 8, Y + 6, 20, 1, "#3f6f8a");
  for (const wx of [11, 17, 23]) rect(X + wx, Y + 10, 3, 3, "#3f6f8a");
  // えんとつ
  rect(X + 30, Y + 4, 5, 12, "#3f6f8a");
  rect(X + 30, Y + 4, 5, 2, "#c4473a");
  // 浮き輪
  rect(X + 3, Y + 18, 3, 3, "#e0453a");
  rect(X + 4, Y + 19, 1, 1, "#f6efd9");
}
function drawBuilding(b: Building) {
  BUILDING_ART[b.id]?.(b.x * TILE, b.y * TILE);
}

/* ---------- 種 ---------- */
function drawMound(X: number, Y: number, color = "#6b4226") {
  rect(X + 5, Y + 11, 6, 2, color);
  rect(X + 6, Y + 10, 4, 1, color);
}
// 蒔いたばかりの種（まだ誰も水やりしていない）。土の上に、小さな種がのぞいている
function drawSeed(X: number, Y: number) {
  hiSeed(rect, X, Y);
}
function drawSprout(X: number, Y: number, _size: number, pale: boolean) {
  hiSprout(rect, X, Y, pale);
}
function drawSparkle(X: number, Y: number, t: number, tx: number) {
  hiSparkle(rect, X, Y, t, tx);
}
// 満員（5人が水やり）になった種。村人の優しさで咲いた花
function drawFlower(X: number, Y: number) {
  hiFlower(rect, X, Y);
}

// 種の育ち具合は3段階だけ見せる（水やりの人数がわからないように）。0回=種、1〜4回=芽、満員=花
type Stage = "seed" | "sprout" | "flower";
const stageOf = (waterCount: number): Stage => (waterCount >= 5 ? "flower" : waterCount > 0 ? "sprout" : "seed");
function drawStage(X: number, Y: number, stage: Stage, pale = false) {
  if (stage === "flower") drawFlower(X, Y);
  else if (stage === "sprout") drawSprout(X, Y, 2, pale);
  else drawSeed(X, Y);
}

/* ---------- 村人 ---------- */
// 歩いている途中も含めた、村人の今の位置（マス単位）。着く手前でゆっくりになる
export function playerPos(p: Player, t: number, ms = MOVE_MS) {
  const k = Math.min(1, Math.max(0, (t - p.moveStart) / ms));
  const e = 1 - (1 - k) * (1 - k);
  return { fx: p.fromX + (p.x - p.fromX) * e, fy: p.fromY + (p.y - p.fromY) * e, moving: k < 1 };
}

// 村人が画面の中央に来るカメラ位置。マップの端からははみ出さない
function camera(p: Player, t: number, v: ViewSize) {
  const { fx, fy } = playerPos(p, t);
  const m = MARGIN * TILE;
  // 画面のほうが広いときは、真ん中に寄せる
  const clamp = (n: number, min: number, max: number) =>
    Math.round(min > max ? (min + max) / 2 : Math.min(Math.max(n, min), max));
  return {
    x: clamp(fx * TILE + TILE / 2 - v.w / 2, -m, W - v.w + m),
    y: clamp(fy * TILE + TILE / 2 - v.h * v.focusY, -NORTH, H - v.h + SOUTH),
  };
}

// 足踏みのコマ。-1 = 立ち止まり、0..3 = 歩き（0,2 = 足がそろう / 1,3 = 左右の足が前）
function walkPhase(p: Player, t: number, moving: boolean) {
  return t < p.walkUntil || moving ? (1 + Math.floor((t - p.walkStart) / 115)) % 4 : -1;
}

function drawPlayer(p: Player, t: number) {
  const { fx, fy, moving } = playerPos(p, t);
  // 半ドット（0.5単位）にそろえて、ドットがにじまないようにする
  const X = Math.round(fx * TILE * 2) / 2, Y = Math.round(fy * TILE * 2) / 2;
  hiFarmer(rect, X, Y, p.dir, walkPhase(p, t, moving));
}

/* ---------- 村長（長老） ---------- */
// 1マス歩くのにかける時間。村人よりずっとゆっくり
export const MAYOR_MOVE_MS = 700;
export const mayorPos = (p: Player, t: number) => playerPos(p, t, MAYOR_MOVE_MS);

function drawMayor(p: Player, t: number) {
  const { fx, fy, moving } = mayorPos(p, t);
  const X = Math.round(fx * TILE * 2) / 2, Y = Math.round(fy * TILE * 2) / 2;
  // 村人よりゆっくり足を運ぶ
  const ph = moving ? (1 + Math.floor((t - p.walkStart) / 230)) % 4 : -1;
  hiMayor(rect, X, Y, p.dir, ph);
}

function drawEffects(t: number) {
  effects = effects.filter((e) => t - e.start < e.duration);
  for (const e of effects) {
    const X = e.x * TILE, Y = e.y * TILE;
    const k = (t - e.start) / e.duration;
    if (e.type === "water") {
      for (let i = 0; i < 5; i++) {
        const dy = ((t - e.start) / 6 + i * 7) % 18;
        rect(X + 2 + i * 3, Y - 4 + dy, 1, 2, "#9ed3e6");
      }
      rect(X + 3, Y + 13, 10 * Math.min(1, k * 2), 1, "#5fa8c8");
    }
    if (e.type === "sow") {
      const r = Math.floor(k * 6);
      rect(X + 8 - r, Y + 8, 1, 1, "#fff6c2");
      rect(X + 8 + r, Y + 8, 1, 1, "#fff6c2");
      rect(X + 8, Y + 8 - r, 1, 1, "#fff6c2");
    }
  }
}

/* ---------- 家の中 ---------- */
function drawFloor(X: number, Y: number, tx: number) {
  rect(X, Y, 16, 16, "#c89b6a");
  for (let i = 0; i < 4; i++) rect(X, Y + i * 4 + 3, 16, 1, "#b4875a");
  rect(X + ((tx * 5) % 12) + 2, Y, 1, 4, "#b4875a");
  rect(X + ((tx * 7 + 6) % 12) + 2, Y + 8, 1, 4, "#b4875a");
}
function drawBackWall(X: number, Y: number) {
  rect(X, Y, 16, 16, "#e3d3b0");
  for (let i = 0; i < 4; i++) rect(X + i * 4 + 1, Y + 4, 1, 9, "#d6c49e");
  rect(X, Y, 16, 4, "#3a2e24");
  rect(X, Y + 13, 16, 3, "#8a6a48");
}
function drawBookshelf(X: number, Y: number) {
  // 2マスぶんの幅で、奥の壁に立てかけてある
  rect(X + 1, Y - 6, 30, 21, "#6b4a2e");
  rect(X + 2, Y - 5, 28, 19, "#4f3520");
  const colors = ["#c4473a", "#3f6fb0", "#e2c15a", "#4f8f3a", "#f6efd9", "#8a5aa8"];
  for (let row = 0; row < 3; row++) {
    const sy = Y - 5 + row * 6;
    for (let i = 0; i < 9; i++) {
      const h = 4 + ((i + row) % 2);
      rect(X + 3 + i * 3, sy + 5 - h, 2, h, colors[(i * 2 + row) % colors.length]);
    }
    rect(X + 2, sy + 5, 28, 1, "#6b4a2e");
  }
}
function drawBed(X: number, Y: number) {
  // 縦に2マス
  rect(X + 1, Y - 2, 14, 32, "#7a5235");
  rect(X + 2, Y, 12, 29, "#f4efe2");
  rect(X + 3, Y + 1, 10, 5, "#ffffff");
  rect(X + 3, Y + 5, 10, 1, "#ddd6c4");
  rect(X + 2, Y + 10, 12, 19, "#5a8ad0");
  rect(X + 2, Y + 10, 12, 2, "#7aa6e0");
  for (const by of [16, 22]) rect(X + 2, Y + by, 12, 1, "#4a78bc");
}
function drawTable(X: number, Y: number) {
  // 横に2マス
  rect(X + 3, Y + 10, 2, 5, "#5a3e2b");
  rect(X + 27, Y + 10, 2, 5, "#5a3e2b");
  rect(X + 1, Y + 2, 30, 9, "#a0703f");
  rect(X + 1, Y + 2, 30, 1, "#b8854f");
  rect(X + 1, Y + 10, 30, 1, "#7a5235");
  // マグカップ
  rect(X + 20, Y + 3, 4, 4, "#f6efd9");
  rect(X + 24, Y + 4, 1, 2, "#f6efd9");
  rect(X + 21, Y + 4, 2, 1, "#6b4a2e");
}
function drawDoorMat(X: number, Y: number) {
  rect(X + 2, Y + 1, 12, 11, "#9c3d34");
  rect(X + 3, Y + 2, 10, 9, "#b84c40");
  rect(X + 3, Y + 6, 10, 1, "#9c3d34");
}

function houseLayer(): SkPicture {
  const room = ROOMS.house.map;
  const cols = room[0].length, rows = room.length;
  const at = (x: number, y: number) => roomTileAt("house", x, y);
  return createPicture((canvas) => {
    cv = canvas;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const X = x * TILE, Y = y * TILE;
        const c = at(x, y);
        if (c === "#") {
          if (y === 0 && x > 0 && x < cols - 1) drawBackWall(X, Y);
          else rect(X, Y, 16, 16, "#3a2e24");
        } else {
          drawFloor(X, Y, x);
          if (c === "E") drawDoorMat(X, Y);
        }
      }
    }
    // 奥の壁の窓
    rect(4 * TILE + 3, 3, 10, 9, "#8a6a48");
    rect(4 * TILE + 4, 4, 8, 7, "#a8d4ec");
    rect(4 * TILE + 8, 4, 1, 7, "#8a6a48");
    // 家具（左上のマスを起点に描く）
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = at(x, y);
        const first = at(x - 1, y) !== c && at(x, y - 1) !== c;
        if (!first) continue;
        if (c === "K") drawBookshelf(x * TILE, y * TILE);
        if (c === "B") drawBed(x * TILE, y * TILE);
        if (c === "L") drawTable(x * TILE, y * TILE);
      }
    }
  }, Skia.XYWHRect(0, -TILE, cols * TILE, (rows + 1) * TILE));
}

/* ---------- カフェの中 ---------- */
function drawCafeFloor(X: number, Y: number, tx: number, ty: number) {
  // 市松模様の床
  rect(X, Y, 16, 16, (tx + ty) % 2 ? "#a77a52" : "#b98b5f");
  rect(X, Y + 15, 16, 1, "rgba(0,0,0,0.08)");
}
function drawCafeWall(X: number, Y: number, tx: number) {
  rect(X, Y, 16, 16, "#5a3e2b");
  rect(X, Y, 16, 3, "#3a2a1e");
  // 棚とカップ
  rect(X, Y + 8, 16, 2, "#8a6a48");
  if (tx % 2 === 0) {
    rect(X + 3, Y + 5, 3, 3, "#f6efd9");
    rect(X + 9, Y + 5, 3, 3, "#c4473a");
  } else {
    rect(X + 4, Y + 3, 3, 5, "#6f9a44"); // びん
    rect(X + 10, Y + 5, 3, 3, "#f6efd9");
  }
  // 腰板
  rect(X, Y + 12, 16, 4, "#7a5235");
}
function drawCounter(X: number, Y: number, tx: number) {
  rect(X, Y + 1, 16, 5, "#c89060");
  rect(X, Y + 1, 16, 1, "#e0ad78");
  rect(X, Y + 6, 16, 10, "#7a5235");
  rect(X + 2, Y + 8, 12, 6, "#6b4a2e");
  if (tx === 9) { rect(X + 5, Y - 2, 6, 4, "#cfd8dc"); rect(X + 7, Y - 4, 2, 2, "#455a64"); } // コーヒーメーカー
  // 座っている村人の前にはカップ
  if (CAFE_GUESTS[keyOf(tx, 3)]) { rect(X + 6, Y + 1, 4, 3, "#f6efd9"); rect(X + 10, Y + 2, 1, 1, "#f6efd9"); }
}
function drawPottedPlant(X: number, Y: number) {
  rect(X + 5, Y + 10, 6, 5, "#b5523b");
  rect(X + 5, Y + 10, 6, 1, "#93402d");
  rect(X + 3, Y + 2, 10, 8, "#4f8f3a");
  rect(X + 5, Y, 6, 3, "#5e9e4e");
  rect(X + 4, Y + 4, 2, 2, "#7cc35a");
  rect(X + 10, Y + 6, 2, 2, "#7cc35a");
}
function drawCafeTable(X: number, Y: number) {
  rect(X + 7, Y + 10, 2, 5, "#5a3e2b");
  rect(X + 4, Y + 14, 8, 1, "#5a3e2b");
  rect(X + 1, Y + 4, 14, 7, "#a0703f");
  rect(X + 1, Y + 4, 14, 1, "#b8854f");
  rect(X + 1, Y + 10, 14, 1, "#7a5235");
  // カップと湯気
  rect(X + 3, Y + 5, 3, 3, "#f6efd9");
  rect(X + 4, Y + 6, 1, 1, "#6b4a2e");
  rect(X + 10, Y + 5, 3, 3, "#f6efd9");
}
function drawStool(X: number, Y: number) {
  rect(X + 7, Y + 10, 2, 5, "#5a3e2b");
  rect(X + 5, Y + 14, 6, 1, "#5a3e2b");
  rect(X + 3, Y + 7, 10, 4, "#c4473a");
  rect(X + 3, Y + 7, 10, 1, "#e06a5c");
}
function drawChair(X: number, Y: number) {
  rect(X + 3, Y + 2, 10, 3, "#7a5235");
  rect(X + 3, Y + 10, 10, 3, "#8a6a48");
  rect(X + 3, Y + 2, 2, 13, "#5a3e2b");
  rect(X + 11, Y + 2, 2, 13, "#5a3e2b");
}
// 天井から下がるランプのあかり
function drawLamp(X: number, Y: number) {
  rect(X + 7, Y - 16, 1, 10, "#3a2a1e");
  rect(X + 4, Y - 6, 8, 3, "#e2c15a");
  rect(X + 5, Y - 3, 6, 1, "#fff6c2");
}

// 部屋の絵。base は床と壁、rows[y] はその行に置いた家具や村人。
// 村人より下の行にあるものは村人のあとに描いて、手前に重なるようにする
type RoomArt = { base: SkPicture; rows: SkPicture[] };

function cafeArt(): RoomArt {
  const room = ROOMS.cafe.map;
  const cols = room[0].length, rows = room.length;
  const at = (x: number, y: number) => roomTileAt("cafe", x, y);
  const bounds = Skia.XYWHRect(0, -TILE, cols * TILE, (rows + 1) * TILE);
  const base = createPicture((canvas) => {
    cv = canvas;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const X = x * TILE, Y = y * TILE;
        const c = at(x, y);
        if (c === "#") {
          if (y === 0 && x > 0 && x < cols - 1) drawCafeWall(X, Y, x);
          else rect(X, Y, 16, 16, "#2e2219");
        } else {
          drawCafeFloor(X, Y, x, y);
          if (c === "E") drawDoorMat(X, Y);
        }
      }
    }
  }, bounds);
  const rowArt = Array.from({ length: rows }, (_, y) => createPicture((canvas) => {
    cv = canvas;
    for (let x = 0; x < cols; x++) {
      const X = x * TILE, Y = y * TILE;
      const c = at(x, y);
      if (c === "O") drawAnimal(rect, "owl", X, Y + 3);
      if (c === "C") drawCounter(X, Y, x);
      if (c === "P") drawPottedPlant(X, Y);
      if (c === "a") {
        drawChair(X, Y);
        const guest = CAFE_GUESTS[keyOf(x, y)];
        if (guest) drawAnimal(rect, guest, X, Y - 2);
      }
      if (c === "T") { drawCafeTable(X, Y); drawLamp(X, Y); }
      if (c === "s") drawStool(X, Y);
      if (c === "g") {
        // カウンターに向かって座っている村人（後ろ姿）
        drawStool(X, Y);
        const guest = CAFE_GUESTS[keyOf(x, y)];
        if (guest) drawAnimal(rect, guest, X, Y - 6, true);
      }
    }
    // あたたかい明かり（最後の行でまとめて重ねる）
    if (y === rows - 1) rect(0, 0, cols * TILE, rows * TILE, "rgba(255,190,110,0.08)");
  }, bounds));
  return { base, rows: rowArt };
}

/* ---------- 村役場の中 ---------- */
function drawHallFloor(X: number, Y: number, tx: number, ty: number) {
  // 明るいタイルの床
  rect(X, Y, 16, 16, (tx + ty) % 2 ? "#d8d2c4" : "#e2dccf");
  rect(X, Y, 16, 1, "#cbc4b4");
  rect(X, Y, 1, 16, "#cbc4b4");
}
function drawHallWall(X: number, Y: number) {
  rect(X, Y, 16, 16, "#efe6d2");
  rect(X, Y, 16, 3, "#8a7a64");
  // 腰板
  rect(X, Y + 11, 16, 5, "#b9a27c");
  rect(X, Y + 11, 16, 1, "#cdb894");
}
// 掲示板（2マスぶん）。奥の壁に掛かっていて、紙のお知らせが貼ってある
function drawBulletinBoard(X: number, Y: number) {
  rect(X + 1, Y - 12, 30, 22, "#7a5235");
  rect(X + 3, Y - 10, 26, 18, "#c99a62");
  const notes: [number, number, number, number, string][] = [
    [5, -9, 8, 7, "#f6efd9"], [15, -8, 9, 6, "#fff6c2"], [6, -1, 7, 7, "#d8ecf4"], [16, -1, 10, 7, "#f6efd9"],
  ];
  for (const [nx, ny, w, h, c] of notes) {
    rect(X + nx, Y + ny, w, h, c);
    rect(X + nx + 1, Y + ny + 2, w - 2, 1, "#9b9384");
    rect(X + nx + 1, Y + ny + 4, w - 3, 1, "#9b9384");
    rect(X + nx + Math.floor(w / 2), Y + ny, 1, 1, "#c4473a"); // 画びょう
  }
}
function drawHallCounter(X: number, Y: number) {
  rect(X, Y + 1, 16, 5, "#d9d4c8");
  rect(X, Y + 1, 16, 1, "#f2efe8");
  rect(X, Y + 6, 16, 10, "#5f7f9a");
  rect(X + 2, Y + 8, 12, 6, "#53718a");
}
// 窓口の上の札（係員の上）
function drawWindowSign(X: number, Y: number) {
  rect(X + 1, Y - 14, 14, 6, "#3f6fb0");
  rect(X + 2, Y - 13, 12, 4, "#5a8ad0");
  for (let i = 0; i < 4; i++) rect(X + 3 + i * 3, Y - 12, 2, 2, "#f6efd9");
}
function drawBench(X: number, Y: number) {
  rect(X, Y + 6, 16, 4, "#a0703f");
  rect(X, Y + 6, 16, 1, "#b8854f");
  rect(X, Y + 2, 16, 3, "#8a5c33");
  rect(X + 2, Y + 10, 2, 5, "#5a3e2b");
  rect(X + 12, Y + 10, 2, 5, "#5a3e2b");
}

function hallArt(): RoomArt {
  const room = ROOMS.hall.map;
  const cols = room[0].length, rows = room.length;
  const at = (x: number, y: number) => roomTileAt("hall", x, y);
  const bounds = Skia.XYWHRect(0, -TILE, cols * TILE, (rows + 1) * TILE);
  const base = createPicture((canvas) => {
    cv = canvas;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const X = x * TILE, Y = y * TILE;
        const c = at(x, y);
        if (c === "#") {
          if (y === 0 && x > 0 && x < cols - 1) drawHallWall(X, Y);
          else rect(X, Y, 16, 16, "#5c5246");
        } else {
          drawHallFloor(X, Y, x, y);
          if (c === "E") drawDoorMat(X, Y);
        }
      }
    }
  }, bounds);
  const rowArt = Array.from({ length: rows }, (_, y) => createPicture((canvas) => {
    cv = canvas;
    for (let x = 0; x < cols; x++) {
      const X = x * TILE, Y = y * TILE;
      const c = at(x, y);
      // 掲示板は2マスぶん。左のマスを起点に描く
      if (c === "N" && at(x - 1, y) !== "N") drawBulletinBoard(X, Y);
      if (c === "K") { drawWindowSign(X, Y); drawAnimal(rect, "tanuki", X, Y + 3); }
      if (c === "C") drawHallCounter(X, Y);
      if (c === "P") drawPottedPlant(X, Y);
      if (c === "L") {
        drawBench(X, Y);
        const guest = HALL_GUESTS[keyOf(x, y)];
        if (guest) drawAnimal(rect, guest, X, Y - 4);
      }
    }
  }, bounds));
  return { base, rows: rowArt };
}

// 部屋は画面より小さいので、村人を置く高さに部屋の真ん中を合わせる
function roomCamera(id: RoomId, p: Player, t: number, v: ViewSize) {
  const { fx } = playerPos(p, t);
  const room = ROOMS[id].map;
  const RW = room[0].length * TILE, RH = room.length * TILE;
  const x = RW <= v.w ? (RW - v.w) / 2 : Math.min(Math.max(fx * TILE + TILE / 2 - v.w / 2, 0), RW - v.w);
  return { x: Math.round(x), y: Math.round(RH / 2 - v.h * v.focusY) };
}

function roomFrame(id: RoomId, art: RoomArt, scene: Scene, t: number, v: ViewSize): SkPicture {
  return createPicture((canvas) => {
    cv = canvas;
    rect(0, 0, v.w, v.h, "#1a1612");
    const cam = roomCamera(id, scene.player, t, v);
    canvas.save();
    canvas.translate(-cam.x, -cam.y);
    canvas.drawPicture(art.base);
    // 村人の立っている行までは奥、それより下の行は手前に描く
    const { fy } = playerPos(scene.player, t);
    art.rows.forEach((pic, y) => { if (y <= fy) canvas.drawPicture(pic); });
    // 丸椅子に座っているときは、少し上に描いて腰かけた形にする
    const p = scene.player;
    const seated = roomTileAt(id, p.x, p.y) === "s" && fy === p.y;
    if (seated) { canvas.save(); canvas.translate(0, -6); }
    drawPlayer(p, t);
    if (seated) canvas.restore();
    art.rows.forEach((pic, y) => { if (y > fy) canvas.drawPicture(pic); });
    canvas.restore();
  }, { width: v.w, height: v.h });
}

/* ---------- 1フレーム ---------- */
// 波・池・郵便受け以外は動かないので、一度だけ描いておく（まわりの海も含める）
function staticLayer(): SkPicture {
  return createPicture((canvas) => {
    cv = canvas;
    for (let y = -DESERT_DEPTH - MARGIN; y < ROWS + SOUTH_TILES; y++) {
      for (let x = -MARGIN; x < COLS + MARGIN; x++) {
        const X = x * TILE, Y = y * TILE;
        const c = tileAt(x, y);
        if (ON_SEA.has(c)) drawSea(X, Y, x, y);
        else if (c === "D") drawDesert(X, Y, x, y);
        else if (c === "W") drawStorm(X, Y);
        else if (c === "." || c === "H") drawGrass(X, Y, x, y);
        else if (c === ",") drawSoil(X, Y, x, y);
        else if (c === "P") drawPath(X, Y, x, y);
        else if (c === "T") drawTree(X, Y, x, y);
        else if (c === "F") drawFence(X, Y, x, y);
      }
    }
    BUILDINGS.forEach(drawBuilding);
    drawPier();
    drawShip();
  }, Skia.XYWHRect(-MARGIN * TILE, -NORTH, W + 2 * MARGIN * TILE, H + NORTH + SOUTH));
}

function frame(base: SkPicture, scene: Scene, t: number, v: ViewSize): SkPicture {
  return createPicture((canvas) => {
    cv = canvas;
    const cam = camera(scene.player, t, v);
    // 画面に入るマスの範囲（はしの半端なマスも含める）
    const x0 = Math.floor(cam.x / TILE), x1 = Math.ceil((cam.x + v.w) / TILE);
    const y0 = Math.floor(cam.y / TILE), y1 = Math.ceil((cam.y + v.h) / TILE);
    const inView = (x: number, y: number) => x >= x0 - 1 && x <= x1 && y >= y0 - 1 && y <= y1;

    canvas.save();
    canvas.translate(-cam.x, -cam.y);
    canvas.drawPicture(base);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = tileAt(x, y);
        if (c === "S") drawSeaWave(x * TILE, y * TILE, x, y, t);
        else if (c === "W") drawStormWind(x * TILE, y * TILE, x, y, t);
        else if (c === "~") drawWater(x * TILE, y * TILE, x, t);
        else if (c === "M") drawMailbox(x * TILE, y * TILE, x, y, scene.hasUnread);
      }
    }
    const { x: px, y: py } = scene.player;
    for (const s of scene.seeds) {
      if (!inView(s.x, s.y)) continue;
      const X = s.x * TILE, Y = s.y * TILE;
      const kind = scene.kindOf(s);
      // 自分の種：水やりされるまでは種、水やりされると芽、満員で花
      if (kind === "mine") drawStage(X, Y, stageOf(s.waterCount || 0));
      else if (kind === "mine-review") drawMound(X, Y, "#7d7666");
      else if (kind === "watered") drawStage(X, Y, stageOf(s.waterCount || 0), true);
      else if (kind === "full") drawFlower(X, Y);
      else if (kind === "open" && Math.abs(s.x - px) + Math.abs(s.y - py) <= 2) drawSparkle(X, Y, t, s.x);
    }
    drawEffects(t);
    // 村長と村人は、手前（下）にいるほうをあとに描く
    const mayorY = mayorPos(scene.mayor, t).fy, playerY = playerPos(scene.player, t).fy;
    if (mayorY <= playerY) { drawMayor(scene.mayor, t); drawPlayer(scene.player, t); }
    else { drawPlayer(scene.player, t); drawMayor(scene.mayor, t); }
    canvas.restore();
  }, { width: v.w, height: v.h });
}

// 横に約 VIEW_TILES_ACROSS マス見える倍率。ドットがにじまないよう端末の画素に合わせて丸める
function scaleFor(width: number) {
  // 1ドット（0.5単位）が端末の画素にぴったり合うよう、倍率を 2/pr 刻みにそろえる
  const pr = PixelRatio.get();
  return Math.max(2 / pr, Math.round((width / (VIEW_TILES_ACROSS * TILE)) * pr / 2) * 2 / pr);
}

// 画面いっぱいに敷くマップ。親が大きさを決める（absoluteFill などで置く）
export function FarmMap({ scene, paused, focusY = 0.5 }: { scene: RefObject<Scene>; paused: boolean; focusY?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const base = useMemo(() => staticLayer(), []);
  const rooms = useMemo<Record<RoomId, RoomArt>>(
    () => ({ house: { base: houseLayer(), rows: [] }, cafe: cafeArt(), hall: hallArt() }),
    [],
  );
  const picture = useSharedValue<SkPicture>(base);
  const scale = size.width ? scaleFor(size.width) : 1;
  const view = useMemo(
    () => ({ w: size.width / scale, h: size.height / scale, focusY }),
    [size.width, size.height, scale, focusY],
  );

  useEffect(() => {
    if (paused || !view.w) return;
    let raf = 0;
    const loop = (t: number) => {
      const sc = scene.current;
      picture.value = sc.area === "farm" ? frame(base, sc, t, view) : roomFrame(sc.area, rooms[sc.area], sc, t, view);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [base, rooms, scene, picture, paused, view]);

  return (
    <View
      style={s.fill}
      onLayout={(e: LayoutChangeEvent) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      accessibilityLabel="農園のマップ"
      accessibilityRole="image"
    >
      {size.width > 0 ? (
        <Canvas style={s.fill}>
          <Group transform={[{ scale }]}>
            <Picture picture={picture} />
          </Group>
        </Canvas>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#3b7fae" },
});
