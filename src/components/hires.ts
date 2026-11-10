/* =========================================================
   高解像度ドット絵。1マス（16単位）を32×32ドットで描く（1ドット = 0.5単位）。
   光は左上から。黒い輪郭線は使わず、色の濃淡とやわらかい影で形を出す。
   座標は「ドット」で書き、dot() が単位に直して rect に渡す。
   ========================================================= */
import type { RectFn } from "./animals";
import { P } from "./palette";

type Dot = (x: number, y: number, w: number, h: number, c: string) => void;
type Dir = "up" | "down" | "left" | "right";

// (X, Y) を左上にして、ドット単位で描く。flip なら左右を反転する（幅 W ドットの中で）
export function dot(r: RectFn, X: number, Y: number, flip = false, W = 32): Dot {
  return (x, y, w, h, c) => r(X + (flip ? W - x - w : x) / 2, Y + y / 2, w / 2, h / 2, c);
}

// 楕円（影など）。中心 (cx, cy)、横の半径 rx、縦の半径 ry
function ellipse(d: Dot, cx: number, cy: number, rx: number, ry: number, c: string) {
  for (let dy = -ry; dy <= ry; dy++) {
    const w = Math.round(rx * Math.sqrt(1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5))));
    if (w > 0) d(cx - w, cy + dy, w * 2, 1, c);
  }
}
// 丸（葉のかたまりなど）
function blob(d: Dot, cx: number, cy: number, rad: number, c: string) {
  ellipse(d, cx, cy, rad, rad, c);
}

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/* ---------- 地面 ---------- */
export function hiGrass(r: RectFn, X: number, Y: number, tx: number, ty: number) {
  const d = dot(r, X, Y);
  const h = hash(tx, ty);
  d(0, 0, 32, 32, P.grass);
  // マスの継ぎ目が見えないよう、地の色は1色。濃淡は小さな草の点で出す
  for (let i = 0; i < 4; i++) d((h >> (i * 5 + 1)) % 30 + 1, (h >> (i * 5 + 3)) % 30 + 1, 2, 1, P.grass2);
  // 草の葉。濃い根もとと、明るい先
  for (let i = 0; i < 6; i++) {
    const gx = (h >> (i * 3)) % 28 + 2;
    const gy = (h >> (i * 3 + 1)) % 26 + 3;
    d(gx, gy, 1, 3, P.grassDark);
    d(gx + 1, gy + 1, 1, 2, P.grassDark);
    d(gx, gy - 1, 1, 1, P.grassLight);
  }
  // ときどき小さな花
  if (h % 7 === 0) {
    const fx = (h >> 5) % 24 + 4, fy = (h >> 9) % 22 + 5;
    const petal = h % 2 ? P.flowerWhite : P.flowerPink;
    d(fx - 1, fy, 3, 1, petal);
    d(fx, fy - 1, 1, 3, petal);
    d(fx, fy, 1, 1, P.flowerYellow);
  }
}

export function hiPath(r: RectFn, X: number, Y: number, tx: number, ty: number, edge: { up: boolean; down: boolean; left: boolean; right: boolean }) {
  const d = dot(r, X, Y);
  const h = hash(tx, ty);
  d(0, 0, 32, 32, P.path);
  // 小石と、明るい砂
  for (let i = 0; i < 5; i++) {
    const px = (h >> (i * 4)) % 28 + 2, py = (h >> (i * 4 + 2)) % 28 + 2;
    d(px, py, i % 2 ? 2 : 1, 1, P.pebble);
    d(px, py - 1, 1, 1, P.pathLight);
  }
  // 草地との境目：上は草の影が落ち、下と横は少し暗く
  if (edge.up) { d(0, 0, 32, 2, P.pathDark); d(0, 2, 32, 1, "rgba(120,100,60,0.12)"); }
  if (edge.down) d(0, 31, 32, 1, P.pathDark);
  if (edge.left) d(0, 0, 1, 32, P.pathDark);
  if (edge.right) d(31, 0, 1, 32, P.pathDark);
}

export function hiSoil(r: RectFn, X: number, Y: number, tx: number, ty: number) {
  const d = dot(r, X, Y);
  d(0, 0, 32, 32, P.soil);
  // 畝：明るい盛り上がりと、暗い溝
  for (let row = 0; row < 4; row++) {
    const y = row * 8;
    d(0, y + 1, 32, 2, P.soilRidge);
    d(0, y + 1, 32, 1, P.soilLight);
    d(0, y + 6, 32, 2, P.soilFurrow);
  }
  const h = hash(tx, ty);
  for (let i = 0; i < 3; i++) d((h >> (i * 5)) % 28 + 2, (h >> (i * 5 + 2)) % 4 * 8 + 3, 2, 1, P.soilLight);
}

export function hiWater(r: RectFn, X: number, Y: number, tx: number, t: number, bankAbove: boolean) {
  const d = dot(r, X, Y);
  // 岸のそばは明るく、離れると深い色（マスごとの縞にならないよう、岸の下だけで切り替える）
  d(0, 0, 32, 32, bankAbove ? P.water : P.waterDeep);
  if (bankAbove) {
    d(0, 0, 32, 3, P.waterBank);
    d(0, 3, 32, 1, "rgba(40,90,120,0.25)");
    d(0, 24, 32, 8, P.waterDeep);
    d(0, 22, 32, 2, "#63abcd");
  }
  // ゆっくり流れるきらめき
  const o = Math.floor(t / 220 + tx * 5) % 28;
  d(o, 9, 6, 1, P.waterShine);
  d((o + 14) % 26, 21, 4, 1, P.waterShine);
  d((o + 7) % 28, 15, 2, 1, "rgba(255,255,255,0.35)");
}

/* ---------- 木・柵・郵便受け ---------- */
export function hiTree(r: RectFn, X: number, Y: number) {
  const d = dot(r, X, Y);
  ellipse(d, 16, 29, 11, 2, P.shadow);
  // 幹
  d(14, 20, 5, 10, P.trunk);
  d(14, 20, 2, 10, P.trunkLight);
  // 葉のかたまり（暗い→明るい、左上ほど明るい）。上のマスに少しはみ出す
  blob(d, 16, 10, 12, P.leafDark);
  blob(d, 11, 9, 8, P.leaf);
  blob(d, 21, 11, 8, P.leaf);
  blob(d, 15, 6, 8, P.leafMid);
  blob(d, 12, 4, 4, P.leafLight);
  d(10, 2, 3, 1, "rgba(255,255,240,0.35)");
  blob(d, 22, 15, 3, P.leafDark);
}

export function hiFence(r: RectFn, X: number, Y: number) {
  const d = dot(r, X, Y);
  d(0, 28, 32, 2, P.shadowSoft);
  // 横木
  d(0, 13, 32, 3, P.wood); d(0, 13, 32, 1, P.woodLight); d(0, 16, 32, 1, P.woodDark);
  d(0, 21, 32, 3, P.wood); d(0, 21, 32, 1, P.woodLight); d(0, 24, 32, 1, P.woodDark);
  // 杭
  for (const x of [4, 24]) {
    d(x, 9, 4, 19, P.woodDark);
    d(x, 9, 2, 19, P.wood);
    d(x, 8, 4, 1, P.woodLight);
  }
}

export function hiMailbox(r: RectFn, X: number, Y: number, hasUnread: boolean) {
  const d = dot(r, X, Y);
  ellipse(d, 16, 30, 7, 1, P.shadow);
  d(14, 17, 4, 14, P.woodDark);
  d(14, 17, 2, 14, P.wood);
  // 箱（丸い屋根）
  d(7, 7, 18, 11, P.red);
  d(8, 5, 16, 2, P.red);
  d(7, 7, 18, 2, "#e0705f");
  d(21, 7, 4, 11, P.redDark);
  d(7, 16, 18, 2, P.redDark);
  d(9, 11, 6, 1, P.redDark); // 投函口
  if (hasUnread) {
    // 手紙が届くと旗が立つ
    d(25, 2, 2, 12, P.woodDark);
    d(27, 2, 5, 4, P.yellow);
    d(27, 5, 5, 1, "#d4ae45");
  }
}

/* ---------- 自分の家（2×2マス = 64×64ドット） ---------- */
export function hiHouse(r: RectFn, X: number, Y: number) {
  const d = dot(r, X, Y, false, 64);
  ellipse(d, 32, 63, 30, 2, P.shadowSoft);
  // 壁
  d(4, 26, 56, 37, P.wall);
  d(52, 26, 8, 37, P.wallShade);
  d(4, 60, 56, 3, P.wallShade);
  // 屋根：横縞の瓦と、左上の光
  for (let y = 0; y < 26; y++) {
    const inset = Math.max(0, 8 - Math.floor(y / 2));
    const c = y % 5 === 4 ? P.roofDark : y < 3 ? P.roofLight : P.roof;
    d(inset, y + 2, 64 - inset * 2, 1, c);
  }
  d(10, 3, 18, 1, "rgba(255,230,210,0.5)");
  d(0, 27, 64, 2, P.roofDark);
  d(4, 29, 56, 2, "rgba(60,40,20,0.18)"); // 軒下の影
  // 煙突
  d(44, 0, 7, 9, "#9a5a46"); d(44, 0, 7, 2, "#b87058"); d(49, 2, 2, 7, "#7d4838");
  // 窓
  d(37, 36, 18, 15, P.frame);
  d(39, 38, 14, 11, P.glass);
  d(39, 38, 5, 4, P.glassLight);
  d(45, 38, 2, 11, P.frame);
  d(39, 43, 14, 1, P.frame);
  d(36, 51, 20, 2, P.woodDark);
  // 窓辺の花
  for (let i = 0; i < 5; i++) d(38 + i * 4, 49, 2, 2, i % 2 ? P.flowerPink : P.flowerYellow);
  // 扉（左下のマス）
  d(9, 36, 16, 27, P.woodDark);
  d(10, 37, 14, 26, P.wood);
  d(10, 37, 14, 2, P.woodLight);
  d(12, 41, 10, 7, "rgba(0,0,0,0.10)");
  d(12, 51, 10, 8, "rgba(0,0,0,0.10)");
  d(21, 50, 2, 2, P.yellow);
  d(8, 62, 18, 1, P.woodDark);
}

/* ---------- 種・芽・花 ---------- */
function mound(d: Dot) {
  ellipse(d, 16, 25, 8, 2, "#6e4a30");
  d(10, 23, 12, 1, "#8b5f3d");
}
export function hiSeed(r: RectFn, X: number, Y: number) {
  const d = dot(r, X, Y);
  mound(d);
  d(14, 19, 4, 4, "#d9b25a");
  d(14, 19, 2, 2, "#f2dc96");
  d(16, 21, 2, 2, "#a8833c");
}
export function hiSprout(r: RectFn, X: number, Y: number, pale: boolean) {
  const d = dot(r, X, Y);
  mound(d);
  const stem = pale ? "#7aa865" : "#4f8f3a", leaf = pale ? "#b0d396" : "#7cc35a", hl = pale ? "#d2e8bf" : "#a6dc7f";
  d(15, 13, 2, 11, stem);
  // 左右の葉
  d(8, 12, 7, 3, leaf); d(9, 11, 4, 1, leaf); d(9, 12, 3, 1, hl);
  d(17, 9, 7, 3, leaf); d(19, 8, 4, 1, leaf); d(18, 9, 3, 1, hl);
}
export function hiFlower(r: RectFn, X: number, Y: number) {
  const d = dot(r, X, Y);
  mound(d);
  d(15, 10, 2, 14, "#4f8f3a");
  d(8, 16, 7, 3, "#7cc35a"); d(17, 13, 7, 3, "#7cc35a");
  // 花びら（5枚）とまんなか
  const pk = P.flowerPink, pd = "#e3889e";
  blob(d, 16, 4, 3, pk); blob(d, 11, 7, 3, pk); blob(d, 21, 7, 3, pk); blob(d, 13, 11, 3, pd); blob(d, 19, 11, 3, pd);
  blob(d, 16, 8, 2, P.yellow);
  d(15, 7, 1, 1, "#fff3c4");
}
export function hiSparkle(r: RectFn, X: number, Y: number, t: number, tx: number) {
  const d = dot(r, X, Y);
  mound(d);
  const k = ((t / 600 + tx * 0.37) % 1);
  const s = k < 0.5 ? Math.round(k * 2 * 6) : Math.round((1 - k) * 2 * 6);
  const c = "#fff6c2";
  d(16 - s, 15, s * 2 + 1, 1, c);
  d(16, 15 - s, 1, s * 2 + 1, c);
  d(15, 14, 3, 3, "rgba(255,246,194,0.6)");
}

/* ---------- 人物（32×32ドット。歩きは4コマ） ---------- */
// ph：-1=立ち止まり、1と3=足を出したコマ
export function hiFarmer(r: RectFn, X: number, Y: number, dir: Dir, ph: number) {
  const flip = dir === "left";
  const d = dot(r, X, Y - 4, flip); // 頭が少し上のマスにはみ出す
  const step = ph === 1 || ph === 3;
  const b = step ? -1 : 0; // 足を出したコマで体が少し上がる
  ellipse(d, 16, 34, 8, 2, P.shadow);
  if (dir === "down" || dir === "up") {
    // 足
    d(11, 28 - (ph === 3 ? 1 : 0), 4, 4, P.pants); d(10, 31 - (ph === 3 ? 1 : 0), 5, 2, P.shoe);
    d(17, 28 - (ph === 1 ? 1 : 0), 4, 4, P.pants); d(17, 31 - (ph === 1 ? 1 : 0), 5, 2, P.shoe);
    // 体
    d(9, 19 + b, 14, 10, P.shirt);
    d(19, 19 + b, 4, 10, P.shirtShade);
    d(10, 19 + b, 8, 1, P.shirtLight);
    if (dir === "down") d(14, 19 + b, 4, 2, P.skinShade);
    // 腕（交互に振る）
    const la = ph === 1 ? 1 : ph === 3 ? -1 : 0;
    d(7, 20 + b + la, 2, 7, P.shirt); d(7, 27 + b + la, 2, 2, P.skin);
    d(23, 20 + b - la, 2, 7, P.shirtShade); d(23, 27 + b - la, 2, 2, P.skin);
    // 頭
    d(9, 9 + b, 14, 10, P.skin);
    d(10, 8 + b, 12, 1, P.skin);
    d(21, 10 + b, 2, 8, P.skinShade);
    if (dir === "down") {
      d(9, 9 + b, 14, 2, P.hair); d(9, 11 + b, 2, 3, P.hair); d(21, 11 + b, 2, 3, P.hair);
      d(12, 13 + b, 2, 2, P.eye); d(18, 13 + b, 2, 2, P.eye);
      d(12, 13 + b, 1, 1, "#5a4a3a");
      d(10, 16 + b, 3, 1, P.cheek); d(19, 16 + b, 3, 1, P.cheek);
      d(15, 17 + b, 2, 1, "#c97a6a");
    } else {
      d(9, 9 + b, 14, 9, P.hair);
      d(9, 17 + b, 14, 1, "#5a3d22");
    }
    // 麦わら帽子
    d(10, 3 + b, 12, 6, P.hat);
    d(11, 3 + b, 6, 1, "#f4dc8c");
    d(10, 7 + b, 12, 2, P.hatBand);
    d(5, 9 + b, 22, 2, P.hatShade);
    d(6, 9 + b, 20, 1, P.hat);
  } else {
    // 横向き（右向きを描いて、左向きは反転）
    const f = ph === 1 ? 1 : ph === 3 ? -1 : 0;
    d(13 - f * 2, 28, 4, 4, "#4a3c30"); d(13 - f * 2, 31, 5, 2, P.shoe); // 奥の足
    d(14 + f * 2, 28, 4, 4, P.pants); d(14 + f * 2, 31, 5, 2, P.shoe); // 手前の足
    d(11, 19 + b, 11, 10, P.shirt);
    d(11, 19 + b, 3, 10, P.shirtShade);
    d(13, 19 + b, 7, 1, P.shirtLight);
    d(15 + f * 2, 21 + b, 3, 6, P.shirtShade); d(15 + f * 3, 27 + b, 3, 2, P.skin); // 腕
    d(10, 9 + b, 13, 10, P.skin);
    d(10, 9 + b, 6, 8, P.hair); // 後ろの髪
    d(19, 13 + b, 2, 2, P.eye);
    d(20, 16 + b, 2, 1, P.cheek);
    d(22, 14 + b, 1, 2, P.skinShade); // 鼻
    d(10, 3 + b, 12, 6, P.hat);
    d(12, 3 + b, 6, 1, "#f4dc8c");
    d(10, 7 + b, 12, 2, P.hatBand);
    d(6, 9 + b, 21, 2, P.hatShade);
    d(7, 9 + b, 19, 1, P.hat);
  }
}

// 村長（長老）。白い髪と長いひげ、着物に羽織、杖
export function hiMayor(r: RectFn, X: number, Y: number, dir: Dir, ph: number) {
  const flip = dir === "left";
  const d = dot(r, X, Y - 4, flip);
  const step = ph === 1 || ph === 3;
  const b = step ? -1 : 0;
  ellipse(d, 16, 34, 9, 2, P.shadow);
  const side = dir === "left" || dir === "right";
  // 杖
  const cx = side ? 25 : 26;
  d(cx, 17 + b, 2, 17, P.cane); d(cx, 17 + b, 1, 17, "#a87a52");
  d(cx - 1, 15 + b, 4, 3, P.woodDark);
  // 足（草履）
  d(11, 32 - (ph === 3 ? 1 : 0), 4, 1, P.shoe); d(17, 32 - (ph === 1 ? 1 : 0), 4, 1, P.shoe);
  // 着物と羽織
  d(9, 19 + b, 14, 13, P.robe);
  d(9, 19 + b, 14, 1, P.robeLight);
  d(8, 20 + b, 4, 12, P.haori); d(20, 20 + b, 4, 12, P.haoriShade);
  d(9, 25 + b, 14, 2, P.obi);
  if (!side && dir === "down") { d(14, 19 + b, 4, 5, "#efe6d0"); d(15, 19 + b, 2, 5, P.robe); }
  // 腕と手
  if (side) { d(16, 21 + b, 4, 6, P.haori); d(19, 26 + b, 3, 2, P.skin); }
  else { d(6, 21 + b, 3, 7, P.haori); d(23, 21 + b, 3, 7, P.haoriShade); d(24, 27 + b, 2, 2, P.skin); }
  // 頭
  d(10, 8 + b, 12, 11, P.skin);
  d(20, 9 + b, 2, 9, P.skinShade);
  d(11, 7 + b, 10, 2, P.white); // 頭の上の白髪（少なめ）
  if (dir === "down") {
    d(9, 9 + b, 2, 6, P.white); d(21, 9 + b, 2, 6, P.white); // 横の髪
    d(12, 11 + b, 3, 1, P.white); d(17, 11 + b, 3, 1, P.white); // 白い眉
    d(13, 13 + b, 2, 1, P.eye); d(17, 13 + b, 2, 1, P.eye); // 目を細めて笑う
    d(11, 15 + b, 2, 1, P.cheek); d(19, 15 + b, 2, 1, P.cheek);
    // 長いひげ
    d(12, 16 + b, 8, 4, P.white); d(13, 20 + b, 6, 3, P.white); d(14, 23 + b, 4, 2, P.white);
    d(18, 17 + b, 2, 6, P.whiteShade);
    d(15, 16 + b, 2, 1, "#c97a6a");
  } else if (dir === "up") {
    d(10, 9 + b, 12, 9, P.white);
    d(10, 17 + b, 12, 1, P.whiteShade);
  } else {
    d(10, 9 + b, 5, 8, P.white); // 後ろの髪
    d(18, 11 + b, 3, 1, P.white);
    d(19, 13 + b, 2, 1, P.eye);
    d(22, 13 + b, 1, 2, P.skinShade);
    d(17, 16 + b, 6, 4, P.white); d(18, 20 + b, 4, 3, P.white); d(19, 23 + b, 2, 2, P.white);
  }
}
