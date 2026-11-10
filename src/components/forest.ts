// 地図の動かない絵（地面・木・柵・家）。1ドットずつ PixMap に描く。
// 光は左上から。影は右下へ、青緑の半透明で落とす
import { tileAt } from "@/lib/game";
import { DIRT, DIRT_EDGE, FLOWERS, GRASS, HOUSE, LEAVES, PEBBLE, SHADE, SOIL, STONE, TRUNK, TUFT_DARK, TUFT_LIGHT, WATER, WOOD } from "./palette";
import { type PixMap, type RGB, noise, pick, rnd } from "./pixmap";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/* ---------- 地面 ---------- */
// 草地の明るさ。数マスにまたがる日だまりと、少し暗い所のむら
const grassLight = (x: number, y: number) =>
  clamp01((0.62 * noise(x / 40, y / 40, 1) + 0.38 * noise(x / 13, y / 13, 2) - 0.22) / 0.56);
const grassAt = (x: number, y: number) => pick(GRASS, grassLight(x, y), x, y);

function fillGrass(pm: PixMap, X: number, Y: number) {
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) pm.set(X + i, Y + j, grassAt(X + i, Y + j));
}
// 小さな草むら：暗い葉に、光の当たる先っぽ
function tuft(pm: PixMap, x: number, y: number) {
  for (let i = 0; i < 5; i++) pm.set(x + i, y + 1, SHADE, 0.12);
  for (const [dx, dy] of [[0, 0], [1, -1], [1, 0], [2, 0], [3, -1], [3, 0], [4, 0]]) pm.set(x + dx, y + dy, TUFT_DARK);
  pm.set(x + 1, y - 2, TUFT_LIGHT);
  pm.set(x + 3, y - 2, TUFT_LIGHT);
}
export function drawGrassTile(pm: PixMap, X: number, Y: number, tx: number, ty: number) {
  fillGrass(pm, X, Y);
  const n = 1 + Math.floor(rnd(tx, ty, 11) * 3);
  for (let k = 0; k < n; k++) {
    tuft(pm, X + 1 + Math.floor(rnd(tx, ty, 20 + k) * 10), Y + 3 + Math.floor(rnd(tx, ty, 30 + k) * 11));
  }
  if (rnd(tx, ty, 12) < 0.22) {
    const c = FLOWERS[Math.floor(rnd(tx, ty, 13) * FLOWERS.length)];
    const fx = X + 2 + Math.floor(rnd(tx, ty, 14) * 12), fy = Y + 2 + Math.floor(rnd(tx, ty, 15) * 11);
    pm.set(fx, fy + 1, TUFT_DARK);
    pm.set(fx, fy, c);
    if (rnd(tx, ty, 16) < 0.5) { pm.set(fx + 3, fy + 2, TUFT_DARK); pm.set(fx + 3, fy + 1, c); }
  }
}

// 道や畑のふち：となりが草地の辺は、草が少しかぶさる
const GROUNDISH = new Set([".", "T", "F", "M", "~", ","]);
type Side = "top" | "bottom" | "left" | "right";
function edges(tx: number, ty: number, same: (c: string) => boolean) {
  const open = (x: number, y: number) => { const c = tileAt(x, y); return !same(c) && GROUNDISH.has(c); };
  return { top: open(tx, ty - 1), bottom: open(tx, ty + 1), left: open(tx - 1, ty), right: open(tx + 1, ty) };
}
// 辺から内側への深さ（0 が辺）。草がかぶる幅はゆらぎで 0〜2 ドット
function overhang(pm: PixMap, X: number, Y: number, side: Side, edge: RGB) {
  for (let k = 0; k < 16; k++) {
    const wx = side === "left" || side === "right" ? 0 : k, wy = side === "top" || side === "bottom" ? 0 : k;
    const g = Math.floor(noise((X + wx) / 3, (Y + wy) / 3, side.length) * 3);
    for (let d = 0; d <= g; d++) {
      const [x, y] = at(X, Y, side, k, d);
      pm.set(x, y, d === g ? edge : grassAt(x, y));
    }
  }
}
function at(X: number, Y: number, side: Side, k: number, d: number): [number, number] {
  if (side === "top") return [X + k, Y + d];
  if (side === "bottom") return [X + k, Y + 15 - d];
  if (side === "left") return [X + d, Y + k];
  return [X + 15 - d, Y + k];
}

export function drawPathTile(pm: PixMap, X: number, Y: number, tx: number, ty: number) {
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      pm.set(x, y, pick(DIRT, clamp01(0.25 + 0.6 * noise(x / 6, y / 6, 3)), x, y, 0.9));
    }
  }
  for (let k = 0; k < 2; k++) {
    if (rnd(tx, ty, 40 + k) < 0.6) {
      const px = X + 2 + Math.floor(rnd(tx, ty, 42 + k) * 12), py = Y + 2 + Math.floor(rnd(tx, ty, 44 + k) * 12);
      pm.set(px, py, PEBBLE); pm.set(px + 1, py, PEBBLE); pm.set(px, py - 1, DIRT[3]);
    }
  }
  const e = edges(tx, ty, (c) => c === "P");
  for (const side of ["top", "bottom", "left", "right"] as Side[]) if (e[side]) overhang(pm, X, Y, side, DIRT_EDGE);
}

// 畑：横の畝。上の段が光り、下の溝が暗い
export function drawSoilTile(pm: PixMap, X: number, Y: number, tx: number, ty: number) {
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j, r = y & 3, n = noise(x / 4, y / 2, 5);
      const c = r === 0 ? (n > 0.55 ? SOIL.light : SOIL.ridge) : r === 1 ? SOIL.ridge : r === 2 ? (n < 0.3 ? SOIL.furrow : SOIL.body) : SOIL.furrow;
      pm.set(x, y, c);
    }
  }
  if (rnd(tx, ty, 50) < 0.5) { const cx = X + 3 + Math.floor(rnd(tx, ty, 51) * 10); pm.set(cx, Y + 4, SOIL.light); pm.set(cx + 1, Y + 8, SOIL.light); }
  const e = edges(tx, ty, (c) => c === ",");
  for (const side of ["top", "bottom", "left", "right"] as Side[]) if (e[side]) overhang(pm, X, Y, side, SOIL.furrow);
}

// 池：まわりは石と草。上と左の岸は水面に影を落とす
export function drawPondTile(pm: PixMap, X: number, Y: number, tx: number, ty: number) {
  const land = (x: number, y: number) => tileAt(x, y) !== "~";
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      const n = noise(x / 9, y / 5, 6);
      pm.set(x, y, n < 0.38 ? WATER.deep : n > 0.72 ? WATER.light : WATER.body);
    }
  }
  const stone = (x: number, y: number) => pm.set(x, y, STONE[Math.floor(noise(x / 2, y / 2, 7) * 3)]);
  for (let k = 0; k < 16; k++) {
    if (land(tx, ty - 1)) { stone(X + k, Y); stone(X + k, Y + 1); pm.set(X + k, Y + 2, WATER.bank); pm.set(X + k, Y + 3, WATER.bank, 0.5); }
    if (land(tx - 1, ty)) { stone(X, Y + k); pm.set(X + 1, Y + k, WATER.bank); pm.set(X + 2, Y + k, WATER.bank, 0.5); }
    if (land(tx + 1, ty)) { stone(X + 15, Y + k); pm.set(X + 14, Y + k, STONE[2]); }
    if (land(tx, ty + 1)) { stone(X + k, Y + 15); pm.set(X + k, Y + 14, STONE[2]); }
  }
}

/* ---------- 木 ---------- */
// 地面の上：足元の影と幹。葉は別の層（村人より手前）に描く
export function drawTreeShadow(pm: PixMap, X: number, Y: number) {
  pm.ellipse(X + 12, Y + 13, 11, 4.5, SHADE, 0.32);
  pm.ellipse(X + 8, Y + 13, 6, 2.5, SHADE, 0.3);
}
export function drawTrunk(pm: PixMap, X: number, Y: number) {
  for (let y = Y + 5; y < Y + 15; y++) {
    pm.set(X + 6, y, TRUNK.light);
    pm.set(X + 7, y, TRUNK.body);
    pm.set(X + 8, y, TRUNK.body);
    pm.set(X + 9, y, TRUNK.dark);
  }
  pm.set(X + 5, Y + 14, TRUNK.body); pm.set(X + 10, Y + 14, TRUNK.dark);
  pm.set(X + 7, Y + 9, TRUNK.dark);
}
// 葉：いくつかの丸い塊を重ねる。左上ほど明るく、塊の下のふちは暗い
type Blob = { cx: number; cy: number; r: number; lift: number };
export function drawCanopy(pm: PixMap, X: number, Y: number, tx: number, ty: number) {
  const j = (s: number) => Math.round((rnd(tx, ty, s) - 0.5) * 4);
  const blobs: Blob[] = [
    { cx: 8 + j(60), cy: -4, r: 8, lift: -0.12 },
    { cx: 1, cy: 3 + j(61) / 2, r: 7, lift: -0.06 },
    { cx: 15, cy: 3 + j(62) / 2, r: 7, lift: -0.08 },
    { cx: 8, cy: 3, r: 8.5, lift: 0 },
    { cx: 5 + j(63) / 2, cy: -2, r: 5, lift: 0.12 },
    { cx: 11, cy: 5, r: 4.5, lift: 0.02 },
  ];
  for (const b of blobs) {
    const cx = X + b.cx, cy = Y + b.cy;
    for (let y = Math.floor(cy - b.r - 1); y <= cy + b.r; y++) {
      for (let x = Math.floor(cx - b.r - 1); x <= cx + b.r; x++) {
        const dx = (x + 0.5 - cx) / b.r, dy = (y + 0.5 - cy) / b.r, d2 = dx * dx + dy * dy;
        // ふちは葉先のようにぎざぎざに
        if (d2 > 1 - 0.35 * noise(x / 1.6, y / 1.6, 8)) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d2));
        const light = -dx * 0.45 - dy * 0.6 + nz * 0.55;
        let v = 0.38 + 0.38 * light + b.lift + 0.3 * (noise(x / 3, y / 3, 9) - 0.5);
        if (dy > 0.55 && d2 > 0.6) v -= 0.18; // 塊の下のふち
        pm.set(x, y, pick(LEAVES, clamp01(v), x, y, 0.8));
      }
    }
  }
}

/* ---------- 柵 ---------- */
export function drawFenceTile(pm: PixMap, X: number, Y: number) {
  for (let i = 0; i < 16; i++) {
    pm.set(X + i, Y + 6, WOOD.light);
    pm.set(X + i, Y + 7, WOOD.body);
    pm.set(X + i, Y + 8, SHADE, 0.28);
    pm.set(X + i, Y + 11, WOOD.body);
    pm.set(X + i, Y + 12, SHADE, 0.28);
  }
  for (const px of [X + 2, X + 12]) {
    pm.ellipse(px + 3, Y + 15, 3.5, 1.5, SHADE, 0.3);
    for (let y = Y + 4; y < Y + 15; y++) { pm.set(px, y, WOOD.light); pm.set(px + 1, y, WOOD.dark); }
    pm.set(px, Y + 4, WOOD.light); pm.set(px + 1, Y + 4, WOOD.body);
  }
}

/* ---------- 家（2×2マス。扉は左下のマス） ---------- */
export function drawHouseArt(pm: PixMap, X: number, Y: number) {
  const H = HOUSE;
  // 右と下に落ちる影
  pm.rect(X + 32, Y + 6, 4, 26, SHADE, 0.3);
  pm.rect(X + 2, Y + 32, 34, 2, SHADE, 0.3);
  // 壁：しっくいと柱
  pm.rect(X + 1, Y + 13, 30, 19, H.wall);
  pm.rect(X + 24, Y + 13, 7, 19, H.wallShade);
  for (const x of [X + 1, X + 15, X + 30]) pm.rect(x, Y + 13, 1, 19, H.timber);
  pm.rect(X + 1, Y + 31, 30, 1, H.timber);
  // 軒下の濃い影
  pm.rect(X + 1, Y + 13, 30, 3, H.timber, 0.55);
  // 屋根：瓦の段。上の段ほど明るく、段ごとに下のふちが暗い
  for (let y = Y - 3; y < Y + 14; y++) {
    const row = Math.floor((y - Y + 3) / 3), r = (y - Y + 3) % 3;
    const left = X - 1 - (y > Y + 10 ? 1 : 0), right = X + 33 + (y > Y + 10 ? 1 : 0);
    for (let x = left; x < right; x++) {
      const shade = x > X + 22 ? 1 : 0;
      let c = H.roof[Math.max(0, 2 - shade - (row > 3 ? 1 : 0))];
      if (r === 0) c = H.roof[Math.min(3, 3 - shade)];
      if (r === 2) c = H.roof[0];
      if (r === 1 && (x + row * 2) % 5 === 0) c = H.roof[0];
      pm.set(x, y, c);
    }
  }
  pm.rect(X - 1, Y - 4, 34, 1, H.roof[3]); // 棟
  pm.rect(X - 2, Y + 14, 36, 1, H.roof[0]);
  // 窓：あたたかい明かり
  pm.rect(X + 18, Y + 18, 10, 8, H.timber);
  pm.rect(X + 19, Y + 19, 8, 6, H.glow);
  pm.rect(X + 19, Y + 19, 3, 2, H.glowLight);
  pm.rect(X + 22, Y + 19, 1, 6, H.timber);
  pm.rect(X + 19, Y + 21, 8, 1, H.timber);
  pm.rect(X + 17, Y + 26, 12, 1, WOOD.body);
  // 扉
  pm.rect(X + 2, Y + 17, 12, 15, H.timber);
  pm.rect(X + 3, Y + 18, 10, 14, H.door);
  pm.rect(X + 3, Y + 18, 10, 1, WOOD.light);
  pm.rect(X + 12, Y + 19, 1, 13, H.doorDark);
  pm.rect(X + 5, Y + 21, 6, 4, H.doorDark);
  pm.set(X + 11, Y + 26, H.glow);
  // 表札と鉢植え
  pm.rect(X + 16, Y + 19, 1, 4, WOOD.dark);
  pm.ellipse(X + 21, Y + 31.5, 4, 1.2, SHADE, 0.35);
  pm.rect(X + 18, Y + 28, 5, 3, H.pot);
  pm.rect(X + 18, Y + 28, 5, 1, WOOD.light);
  for (const [dx, dy, c] of [[1, -1, LEAVES[4]], [2, -2, LEAVES[5]], [3, -1, LEAVES[3]], [0, -2, LEAVES[3]], [4, -2, LEAVES[4]], [2, -3, LEAVES[4]]] as const) {
    pm.set(X + 18 + dx, Y + 28 + dy, c);
  }
}
