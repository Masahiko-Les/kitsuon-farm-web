// 「ありがとう」で咲く花のドット絵（16×16）。農場の10種類と、砂漠の10種類
// 1ドットずつ PixMap に描く。輪郭は最後にまとめて足す（便箋の上でも形が見えるように）
import { PixMap, type RGB, hex } from "./pixmap";

type Draw = (pm: PixMap) => void;
const S = 16;

/* ---------- 色 ---------- */
const STEM = hex("#4f8a3a");
const LEAF = [hex("#3b6c47"), hex("#5f9a44"), hex("#8cbf5a")]; // 暗・中・明
const GRASS_TUFT = [hex("#3b6c47"), hex("#5f9a44")];
const SAND = [hex("#c9a46e"), hex("#e1c28d")];
const OUTLINE = hex("#3a2e26");
const c3 = (d: string, b: string, l: string): RGB[] => [hex(d), hex(b), hex(l)];

/* ---------- 部品 ---------- */
function px(pm: PixMap, x: number, y: number, c: RGB) { pm.set(x, y, c); }
function line(pm: PixMap, x0: number, y0: number, x1: number, y1: number, c: RGB) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 0; i <= n; i++) pm.set(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), c);
}
function stem(pm: PixMap, x: number, y0: number, y1 = 15) { for (let y = y0; y <= y1; y++) px(pm, x, y, STEM); }
// 葉：茎の x から、side の向きに斜め上へ伸びる
function leaf(pm: PixMap, x: number, y: number, side: 1 | -1, len = 3) {
  for (let i = 1; i <= len; i++) {
    px(pm, x + side * i, y - Math.floor(i / 2), i === len ? LEAF[2] : LEAF[1]);
    if (i < len) px(pm, x + side * i, y - Math.floor(i / 2) + 1, LEAF[0]);
  }
}
// 放射状の花びら。n 枚、中心からの距離 r0〜r1、幅 w。左上が明るい
function bloom(pm: PixMap, cx: number, cy: number, o: { n: number; r0: number; r1: number; w: number; c: RGB[]; rot?: number }) {
  const step = (Math.PI * 2) / o.n, rot = o.rot ?? -Math.PI / 2;
  for (let y = Math.floor(cy - o.r1 - 1); y <= cy + o.r1 + 1; y++) {
    for (let x = Math.floor(cx - o.r1 - 1); x <= cx + o.r1 + 1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.hypot(dx, dy);
      if (d < o.r0 || d > o.r1) continue;
      const a = Math.atan2(dy, dx) - rot;
      let f = ((a / step) % 1 + 1) % 1;
      f = Math.min(f, 1 - f);
      const arc = f * step * d; // 花びらの中心線からの距離
      const k = (d - o.r0) / Math.max(0.01, o.r1 - o.r0);
      const half = o.w * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, k * 0.9 + 0.1)));
      if (arc > half) continue;
      const lit = dx + dy < -0.5;
      pm.set(x, y, arc > half - 0.6 && d > o.r0 + 0.8 ? o.c[0] : lit ? o.c[2] : o.c[1]);
    }
  }
}
function disk(pm: PixMap, cx: number, cy: number, r: number, c: RGB[]) {
  pm.ellipse(cx, cy, r, r, c[1]);
  pm.set(Math.floor(cx - r * 0.4), Math.floor(cy - r * 0.4), c[2]);
  if (r >= 1.5) pm.set(Math.floor(cx + r * 0.4), Math.floor(cy + r * 0.4), c[0]);
}
// 小さな4枚の花（なのはな・ブーゲンビリアなど）
function floret(pm: PixMap, x: number, y: number, c: RGB[], center?: RGB) {
  px(pm, x, y - 1, c[2]); px(pm, x - 1, y, c[1]); px(pm, x + 1, y, c[1]); px(pm, x, y + 1, c[0]);
  px(pm, x, y, center ?? c[1]);
}
const grassBase = (pm: PixMap) => {
  for (const [x, h] of [[4, 2], [5, 1], [10, 1], [11, 2], [12, 1]] as const) for (let j = 0; j < h; j++) px(pm, x, 15 - j, GRASS_TUFT[j === 0 ? 0 : 1]);
};
const sandBase = (pm: PixMap) => {
  pm.rect(3, 15, 10, 1, SAND[0]); pm.rect(5, 14, 6, 1, SAND[1]);
};

/* ---------- 農場の花 ---------- */
const TULIP = c3("#a8322c", "#d9483b", "#ef7a5e");
const SUN = c3("#c98a1e", "#efc23a", "#f7dc6a");
const BROWN = c3("#4a2f1c", "#6b4226", "#8a5a34");
const COSMOS = c3("#c0607f", "#e98fb0", "#f6bfd2");
const YELLOW = c3("#c9a21e", "#efd23a", "#f8e88a");
const WHITE = c3("#c9c3b4", "#f1ede2", "#ffffff");
const GLORY = c3("#2f4fa8", "#4e6fd0", "#86a3ec");
const LAV = c3("#6a4c9c", "#8e6cc0", "#b79ae0");
const PANSY = c3("#4a2a78", "#6a3fa0", "#9670c8");
const PEA = c3("#c0688f", "#f2a0bf", "#fbd0e0");
const PEA2 = c3("#7e68b0", "#b9a0e0", "#ddd0f4");

const FARM: Record<string, Draw> = {
  tulip: (pm) => {
    grassBase(pm);
    stem(pm, 8, 8);
    for (let y = 10; y <= 14; y++) { px(pm, 6, y, LEAF[1]); px(pm, 10, y - 1, LEAF[1]); }
    px(pm, 7, 14, LEAF[0]); px(pm, 9, 13, LEAF[0]); px(pm, 6, 9, LEAF[2]); px(pm, 10, 8, LEAF[2]);
    pm.rect(6, 4, 5, 4, TULIP[1]);
    px(pm, 6, 3, TULIP[1]); px(pm, 8, 2, TULIP[1]); px(pm, 8, 3, TULIP[1]); px(pm, 10, 3, TULIP[0]);
    pm.rect(7, 4, 1, 2, TULIP[2]); px(pm, 6, 3, TULIP[2]);
    pm.rect(10, 4, 1, 4, TULIP[0]); pm.rect(7, 7, 3, 1, TULIP[0]);
  },
  sunflower: (pm) => {
    grassBase(pm);
    stem(pm, 8, 10);
    leaf(pm, 8, 13, -1, 3); leaf(pm, 8, 12, 1, 3);
    bloom(pm, 8, 6, { n: 12, r0: 1.5, r1: 5.2, w: 1.0, c: SUN });
    disk(pm, 8, 6, 2.3, BROWN);
  },
  cosmos: (pm) => {
    grassBase(pm);
    line(pm, 8, 15, 7, 9, STEM); px(pm, 6, 12, LEAF[1]); px(pm, 5, 11, LEAF[2]); px(pm, 9, 13, LEAF[1]); px(pm, 10, 12, LEAF[2]);
    bloom(pm, 7.5, 5.5, { n: 8, r0: 1, r1: 4.8, w: 1.2, c: COSMOS, rot: -Math.PI / 2 + 0.2 });
    disk(pm, 7.5, 5.5, 1.2, YELLOW);
  },
  nanohana: (pm) => {
    grassBase(pm);
    stem(pm, 8, 8);
    leaf(pm, 8, 13, -1, 3); leaf(pm, 8, 11, 1, 2);
    for (const [x, y] of [[8, 2], [6, 4], [10, 4], [8, 5], [5, 7], [11, 7], [7, 7], [9, 8]] as const) floret(pm, x, y, YELLOW, SUN[0]);
  },
  daisy: (pm) => {
    grassBase(pm);
    stem(pm, 8, 10);
    leaf(pm, 8, 14, 1, 3); leaf(pm, 8, 13, -1, 2);
    bloom(pm, 8, 6, { n: 14, r0: 1.2, r1: 5, w: 0.7, c: WHITE });
    disk(pm, 8, 6, 1.6, YELLOW);
  },
  morningglory: (pm) => {
    // 支柱に巻きつくつる。ハートの葉
    for (let y = 9; y <= 15; y++) px(pm, y % 2 ? 7 : 8, y, STEM);
    pm.ellipse(11, 12, 2, 1.6, LEAF[1]); px(pm, 10, 11, LEAF[2]); px(pm, 12, 13, LEAF[0]);
    pm.ellipse(4.5, 11, 1.8, 1.4, LEAF[1]); px(pm, 4, 10, LEAF[2]);
    pm.ellipse(8, 5.5, 4.6, 4.6, GLORY[1]);
    pm.ellipse(7.5, 5, 3, 3, GLORY[2]);
    pm.ellipse(8, 5.5, 1.6, 1.6, WHITE[1]);
    px(pm, 8, 5, WHITE[2]);
    for (const [x, y] of [[8, 1], [4, 4], [12, 4], [5, 9], [11, 9]] as const) line(pm, 8, 5, x, y, GLORY[0]);
    pm.ellipse(8, 5.5, 1.2, 1.2, WHITE[2]);
  },
  suzuran: (pm) => {
    // 大きな葉と、弓なりの茎に下向きの鈴
    pm.ellipse(11, 11.5, 2.4, 4.2, LEAF[1]); line(pm, 11, 8, 11, 15, LEAF[0]); px(pm, 10, 9, LEAF[2]);
    line(pm, 5, 15, 5, 8, STEM); line(pm, 5, 8, 7, 4, STEM); line(pm, 7, 4, 10, 3, STEM); px(pm, 11, 4, STEM);
    for (const [x, y] of [[6, 7], [8, 5], [11, 6], [4, 10]] as const) {
      pm.rect(x - 1, y, 3, 2, WHITE[1]); px(pm, x - 1, y, WHITE[2]);
      px(pm, x - 1, y + 2, WHITE[1]); px(pm, x + 1, y + 2, WHITE[0]);
    }
  },
  lavender: (pm) => {
    grassBase(pm);
    for (const [x, top, h] of [[5, 4, 5], [8, 1, 6], [11, 3, 5]] as const) {
      stem(pm, x, top + h);
      for (let i = 0; i < h; i++) {
        const y = top + i;
        px(pm, x, y, LAV[i % 2 ? 1 : 2]);
        if (i > 0 && i < h - 1) { px(pm, x - 1, y, i % 2 ? LAV[0] : LAV[1]); px(pm, x + 1, y, i % 2 ? LAV[1] : LAV[0]); }
      }
    }
  },
  pansy: (pm) => {
    grassBase(pm);
    stem(pm, 8, 11);
    leaf(pm, 8, 14, -1, 3); leaf(pm, 8, 13, 1, 3);
    pm.ellipse(5.5, 4, 2.4, 2.4, PANSY[1]); pm.ellipse(10.5, 4, 2.4, 2.4, PANSY[1]);
    px(pm, 4, 3, PANSY[2]); px(pm, 9, 3, PANSY[2]);
    pm.ellipse(4.5, 7.5, 2.2, 2, YELLOW[1]); pm.ellipse(11.5, 7.5, 2.2, 2, YELLOW[1]); pm.ellipse(8, 9, 2.6, 2.1, YELLOW[1]);
    px(pm, 4, 7, YELLOW[2]); px(pm, 7, 8, YELLOW[2]);
    pm.ellipse(8, 7.2, 2, 1.8, PANSY[0]);
    px(pm, 8, 7, YELLOW[2]); px(pm, 6, 8, PANSY[0]); px(pm, 10, 8, PANSY[0]); px(pm, 8, 9, PANSY[0]);
  },
  sweetpea: (pm) => {
    // くるっと巻いたつると、蝶の形の2つの花
    line(pm, 8, 15, 8, 9, STEM); line(pm, 8, 9, 10, 9, STEM); line(pm, 8, 11, 5, 9, STEM);
    px(pm, 12, 13, STEM); px(pm, 13, 12, STEM); px(pm, 12, 11, STEM); px(pm, 9, 13, STEM); px(pm, 10, 13, STEM);
    leaf(pm, 8, 14, -1, 3);
    pm.ellipse(5.5, 4.5, 3, 2.8, PEA[1]); px(pm, 4, 3, PEA[2]); px(pm, 5, 3, PEA[2]);
    pm.rect(5, 7, 2, 2, PEA[0]); line(pm, 3, 5, 8, 5, PEA[0]);
    pm.ellipse(11.5, 6.5, 2.6, 2.4, PEA2[1]); px(pm, 10, 5, PEA2[2]);
    pm.rect(11, 8, 2, 1, PEA2[0]); line(pm, 10, 7, 13, 7, PEA2[0]);
  },
};

/* ---------- 砂漠の花 ---------- */
const CACTUS = c3("#2f6a4a", "#4f8f5a", "#7ab478");
const PINK = c3("#c0466e", "#f27aa0", "#fbb0c8");
const SEPAL = c3("#8a4a34", "#b07050", "#d09070");
const CREAM = c3("#d8ccb0", "#f4ecd8", "#fffaf0");
const ADE = c3("#a8304e", "#e0507a", "#f7a0b8");
const CAUDEX = c3("#7a6650", "#9c8466", "#bca684");
const BOUG = c3("#a12a6c", "#d23c8c", "#ec6fb0");
const BRANCH = hex("#7a5d45");
const MAGENTA = c3("#a03090", "#d84fb0", "#f2a0dc");
const SUCC = c3("#3f7a50", "#62a068", "#94c890");
const ORANGE = c3("#c0581e", "#ef8a2a", "#f7b860");
const RED = c3("#a01e24", "#d8343a", "#f06e64");
const THORNY = c3("#5a5048", "#7d7266", "#a49888");
const ALOE = c3("#4f7a5a", "#7aa47e", "#b0ccb0");
const GAZ = c3("#c05a14", "#f08a24", "#f8c058");
const BIRD = c3("#3a5a48", "#4f8a5a", "#6aa070");
const PURPLE = hex("#6a4a6a");
const BLUE = c3("#2f4fa8", "#3f6fd0", "#86a3ec");

const DESERT: Record<string, Draw> = {
  "desert-cactus": (pm) => {
    sandBase(pm);
    pm.ellipse(8, 10.5, 3.6, 4, CACTUS[1]);
    for (let y = 7; y <= 14; y++) { px(pm, 7, y, CACTUS[2]); px(pm, 10, y, CACTUS[0]); }
    for (const [x, y] of [[5, 9], [11, 10], [6, 12], [9, 13], [11, 8]] as const) px(pm, x, y, CREAM[2]);
    bloom(pm, 8, 4.5, { n: 8, r0: 0.8, r1: 3.6, w: 1.1, c: PINK });
    disk(pm, 8, 4.5, 0.9, YELLOW);
  },
  "desert-gekka": (pm) => {
    // 夜に咲く、大きな白い花。外側に赤茶のがく。平たい葉
    line(pm, 3, 15, 7, 11, LEAF[1]); line(pm, 4, 15, 8, 11, LEAF[0]); line(pm, 13, 14, 9, 11, LEAF[1]);
    line(pm, 8, 11, 8, 9, STEM);
    bloom(pm, 8, 5.5, { n: 12, r0: 3.5, r1: 6.5, w: 0.5, c: SEPAL, rot: -Math.PI / 2 + 0.26 });
    bloom(pm, 8, 5.5, { n: 10, r0: 0.5, r1: 5.2, w: 1.2, c: CREAM });
    disk(pm, 8, 5.5, 1.1, YELLOW);
  },
  "desert-rose": (pm) => {
    // ふくらんだ幹から枝が伸び、ラッパ形の花
    sandBase(pm);
    pm.ellipse(8, 12.5, 3.8, 2.6, CAUDEX[1]); pm.rect(6, 11, 2, 1, CAUDEX[2]); pm.rect(9, 14, 3, 1, CAUDEX[0]);
    line(pm, 7, 10, 5, 7, CAUDEX[1]); line(pm, 9, 10, 11, 6, CAUDEX[1]);
    px(pm, 3, 8, LEAF[1]); px(pm, 13, 7, LEAF[1]); px(pm, 12, 8, LEAF[2]);
    bloom(pm, 5, 5, { n: 5, r0: 0.4, r1: 3, w: 1.3, c: ADE }); px(pm, 5, 5, CREAM[2]);
    bloom(pm, 11.5, 3.5, { n: 5, r0: 0.4, r1: 2.8, w: 1.3, c: ADE, rot: 0 }); px(pm, 11, 3, CREAM[2]);
  },
  "desert-bougainvillea": (pm) => {
    sandBase(pm);
    line(pm, 8, 14, 8, 8, BRANCH); line(pm, 8, 10, 5, 7, BRANCH); line(pm, 8, 9, 11, 6, BRANCH);
    for (const [x, y] of [[8, 3], [5, 4], [11, 4], [3, 7], [7, 6], [10, 7], [13, 7], [6, 9], [11, 9]] as const) floret(pm, x, y, BOUG, CREAM[2]);
    px(pm, 4, 10, LEAF[1]); px(pm, 12, 11, LEAF[1]);
  },
  "desert-matsubagiku": (pm) => {
    sandBase(pm);
    for (const [x, h] of [[5, 3], [6, 4], [10, 4], [11, 3]] as const) for (let j = 0; j < h; j++) px(pm, x, 14 - j, j === h - 1 ? SUCC[2] : SUCC[1]);
    stem(pm, 8, 10, 14);
    bloom(pm, 8, 5.5, { n: 18, r0: 1.4, r1: 4.8, w: 0.45, c: MAGENTA });
    pm.ellipse(8, 5.5, 1.4, 1.4, CREAM[1]); px(pm, 8, 5, YELLOW[1]);
  },
  "desert-portulaca": (pm) => {
    // 地面を這う多肉の葉と、色ちがいの小さな花
    sandBase(pm);
    for (const [x0, y0, x1, y1] of [[2, 13, 7, 11], [8, 13, 13, 12], [6, 12, 9, 9]] as const) line(pm, x0, y0, x1, y1, SUCC[1]);
    for (const [x, y] of [[3, 12], [12, 11], [8, 10], [5, 11]] as const) px(pm, x, y, SUCC[2]);
    bloom(pm, 4.5, 8.5, { n: 5, r0: 0.3, r1: 2.6, w: 1.2, c: ORANGE }); px(pm, 4, 8, YELLOW[2]);
    bloom(pm, 10, 6, { n: 5, r0: 0.3, r1: 2.8, w: 1.2, c: PINK }); px(pm, 10, 6, YELLOW[2]);
    bloom(pm, 12.5, 10, { n: 5, r0: 0.3, r1: 2.2, w: 1.1, c: YELLOW }); px(pm, 12, 10, ORANGE[0]);
  },
  "desert-hanakirin": (pm) => {
    // とげのある茎の先に、赤い2枚の苞
    sandBase(pm);
    for (const [x, top] of [[6, 7], [10, 5]] as const) {
      pm.rect(x, top, 2, 15 - top, THORNY[1]); for (let y = top; y < 15; y++) px(pm, x, y, y % 2 ? THORNY[2] : THORNY[1]);
      for (let y = top + 1; y < 15; y += 2) { px(pm, x - 1, y, THORNY[0]); px(pm, x + 2, y + 1, THORNY[0]); }
    }
    px(pm, 5, 9, LEAF[1]); px(pm, 12, 7, LEAF[1]);
    for (const [x, y] of [[6, 5], [3, 7], [10, 3], [13, 5]] as const) {
      pm.rect(x - 1, y, 2, 2, RED[1]); pm.rect(x + 1, y, 2, 2, RED[1]);
      px(pm, x - 1, y, RED[2]); px(pm, x + 2, y + 1, RED[0]); px(pm, x + 1, y + 1, YELLOW[1]);
    }
  },
  "desert-aloe": (pm) => {
    // とがった葉の株と、高い花茎に下向きの筒形の花
    sandBase(pm);
    for (const [x0, x1, y1] of [[8, 3, 10], [8, 13, 10], [7, 5, 9], [9, 11, 9], [8, 8, 10]] as const) {
      line(pm, x0, 14, x1, y1, ALOE[1]); line(pm, x0 + (x1 > x0 ? -1 : 1), 14, x1, y1 + 1, ALOE[0]);
    }
    px(pm, 5, 12, ALOE[2]); px(pm, 11, 12, ALOE[2]);
    stem(pm, 8, 2, 10);
    for (let y = 2; y <= 7; y++) {
      const c = y < 4 ? YELLOW : y < 6 ? ORANGE : RED;
      px(pm, 7, y, c[1]); px(pm, 9, y, c[0]);
      if (y > 3) { px(pm, 6, y + 1, c[1]); px(pm, 10, y + 1, c[0]); }
    }
    px(pm, 8, 1, YELLOW[2]);
  },
  "desert-gazania": (pm) => {
    sandBase(pm);
    stem(pm, 8, 10, 14);
    line(pm, 8, 14, 4, 12, SUCC[1]); line(pm, 8, 14, 12, 12, SUCC[1]);
    bloom(pm, 8, 6, { n: 12, r0: 1.4, r1: 5.2, w: 0.95, c: GAZ });
    // 花の中心のまわりの、黒と白の目玉もよう
    for (let i = 0; i < 12; i += 2) {
      const a = -Math.PI / 2 + (i * Math.PI * 2) / 12;
      px(pm, Math.floor(8 + Math.cos(a) * 2.6), Math.floor(6 + Math.sin(a) * 2.6), hex("#2a2018"));
    }
    disk(pm, 8, 6, 1.5, YELLOW);
  },
  "desert-strelitzia": (pm) => {
    // 鳥が頭を上げたような形：緑の舟形のがくから、橙の花びらと青い舌
    sandBase(pm);
    stem(pm, 11, 10, 14);
    line(pm, 9, 14, 13, 9, LEAF[1]); px(pm, 13, 8, LEAF[2]);
    line(pm, 3, 8, 12, 9, BIRD[1]); line(pm, 4, 9, 11, 10, PURPLE); line(pm, 4, 7, 9, 8, BIRD[2]);
    px(pm, 2, 8, BIRD[0]);
    line(pm, 8, 7, 5, 2, ORANGE[1]); line(pm, 9, 7, 8, 1, ORANGE[2]); line(pm, 10, 7, 11, 2, ORANGE[1]); line(pm, 7, 7, 4, 4, ORANGE[0]);
    line(pm, 8, 7, 6, 5, BLUE[1]); px(pm, 6, 4, BLUE[2]);
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
  for (const [x, y] of edge) pm.set(x, y, OUTLINE, 0.85);
}

// 花の 16×16 のドット（RGBA）。輪郭つき。1種類につき1回だけ描く
const cache = new Map<string, Uint8Array>();
export function flowerPixels(id: string): Uint8Array {
  let d = cache.get(id);
  if (!d) {
    const pm = new PixMap(S, S);
    (DRAW[id] ?? FARM.tulip)(pm);
    outline(pm);
    d = pm.data;
    cache.set(id, d);
  }
  return d;
}
export const FLOWER_SIZE = S;
