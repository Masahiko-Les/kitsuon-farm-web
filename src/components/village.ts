// 地図の動かない絵のうち、海・砂漠・砂嵐・建物・桟橋・船。forest.ts と同じく1ドットずつ PixMap に描く。
// 光は左上から。影は右下へ、青緑の半透明で落とす
import { HARBOR, ON_SEA, tileAt } from "@/lib/game";
import { HOUSE, LEAVES, SAND, SEA, SHADE, STONE, WOOD } from "./palette";
import { type PixMap, type RGB, hex, noise, pick, rnd } from "./pixmap";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// 文字の並びで描く小さな絵（看板の絵柄など）。「.」は描かない
function sprite(pm: PixMap, x: number, y: number, rows: string[], colors: Record<string, RGB>) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = colors[row[i]];
      if (c) pm.set(x + i, y + j, c);
    }
  });
}

/* ---------- 海 ---------- */
const isLand = (x: number, y: number) => !ON_SEA.has(tileAt(x, y));
export function drawSeaTile(pm: PixMap, X: number, Y: number, tx: number, ty: number) {
  // 岸までの近さ（陸のとなりのマスほど浅い）
  const near = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => isLand(tx + dx, ty + dy));
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      const v = clamp01(0.25 + 0.55 * noise(x / 22, y / 14, 21) + (near ? 0.2 : 0));
      pm.set(x, y, pick(SEA.depth, v, x, y, 0.7));
    }
  }
  // 陸と接する辺に、砂浜と白い波
  const beach = (k: number, d: number, side: "top" | "bottom" | "left" | "right") => {
    const pos = (dd: number): [number, number] =>
      side === "top" ? [X + k, Y + dd] : side === "bottom" ? [X + k, Y + 15 - dd] : side === "left" ? [X + dd, Y + k] : [X + 15 - dd, Y + k];
    for (let dd = 0; dd < d; dd++) { const [x, y] = pos(dd); pm.set(x, y, pick(SAND.ground, 0.75, x, y)); }
    const [fx, fy] = pos(d); pm.set(fx, fy, SEA.foam);
    const [sx, sy] = pos(d + 1); pm.set(sx, sy, SEA.shallow);
    const [s2x, s2y] = pos(d + 2); pm.set(s2x, s2y, SEA.shallow, 0.5);
  };
  for (let k = 0; k < 16; k++) {
    const d = 2 + Math.floor(noise((X + k) / 4, (Y + k) / 4, 22) * 3);
    if (isLand(tx, ty - 1)) beach(k, d, "top");
    if (isLand(tx, ty + 1)) beach(k, d, "bottom");
    if (isLand(tx - 1, ty)) beach(k, d, "left");
    if (isLand(tx + 1, ty)) beach(k, d, "right");
  }
}

/* ---------- 砂漠と砂嵐 ---------- */
const sandLight = (x: number, y: number) => clamp01(0.2 + 0.7 * noise(x / 30, y / 18, 31));
export function drawDesertTile(pm: PixMap, X: number, Y: number, tx: number, ty: number) {
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      // 風が作った砂の波紋：ゆるく波打つ横の筋
      const ripple = Math.sin(y * 0.9 + Math.sin(x / 7 + y / 11) * 2.2 + noise(x / 9, y / 9, 32) * 3);
      let v = sandLight(x, y);
      if (ripple > 0.82) v -= 0.3;
      else if (ripple < -0.85) v += 0.18;
      pm.set(x, y, pick(SAND.ground, clamp01(v), x, y, 0.6));
    }
  }
  const r = rnd(tx, ty, 33);
  if (r < 0.18) {
    // 小石
    const px = X + 3 + Math.floor(rnd(tx, ty, 34) * 10), py = Y + 3 + Math.floor(rnd(tx, ty, 35) * 10);
    pm.set(px + 1, py + 2, SHADE, 0.25); pm.set(px + 2, py + 2, SHADE, 0.25);
    sprite(pm, px, py, ["ab.", "bbc"], { a: STONE[2], b: STONE[1], c: STONE[0] });
  } else if (r < 0.3) {
    // 枯れ草
    const px = X + 3 + Math.floor(rnd(tx, ty, 36) * 9), py = Y + 4 + Math.floor(rnd(tx, ty, 37) * 9);
    sprite(pm, px, py, ["a.a.a", ".bab.", "..b.."], { a: SAND.grass, b: SAND.grassDark });
  }
  // となりが草地なら、草が少しかぶる
  if (tileAt(tx, ty + 1) !== "D" && !ON_SEA.has(tileAt(tx, ty + 1))) {
    for (let k = 0; k < 16; k++) {
      const g = Math.floor(noise((X + k) / 3, Y / 3, 38) * 3);
      for (let d = 0; d <= g; d++) pm.set(X + k, Y + 15 - d, d === g ? SAND.grassDark : LEAVES[4]);
    }
  }
}
// 砂嵐の奥：舞い上がった砂で、遠くほど白くかすむ
export function drawStormTile(pm: PixMap, X: number, Y: number) {
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      const v = clamp01(0.3 + 0.6 * noise(x / 14, y / 6, 39));
      pm.set(x, y, pick(SAND.storm, v, x, y, 1));
    }
  }
}

/* ---------- 建物の部品 ---------- */
type Roof = readonly RGB[]; // 暗い順に4色
const ROOFS = {
  brown: ["#4a3328", "#664534", "#7f5a42", "#9c7457"].map(hex),
  slate: HOUSE.roof,
  blue: ["#25404f", "#30586a", "#3f7086", "#5a8ea3"].map(hex),
  red: ["#5e2b26", "#7f3a31", "#9c4c3d", "#bb6a55"].map(hex),
  gray: ["#2c3236", "#3b4348", "#4c565c", "#66737a"].map(hex),
};
// 建物の右と下に落ちる影
function castShadow(pm: PixMap, X: number, Y: number, w: number, h: number) {
  pm.rect(X + w, Y + 6, 4, h - 6, SHADE, 0.3);
  pm.rect(X + 2, Y + h, w + 2, 2, SHADE, 0.3);
}
// 瓦の屋根。段ごとに上のふちが明るく、下のふちが暗い。右側は少し陰る
function tileRoof(pm: PixMap, x: number, y: number, w: number, h: number, roof: Roof) {
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / 3), r = j % 3;
    for (let i = 0; i < w; i++) {
      const shade = i > w * 0.72 ? 1 : 0;
      let c = roof[Math.max(1, 2 - shade)];
      if (r === 0) c = roof[3 - shade];
      if (r === 2) c = roof[0];
      if (r === 1 && (i + row * 2) % 5 === 0) c = roof[0];
      pm.set(x + i, y + j, c);
    }
  }
  pm.rect(x, y - 1, w, 1, roof[3]); // 棟
  pm.rect(x - 1, y + h, w + 2, 1, roof[0]); // 軒
}
// 壁。右の端は少し陰る。kind で、しっくい・れんが・板張り・金属板を描き分ける
type WallKind = "plaster" | "brick" | "board" | "panel";
function wall(pm: PixMap, x: number, y: number, w: number, h: number, base: RGB, shade: RGB, line: RGB, kind: WallKind) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const X = x + i, Y = y + j;
      let c = i > w - 7 ? shade : base;
      if (kind === "brick" && (j % 4 === 3 || (i + (Math.floor(j / 4) % 2) * 4) % 8 === 0)) c = line;
      if (kind === "board" && j % 4 === 3) c = line;
      if (kind === "panel" && (i % 12 === 0 || j === Math.floor(h / 2))) c = line;
      if (kind === "plaster" && noise(X / 3, Y / 3, 41) > 0.82) c = shade;
      pm.set(X, Y, c);
    }
  }
  // 軒下の濃い影と、地面ぎわの線
  pm.rect(x, y, w, 3, HOUSE.timber, 0.5);
  pm.rect(x, y + h - 1, w, 1, line);
}
// 窓。lit ならあたたかい明かり、そうでなければ空を映すガラス
const GLASS = { body: hex("#5f8fa3"), light: hex("#a9d0dc"), dark: hex("#3f6878") };
function windowAt(pm: PixMap, x: number, y: number, w: number, h: number, frame: RGB, lit = true) {
  pm.rect(x - 1, y - 1, w + 2, h + 2, frame);
  pm.rect(x, y, w, h, lit ? HOUSE.glow : GLASS.body);
  pm.rect(x, y, Math.ceil(w / 2) - 1, Math.max(1, Math.floor(h / 3)), lit ? HOUSE.glowLight : GLASS.light);
  if (!lit) pm.rect(x, y + h - 1, w, 1, GLASS.dark);
  if (w >= 6) pm.rect(x + Math.floor(w / 2), y, 1, h, frame);
  pm.rect(x - 1, y + h + 1, w + 2, 1, WOOD.dark, 0.5);
}
// 扉は村人1人ぶん（1マス）。X, Y は扉のマスの左上
function door(pm: PixMap, X: number, Y: number, wood: RGB, frame: RGB) {
  pm.rect(X + 2, Y + 1, 12, 15, frame);
  pm.rect(X + 3, Y + 2, 10, 14, wood);
  pm.rect(X + 3, Y + 2, 10, 1, WOOD.light, 0.6);
  pm.rect(X + 12, Y + 3, 1, 13, frame, 0.6);
  pm.rect(X + 5, Y + 5, 6, 4, frame, 0.45);
  pm.set(X + 11, Y + 10, HOUSE.glow);
  pm.rect(X + 2, Y + 15, 12, 1, SHADE, 0.3);
}
function plant(pm: PixMap, x: number, y: number) {
  pm.ellipse(x + 3, y + 5.5, 4, 1.2, SHADE, 0.35);
  pm.rect(x + 1, y + 2, 5, 3, HOUSE.pot);
  pm.rect(x + 1, y + 2, 5, 1, WOOD.light);
  sprite(pm, x, y - 3, [".b.c.", "abcba", ".aba."], { a: LEAVES[3], b: LEAVES[4], c: LEAVES[5] });
}
const T = hex("#f2ead6"); // 看板の地
const INK = hex("#3a2e28");

/* ---------- 建物 ---------- */
// それぞれ、建物の左上 (X, Y) から描く。扉のマスの位置は game.ts の BUILDINGS と合わせる
function cafe(pm: PixMap, X: number, Y: number) {
  castShadow(pm, X, Y, 48, 32);
  wall(pm, X + 1, Y + 11, 46, 21, hex("#efe0c0"), hex("#d6c49e"), hex("#b9a47c"), "plaster");
  tileRoof(pm, X - 1, Y - 2, 50, 12, ROOFS.brown);
  // しましまのひさし（下のふちは波形）
  for (let i = 0; i < 48; i++) {
    const red = Math.floor(i / 4) % 2 === 0;
    for (let j = 0; j < 4 + (i % 4 === 1 || i % 4 === 2 ? 1 : 0); j++) {
      pm.set(X + i, Y + 11 + j, red ? (j === 0 ? hex("#d06a58") : hex("#b84f40")) : (j === 0 ? T : hex("#ddd2b9")));
    }
    pm.set(X + i, Y + 16, SHADE, 0.3);
  }
  for (const wx of [4, 36]) windowAt(pm, X + wx, Y + 19, 8, 7, HOUSE.timber);
  // 看板（コーヒーカップ）
  pm.rect(X + 18, Y + 1, 13, 9, HOUSE.timber);
  pm.rect(X + 19, Y + 2, 11, 7, T);
  sprite(pm, X + 21, Y + 3, [".a.a..", "bbbbb.", "bbbbbb", "bbbbb.", ".bbb.."], { a: hex("#b9a47c"), b: hex("#6b4a32") });
  door(pm, X + 16, Y + 16, HOUSE.door, HOUSE.timber);
  // 黒板と鉢植え
  pm.rect(X + 33, Y + 27, 5, 5, WOOD.dark); pm.rect(X + 34, Y + 28, 3, 3, hex("#2f3a34"));
  pm.set(X + 35, Y + 29, T);
  plant(pm, X + 4, Y + 27);
}
function library(pm: PixMap, X: number, Y: number) {
  castShadow(pm, X, Y, 48, 32);
  wall(pm, X + 1, Y + 10, 46, 22, hex("#a8664a"), hex("#8f5540"), hex("#7a4836"), "brick");
  tileRoof(pm, X - 1, Y, 50, 10, ROOFS.blue);
  // 縦長の窓（上が丸い）
  for (const wx of [5, 37]) {
    windowAt(pm, X + wx, Y + 16, 6, 10, hex("#e8dcc0"), false);
    pm.set(X + wx, Y + 16, hex("#e8dcc0")); pm.set(X + wx + 5, Y + 16, hex("#e8dcc0"));
  }
  // 看板（本）
  pm.rect(X + 18, Y + 10, 12, 6, HOUSE.timber);
  pm.rect(X + 19, Y + 11, 10, 4, T);
  sprite(pm, X + 20, Y + 11, ["aab.cc", "aab.cc", "aab.cc", "aab.cc"], { a: hex("#b84f40"), b: hex("#e8dcc0"), c: hex("#3f6f8a") });
  door(pm, X + 16, Y + 16, hex("#5a3e2b"), hex("#3f2b1e"));
  plant(pm, X + 14, Y + 27);
}
function hall(pm: PixMap, X: number, Y: number) {
  castShadow(pm, X, Y, 64, 48);
  wall(pm, X + 1, Y + 17, 62, 31, hex("#ece5d4"), hex("#d4cbb6"), hex("#b8ad96"), "plaster");
  // 1階と2階のあいだの帯、石の土台
  pm.rect(X + 1, Y + 31, 62, 2, hex("#cfc5ae"));
  pm.rect(X + 1, Y + 32, 62, 1, SHADE, 0.2);
  for (let i = 0; i < 62; i++) pm.set(X + 1 + i, Y + 46, STONE[Math.floor(noise((X + i) / 2, Y, 42) * 3)]);
  // 屋根と、まんなかの三角の破風
  tileRoof(pm, X - 1, Y + 8, 66, 9, ROOFS.slate);
  for (let j = 0; j < 9; j++) {
    const half = 6 + j * 2;
    for (let i = -half; i <= half; i++) pm.set(X + 32 + i, Y + 1 + j, i === -half || i === half ? HOUSE.roof[3] : hex("#e4dcc8"));
  }
  // 時計
  sprite(pm, X + 28, Y + 2, [".aaaaaa.", "abbbbbba", "abbcbbba", "abbcbbba", "abbccbba", "abbbbbba", ".aaaaaa."], {
    a: hex("#8a7a64"), b: T, c: INK,
  });
  // 2階と1階の窓（扉のマスはあける）
  for (const wx of [5, 21, 37, 53]) windowAt(pm, X + wx, Y + 21, 6, 7, hex("#8a7a64"), false);
  for (const wx of [37, 53]) windowAt(pm, X + wx, Y + 36, 6, 7, hex("#8a7a64"), true);
  windowAt(pm, X + 4, Y + 36, 6, 7, hex("#8a7a64"), true);
  door(pm, X + 16, Y + 32, hex("#7a5236"), hex("#5a3e2b"));
  plant(pm, X + 29, Y + 43);
}
function harbor(pm: PixMap, X: number, Y: number) {
  castShadow(pm, X, Y, 32, 32);
  wall(pm, X + 1, Y + 12, 30, 20, hex("#efebe0"), hex("#d6d0c0"), hex("#b9b3a3"), "board");
  tileRoof(pm, X - 1, Y + 1, 34, 11, ROOFS.blue);
  // 看板（いかり）
  pm.rect(X + 18, Y + 2, 11, 9, HOUSE.timber);
  pm.rect(X + 19, Y + 3, 9, 7, T);
  sprite(pm, X + 20, Y + 3, ["...a...", "..aaa..", "...a...", "...a...", "a..a..a", ".aaaaa."], { a: hex("#2f5f78") });
  // 丸窓
  sprite(pm, X + 20, Y + 17, [".aaaa.", "abbcca", "abbbca", "abbbba", ".aaaa."], { a: hex("#2f5f78"), b: GLASS.body, c: GLASS.light });
  door(pm, X, Y + 16, hex("#3f6f8a"), hex("#2a4a5c"));
}
function radio(pm: PixMap, X: number, Y: number) {
  castShadow(pm, X, Y, 32, 32);
  wall(pm, X + 1, Y + 12, 30, 20, hex("#e6dccb"), hex("#cdbfa8"), hex("#b3a68e"), "plaster");
  tileRoof(pm, X - 1, Y + 4, 34, 8, ROOFS.red);
  // 屋根の上のアンテナ塔
  const steel = hex("#7d8790"), steelLight = hex("#a9b3ba");
  for (let j = 0; j < 14; j++) {
    pm.set(X + 21 + Math.floor(j / 5), Y - 9 + j, steel);
    pm.set(X + 28 - Math.floor(j / 5), Y - 9 + j, steel);
    if (j % 3 === 0) pm.rect(X + 22, Y - 9 + j, 6, 1, steelLight);
  }
  pm.rect(X + 24, Y - 13, 2, 4, steel);
  pm.rect(X + 24, Y - 15, 2, 2, hex("#e0503f"));
  pm.set(X + 24, Y - 15, hex("#ff9b85"));
  // 窓と「放送中」のランプ
  windowAt(pm, X + 19, Y + 19, 8, 6, HOUSE.timber, true);
  pm.rect(X + 19, Y + 15, 9, 2, INK);
  pm.rect(X + 22, Y + 15, 3, 2, hex("#e0503f"));
  door(pm, X, Y + 16, HOUSE.door, HOUSE.timber);
}
function dev(pm: PixMap, X: number, Y: number) {
  castShadow(pm, X, Y, 48, 32);
  wall(pm, X + 1, Y + 9, 46, 23, hex("#cfd6d8"), hex("#b2bcbf"), hex("#99a5a9"), "panel");
  // 平らな屋根
  pm.rect(X - 1, Y + 4, 50, 5, ROOFS.gray[1]);
  pm.rect(X - 1, Y + 4, 50, 1, ROOFS.gray[3]);
  pm.rect(X - 1, Y + 8, 50, 1, ROOFS.gray[0]);
  // 看板（歯車）
  pm.rect(X + 19, Y - 1, 11, 10, HOUSE.timber);
  pm.rect(X + 20, Y, 9, 8, T);
  sprite(pm, X + 21, Y, [".a.a.a.", "aaaaaaa", ".aa.aa.", "aa...aa", ".aa.aa.", "aaaaaaa", ".a.a.a."], { a: hex("#5d7480") });
  for (const wx of [4, 12, 20, 28, 36]) windowAt(pm, X + wx, Y + 12, 6, 3, hex("#7f8b90"), false);
  for (const wx of [4, 36]) windowAt(pm, X + wx, Y + 22, 8, 6, hex("#7f8b90"), true);
  door(pm, X + 16, Y + 16, hex("#78909c"), hex("#455a64"));
}
const ART: Record<string, (pm: PixMap, X: number, Y: number) => void> = { cafe, library, hall, harbor, radio, dev };
export function drawBuildingArt(pm: PixMap, id: string, X: number, Y: number) {
  ART[id]?.(pm, X, Y);
}

/* ---------- 港 ---------- */
// 桟橋：板張りの道が海へのびる
export function drawPierArt(pm: PixMap, TILE: number) {
  const { x, y, h } = HARBOR.pier;
  const X = x * TILE, Y = y * TILE;
  pm.rect(X + 15, Y + 2, 3, h * TILE, SHADE, 0.35);
  for (let j = 0; j < h * TILE; j++) {
    const plank = j % 4;
    for (let i = 1; i < 15; i++) {
      const c = plank === 3 ? WOOD.dark : plank === 0 ? WOOD.light : noise((X + i) / 3, Y + j, 43) > 0.7 ? WOOD.dark : WOOD.body;
      pm.set(X + i, Y + j, c);
    }
    pm.set(X + 1, Y + j, WOOD.dark); pm.set(X + 14, Y + j, WOOD.dark);
  }
  for (let i = 0; i < h; i++) {
    for (const px of [X, X + 14]) { pm.rect(px, Y + i * TILE + 11, 2, 5, hex("#4a3426")); pm.set(px, Y + i * TILE + 11, WOOD.light); }
    pm.rect(X, Y + i * TILE + 16, 16, 1, SEA.foam, 0.6);
  }
}
// 船：桟橋の右に、へさきを右に向けて停まっている
export function drawShipArt(pm: PixMap, TILE: number) {
  const { x, y } = HARBOR.ship;
  const X = x * TILE, Y = y * TILE;
  const hull = hex("#f1ebdd"), hullShade = hex("#d4ccba"), red = hex("#b84f40"), redDark = hex("#8f3a31"), navy = hex("#2f5f78");
  pm.ellipse(X + 24, Y + 28, 22, 2.5, SEA.depth[0], 0.6); // 水面に落ちる影
  for (let j = 0; j < 11; j++) {
    const narrow = j > 6 ? (j - 6) * 2 : 0;
    const tip = 46 - (j > 3 ? j - 3 : 0); // へさきに向かって細くなる
    for (let i = 1 + narrow; i < tip; i++) {
      let c = j < 8 ? (j < 2 ? hull : i > 34 ? hullShade : hull) : j < 10 ? red : redDark;
      if (j === 0) c = hullShade;
      pm.set(X + i, Y + 16 + j, c);
    }
  }
  pm.rect(X + 2, Y + 21, 36, 1, navy);
  // 船室と窓
  pm.rect(X + 8, Y + 7, 20, 9, hull);
  pm.rect(X + 22, Y + 7, 6, 9, hullShade);
  pm.rect(X + 7, Y + 5, 22, 2, navy);
  for (const wx of [11, 17, 23]) { pm.rect(X + wx, Y + 10, 3, 3, GLASS.body); pm.set(X + wx, Y + 10, GLASS.light); }
  // えんとつ
  pm.rect(X + 30, Y + 3, 5, 13, navy);
  pm.rect(X + 30, Y + 3, 5, 2, red);
  pm.rect(X + 34, Y + 3, 1, 13, hex("#24485c"));
  // 浮き輪
  sprite(pm, X + 3, Y + 17, [".ab.", "a..b", "b..a", ".ba."], { a: hex("#e0503f"), b: hull });
}

