import { AlphaType, ColorType, type SkImage, Skia } from "@shopify/react-native-skia";

// 1ドットずつ色を置ける画用紙。花のドット絵（flowers.ts）をここに描く
// ox, oy は、マップの座標 (0, 0) が画用紙のどこに来るか
export type RGB = readonly [number, number, number];
export const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

export class PixMap {
  readonly data: Uint8Array;
  constructor(readonly w: number, readonly h: number, readonly ox = 0, readonly oy = 0) {
    this.data = new Uint8Array(w * h * 4);
  }
  // a < 1 なら、下の色と混ぜる（半透明の影など）
  set(x: number, y: number, c: RGB, a = 1) {
    const px = Math.floor(x) + this.ox, py = Math.floor(y) + this.oy;
    if (px < 0 || py < 0 || px >= this.w || py >= this.h) return;
    const i = (py * this.w + px) * 4, d = this.data;
    if (a >= 1 || d[i + 3] === 0) {
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a >= 1 ? 255 : Math.round(a * 255);
    } else {
      d[i] += (c[0] - d[i]) * a; d[i + 1] += (c[1] - d[i + 1]) * a; d[i + 2] += (c[2] - d[i + 2]) * a;
    }
  }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }
  // 楕円（影など）。中心 cx, cy、半径 rx, ry
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGB, a = 1) {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }
  filled(x: number, y: number) {
    const px = Math.floor(x) + this.ox, py = Math.floor(y) + this.oy;
    return px >= 0 && py >= 0 && px < this.w && py < this.h && this.data[(py * this.w + px) * 4 + 3] > 0;
  }
  toImage(): SkImage {
    const img = Skia.Image.MakeImage(
      { width: this.w, height: this.h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
      Skia.Data.fromBytes(this.data),
      this.w * 4,
    );
    if (!img) throw new Error("画像を作れませんでした");
    return img;
  }
}

/* ---------- ゆらぎ（日だまりや葉のかたまりを作る） ---------- */
export function rnd(x: number, y: number, s = 0) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
const smooth = (t: number) => t * t * (3 - 2 * t);
export function noise(x: number, y: number, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = smooth(x - xi), v = smooth(y - yi);
  const a = rnd(xi, yi, s), b = rnd(xi + 1, yi, s), c = rnd(xi, yi + 1, s), d = rnd(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
// 4×4 の網点。色の境目をドットの市松でなじませる
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dither = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 - 0.5;
// 0〜1 の明るさを、暗い順に並んだ色から選ぶ（境目は網点）
export function pick(colors: readonly RGB[], v: number, x: number, y: number, spread = 0.6) {
  const k = Math.max(0, Math.min(colors.length - 1, Math.floor(v * colors.length + dither(x, y) * spread)));
  return colors[k];
}
