import {
  Canvas, FilterMode, Group, MipmapMode, Picture, Skia, type SkCanvas, type SkPaint, type SkPicture, createPicture,
} from "@shopify/react-native-skia";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, PixelRatio, Pressable, StyleSheet, Text, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import type { Seed } from "@/lib/farm-api";
import {
  type Area, BUILDINGS, type Building, CAFE_GUESTS, HALL_GUESTS, COLS, type Dir, MAX_WATERERS, HARBOR, ON_SEA, ROOMS, ROWS, type RoomId, TILE,
  VIEW_TILES_ACROSS, cropById, keyOf, roomTileAt, tileAt,
} from "@/lib/game";
import { drawAnimal } from "./animals";
import { flowerImage } from "./flowers";

export const MOVE_MS = 150;
const W = COLS * TILE; // マップ全体
const H = ROWS * TILE;
// 画面に映す範囲（マップの画素単位）と、村人を置く高さ（画面の上からの割合）
type ViewSize = { w: number; h: number; focusY: number };
const MARGIN = 2; // マップの外にも海を何マスぶん見せるか
const NORTH = MARGIN * TILE;
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
// ほかの村人。look は服の色の組み合わせ（ID から決める）
export type Other = Player & { look: number };

export type Scene = {
  area: Area;
  player: Player;
  mayor: Player; // 村のマップを道に沿ってゆっくり歩く村長
  others: Map<string, Other>; // 同じ場所にいる、ほかの村人（src/state/village.ts）
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
  rect(X, Y, 16, 16, "#8dbf5a");
  const h = hash(tx, ty);
  for (let i = 0; i < 4; i++) {
    const gx = ((h >> (i * 4)) % 14) + 1;
    const gy = ((h >> (i * 4 + 2)) % 13) + 1;
    rect(X + gx, Y + gy, 1, 2, "#6fa347");
  }
}
function drawSoil(X: number, Y: number) {
  rect(X, Y, 16, 16, "#8a5a34");
  for (const r of [3, 7, 11, 15]) rect(X, Y + r, 16, 1, "#6f4526");
  rect(X + 3, Y + 1, 2, 1, "#a06c42");
  rect(X + 10, Y + 9, 2, 1, "#a06c42");
}
function drawPath(X: number, Y: number, tx: number, ty: number) {
  rect(X, Y, 16, 16, "#d8c28e");
  const h = hash(tx, ty);
  rect(X + (h % 12) + 2, Y + ((h >> 3) % 12) + 2, 2, 1, "#bfa674");
  rect(X + ((h >> 6) % 12) + 2, Y + ((h >> 9) % 12) + 2, 1, 1, "#bfa674");
}
function drawWater(X: number, Y: number, tx: number, t: number) {
  rect(X, Y, 16, 16, "#5fa8c8");
  const o = Math.floor(t / 280 + tx * 3) % 12;
  rect(X + o, Y + 4, 4, 1, "#9ed3e6");
  rect(X + ((o + 6) % 12), Y + 10, 3, 1, "#9ed3e6");
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
  rect(X + 7, Y + 11, 2, 4, "#6b4a2e");
  rect(X + 2, Y + 1, 12, 10, "#3e7a3a");
  rect(X + 1, Y + 3, 14, 6, "#3e7a3a");
  rect(X + 4, Y + 3, 4, 2, "#5e9e4e");
  rect(X + 9, Y + 6, 2, 2, "#5e9e4e");
}
function drawFence(X: number, Y: number, tx: number, ty: number) {
  drawGrass(X, Y, tx, ty);
  rect(X, Y + 7, 16, 2, "#a9845a");
  rect(X, Y + 11, 16, 1, "#a9845a");
  rect(X + 2, Y + 5, 2, 9, "#7a5a3a");
  rect(X + 12, Y + 5, 2, 9, "#7a5a3a");
}
function drawMailbox(X: number, Y: number, tx: number, ty: number, hasUnread: boolean) {
  drawGrass(X, Y, tx, ty);
  rect(X + 7, Y + 8, 2, 8, "#6b4a2e");
  rect(X + 4, Y + 3, 8, 6, "#c4473a");
  rect(X + 4, Y + 3, 8, 1, "#e06a5c");
  if (hasUnread) { rect(X + 12, Y + 1, 2, 5, "#7a5a3a"); rect(X + 12, Y + 1, 3, 2, "#f2d04b"); }
}
// 岩場（海岸の崖）。草の上に灰茶の岩
function drawRock(X: number, Y: number, tx: number, ty: number) {
  drawGrass(X, Y, tx, ty);
  const h = hash(tx, ty);
  rect(X + 1, Y + 4, 14, 11, "#8a8478");
  rect(X + 3, Y + 2, 10, 2, "#8a8478");
  rect(X + 3, Y + 3, 5, 3, "#aaa498"); // 光の当たる面
  rect(X + 11, Y + 5, 3, 9, "#77716a");
  rect(X + 1, Y + 13, 14, 2, "#6b665c"); // 足元の影
  if (h % 3 === 0) rect(X + 4 + (h % 5), Y + 8, 4, 1, "#6b665c"); // ひび
}
// 丘の崖（ラジオ局の丘）。上が丘の草地なら、ふちに草をかぶせる
const CLIFF = new Set(["X", "^"]);
function drawCliff(X: number, Y: number, tx: number, ty: number) {
  rect(X, Y, 16, 16, "#9c8b70");
  const h = hash(tx, ty);
  rect(X, Y + 5, 16, 1, "#85755c");
  rect(X, Y + 11, 16, 1, "#85755c");
  rect(X + (h % 10) + 2, Y + 1, 4, 3, "#b3a286");
  rect(X + ((h >> 5) % 10) + 1, Y + 7, 5, 3, "#b3a286");
  rect(X + ((h >> 9) % 12) + 2, Y + 12, 1, 3, "#7a6b55");
  if (!CLIFF.has(tileAt(tx, ty - 1))) { rect(X, Y, 16, 3, "#8dbf5a"); rect(X, Y + 3, 16, 1, "#6fa347"); }
  if (!CLIFF.has(tileAt(tx, ty + 1))) rect(X, Y + 14, 16, 2, "#7a6b55"); // ふもとの影
  if (tileAt(tx - 1, ty) === ".") rect(X, Y, 2, 16, "#8dbf5a"); // 横のふちの草
  if (tileAt(tx + 1, ty) === ".") rect(X + 14, Y, 2, 16, "#6fa347");
}
// 崖を下りる石段
function drawStairs(X: number, Y: number, tx: number, ty: number) {
  rect(X, Y, 16, 16, "#85755c");
  for (let i = 0; i < 4; i++) {
    rect(X + 1, Y + i * 4, 14, 3, "#d8cbb0");
    rect(X + 1, Y + i * 4 + 3, 14, 1, "#a8987a");
  }
  if (!CLIFF.has(tileAt(tx - 1, ty))) rect(X, Y, 1, 16, "#6b5d48");
  if (!CLIFF.has(tileAt(tx + 1, ty))) rect(X + 15, Y, 1, 16, "#6b5d48");
}
// 砂漠のサボテン
function drawCactus(X: number, Y: number, tx: number, ty: number) {
  drawDesert(X, Y, tx, ty);
  rect(X + 5, Y + 15, 6, 1, "#cfb070");
  rect(X + 6, Y + 2, 4, 13, "#4f8f3a");
  rect(X + 2, Y + 6, 2, 5, "#4f8f3a");
  rect(X + 2, Y + 10, 4, 2, "#4f8f3a");
  rect(X + 12, Y + 4, 2, 5, "#4f8f3a");
  rect(X + 10, Y + 8, 4, 2, "#4f8f3a");
  rect(X + 7, Y + 3, 1, 11, "#7cc35a");
}
// 砂漠の岩山
function drawMesa(X: number, Y: number, tx: number, ty: number) {
  drawDesert(X, Y, tx, ty);
  rect(X + 3, Y + 6, 10, 10, "#b8734a");
  rect(X + 5, Y + 1, 6, 5, "#b8734a");
  rect(X + 5, Y + 1, 6, 1, "#d39468");
  rect(X + 3, Y + 6, 2, 1, "#d39468");
  rect(X + 3, Y + 10, 10, 1, "#9a5c3a");
  rect(X + 10, Y + 2, 3, 14, "#9a5c3a"); // 影の面
}
// 広場のベンチ（村役場の待合のベンチと同じ絵）
function drawPlazaBench(X: number, Y: number, tx: number, ty: number) {
  drawPath(X, Y, tx, ty);
  drawBench(X, Y);
}
// 村の中央の焚き火（石の輪と薪）。炎は drawFlame で動かす
function drawCampfire(X: number, Y: number, tx: number, ty: number) {
  drawPath(X, Y, tx, ty);
  rect(X + 1, Y + 9, 14, 6, "#8a8478");
  rect(X + 1, Y + 9, 14, 1, "#aaa498");
  rect(X + 3, Y + 10, 10, 4, "#4a3c30");
  rect(X + 3, Y + 11, 10, 2, "#7a5235");
  rect(X + 6, Y + 10, 4, 1, "#5a3e2b");
}
function drawFlame(X: number, Y: number, t: number) {
  const k = Math.floor(t / 160) % 3;
  rect(X + 4, Y + 5, 8, 6, "#e8892b");
  rect(X + 5 + (k === 1 ? 1 : 0), Y + 3, 5, 2, "#e8892b");
  rect(X + 7 + (k === 2 ? -1 : k), Y + 1 + k, 2, 2, "#e8892b");
  rect(X + 6, Y + 6, 4, 5, "#f6d24a");
  rect(X + 7, Y + 5 - (k % 2), 2, 1, "#f6d24a");
  rect(X + 3 + k * 4, Y - 1 - k, 1, 1, "#f6d24a"); // 火の粉
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
  rect(X + 1, Y + 12, 30, 20, "#ead9b5");
  rect(X, Y, 32, 13, "#b5523b");
  for (let i = 0; i < 4; i++) rect(X, Y + 3 * i + 1, 32, 1, "#93402d");
  rect(X + 20, Y + 17, 8, 7, "#7fb6d6");
  rect(X + 23, Y + 17, 1, 7, "#ead9b5");
  rect(X + 19, Y + 24, 10, 1, "#a8956f");
  drawDoor(...doorAt(X, Y, 0, 1), "#7a5235", "#5a3e2b");
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
// 風車（3×5マス。村の目じるし）。下が太い石の塔に、赤い屋根。羽根は drawWindmillBlades で回す
function drawWindmill(X: number, Y: number) {
  rect(X + 4, Y + 56, 40, 24, "#e6dccb");
  rect(X + 7, Y + 40, 34, 16, "#e6dccb");
  rect(X + 10, Y + 26, 28, 14, "#e6dccb");
  rect(X + 40, Y + 56, 4, 24, "#cfc4b0"); // 影の面
  rect(X + 37, Y + 40, 4, 16, "#cfc4b0");
  rect(X + 34, Y + 26, 4, 14, "#cfc4b0");
  rect(X + 10, Y + 34, 28, 1, "#cfc4b0"); // 石積みの目地
  rect(X + 7, Y + 48, 34, 1, "#cfc4b0");
  rect(X + 4, Y + 66, 40, 1, "#cfc4b0");
  rect(X + 4, Y + 73, 40, 1, "#cfc4b0");
  rect(X + 5, Y + 54, 38, 2, "#7a5a3a"); // 見晴らし台
  rect(X + 7, Y + 52, 1, 2, "#7a5a3a");
  rect(X + 40, Y + 52, 1, 2, "#7a5a3a");
  rect(X + 8, Y + 18, 32, 8, "#b5523b"); // とんがり屋根
  rect(X + 12, Y + 12, 24, 6, "#b5523b");
  rect(X + 17, Y + 8, 14, 4, "#b5523b");
  rect(X + 22, Y + 4, 4, 4, "#93402d");
  rect(X + 8, Y + 25, 32, 1, "#93402d");
  rect(X + 21, Y + 42, 6, 8, "#7fb6d6"); // 窓
  rect(X + 23, Y + 42, 1, 8, "#e6dccb");
  rect(X + 9, Y + 60, 6, 5, "#7fb6d6");
  rect(X + 33, Y + 60, 6, 5, "#7fb6d6");
  drawDoor(...doorAt(X, Y, 1, 4), "#7a5235", "#5a3e2b");
}
function drawWindmillBlades(X: number, Y: number, t: number) {
  const cx = X + 24, cy = Y + 22, L = 26;
  const diag = Math.floor(t / 700) % 2 === 1; // 十字と斜めを交互に（ゆっくり回って見える）
  for (let i = 3; i < L; i++) {
    const sail = i > 7;
    if (diag) {
      const d = Math.round(i * 0.72); // 斜めでも羽根の長さをそろえる
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        rect(cx + sx * d - 1, cy + sy * d - 1, 2, 2, "#7a5a3a");
        if (sail) rect(cx + sx * d - 1 + sx * 2, cy + sy * d - 1 - sy * 2, 3, 3, "#f6efd9");
      }
    } else {
      rect(cx - 1, cy - i - 1, 2, 2, "#7a5a3a"); rect(cx - 1, cy + i - 1, 2, 2, "#7a5a3a");
      rect(cx - i - 1, cy - 1, 2, 2, "#7a5a3a"); rect(cx + i - 1, cy - 1, 2, 2, "#7a5a3a");
      if (sail) {
        rect(cx + 1, cy - i - 1, 4, 2, "#f6efd9"); rect(cx - 5, cy + i - 1, 4, 2, "#f6efd9");
        rect(cx - i - 1, cy - 5, 2, 4, "#f6efd9"); rect(cx + i - 1, cy + 1, 2, 4, "#f6efd9");
      }
    }
  }
  rect(cx - 3, cy - 3, 6, 6, "#5a3e2b");
  rect(cx - 1, cy - 1, 2, 2, "#a9845a");
}
// 灯台（2×3マス）。赤白の塔。灯りは drawLighthouseLight で明滅させる
function drawLighthouse(X: number, Y: number) {
  rect(X + 4, Y + 30, 24, 18, "#f6efd9");
  rect(X + 6, Y + 16, 20, 14, "#f6efd9");
  rect(X + 6, Y + 20, 20, 5, "#c4473a");
  rect(X + 4, Y + 34, 24, 5, "#c4473a");
  rect(X + 24, Y + 16, 2, 32, "rgba(0,0,0,0.1)"); // 影の面
  rect(X + 4, Y + 14, 24, 2, "#5d6470"); // 見張り台
  rect(X + 8, Y + 6, 16, 8, "#2f2a24");
  rect(X + 10, Y + 7, 12, 6, "#f2d04b");
  rect(X + 7, Y + 3, 18, 3, "#c4473a"); // 屋根
  rect(X + 13, Y + 1, 6, 2, "#c4473a");
  drawDoor(...doorAt(X, Y, 0, 2), "#3f6f8a", "#2a4a5c");
}
function drawLighthouseLight(X: number, Y: number, t: number) {
  if (Math.floor(t / 900) % 2) return;
  rect(X + 11, Y + 8, 10, 4, "#fff6c2");
  rect(X - 6, Y + 9, 12, 2, "rgba(255,246,194,0.5)"); // 海を照らす光
  rect(X + 26, Y + 9, 10, 2, "rgba(255,246,194,0.35)");
}
const BUILDING_ART: Record<string, (X: number, Y: number) => void> = {
  house: drawHouse, cafe: drawCafe, library: drawLibrary, hall: drawHall, harbor: drawHarbor, radio: drawRadio, dev: drawDev,
  windmill: drawWindmill, lighthouse: drawLighthouse,
};
// 毎フレーム動かす所（風車の羽根、灯台の灯り）
const BUILDING_MOTION: Record<string, (X: number, Y: number, t: number) => void> = {
  windmill: drawWindmillBlades, lighthouse: drawLighthouseLight,
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
  drawMound(X, Y);
  rect(X + 7, Y + 8, 2, 2, "#d9b25a");
  rect(X + 7, Y + 8, 1, 1, "#f2dc96");
  rect(X + 8, Y + 9, 1, 1, "#a8833c");
}
function drawSprout(X: number, Y: number, size: number, pale: boolean) {
  drawMound(X, Y);
  const stem = pale ? "#6f9a5a" : "#4f8f3a";
  const leaf = pale ? "#a8c98f" : "#7cc35a";
  const h = 3 + size;
  rect(X + 7, Y + 10 - h, 2, h, stem);
  rect(X + 4, Y + 10 - h, 3, 2, leaf);
  rect(X + 9, Y + 9 - h, 3, 2, leaf);
}
function drawSparkle(X: number, Y: number, t: number, tx: number) {
  drawMound(X, Y);
  if ((Math.floor(t / 380) + tx) % 2 === 0) {
    rect(X + 8, Y + 4, 1, 4, "#fff6c2");
    rect(X + 6, Y + 5, 5, 1, "#fff6c2");
  } else {
    rect(X + 7, Y + 6, 2, 2, "#fff6c2");
  }
}
// 満員（MAX_WATERERS 人が水やり）になった種。村人の優しさで咲いた花
function drawFlower(X: number, Y: number) {
  drawMound(X, Y);
  rect(X + 7, Y + 5, 2, 6, "#4f8f3a");
  rect(X + 4, Y + 7, 3, 2, "#7cc35a");
  rect(X + 9, Y + 6, 3, 2, "#7cc35a");
  // 花びらと、まんなか
  rect(X + 6, Y + 0, 4, 1, "#f2a7b8");
  rect(X + 5, Y + 1, 6, 4, "#f2a7b8");
  rect(X + 6, Y + 5, 4, 1, "#f2a7b8");
  rect(X + 5, Y + 1, 1, 1, "#e58aa0");
  rect(X + 10, Y + 4, 1, 1, "#e58aa0");
  rect(X + 7, Y + 2, 2, 2, "#f6d24a");
}

// 種の育ち具合は3段階だけ見せる（水やりの人数がわからないように）。0回=種、1回〜満員の手前=芽、満員=花
type Stage = "seed" | "sprout" | "flower";
const stageOf = (waterCount: number): Stage => (waterCount >= MAX_WATERERS ? "flower" : waterCount > 0 ? "sprout" : "seed");
// 「ありがとう」で咲いた花（flowers.ts のドット絵）。足元に小さな影
function drawBloom(canvas: SkCanvas, X: number, Y: number, id: string) {
  rect(X + 4, Y + 15, 8, 1, "rgba(40,60,30,0.25)");
  canvas.drawImageRectOptions(
    flowerImage(id), Skia.XYWHRect(0, 0, TILE, TILE), Skia.XYWHRect(X, Y, TILE, TILE), FilterMode.Nearest, MipmapMode.None,
  );
}
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

// ほかの村人の服と帽子の帯の色。自分（青い服・赤い帯）と見分けられる、落ち着いた色
const LOOKS = [
  { shirt: "#5f8a4a", shirt2: "#7aa45f", band: "#3f6fb5", hair: "#4a3424" },
  { shirt: "#b0674a", shirt2: "#c9805f", band: "#5f8a4a", hair: "#2f2620" },
  { shirt: "#8a6aa8", shirt2: "#a386bf", band: "#c9a43c", hair: "#6b4a2a" },
  { shirt: "#c99a3c", shirt2: "#dcb35a", band: "#7a5236", hair: "#3a2a1e" },
  { shirt: "#4f8f8f", shirt2: "#6aa8a6", band: "#b0674a", hair: "#5a3e2b" },
  { shirt: "#a8545f", shirt2: "#c06f78", band: "#3f6f6a", hair: "#2a2018" },
];
const ME = { shirt: "#3f6fb5", shirt2: "#5a8ad0", band: "#c0392b", hair: "#6b4a2a" };
const lookFor = (p: Player) => ("look" in p ? LOOKS[(p as Other).look % LOOKS.length] : ME);

function drawPlayer(p: Player, t: number) {
  const { fx, fy, moving } = playerPos(p, t);
  const X = Math.round(fx * TILE), Y = Math.round(fy * TILE);
  const ph = walkPhase(p, t, moving);
  const step = ph === 1 || ph === 3;
  const y = Y + (step ? -1 : 0); // 足を出したコマで体が少し上がる
  const { shirt, shirt2, band, hair } = lookFor(p);
  const skin = "#f2c9a0", shoe = "#4a3a2a", shoe2 = "#33281c";
  const side = p.dir === "left" || p.dir === "right";
  const sgn = p.dir === "right" ? 1 : -1;
  rect(X + 3, Y + 15, 10, 1, "rgba(0,0,0,0.22)");
  // 足
  if (side) {
    if (!step) {
      rect(X + 6, Y + 13, 2, 2, shoe2);
      rect(X + 8, Y + 13, 2, 2, shoe);
    } else {
      const f = ph === 1 ? 1 : -1; // 前に出る足を入れ替える
      rect(X + 7 - 2 * sgn * f, Y + 13, 2, 2, shoe2); // 奥の足
      rect(X + 7 + 2 * sgn * f, Y + 13, 2, 2, shoe); // 手前の足
      rect(X + 7, Y + 12, 2, 1, shoe);
    }
  } else {
    rect(X + 5, Y + 13 - (ph === 3 ? 1 : 0), 2, 2, shoe);
    rect(X + 9, Y + 13 - (ph === 1 ? 1 : 0), 2, 2, shoe);
  }
  // 体
  rect(X + 4, y + 8, 8, 5, shirt);
  rect(X + 4, y + 8, 8, 1, shirt2);
  // 腕
  if (side) {
    const sw = !step ? 0 : (ph === 1 ? 2 : -2) * sgn; // 前後に振る
    rect(X + 7 + sw, y + 9, 2, 3, shirt2);
    rect(X + 7 + sw + Math.sign(sw), y + 12, 2, 1, skin);
  } else {
    const la = ph === 1 ? 1 : ph === 3 ? -1 : 0; // 左右の腕を交互に
    rect(X + 3, y + 9 + la, 1, 3, skin);
    rect(X + 12, y + 9 - la, 1, 3, skin);
  }
  // 顔と麦わら帽子
  rect(X + 5, y + 4, 6, 4, skin);
  rect(X + 4, y + 1, 8, 3, "#e2c15a");
  rect(X + 2, y + 3, 12, 1, "#c9a43c");
  rect(X + 4, y + 3, 8, 1, band);
  if (p.dir === "up") {
    rect(X + 5, y + 4, 6, 3, hair);
  } else if (p.dir === "down") {
    rect(X + 6, y + 5, 1, 1, "#2a2018");
    rect(X + 9, y + 5, 1, 1, "#2a2018");
    rect(X + 7, y + 7, 2, 1, "#e0a080");
  } else if (p.dir === "left") {
    rect(X + 5, y + 5, 1, 1, "#2a2018");
    rect(X + 9, y + 4, 2, 3, hair);
  } else {
    rect(X + 10, y + 5, 1, 1, "#2a2018");
    rect(X + 5, y + 4, 2, 3, hair);
  }
}

/* ---------- 村長（長老） ---------- */
// 1マス歩くのにかける時間。村人よりずっとゆっくり
export const MAYOR_MOVE_MS = 700;
export const mayorPos = (p: Player, t: number) => playerPos(p, t, MAYOR_MOVE_MS);

function drawMayor(p: Player, t: number) {
  const { fx, fy, moving } = mayorPos(p, t);
  const X = Math.round(fx * TILE), Y = Math.round(fy * TILE);
  // 足を出したコマで体が少し上がる。村人よりゆっくり足を運ぶ
  const ph = moving ? (1 + Math.floor((t - p.walkStart) / 230)) % 4 : -1;
  const step = ph === 1 || ph === 3;
  const y = Y + (step ? -1 : 0);
  const skin = "#efc39a", robe = "#7a5235", robe2 = "#8f6644", obi = "#c9a43c", white = "#f4f1ea", grey = "#d6d2c8";
  const side = p.dir === "left" || p.dir === "right";
  const front = side ? (p.dir === "right" ? 1 : -1) : 0;
  rect(X + 2, Y + 15, 12, 1, "rgba(0,0,0,0.22)");
  // 杖（体の手前の手で持つ）
  const cx = side ? (front > 0 ? X + 13 : X + 2) : X + 13;
  rect(cx, y + 6, 1, 9, "#6b4a2e");
  rect(cx - 1, y + 5, 3, 2, "#8a6a48");
  // 足（草履）
  rect(X + 5, Y + 14 - (ph === 3 ? 1 : 0), 2, 1, "#3a2e24");
  rect(X + 9, Y + 14 - (ph === 1 ? 1 : 0), 2, 1, "#3a2e24");
  // 着物と羽織
  rect(X + 4, y + 8, 8, 6, robe);
  rect(X + 4, y + 8, 8, 1, robe2);
  rect(X + 4, y + 11, 8, 1, obi);
  if (!side) {
    rect(X + 7, y + 8, 2, 3, p.dir === "up" ? robe : "#e9e2d0"); // 襟
  }
  // 腕
  if (side) {
    rect(X + 7 + front, y + 9, 2, 3, robe2);
    rect(X + 7 + front * 2, y + 11, 2, 1, skin);
  } else {
    rect(X + 3, y + 9, 1, 3, robe2);
    rect(X + 12, y + 9, 1, 3, robe2);
    rect(X + 12, y + 11, 1, 1, skin);
  }
  // 頭：白い髪とひげ
  rect(X + 5, y + 2, 6, 6, skin);
  rect(X + 5, y + 1, 6, 2, white); // 頭の上
  if (p.dir === "up") {
    rect(X + 5, y + 2, 6, 5, white);
    rect(X + 5, y + 6, 6, 1, grey);
  } else if (p.dir === "down") {
    rect(X + 4, y + 3, 1, 3, white); // 横の髪
    rect(X + 11, y + 3, 1, 3, white);
    rect(X + 6, y + 3, 1, 1, white); // 白い眉
    rect(X + 9, y + 3, 1, 1, white);
    rect(X + 6, y + 4, 1, 1, "#2a2018");
    rect(X + 9, y + 4, 1, 1, "#2a2018");
    rect(X + 6, y + 6, 4, 2, white); // ひげ
    rect(X + 7, y + 8, 2, 2, white);
  } else {
    const fxp = front > 0 ? X + 9 : X + 6; // 顔の向いている側
    rect(front > 0 ? X + 5 : X + 10, y + 3, 1, 3, white); // 後ろの髪
    rect(fxp, y + 3, 1, 1, white);
    rect(fxp, y + 4, 1, 1, "#2a2018");
    rect(front > 0 ? X + 8 : X + 6, y + 6, 3, 2, white); // ひげ
    rect(front > 0 ? X + 9 : X + 6, y + 8, 1, 2, white);
  }
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

/* ---------- 開発局の中 ---------- */
function drawDevFloor(X: number, Y: number, tx: number, ty: number) {
  rect(X, Y, 16, 16, (tx + ty) % 2 ? "#c9d3d8" : "#d4dde1");
  rect(X, Y, 16, 1, "#b8c3c9");
  rect(X, Y, 1, 16, "#b8c3c9");
}
function drawDevWall(X: number, Y: number) {
  rect(X, Y, 16, 16, "#e4e9ec");
  rect(X, Y, 16, 3, "#455a64");
  rect(X, Y + 11, 16, 5, "#90a4ae");
  rect(X, Y + 11, 16, 1, "#b0bec5");
}
// 黒板（4マスぶん）。奥の壁に掛かっていて、村人のアイデアがチョークで並んでいる
function drawBlackboard(X: number, Y: number) {
  rect(X + 1, Y - 14, 62, 26, "#7a5235");
  rect(X + 3, Y - 12, 58, 21, "#2f5a46");
  rect(X + 8, Y - 9, 22, 1, "#e8efe6"); // 見出し
  rect(X + 8, Y - 8, 22, 1, "#e8efe6");
  for (let i = 0; i < 3; i++) {
    rect(X + 8, Y - 4 + i * 4, 2, 2, "#e8efe6");
    rect(X + 12, Y - 4 + i * 4, 18 + ((i * 7) % 12), 1, "#c9d6cc");
    rect(X + 35, Y - 4 + i * 4, 2, 2, "#e8efe6");
    rect(X + 39, Y - 4 + i * 4, 16 - ((i * 5) % 8), 1, "#c9d6cc");
  }
  rect(X + 3, Y + 9, 58, 3, "#a0703f"); // チョーク受け
  rect(X + 46, Y + 8, 4, 1, "#ffffff");
  rect(X + 52, Y + 8, 3, 1, "#f2d04b");
}
// 作業机（横に2マス）。図面と、ノートと、ランプ
function drawDevDesk(X: number, Y: number) {
  rect(X + 3, Y + 10, 2, 5, "#5a3e2b");
  rect(X + 27, Y + 10, 2, 5, "#5a3e2b");
  rect(X + 1, Y + 2, 30, 9, "#8a6a48");
  rect(X + 1, Y + 2, 30, 1, "#a8865e");
  rect(X + 1, Y + 10, 30, 1, "#6b4a2e");
  rect(X + 4, Y + 3, 12, 6, "#d8ecf4"); // 図面
  rect(X + 6, Y + 5, 8, 1, "#3f6fb0");
  rect(X + 6, Y + 7, 5, 1, "#3f6fb0");
  rect(X + 19, Y + 4, 5, 5, "#f6efd9"); // ノート
  rect(X + 26, Y - 2, 1, 5, "#455a64"); // ランプ
  rect(X + 24, Y - 4, 5, 3, "#f2d04b");
}
function devArt(): RoomArt {
  const room = ROOMS.dev.map;
  const cols = room[0].length, rows = room.length;
  const at = (x: number, y: number) => roomTileAt("dev", x, y);
  const bounds = Skia.XYWHRect(0, -TILE, cols * TILE, (rows + 1) * TILE);
  const base = createPicture((canvas) => {
    cv = canvas;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const X = x * TILE, Y = y * TILE;
        const c = at(x, y);
        if (c === "#") {
          if (y === 0 && x > 0 && x < cols - 1) drawDevWall(X, Y);
          else rect(X, Y, 16, 16, "#37474f");
        } else {
          drawDevFloor(X, Y, x, y);
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
      const first = at(x - 1, y) !== c; // 何マスかにまたがる家具は、左のマスを起点に描く
      if (c === "G" && first) drawBlackboard(X, Y);
      if (c === "K" && first) drawBookshelf(X, Y);
      if (c === "D" && first) drawDevDesk(X, Y);
      if (c === "V") drawAnimal(rect, "owl", X, Y);
      if (c === "P") drawPottedPlant(X, Y);
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
    // 家具は行ごとに描き、村人は立っている行の家具のあとに描く（下の行の家具が手前に来る）
    const people = [...scene.others.values(), scene.player]
      .map((p) => ({ p, fy: playerPos(p, t).fy - (p === scene.player ? 0 : 0.001) }))
      .sort((a, b) => a.fy - b.fy);
    let k = 0;
    const drawPerson = (p: Player, fy: number) => {
      // 丸椅子に座っているときは、少し上に描いて腰かけた形にする
      const seated = roomTileAt(id, p.x, p.y) === "s" && Math.abs(fy - p.y) < 0.01;
      if (seated) { canvas.save(); canvas.translate(0, -6); }
      drawPlayer(p, t);
      if (seated) canvas.restore();
    };
    art.rows.forEach((pic, y) => {
      while (k < people.length && people[k].fy < y) { drawPerson(people[k].p, people[k].fy); k++; }
      canvas.drawPicture(pic);
    });
    while (k < people.length) { drawPerson(people[k].p, people[k].fy); k++; }
    canvas.restore();
  }, { width: v.w, height: v.h });
}

/* ---------- 1フレーム ---------- */
// 波・池・郵便受け・焚き火の炎・風車の羽根・灯台の灯り以外は動かないので、一度だけ描いておく（まわりの海も含める）
function staticLayer(): SkPicture {
  return createPicture((canvas) => {
    cv = canvas;
    for (let y = -MARGIN; y < ROWS + SOUTH_TILES; y++) {
      for (let x = -MARGIN; x < COLS + MARGIN; x++) {
        const X = x * TILE, Y = y * TILE;
        const c = tileAt(x, y);
        if (ON_SEA.has(c)) drawSea(X, Y, x, y);
        else if (c === "D") drawDesert(X, Y, x, y);
        else if (c === "W") drawStorm(X, Y);
        else if (c === "." || c === "H") drawGrass(X, Y, x, y);
        else if (c === ",") drawSoil(X, Y);
        else if (c === "P") drawPath(X, Y, x, y);
        else if (c === "T") drawTree(X, Y, x, y);
        else if (c === "F") drawFence(X, Y, x, y);
        else if (c === "R") drawRock(X, Y, x, y);
        else if (c === "X") drawCliff(X, Y, x, y);
        else if (c === "^") drawStairs(X, Y, x, y);
        else if (c === "C") drawCactus(X, Y, x, y);
        else if (c === "K") drawMesa(X, Y, x, y);
        else if (c === "L") drawPlazaBench(X, Y, x, y);
        else if (c === "O") drawCampfire(X, Y, x, y);
      }
    }
    BUILDINGS.forEach(drawBuilding);
    drawPier();
    drawShip();
  }, Skia.XYWHRect(-MARGIN * TILE, -NORTH, W + 2 * MARGIN * TILE, H + NORTH + SOUTH));
}

// 村のマップの村人。ベンチ（L）に座っているときは、少し上に描いて腰かけた形にする
function drawOnFarm(p: Player, t: number) {
  const { fy, moving } = playerPos(p, t);
  const seated = !moving && tileAt(p.x, p.y) === "L" && Math.abs(fy - p.y) < 0.01;
  if (seated) { cv.save(); cv.translate(0, -5); }
  drawPlayer(p, t);
  if (seated) cv.restore();
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
        else if (c === "O") drawFlame(x * TILE, y * TILE, t);
      }
    }
    for (const b of BUILDINGS) if (inView(b.x, b.y) || inView(b.x + b.w, b.y + b.h)) BUILDING_MOTION[b.id]?.(b.x * TILE, b.y * TILE, t);
    const { x: px, y: py } = scene.player;
    for (const s of scene.seeds) {
      if (!inView(s.x, s.y)) continue;
      const X = s.x * TILE, Y = s.y * TILE;
      // 「ありがとう」で花が咲いた種は、誰の画面にもその花を咲かせる
      if (s.bloom) { drawBloom(canvas, X, Y, cropById(s.bloom).id); continue; }
      const kind = scene.kindOf(s);
      // 自分の種：水やりされるまでは種、水やりされると芽、満員で花
      if (kind === "mine") drawStage(X, Y, stageOf(s.waterCount || 0));
      else if (kind === "mine-review") drawMound(X, Y, "#7d7666");
      else if (kind === "watered") drawStage(X, Y, stageOf(s.waterCount || 0), true);
      else if (kind === "full") drawFlower(X, Y);
      else if (kind === "open" && Math.abs(s.x - px) + Math.abs(s.y - py) <= 2) drawSparkle(X, Y, t, s.x);
    }
    drawEffects(t);
    // 村長と村人は、手前（下）にいるほうをあとに描く。ほかの村人は、自分より先に描く（同じ行なら自分が手前）
    const people = [
      ...[...scene.others.values()].filter((o) => inView(o.x, o.y)).map((o) => ({ fy: playerPos(o, t).fy - 0.001, draw: () => drawOnFarm(o, t) })),
      { fy: mayorPos(scene.mayor, t).fy, draw: () => drawMayor(scene.mayor, t) },
      { fy: playerPos(scene.player, t).fy, draw: () => drawOnFarm(scene.player, t) },
    ].sort((a, b) => a.fy - b.fy);
    for (const q of people) q.draw();
    canvas.restore();
  }, { width: v.w, height: v.h });
}

// 横に約 VIEW_TILES_ACROSS マス見える倍率。ドットがにじまないよう端末の画素に合わせて丸める
function scaleFor(width: number) {
  const pr = PixelRatio.get();
  return Math.max(1 / pr, Math.round((width / (VIEW_TILES_ACROSS * TILE)) * pr) / pr);
}

// 画面いっぱいに敷くマップ。親が大きさを決める（absoluteFill などで置く）
export function FarmMap({ scene, paused, focusY = 0.5 }: { scene: RefObject<Scene>; paused: boolean; focusY?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const base = useMemo(() => staticLayer(), []);
  const rooms = useMemo<Record<RoomId, RoomArt>>(
    () => ({ house: { base: houseLayer(), rows: [] }, cafe: cafeArt(), hall: hallArt(), dev: devArt() }),
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

/* ---------- 村全体のマップ（ヘッダーの「マップ」から開く） ---------- */
// 見せる範囲（マス）。まわりの海を1マス、南は桟橋と船まで
const MAP_X0 = -1, MAP_Y0 = -1, MAP_COLS = COLS + 2, MAP_ROWS = HARBOR.ship.y + HARBOR.ship.h + 1 - MAP_Y0;
let villageBase: SkPicture | null = null;

type Spot = { x: number; y: number };
type BloomSpot = Spot & { bloom: string };
function villagePicture(here: Spot, blooms: BloomSpot[]): SkPicture {
  villageBase ??= staticLayer();
  const base = villageBase;
  return createPicture((canvas) => {
    cv = canvas;
    canvas.translate(-MAP_X0 * TILE, -MAP_Y0 * TILE);
    canvas.drawPicture(base);
    for (const b of blooms) drawBloom(canvas, b.x * TILE, b.y * TILE, cropById(b.bloom).id);
    // 自分のいる場所：赤い丸と白いふち
    const cx = here.x * TILE + TILE / 2, cy = here.y * TILE + TILE / 2;
    const ring = Skia.Paint(); ring.setColor(Skia.Color("#ffffff")); ring.setAntiAlias(true);
    const dot = Skia.Paint(); dot.setColor(Skia.Color("#e0402f")); dot.setAntiAlias(true);
    canvas.drawCircle(cx, cy, 11, ring);
    canvas.drawCircle(cx, cy, 8, dot);
  }, Skia.XYWHRect(0, 0, MAP_COLS * TILE, MAP_ROWS * TILE));
}

// here：自分のいるマス（建物の中なら、その建物の入り口）。blooms：村に咲いている花
// onPick：建物（または名前）を押したとき、その建物の id を渡す
export function VillageMap({ here, blooms, onPick }: { here: Spot; blooms: BloomSpot[]; onPick?: (id: string) => void }) {
  const [width, setWidth] = useState(0);
  const scale = width / (MAP_COLS * TILE);
  const picture = useMemo(() => villagePicture(here, blooms), [here, blooms]);

  const at = (x: number, y: number) => ({ left: (x - MAP_X0) * TILE * scale, top: (y - MAP_Y0) * TILE * scale });
  return (
    <View
      style={{ width: "100%", aspectRatio: MAP_COLS / MAP_ROWS, backgroundColor: "#3b7fae" }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="image"
      accessibilityLabel="吃音村の全体のマップ"
    >
      {width > 0 ? (
        <>
          <Canvas style={StyleSheet.absoluteFill}>
            <Group transform={[{ scale }]}><Picture picture={picture} /></Group>
          </Canvas>
          {BUILDINGS.map((b) => {
            const box = at(b.x, b.y);
            return (
              <Pressable
                key={`${b.id}-area`}
                accessibilityRole="button"
                accessibilityLabel={`${b.name}の前へ行く`}
                onPress={() => onPick?.(b.id)}
                disabled={!onPick}
                style={{ position: "absolute", left: box.left, top: box.top, width: b.w * TILE * scale, height: (b.h + 1) * TILE * scale }}
              />
            );
          })}
          {BUILDINGS.map((b) => {
            const p = at(b.x + b.w / 2, b.y);
            return (
              <View key={b.id} pointerEvents="box-none" style={[s.label, { left: p.left - 40, top: Math.max(0, p.top - 16) }]}>
                <Pressable onPress={() => onPick?.(b.id)} disabled={!onPick} accessibilityElementsHidden importantForAccessibility="no"
                  style={({ pressed }) => pressed && { opacity: 0.6 }}>
                  <Text style={s.labelText}>{b.name}</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  label: { position: "absolute", width: 80, alignItems: "center" },
  labelText: {
    fontFamily: "DotGothic16_400Regular", fontSize: 11, color: "#fff", backgroundColor: "rgba(31,39,29,0.75)",
    paddingHorizontal: 4, borderRadius: 3, overflow: "hidden",
  },
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#3b7fae" },
});
