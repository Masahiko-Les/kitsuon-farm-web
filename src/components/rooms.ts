// 建物の中の床と壁。1ドットずつ PixMap に描く（家具は farm-map.tsx で重ねる）
import { type RoomId, ROOMS, roomTileAt, TILE } from "@/lib/game";
import { PixMap, type RGB, hex, noise, pick, rnd } from "./pixmap";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

type Wood = readonly RGB[]; // 暗い順に4色
const WOODS = {
  house: ["#8a6142", "#a37650", "#b8895f", "#c99c70"].map(hex),
  cafeA: ["#6e4b33", "#835a3e", "#966a49", "#a87b56"].map(hex),
};
const OUTER = hex("#241c17");
const OUTER_LIGHT = hex("#3a2e26");

// 板張りの床：横長の板を、段ごとに継ぎ目をずらして並べる。木目は網点でなじませる
function woodFloor(pm: PixMap, X: number, Y: number, wood: Wood) {
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      const row = Math.floor(y / 4), r = y % 4;
      const seam = (x + Math.floor(rnd(row, 0, 80) * 32)) % 32 === 0;
      let v = 0.42 + 0.16 * noise(x / 10, row * 3.7, 81) + 0.1 * (noise(x / 2.5, y / 9, 82) - 0.5);
      if (r === 0) v += 0.2;
      if (r === 3 || seam) v = 0;
      pm.set(x, y, pick(wood, clamp01(v), x, y, 0.5));
    }
  }
}
// しっくいの壁と、腰板。上のふちは天井の梁
function plasterWall(pm: PixMap, X: number, Y: number, plaster: RGB[], wains: Wood, beam: RGB) {
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      let c: RGB;
      if (j < 3) c = beam;
      else if (j < 11) c = pick(plaster, clamp01(0.3 + 0.5 * noise(x / 5, y / 5, 83) + (j - 3) * 0.03), x, y, 0.6);
      else if (j === 11) c = wains[3];
      else c = (x % 8 === 0) ? wains[0] : wains[j === 15 ? 0 : 2];
      pm.set(x, y, c);
    }
  }
  pm.rect(X, Y + 3, 16, 1, beam, 0.4); // 梁の下の影
}
function outerWall(pm: PixMap, X: number, Y: number, tx: number, ty: number, cols: number) {
  pm.rect(X, Y, 16, 16, OUTER);
  // 床に面した内側のふちだけ、少し明るく
  if (ty > 0 && tx === 0) pm.rect(X + 15, Y, 1, 16, OUTER_LIGHT);
  if (ty > 0 && tx === cols - 1) pm.rect(X, Y, 1, 16, OUTER_LIGHT);
}

/* ---------- 部屋ごと ---------- */
const HOUSE_PLASTER = ["#d7c6a2", "#e3d3b0", "#ece0c2"].map(hex);
const HALL_PLASTER = ["#e2d9c4", "#ece5d4", "#f4efe2"].map(hex);
const HALL_WAINS = ["#9d8865", "#b29d78", "#c3ad86", "#d5c19b"].map(hex);
const CAFE_BOARD = ["#3f2c20", "#4d3626", "#5a3f2c", "#674a34"].map(hex);
const SHELF = hex("#8a6a48");
const CUP = hex("#f2ead6");
const RED = hex("#b84f40");
const BOTTLE = hex("#6f9a44");
const TILE_COLORS = ["#cfc8b8", "#d9d3c5", "#e3ddd0", "#ebe6da"].map(hex);
const GROUT = hex("#bdb5a3");

function cafeWall(pm: PixMap, X: number, Y: number, tx: number) {
  // 縦の板張りに、カップやびんが並ぶ棚
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      const v = x % 5 === 0 ? 0 : clamp01(0.4 + 0.5 * (noise(x / 2, y / 8, 84) - 0.5) + 0.25);
      pm.set(x, y, pick(CAFE_BOARD, v, x, y, 0.5));
    }
  }
  pm.rect(X, Y, 16, 3, OUTER);
  pm.rect(X, Y + 8, 16, 2, SHELF);
  pm.rect(X, Y + 8, 16, 1, hex("#a7845c"));
  pm.rect(X, Y + 10, 16, 1, OUTER, 0.5);
  if (tx % 2 === 0) {
    pm.rect(X + 3, Y + 5, 3, 3, CUP); pm.set(X + 3, Y + 5, hex("#ffffff"));
    pm.rect(X + 9, Y + 5, 3, 3, RED); pm.set(X + 9, Y + 5, hex("#d06a58"));
  } else {
    pm.rect(X + 4, Y + 3, 3, 5, BOTTLE); pm.rect(X + 5, Y + 2, 1, 1, BOTTLE); pm.set(X + 4, Y + 4, hex("#a5c873"));
    pm.rect(X + 10, Y + 5, 3, 3, CUP);
  }
  pm.rect(X, Y + 12, 16, 4, WOODS.cafeA[1]);
  pm.rect(X, Y + 12, 16, 1, WOODS.cafeA[3]);
}
function hallFloor(pm: PixMap, X: number, Y: number) {
  // 明るい石のタイル（1マスを2×2枚）
  for (let j = 0; j < 16; j++) {
    for (let i = 0; i < 16; i++) {
      const x = X + i, y = Y + j;
      if (i % 8 === 0 || j % 8 === 0) { pm.set(x, y, GROUT); continue; }
      const v = clamp01(0.45 + 0.35 * (noise(Math.floor(x / 8) * 3.1, Math.floor(y / 8) * 2.7, 85) - 0.5) + 0.25 * (noise(x / 3, y / 3, 86) - 0.5) + (i % 8 === 1 || j % 8 === 1 ? 0.2 : 0));
      pm.set(x, y, pick(TILE_COLORS, v, x, y, 0.5));
    }
  }
}

// 部屋の床と壁を1枚の画像にする
export function roomBaseImage(id: RoomId) {
  const room = ROOMS[id].map;
  const cols = room[0].length, rows = room.length;
  const pm = new PixMap(cols * TILE, rows * TILE);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const X = x * TILE, Y = y * TILE;
      const wall = roomTileAt(id, x, y) === "#";
      const back = wall && y === 0 && x > 0 && x < cols - 1;
      if (wall && !back) outerWall(pm, X, Y, x, y, cols);
      else if (id === "house") {
        if (back) plasterWall(pm, X, Y, HOUSE_PLASTER, WOODS.house, hex("#3a2e24"));
        else woodFloor(pm, X, Y, WOODS.house);
      } else if (id === "cafe") {
        if (back) cafeWall(pm, X, Y, x);
        else woodFloor(pm, X, Y, WOODS.cafeA);
      } else if (back) plasterWall(pm, X, Y, HALL_PLASTER, HALL_WAINS, hex("#7d6f5c"));
      else hallFloor(pm, X, Y);
    }
  }
  // 奥の壁ぎわの床に、壁の影
  for (let x = 1; x < cols - 1; x++) pm.rect(x * TILE, TILE, TILE, 2, OUTER, 0.25);
  return pm.toImage();
}
