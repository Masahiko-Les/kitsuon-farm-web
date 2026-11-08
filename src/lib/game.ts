export const MAP_ID = "farm01";
export const MAX_WATERERS = 5;
export const MAX_LINES = 10;
export const MAX_CHARS = 300;
// 種は短すぎると水やりの手紙を書きにくいので、空白と改行を除いてこの字数以上にする
export const SEED_MIN_CHARS = 20;
export const NAME_MAX = 12;
export const TILE = 16;
export const TERMS_VERSION = 1;

// S=海 D=砂漠 W=砂嵐 T=木 .=草 ,=畑 P=道 ~=池 F=柵 H=建物 M=郵便受け（桟橋 B と船 V は HARBOR で決める）
// 左上の 16×12 は最初の農場。すでに蒔かれた種の位置がずれないよう、ここは動かさない。
export const MAP = [
  "SDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDS",
  "S..HH....,,,,,....,,,,.........S",
  "S..HHM...,,,,,.HHH,,,,...HH..TTS",
  "S..PP....,,,,,.HHH,,,,...HH...TS",
  "S..PPPPPPPPP...PPPPPPPPPPPPPP..S",
  "S.~~.....P.....T....P.......P..S",
  "S.~~..,,,P,,,..T.,,,P,,,,,,.P..S",
  "S.....,,,P,,,..T.,,,P,,,,,,.P..S",
  "S.FFF.,,,P,,,....,,,P,,,,,,.P..S",
  "S.....PPPP.....HHHH.P.......P..S",
  "S......P......THHHH.PPPPPPPPP.TS",
  "STTTTTTP...TTTTHHHH.P........TTS",
  "S......P........PPPPP..........S",
  "S.~~~~.P..,,,,,.HHH.P..,,,,,,..S",
  "S.~~~~.P..,,,,,.HHH.P..,,,,,,..S",
  "S.~~~~.PPPPPPPPPPPPPP..,,,,,,..S",
  "S......P............P..........S",
  "S.FFFF.P.,,,,,,..TT.P.,,,,,,,..S",
  "S......P.,,,,,,..TT.P.,,,,,,,..S",
  "S..T...P.,,,,,,.....P.,,,,,,,..S",
  "S.TTTHHP............P...HHHTT..S",
  "S..T.HHPPPPPPPPPPPPPP...HHHTT..S",
  "S...PPPP............PPPPPPP....S",
  "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
];
export const COLS = MAP[0].length;
export const ROWS = MAP.length;
// 画面に横に何マス見せるか（縦は画面の高さで決まる）。カメラが村人を追いかける
export const VIEW_TILES_ACROSS = 7.5;
// 北の砂漠の奥行き。島の北端（y=1）から北へこのマス数だけ歩け、その先は砂嵐で進めない
export const DESERT_DEPTH = 10;
export const WALKABLE = new Set([".", ",", "P", "D", "B"]);
// 砂漠（D）には今は蒔けない。将来、砂漠用の別の種を蒔けるようにする予定
export const SOWABLE = new Set([".", ","]);

export const CROPS = [
  { id: "tomato", name: "トマト", emoji: "🍅" },
  { id: "carrot", name: "にんじん", emoji: "🥕" },
  { id: "eggplant", name: "なす", emoji: "🍆" },
  { id: "cucumber", name: "きゅうり", emoji: "🥒" },
  { id: "corn", name: "とうもろこし", emoji: "🌽" },
  { id: "potato", name: "じゃがいも", emoji: "🥔" },
  { id: "pepper", name: "ピーマン", emoji: "🫑" },
  { id: "pumpkin", name: "かぼちゃ", emoji: "🎃" },
  { id: "strawberry", name: "いちご", emoji: "🍓" },
  { id: "cabbage", name: "はくさい", emoji: "🥬" },
] as const;
export type Crop = (typeof CROPS)[number];
export const cropById = (id: string): Crop => CROPS.find((c) => c.id === id) ?? CROPS[0];
export const randomCrop = (): Crop => CROPS[Math.floor(Math.random() * CROPS.length)];

export type Dir = "up" | "down" | "left" | "right";
export const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// 港の桟橋と船。南の海の上に、マップの外まで続く
export const HARBOR = {
  pier: { x: 4, y: 23, h: 2 }, // 桟橋（歩ける）
  ship: { x: 5, y: 23, w: 3, h: 2 }, // 桟橋の右に停まっている船（歩けない）
};
const inRect = (x: number, y: number, r: { x: number; y: number; w?: number; h: number }) =>
  x >= r.x && x < r.x + (r.w ?? 1) && y >= r.y && y < r.y + r.h;
// 海の上に置かれたもの。波打ち際の砂浜は描かない
export const ON_SEA = new Set(["S", "B", "V"]);

// マップの北には砂漠と砂嵐が続き（幅は島と同じ。左右の端の列は海）、それ以外の外はずっと海
export const tileAt = (x: number, y: number) => {
  if (inRect(x, y, HARBOR.pier)) return "B";
  if (inRect(x, y, HARBOR.ship)) return "V";
  if (y < 0 && x >= 1 && x < COLS - 1) return y > -DESERT_DEPTH ? "D" : "W";
  return (MAP[y] && MAP[y][x]) || "S";
};

// 建物。いまは入れない。将来は enterable を true にして中の画面を作る
// door は扉のマス（建物のいちばん下の行）。村人は扉の1つ下のマスから、上を向いて入る
export type Building = {
  id: string; name: string; x: number; y: number; w: number; h: number; door: { x: number; y: number }; enterable: boolean;
};
export const BUILDINGS: Building[] = [
  { id: "house", name: "家", x: 3, y: 1, w: 2, h: 2, door: { x: 3, y: 2 }, enterable: true },
  { id: "cafe", name: "カフェ", x: 15, y: 2, w: 3, h: 2, door: { x: 16, y: 3 }, enterable: false },
  { id: "hall", name: "村役場", x: 15, y: 9, w: 4, h: 3, door: { x: 16, y: 11 }, enterable: false },
  { id: "library", name: "図書館", x: 16, y: 13, w: 3, h: 2, door: { x: 17, y: 14 }, enterable: false },
  { id: "harbor", name: "港の待合所", x: 5, y: 20, w: 2, h: 2, door: { x: 5, y: 21 }, enterable: false },
  { id: "radio", name: "ラジオ局", x: 25, y: 2, w: 2, h: 2, door: { x: 25, y: 3 }, enterable: false },
  { id: "dev", name: "開発局", x: 24, y: 20, w: 3, h: 2, door: { x: 25, y: 21 }, enterable: false },
];
export const buildingAt = (x: number, y: number) =>
  BUILDINGS.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;

// いま村人がいる場所。農場か、自分の家の中
export type Area = "farm" | "house";

// 自分の家の中。#=壁 .=床 K=本棚 B=ベッド L=テーブル E=出入り口（下へ歩くと外に出る）
export const ROOM = [
  "########",
  "#KK...B#",
  "#.....B#",
  "#..LL..#",
  "#......#",
  "#......#",
  "###E####",
];
export const ROOM_COLS = ROOM[0].length;
export const ROOM_ROWS = ROOM.length;
export const ROOM_WALKABLE = new Set([".", "E"]);
export const ROOM_ENTRY = { x: 3, y: 5 }; // 家に入ったときに立つマス（出入り口の1つ上）
export const roomTileAt = (x: number, y: number) => (ROOM[y] && ROOM[y][x]) || "#";

export const keyOf = (x: number, y: number) => `${x}_${y}`;
