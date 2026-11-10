import {
  BlendMode, Canvas, FilterMode, Group, MipmapMode, Picture, Skia, TileMode, type SkCanvas, type SkImage, type SkPaint, type SkPicture, createPicture,
} from "@shopify/react-native-skia";
import { type RefObject, useEffect, useMemo, useState } from "react";
import { type LayoutChangeEvent, PixelRatio, StyleSheet, View } from "react-native";
import { useSharedValue } from "react-native-reanimated";

import type { Seed } from "@/lib/farm-api";
import {
  type Area, BUILDINGS, CAFE_GUESTS, HALL_GUESTS, COLS, DESERT_DEPTH, type Dir, ON_SEA, ROOMS, ROWS, type RoomId, TILE,
  VIEW_TILES_ACROSS, keyOf, roomTileAt, tileAt,
} from "@/lib/game";
import { drawAnimal } from "./animals";
import {
  drawCanopy, drawFenceTile, drawGrassTile, drawHouseArt, drawPathTile, drawPondTile, drawSoilTile, drawTreeShadow, drawTrunk,
} from "./forest";
import { SEA } from "./palette";
import { PixMap, rnd } from "./pixmap";
import { roomBaseImage } from "./rooms";
import { drawBuildingArt, drawDesertTile, drawPierArt, drawSeaTile, drawShipArt, drawStormTile } from "./village";

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

/* ---------- 動くもの（波・池のきらめき・砂嵐の風・郵便受け） ---------- */
// 池の水面のきらめき（池そのものは forest.ts で描く）
function drawWater(X: number, Y: number, tx: number, ty: number, t: number) {
  const o = Math.floor(t / 300 + tx * 3 + ty * 5) % 12;
  rect(X + o + 2, Y + 6 + (ty % 2) * 3, 3, 1, "#a9dbe3");
  rect(X + ((o + 6) % 12) + 2, Y + 11, 2, 1, "rgba(201,238,240,0.7)");
}
function drawSeaWave(X: number, Y: number, tx: number, ty: number, t: number) {
  const o = (Math.floor(t / 420 + tx * 5 + ty * 3) % 10) + 3;
  rect(X + o - 2, Y + 6, 3, 1, SEA.wave);
  rect(X + ((o + 5) % 10) + 2, Y + 10, 2, 1, SEA.wave);
}
function drawStormWind(X: number, Y: number, tx: number, ty: number, t: number) {
  // 横に流れる風の筋
  for (let i = 0; i < 3; i++) {
    const o = Math.floor(t / 60 + tx * 16 + i * 23 + ty * 7) % 32;
    rect(X + o - 8, Y + 3 + i * 5, 7, 1, "#efe0b8");
  }
}
function drawMailbox(X: number, Y: number, hasUnread: boolean) {
  rect(X + 6, Y + 14, 7, 2, "rgba(29,60,68,0.3)");
  rect(X + 7, Y + 8, 2, 7, "#5c4535");
  rect(X + 4, Y + 3, 8, 6, "#b94a3c");
  rect(X + 4, Y + 3, 8, 1, "#d9705d");
  rect(X + 11, Y + 4, 1, 5, "#8c3a31");
  rect(X + 5, Y + 6, 4, 1, "#7e3029");
  if (hasUnread) { rect(X + 12, Y + 1, 1, 5, "#5c4535"); rect(X + 12, Y + 1, 3, 2, "#efd36e"); }
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
// 満員（5人が水やり）になった種。村人の優しさで咲いた花
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
  const X = Math.round(fx * TILE), Y = Math.round(fy * TILE);
  const ph = walkPhase(p, t, moving);
  const step = ph === 1 || ph === 3;
  const y = Y + (step ? -1 : 0); // 足を出したコマで体が少し上がる
  const skin = "#f2c9a0", shoe = "#4a3a2a", shoe2 = "#33281c", shirt = "#3f6fb5", shirt2 = "#5a8ad0", hair = "#6b4a2a";
  const side = p.dir === "left" || p.dir === "right";
  const sgn = p.dir === "right" ? 1 : -1;
  rect(X + 4, Y + 14, 8, 1, "rgba(29,60,68,0.32)");
  rect(X + 3, Y + 15, 10, 1, "rgba(29,60,68,0.32)");
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
  rect(X + 4, y + 3, 8, 1, "#c0392b");
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
  rect(X + 3, Y + 14, 10, 1, "rgba(29,60,68,0.32)");
  rect(X + 2, Y + 15, 12, 1, "rgba(29,60,68,0.32)");
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
function drawBookshelf(X: number, Y: number) {
  rect(X + 31, Y - 4, 2, 19, "rgba(29,40,44,0.28)");
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
  rect(X + 15, Y, 2, 30, "rgba(29,40,44,0.28)");
  rect(X + 3, Y + 30, 13, 2, "rgba(29,40,44,0.28)");
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
  rect(X + 3, Y + 14, 29, 2, "rgba(29,40,44,0.28)");
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

// 床と壁（rooms.ts で1枚の画像にしたもの）と、入口のマット
const roomImages = new Map<RoomId, SkImage>();
function drawRoomBase(canvas: SkCanvas, id: RoomId, cols: number, rows: number, at: (x: number, y: number) => string) {
  let img = roomImages.get(id);
  if (!img) { img = roomBaseImage(id); roomImages.set(id, img); }
  drawImageAt(canvas, img, 0, 0);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (at(x, y) === "E") drawDoorMat(x * TILE, y * TILE);
}

function houseLayer(): SkPicture {
  const room = ROOMS.house.map;
  const cols = room[0].length, rows = room.length;
  const at = (x: number, y: number) => roomTileAt("house", x, y);
  return createPicture((canvas) => {
    cv = canvas;
    drawRoomBase(canvas, "house", cols, rows, at);
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
  rect(X + 5, Y + 14, 8, 2, "rgba(29,40,44,0.28)");
  rect(X + 5, Y + 10, 6, 5, "#b5523b");
  rect(X + 5, Y + 10, 6, 1, "#93402d");
  rect(X + 3, Y + 2, 10, 8, "#4f8f3a");
  rect(X + 5, Y, 6, 3, "#5e9e4e");
  rect(X + 4, Y + 4, 2, 2, "#7cc35a");
  rect(X + 10, Y + 6, 2, 2, "#7cc35a");
}
function drawCafeTable(X: number, Y: number) {
  rect(X + 3, Y + 14, 12, 2, "rgba(29,40,44,0.28)");
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
  rect(X + 5, Y + 14, 8, 2, "rgba(29,40,44,0.28)");
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
    drawRoomBase(canvas, "cafe", cols, rows, at);
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
  rect(X + 1, Y + 14, 16, 2, "rgba(29,40,44,0.28)");
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
    drawRoomBase(canvas, "hall", cols, rows, at);
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
    const air = airPaints(v);
    canvas.drawRect(Skia.XYWHRect(0, 0, v.w, v.h), air.light);
    canvas.drawRect(Skia.XYWHRect(0, 0, v.w, v.h), air.vignette);
  }, { width: v.w, height: v.h });
}

/* ---------- 1フレーム ---------- */
// 動かない絵は、一度だけ1枚の画像にしておく（まわりの海も含める）。
// 地面・木の幹・柵・家は1ドットずつ描き、木の葉は行ごとの層にして、村人より手前に重ねる
type MapArt = { ground: SkImage; canopies: { y: number; image: SkImage }[] };
const LEFT = -MARGIN * TILE;
const MAP_W = W + 2 * MARGIN * TILE, MAP_H = H + NORTH + SOUTH;
const ROW_Y0 = -DESERT_DEPTH - MARGIN, ROW_Y1 = ROWS + SOUTH_TILES;
const CANOPY_TOP = 16, CANOPY_H = 32; // 葉の層：木のマスの16ドット上から、32ドットぶん

function buildMapArt(): MapArt {
  const pm = new PixMap(MAP_W, MAP_H, -LEFT, NORTH);
  const each = (fn: (x: number, y: number, c: string) => void) => {
    for (let y = ROW_Y0; y < ROW_Y1; y++) for (let x = -MARGIN; x < COLS + MARGIN; x++) fn(x, y, tileAt(x, y));
  };
  // 1. 地面
  each((x, y, c) => {
    const X = x * TILE, Y = y * TILE;
    if (c === "." || c === "H" || c === "T" || c === "F" || c === "M") drawGrassTile(pm, X, Y, x, y);
    else if (c === ",") drawSoilTile(pm, X, Y, x, y);
    else if (c === "P") drawPathTile(pm, X, Y, x, y);
    else if (c === "~") drawPondTile(pm, X, Y, x, y);
  });
  // 2. 地面に落ちる影と、地面に立つもの
  each((x, y, c) => { if (c === "T") drawTreeShadow(pm, x * TILE, y * TILE); });
  each((x, y, c) => {
    if (c === "T") drawTrunk(pm, x * TILE, y * TILE);
    else if (c === "F") drawFenceTile(pm, x * TILE, y * TILE);
  });
  const house = BUILDINGS.find((b) => b.id === "house");
  if (house) drawHouseArt(pm, house.x * TILE, house.y * TILE);

  // 3. 海・砂漠・砂嵐、建物、港
  each((x, y, c) => {
    const X = x * TILE, Y = y * TILE;
    if (ON_SEA.has(c)) drawSeaTile(pm, X, Y, x, y);
    else if (c === "D") drawDesertTile(pm, X, Y, x, y);
    else if (c === "W") drawStormTile(pm, X, Y);
  });
  for (const b of BUILDINGS) if (b.id !== "house") drawBuildingArt(pm, b.id, b.x * TILE, b.y * TILE);
  drawPierArt(pm, TILE);
  drawShipArt(pm, TILE);
  const ground = pm.toImage();

  // 4. 木の葉（行ごと）
  const canopies: MapArt["canopies"] = [];
  for (let y = ROW_Y0; y < ROW_Y1; y++) {
    let layer: PixMap | null = null;
    for (let x = -MARGIN; x < COLS + MARGIN; x++) {
      if (tileAt(x, y) !== "T") continue;
      layer ??= new PixMap(MAP_W, CANOPY_H, -LEFT, -(y * TILE - CANOPY_TOP));
      drawCanopy(layer, x * TILE, y * TILE, x, y);
    }
    if (layer) canopies.push({ y, image: layer.toImage() });
  }
  return { ground, canopies };
}

const plain = Skia.Paint();
function drawImageAt(canvas: SkCanvas, img: SkImage, x: number, y: number) {
  const w = img.width(), h = img.height();
  canvas.drawImageRectOptions(img, Skia.XYWHRect(0, 0, w, h), Skia.XYWHRect(x, y, w, h), FilterMode.Nearest, MipmapMode.None, plain);
}

// 画面全体の空気：左上からのあたたかい光と、ふちの青緑の暗さ
const airCache = new Map<string, { light: SkPaint; vignette: SkPaint }>();
function airPaints(v: ViewSize) {
  const key = `${v.w}x${v.h}`;
  let a = airCache.get(key);
  if (!a) {
    const light = Skia.Paint();
    light.setShader(Skia.Shader.MakeLinearGradient(
      Skia.Point(0, 0), Skia.Point(v.w * 0.8, v.h * 0.8),
      [Skia.Color("rgba(255,222,140,0.75)"), Skia.Color("rgba(255,226,150,0)")], null, TileMode.Clamp,
    ));
    light.setBlendMode(BlendMode.SoftLight);
    const vignette = Skia.Paint();
    // 縦長の画面でも左右のふちが暗くなるよう、楕円にする（半径1の円を画面の大きさに引きのばす）
    vignette.setShader(Skia.Shader.MakeRadialGradient(
      Skia.Point(0, 0), 1,
      [Skia.Color("rgba(16,40,48,0)"), Skia.Color("rgba(16,40,48,0)"), Skia.Color("rgba(16,40,48,0.55)")], [0, 0.55, 1], TileMode.Clamp,
      Skia.Matrix().translate(v.w / 2, v.h * 0.45).scale(v.w * 0.75, v.h * 0.7),
    ));
    a = { light, vignette };
    airCache.set(key, a);
  }
  return a;
}
// 漂う光の粒。地図に少し遅れてついてくる
const MOTES = Array.from({ length: 16 }, (_, i) => ({ x: rnd(i, 1, 70), y: rnd(i, 2, 70), s: 0.5 + rnd(i, 3, 70), p: rnd(i, 4, 70) * 6.28 }));
function drawMotes(cam: { x: number; y: number }, v: ViewSize, t: number) {
  const mod = (n: number, m: number) => ((n % m) + m) % m;
  for (const m of MOTES) {
    const x = mod(m.x * v.w * 1.2 - cam.x * 0.85 + Math.sin(t / 2400 + m.p) * 8 + t * 0.002 * m.s, v.w);
    const y = mod(m.y * v.h * 1.2 - cam.y * 0.85 - t * 0.004 * m.s, v.h);
    const a = 0.35 + 0.35 * Math.sin(t / 700 + m.p);
    rect(Math.round(x), Math.round(y), 1, 1, `rgba(255,246,196,${a.toFixed(2)})`);
  }
}

function frame(art: MapArt, scene: Scene, t: number, v: ViewSize): SkPicture {
  return createPicture((canvas) => {
    cv = canvas;
    const cam = camera(scene.player, t, v);
    // 画面に入るマスの範囲（はしの半端なマスも含める）
    const x0 = Math.floor(cam.x / TILE), x1 = Math.ceil((cam.x + v.w) / TILE);
    const y0 = Math.floor(cam.y / TILE), y1 = Math.ceil((cam.y + v.h) / TILE);
    const inView = (x: number, y: number) => x >= x0 - 1 && x <= x1 && y >= y0 - 1 && y <= y1;

    canvas.save();
    canvas.translate(-cam.x, -cam.y);
    drawImageAt(canvas, art.ground, LEFT, -NORTH);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = tileAt(x, y);
        if (c === "S") drawSeaWave(x * TILE, y * TILE, x, y, t);
        else if (c === "W") drawStormWind(x * TILE, y * TILE, x, y, t);
        else if (c === "~") drawWater(x * TILE, y * TILE, x, y, t);
        else if (c === "M") drawMailbox(x * TILE, y * TILE, scene.hasUnread);
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
    // 村長と村人は、手前（下）にいるほうをあとに描く。木の葉は、その行より奥にいる人の上に重ねる
    const people = [
      { fy: mayorPos(scene.mayor, t).fy, draw: () => drawMayor(scene.mayor, t) },
      { fy: playerPos(scene.player, t).fy, draw: () => drawPlayer(scene.player, t) },
    ].sort((a, b) => a.fy - b.fy);
    let k = 0;
    for (const c of art.canopies) {
      if (c.y < y0 - 1 || c.y > y1 + 2) continue;
      while (k < people.length && people[k].fy < c.y) people[k++].draw();
      drawImageAt(canvas, c.image, LEFT, c.y * TILE - CANOPY_TOP);
    }
    while (k < people.length) people[k++].draw();
    canvas.restore();

    const air = airPaints(v);
    canvas.drawRect(Skia.XYWHRect(0, 0, v.w, v.h), air.light);
    drawMotes(cam, v, t);
    canvas.drawRect(Skia.XYWHRect(0, 0, v.w, v.h), air.vignette);
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
  const art = useMemo(() => buildMapArt(), []);
  const rooms = useMemo<Record<RoomId, RoomArt>>(
    () => ({ house: { base: houseLayer(), rows: [] }, cafe: cafeArt(), hall: hallArt() }),
    [],
  );
  const picture = useSharedValue<SkPicture>(createPicture(() => {}));
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
      picture.value = sc.area === "farm" ? frame(art, sc, t, view) : roomFrame(sc.area, rooms[sc.area], sc, t, view);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [art, rooms, scene, picture, paused, view]);

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
  fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#28607d" },
});
