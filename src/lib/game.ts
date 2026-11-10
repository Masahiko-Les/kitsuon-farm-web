export const MAP_ID = "farm01";
export const MAX_WATERERS = 5;
export const MAX_LINES = 10;
export const MAX_CHARS = 300;
// 種は短すぎると水やりの手紙を書きにくいので、空白と改行を除いてこの字数以上にする
export const SEED_MIN_CHARS = 20;
export const NAME_MAX = 12;
export const TILE = 16;
export const TERMS_VERSION = 3; // 2: 吃音村カフェを追加（Web版） / 3: 砂漠の挑戦の種を追加

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
// 農場で「苦労の種」を蒔けるマス。砂漠（D）には「挑戦の種」を蒔ける（canSow）
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
// 砂漠の「挑戦の種」に「ありがとう」を伝えると実るもの
export const DESERT_CROPS = [
  { id: "desert-cactus", name: "サボテンの花", emoji: "🌵" },
  { id: "desert-watermelon", name: "スイカ", emoji: "🍉" },
  { id: "desert-dates", name: "デーツ", emoji: "🌴" },
  { id: "desert-olive", name: "オリーブ", emoji: "🫒" },
  { id: "desert-sunflower", name: "ひまわり", emoji: "🌻" },
  { id: "desert-melon", name: "メロン", emoji: "🍈" },
  { id: "desert-pineapple", name: "パイナップル", emoji: "🍍" },
  { id: "desert-lemon", name: "レモン", emoji: "🍋" },
  { id: "desert-coconut", name: "ココナッツ", emoji: "🥥" },
  { id: "desert-mango", name: "マンゴー", emoji: "🥭" },
] as const;
export type Crop = (typeof CROPS)[number] | (typeof DESERT_CROPS)[number];
const ALL_CROPS: readonly Crop[] = [...CROPS, ...DESERT_CROPS];
export const cropById = (id: string): Crop => ALL_CROPS.find((c) => c.id === id) ?? CROPS[0];
// 種の場所で選ぶ。砂漠の挑戦の種なら砂漠の作物、農場の種なら野菜
export const randomCrop = (seedId: string): Crop => {
  const list = isDesertSeedId(seedId) ? DESERT_CROPS : CROPS;
  return list[Math.floor(Math.random() * list.length)];
};

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

/* ---------- 砂漠の「挑戦の種」 ----------
   砂漠のマスに蒔いた種が「挑戦の種」。データベースには印を持たず、種の場所（ID の「x_y」）で決める */
export const isDesert = (x: number, y: number) => tileAt(x, y) === "D";
export function isDesertSeedId(id: string) {
  const m = /^(-?\d+)_(-?\d+)$/.exec(id.split("_").slice(0, 2).join("_"));
  return m ? isDesert(Number(m[1]), Number(m[2])) : false;
}
// 種の呼び名（画面の文言用）。砂漠なら「挑戦の種」
export const seedNameOf = (seedId: string) => (isDesertSeedId(seedId) ? "挑戦の種" : "種");
// 種を蒔けるマス：農場の草地・畑（苦労の種）と、砂漠（挑戦の種）
export const canSow = (x: number, y: number) => SOWABLE.has(tileAt(x, y)) || isDesert(x, y);

// 建物。いまは入れない。将来は enterable を true にして中の画面を作る
// door は扉のマス（建物のいちばん下の行）。村人は扉の1つ下のマスから、上を向いて入る
export type Building = {
  id: string; name: string; x: number; y: number; w: number; h: number; door: { x: number; y: number }; enterable: boolean;
};
export const BUILDINGS: Building[] = [
  { id: "house", name: "家", x: 3, y: 1, w: 2, h: 2, door: { x: 3, y: 2 }, enterable: true },
  { id: "cafe", name: "カフェ", x: 15, y: 2, w: 3, h: 2, door: { x: 16, y: 3 }, enterable: true },
  { id: "hall", name: "村役場", x: 15, y: 9, w: 4, h: 3, door: { x: 16, y: 11 }, enterable: false },
  { id: "library", name: "図書館", x: 16, y: 13, w: 3, h: 2, door: { x: 17, y: 14 }, enterable: false },
  { id: "harbor", name: "港の待合所", x: 5, y: 20, w: 2, h: 2, door: { x: 5, y: 21 }, enterable: false },
  { id: "radio", name: "ラジオ局", x: 25, y: 2, w: 2, h: 2, door: { x: 25, y: 3 }, enterable: false },
  { id: "dev", name: "開発局", x: 24, y: 20, w: 3, h: 2, door: { x: 25, y: 21 }, enterable: false },
];
export const buildingAt = (x: number, y: number) =>
  BUILDINGS.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;

// いま村人がいる場所。農場か、建物の中（建物の id と同じ）
export type RoomId = "house" | "cafe";
export type Area = "farm" | RoomId;

// 建物の中。どの部屋も #=壁 .=床 E=出入り口（下へ歩くと外に出る）
export type Room = {
  map: string[];
  entry: { x: number; y: number }; // 入ったときに立つマス（出入り口の1つ上）
  walkable: Set<string>;
};
export const ROOMS: Record<RoomId, Room> = {
  // 自分の家。K=本棚 B=ベッド L=テーブル
  house: {
    map: [
      "########",
      "#KK...B#",
      "#.....B#",
      "#..LL..#",
      "#......#",
      "#......#",
      "###E####",
    ],
    entry: { x: 3, y: 5 },
    walkable: new Set([".", "E"]),
  },
  // 吃音村カフェ（吃音村カフェのアプリから移植）。b=カウンターの内側 O=マスター C=バーカウンター
  // s=空いている丸椅子 g=村人が座っている丸椅子 P=鉢植え T=テーブル a=村人が座っている椅子。
  // 空いている丸椅子に向かってAを押すと座れる
  cafe: {
    map: [
      "##############",
      "#bbbbbObbbbbP#",
      "#CCCCCCCCCCC.#",
      "#sgsgssgssgs.#",
      "#............#",
      "#..aT.....aT.#",
      "#............#",
      "#P.aT.....aT.#",
      "#............#",
      "#............#",
      "######E#######",
    ],
    entry: { x: 6, y: 9 },
    walkable: new Set([".", "E"]),
  },
};
export const roomTileAt = (room: RoomId, x: number, y: number) => {
  const m = ROOMS[room].map;
  return (m[y] && m[y][x]) || "#";
};
// カフェに座っている村人（カウンター席とテーブル席）
export const CAFE_GUESTS: Record<string, string> = {
  "2_3": "rabbit", "4_3": "tanuki", "7_3": "cat", "10_3": "dog",
  "3_5": "sheep", "10_5": "fox", "3_7": "dog", "10_7": "rabbit",
};

export const keyOf = (x: number, y: number) => `${x}_${y}`;
