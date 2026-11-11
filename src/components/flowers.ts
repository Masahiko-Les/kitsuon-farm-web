// 「ありがとう」で咲く花のドット絵（16×16）。農場の10種類と、砂漠の10種類
// 1ドットずつ PixMap に描く。形は写実より、シンプルできれいなことを優先する（丸い花びら・同じ形の茎と葉・少ない色）
// 輪郭は最後にまとめて足す（便箋の上でも形が見えるように）
import type { SkImage } from "@shopify/react-native-skia";

import { PixMap, type RGB, hex } from "./pixmap";

type Draw = (pm: PixMap) => void;
const S = 16;

/* ---------- 色 ---------- */
const STEM = hex("#4f8a3a");
const LEAF = [hex("#3b6c47"), hex("#5f9a44"), hex("#8cbf5a")]; // 暗・中・明
const SAND = [hex("#c9a46e"), hex("#e1c28d")];
const OUTLINE = hex("#4a3c30");
const c3 = (d: string, b: string, l: string): RGB[] => [hex(d), hex(b), hex(l)];

/* ---------- 部品 ---------- */
function px(pm: PixMap, x: number, y: number, c: RGB) { pm.set(x, y, c); }
function line(pm: PixMap, x0: number, y0: number, x1: number, y1: number, c: RGB) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) pm.set(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), c);
}
function stem(pm: PixMap, x: number, y0: number, y1 = 15) { for (let y = y0; y <= y1; y++) px(pm, x, y, STEM); }
// 丸い花びらを n 枚、輪に並べた花。花びらごとに、左上を明るく、右下を少し暗く
function petals(pm: PixMap, cx: number, cy: number, o: { n: number; d: number; r: number; c: RGB[]; rot?: number; ry?: number }) {
  const rot = o.rot ?? -Math.PI / 2, ry = o.ry ?? o.r;
  for (let k = 0; k < o.n; k++) {
    const a = rot + (k * Math.PI * 2) / o.n;
    const px0 = cx + Math.cos(a) * o.d, py0 = cy + Math.sin(a) * o.d;
    for (let y = Math.floor(py0 - ry); y <= py0 + ry; y++) {
      for (let x = Math.floor(px0 - o.r); x <= px0 + o.r; x++) {
        const dx = (x + 0.5 - px0) / o.r, dy = (y + 0.5 - py0) / ry;
        if (dx * dx + dy * dy > 1.05) continue;
        pm.set(x, y, dx + dy < -0.55 ? o.c[2] : dx + dy > 0.75 ? o.c[0] : o.c[1]);
      }
    }
  }
}
// 花の芯（丸）
function center(pm: PixMap, cx: number, cy: number, r: number, c: RGB[]) {
  pm.ellipse(cx, cy, r, r, c[1]);
  if (r >= 1) pm.set(Math.floor(cx - 0.5), Math.floor(cy - 0.5), c[2]);
}
// まっすぐな茎と、左右の葉（どの花も同じ形）
function stemLeaves(pm: PixMap, top: number) {
  stem(pm, 7, top, 15);
  for (const [x, y, c] of [[4, 11, 2], [5, 11, 1], [5, 12, 1], [6, 12, 0], [3, 10, 2],
    [10, 11, 2], [9, 11, 1], [9, 12, 1], [8, 12, 0], [11, 10, 2]] as const) px(pm, x, y, LEAF[c]);
}
// 砂の小山（砂漠の花の足元）
const sand = (pm: PixMap) => { pm.rect(3, 15, 9, 1, SAND[0]); pm.rect(5, 14, 5, 1, SAND[1]); };

/* ---------- 農場の花 ---------- */
const RED = c3("#c8483e", "#e8665a", "#f6a08f");
const SUN = c3("#d99a26", "#f2c53d", "#fbe07a");
const BROWN = c3("#5e3a22", "#7a4a2a", "#a0663a");
const PINK = c3("#d86f98", "#f093b6", "#fbc6da");
const YELLOW = c3("#d9b02a", "#f2d24a", "#faea9a");
const WHITE = c3("#d6d0c2", "#f4f0e6", "#ffffff");
const BLUE = c3("#4a68c8", "#6f8ee0", "#a8c0f4");
const LAV = c3("#7a62b8", "#9c86d4", "#c6b6ee");
const VIOLET = c3("#6d55b0", "#8f78cc", "#b8a6e6");
const LILAC = c3("#b49ad8", "#d2c0ee", "#efe6fb");
const PEACH = c3("#e0889a", "#f4aabb", "#fcd6df");

const FARM: Record<string, Draw> = {
  tulip: (pm) => {
    stemLeaves(pm, 7);
    pm.rect(4, 3, 7, 3, RED[1]); pm.rect(5, 6, 5, 1, RED[1]); pm.rect(6, 7, 3, 1, RED[0]);
    px(pm, 4, 2, RED[2]); px(pm, 7, 2, RED[1]); px(pm, 10, 2, RED[0]);
    pm.rect(4, 3, 1, 3, RED[2]); pm.rect(5, 3, 1, 1, RED[2]); pm.rect(10, 3, 1, 3, RED[0]); px(pm, 9, 6, RED[0]);
  },
  sunflower: (pm) => {
    stemLeaves(pm, 9);
    petals(pm, 7.5, 5, { n: 10, d: 3.4, r: 1.5, c: SUN });
    center(pm, 7.5, 5, 2.4, BROWN);
  },
  cosmos: (pm) => {
    stemLeaves(pm, 9);
    petals(pm, 7.5, 5, { n: 8, d: 2.9, r: 1.6, c: PINK, rot: -Math.PI / 2 + Math.PI / 8 });
    center(pm, 7.5, 5, 1.2, YELLOW);
  },
  nanohana: (pm) => {
    stemLeaves(pm, 7);
    for (const [x, y] of [[7.5, 2.5], [5, 5], [10, 5], [7.5, 6.5]] as const) {
      petals(pm, x, y, { n: 4, d: 1.1, r: 1, c: YELLOW, rot: -Math.PI / 4 });
      px(pm, Math.floor(x), Math.floor(y), SUN[0]);
    }
  },
  daisy: (pm) => {
    stemLeaves(pm, 9);
    petals(pm, 7.5, 5, { n: 12, d: 3.2, r: 1.2, c: WHITE });
    center(pm, 7.5, 5, 1.8, YELLOW);
  },
  morningglory: (pm) => {
    stemLeaves(pm, 9);
    pm.ellipse(7.5, 5, 4.5, 4.2, BLUE[1]);
    pm.ellipse(7, 4.5, 3, 2.8, BLUE[2]);
    pm.ellipse(7.5, 5, 1.6, 1.6, WHITE[2]);
    for (const [x, y] of [[11, 6], [10, 8], [11, 4], [5, 8]] as const) px(pm, x, y, BLUE[0]);
  },
  suzuran: (pm) => {
    stemLeaves(pm, 4);
    px(pm, 8, 3, STEM); px(pm, 9, 3, STEM); px(pm, 10, 4, STEM); px(pm, 6, 3, STEM); px(pm, 5, 4, STEM);
    for (const [x, y] of [[5, 5], [10, 5], [7, 1]] as const) {
      pm.rect(x - 1, y, 3, 2, WHITE[1]); px(pm, x - 1, y, WHITE[2]);
      px(pm, x - 1, y + 2, WHITE[0]); px(pm, x + 1, y + 2, WHITE[0]);
    }
  },
  lavender: (pm) => {
    stemLeaves(pm, 8);
    for (let y = 1; y <= 7; y++) {
      const w = y === 1 || y === 7 ? 0 : 1;
      for (let x = 7 - w; x <= 7 + w; x++) px(pm, x, y, x < 7 ? LAV[2] : x > 7 ? LAV[0] : LAV[1]);
    }
  },
  pansy: (pm) => {
    stemLeaves(pm, 9);
    // 上の2枚は濃い紫、下の3枚は淡い紫。芯は小さな黄色
    petals(pm, 7.5, 5, { n: 2, d: 2, r: 2.2, c: VIOLET, rot: -Math.PI / 2 - 0.9 });
    petals(pm, 7.5, 5, { n: 2, d: 2, r: 2.2, c: VIOLET, rot: -Math.PI / 2 + 0.9 });
    petals(pm, 7.5, 5.5, { n: 3, d: 2.2, r: 2, c: LILAC, rot: Math.PI / 2 });
    petals(pm, 7.5, 5.5, { n: 1, d: 0, r: 1.2, c: LILAC });
    center(pm, 7.5, 5.5, 0.8, YELLOW);
  },
  sweetpea: (pm) => {
    stemLeaves(pm, 9);
    pm.ellipse(7.5, 4.5, 4, 3.4, PEACH[1]);
    pm.ellipse(6.5, 3.5, 2.2, 1.8, PEACH[2]);
    pm.ellipse(7.5, 8, 2, 1.4, PEACH[0]);
    px(pm, 7, 6, PEACH[0]); px(pm, 8, 6, PEACH[0]);
  },
};

/* ---------- 砂漠の花 ---------- */
const CACTUS = c3("#3f7a52", "#5c9a64", "#86bc84");
const HOT = c3("#d8507a", "#f27aa0", "#fbb4ca");
const CREAM = c3("#e6dcc6", "#f8f2e4", "#ffffff");
const BLUSH = c3("#e8b0bc", "#f6d2da", "#fdeef1");
const ROSE = c3("#d04a72", "#ee6e94", "#f9aec4");
const TRUNK = c3("#8a7458", "#a88e6c", "#c8b08a");
const MAGENTA = c3("#b83c8a", "#dc5aac", "#f2a2d4");
const ORANGE = c3("#e0702a", "#f5964a", "#fac48a");
const SCARLET = c3("#c83a3a", "#e85a52", "#f69a90");
const SUCC = c3("#4f8a5e", "#6fa878", "#9ccaa0");
const BIRD = c3("#3f7a5a", "#5c9a70", "#86bc94");
const SKY = c3("#3a64c0", "#5a86de", "#9cbaf2");

const DESERT: Record<string, Draw> = {
  "desert-cactus": (pm) => {
    sand(pm);
    pm.ellipse(7.5, 11, 3.5, 3.6, CACTUS[1]);
    pm.rect(6, 8, 1, 6, CACTUS[2]); pm.rect(9, 8, 1, 6, CACTUS[0]);
    petals(pm, 7.5, 5, { n: 5, d: 1.8, r: 1.5, c: HOT });
    center(pm, 7.5, 5, 0.9, YELLOW);
  },
  "desert-gekka": (pm) => {
    stemLeaves(pm, 9);
    petals(pm, 7.5, 5, { n: 10, d: 3.2, r: 1.4, c: BLUSH });
    petals(pm, 7.5, 5, { n: 6, d: 1.8, r: 1.4, c: CREAM, rot: 0 });
    center(pm, 7.5, 5, 0.9, YELLOW);
  },
  "desert-rose": (pm) => {
    sand(pm);
    pm.ellipse(7.5, 12.5, 3, 2, TRUNK[1]); px(pm, 6, 11, TRUNK[2]); px(pm, 9, 13, TRUNK[0]);
    stem(pm, 7, 9, 11);
    px(pm, 5, 10, LEAF[1]); px(pm, 4, 9, LEAF[2]); px(pm, 9, 10, LEAF[1]); px(pm, 10, 9, LEAF[2]);
    petals(pm, 7.5, 5, { n: 5, d: 2.2, r: 1.8, c: ROSE });
    center(pm, 7.5, 5, 1, CREAM);
  },
  "desert-bougainvillea": (pm) => {
    stemLeaves(pm, 9);
    for (const [x, y] of [[7.5, 3], [4.5, 6.5], [10.5, 6.5]] as const) {
      petals(pm, x, y, { n: 3, d: 1, r: 1.5, c: MAGENTA });
      px(pm, Math.floor(x), Math.floor(y), CREAM[2]);
    }
  },
  "desert-matsubagiku": (pm) => {
    sand(pm);
    stem(pm, 7, 9, 14);
    for (const x of [5, 10]) { px(pm, x, 13, SUCC[1]); px(pm, x, 12, SUCC[2]); }
    petals(pm, 7.5, 5, { n: 14, d: 3.1, r: 1.1, c: MAGENTA });
    center(pm, 7.5, 5, 1.6, CREAM);
    px(pm, 7, 4, YELLOW[1]);
  },
  "desert-portulaca": (pm) => {
    sand(pm);
    pm.rect(3, 13, 9, 1, SUCC[1]); px(pm, 4, 12, SUCC[2]); px(pm, 10, 12, SUCC[2]);
    petals(pm, 5, 9, { n: 5, d: 1.5, r: 1.3, c: ORANGE }); center(pm, 5, 9, 0.7, YELLOW);
    petals(pm, 10, 7, { n: 5, d: 1.5, r: 1.3, c: HOT }); center(pm, 10, 7, 0.7, YELLOW);
  },
  "desert-hanakirin": (pm) => {
    sand(pm);
    stem(pm, 7, 6, 14);
    px(pm, 6, 9, SUCC[1]); px(pm, 8, 11, SUCC[1]); px(pm, 5, 8, SUCC[2]); px(pm, 9, 10, SUCC[2]);
    // 小さな赤い花（丸い2枚）を3つ
    for (const [x, y] of [[7.5, 4], [4.5, 6.5], [10.5, 7.5]] as const) {
      petals(pm, x, y, { n: 2, d: 0.9, r: 1.2, c: SCARLET, rot: 0 });
      px(pm, Math.floor(x), Math.floor(y), YELLOW[1]);
    }
  },
  "desert-aloe": (pm) => {
    sand(pm);
    for (const [x0, x1] of [[6, 3], [9, 12], [7, 7]] as const) line(pm, x0, 14, x1, x1 === 7 ? 10 : 11, SUCC[1]);
    px(pm, 3, 11, SUCC[2]); px(pm, 12, 11, SUCC[2]);
    stem(pm, 7, 7, 12);
    for (let y = 1; y <= 6; y++) {
      const c = y <= 2 ? YELLOW : ORANGE;
      px(pm, 7, y, c[1]);
      if (y >= 3) { px(pm, 6, y, c[2]); px(pm, 8, y, c[0]); }
    }
  },
  "desert-gazania": (pm) => {
    stemLeaves(pm, 9);
    petals(pm, 7.5, 5, { n: 10, d: 3.2, r: 1.5, c: ORANGE });
    pm.ellipse(7.5, 5, 2, 2, SCARLET[0]);
    center(pm, 7.5, 5, 1.2, YELLOW);
  },
  "desert-strelitzia": (pm) => {
    stemLeaves(pm, 8);
    // 横向きの緑のがく（舟の形）と、上に立つ橙の花びら、青い1枚
    pm.rect(3, 7, 8, 1, BIRD[1]); pm.rect(4, 8, 6, 1, BIRD[0]); px(pm, 2, 7, BIRD[2]); pm.rect(3, 6, 3, 1, BIRD[2]);
    for (const [x, top] of [[6, 2], [8, 1], [10, 3]] as const) for (let y = top; y <= 6; y++) px(pm, x, y, y === top ? ORANGE[2] : ORANGE[1]);
    pm.rect(7, 4, 1, 3, SKY[1]); px(pm, 7, 3, SKY[2]);
  },
};

const DRAW: Record<string, Draw> = { ...FARM, ...DESERT };

// 透明なドットのうち、花に接している所に輪郭を引く
function outline(pm: PixMap) {
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < S && y < S && pm.data[(y * S + x) * 4 + 3] > 0;
  const edge: [number, number][] = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edge.push([x, y]);
  }
  for (const [x, y] of edge) pm.set(x, y, OUTLINE, 0.6);
}

// 花の 16×16 のドット（RGBA）。1種類につき1回だけ描く
// 輪郭は、便箋の上に出すときだけつける（マップの上では、まわりの絵になじませるため輪郭なし）
const cache = new Map<string, PixMap>();
function flowerMap(id: string, outlined: boolean) {
  const key = `${id}:${outlined ? 1 : 0}`;
  let pm = cache.get(key);
  if (!pm) {
    pm = new PixMap(S, S);
    (DRAW[id] ?? FARM.tulip)(pm);
    if (outlined) outline(pm);
    cache.set(key, pm);
  }
  return pm;
}
export const flowerPixels = (id: string): Uint8Array => flowerMap(id, true).data;
// マップに咲かせる花の画像
const images = new Map<string, SkImage>();
export function flowerImage(id: string): SkImage {
  let img = images.get(id);
  if (!img) {
    img = flowerMap(id, false).toImage();
    images.set(id, img);
  }
  return img;
}
export const FLOWER_SIZE = S;
