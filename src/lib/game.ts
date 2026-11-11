export const MAP_ID = "farm01";
export const MAX_WATERERS = 5;
export const MAX_LINES = 10;
export const MAX_CHARS = 300;
export const NAME_MAX = 12;
export const TILE = 16;
export const TERMS_VERSION = 3; // 2: 吃音村カフェを追加（Web版） / 3: 砂漠の挑戦の種を追加

// S=海 D=砂漠 W=砂嵐 T=木 .=草 ,=畑 P=道 ~=池 F=柵 H=建物 M=郵便受け（桟橋 B と船 V は HARBOR で決める）
// R=岩場 X=崖 C=サボテン K=岩山 O=焚き火 L=ベンチ（どれも通れない） ^=石段（歩ける。種は蒔けない）
// 2026年11月に作り直した地形：西は海、北西の崖の上にラジオ局、北東は砂漠、中央は焚き火の広場、東と南東は柵の畑、南西に港
export const MAP = [
  "SST.....TTTTTTTTTTTTTTTWWWWWWWWWWWWWWWWWWWWWWWWW",
  "SST..HH..TTTTTTTTTTTTTTTTDDDDDDDDDDDDDKKDDDDDDDW",
  "SS...HH...TTTTTT...TTTT.DDDDDCDDDDDDDDDDDCDDDDDW",
  "SS........THHH...........DDDDDDDHHHDCDDDDDDDDDDW",
  "SSXXXX^XXXXHHHT....T.....DDDDDDDHHHDDDDDDDDKDDDW",
  "SSXXXX^^XXXHHH.HHHH.HH...DDDDDDDDDDDDDDDDDDDDDDW",
  "SSXXXXX^^XXHHH.HHHH.HHM.T.DDDDDDDDDDDDDDDDDDCDDW",
  "SS......P..HHH.HHHH.P.....DDDDDCDDDDDDDDDDDDDDDW",
  "SS......PPPPPPPPPPPPPPPPPPDDDDDDDDDDDCDDDDDDDDDW",
  "SSS........T....P..........DDDCDDDDDDDDDKKDDDDDW",
  "SS.HH.TT....T...P....T.T...DDDDDDDDKDDDDDDDDDDDW",
  "SS.HH...HHH.....P.....T.T.FFFFFFFFFFFFDDDDCDDDDW",
  "SS.HH...HHH..PPPPPPP......F,,,,,,,,,,FDDDDDDDDDW",
  "SS.P.....P...PLPPPLP......F,,,,,,,,,,FDDDDDDDDDW",
  "SS.PPPPPPPPPPPPPOPPPPPPPPPP,,,,,,,,,,FDDDDDKDDDW",
  "SSS..........PLPPPLP......F,,,,,,,,,,FDDDDDDDDDW",
  "SSSS...~~~...PPPPPPP......F,,,,,,,,,,FDDCDDDDDDW",
  "SSSS...~~~......P.........F,,,,,,,,,,FDDDDDDDDDW",
  "SSSSS...........P..T......FFFFFFFFFFFFDDDDDDCDDW",
  "SSSFFF.......T..P...T.................DDDDKDDDDW",
  "SSSSSSS...HH..T.P....HHH.....FFFFFFFFFF.DDDDDDDW",
  "SSSSSSSS..HH....P....HHH.....F,,,,,,,,FT..RRRRRR",
  "SSSSSSSSS.PPPPPPPPPPPPPPPPPPPP,,,,,,,,F...RRRRRR",
  "SSSSSSSSSRP..............T...F,,,,,,,,FRRRRRRRRR",
  "SSSSSSSSSSP.RR..........T....FFFFFFFFFFRRRRRRRRR",
  "SSSSSSSSSSPRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
];
export const COLS = MAP[0].length;
export const ROWS = MAP.length;
// 画面に横に何マス見せるか（縦は画面の高さで決まる）。カメラが村人を追いかける
export const VIEW_TILES_ACROSS = 7.5;
export const WALKABLE = new Set([".", ",", "P", "D", "B", "^"]);
// 農場で「苦労の種」を蒔けるマス。砂漠（D）には「挑戦の種」を蒔ける（canSow）
export const SOWABLE = new Set([".", ","]);

// 「ありがとう」で咲く花（Web版だけ。iPhone版は野菜のまま）。絵は src/components/flowers.ts のドット絵
// 型や列の名前は、前の「作物」のまま（crops.crop_type に id を入れる）
export const CROPS = [
  { id: "tulip", name: "チューリップ" },
  { id: "sunflower", name: "ひまわり" },
  { id: "cosmos", name: "コスモス" },
  { id: "nanohana", name: "なのはな" },
  { id: "daisy", name: "デイジー" },
  { id: "morningglory", name: "あさがお" },
  { id: "suzuran", name: "すずらん" },
  { id: "lavender", name: "ラベンダー" },
  { id: "pansy", name: "パンジー" },
  { id: "sweetpea", name: "スイートピー" },
] as const;
// 砂漠の「挑戦の種」に「ありがとう」を伝えると咲く花
export const DESERT_CROPS = [
  { id: "desert-cactus", name: "サボテンの花" },
  { id: "desert-gekka", name: "月下美人" },
  { id: "desert-rose", name: "デザートローズ" },
  { id: "desert-bougainvillea", name: "ブーゲンビリア" },
  { id: "desert-matsubagiku", name: "マツバギク" },
  { id: "desert-portulaca", name: "ポーチュラカ" },
  { id: "desert-hanakirin", name: "ハナキリン" },
  { id: "desert-aloe", name: "アロエの花" },
  { id: "desert-gazania", name: "ガザニア" },
  { id: "desert-strelitzia", name: "ストレリチア" },
] as const;
export type Crop = (typeof CROPS)[number] | (typeof DESERT_CROPS)[number];
const ALL_CROPS: readonly Crop[] = [...CROPS, ...DESERT_CROPS];
// 花にする前に実った野菜・果物の id。同じ並び順の花として読みかえる
const LEGACY: Record<string, string> = Object.fromEntries([
  ...["tomato", "carrot", "eggplant", "cucumber", "corn", "potato", "pepper", "pumpkin", "strawberry", "cabbage"].map((id, i) => [id, CROPS[i].id]),
  ...["desert-cactus", "desert-watermelon", "desert-dates", "desert-olive", "desert-sunflower", "desert-melon", "desert-pineapple", "desert-lemon", "desert-coconut", "desert-mango"]
    .map((id, i) => [id, DESERT_CROPS[i].id]),
]);
export const cropById = (id: string): Crop => {
  const key = LEGACY[id] ?? id;
  return ALL_CROPS.find((c) => c.id === key) ?? CROPS[0];
};
// 種の場所で選ぶ。砂漠の挑戦の種なら砂漠の花、農場の種なら農場の花
export const randomCrop = (seedId: string): Crop => {
  const list = isDesertSeedId(seedId) ? DESERT_CROPS : CROPS;
  return list[Math.floor(Math.random() * list.length)];
};

export type Dir = "up" | "down" | "left" | "right";
export const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// 港の桟橋と船。港の待合所の南から、マップの外の海へ延びる
export const HARBOR = {
  pier: { x: 10, y: 26, h: 2 }, // 桟橋（歩ける）
  ship: { x: 11, y: 26, w: 3, h: 2 }, // 桟橋の右に停まっている船（歩けない）
};
const inRect = (x: number, y: number, r: { x: number; y: number; w?: number; h: number }) =>
  x >= r.x && x < r.x + (r.w ?? 1) && y >= r.y && y < r.y + r.h;
// 海の上に置かれたもの。波打ち際の砂浜は描かない
export const ON_SEA = new Set(["S", "B", "V"]);

// 砂漠のもの。マップの外は、いちばん近い端のマスが砂漠なら砂嵐、それ以外はずっと海
const DESERT_SIDE = new Set(["D", "W", "C", "K"]);
export const tileAt = (x: number, y: number): string => {
  if (inRect(x, y, HARBOR.pier)) return "B";
  if (inRect(x, y, HARBOR.ship)) return "V";
  const c = MAP[y]?.[x];
  if (c) return c;
  const edge = MAP[Math.min(Math.max(y, 0), ROWS - 1)][Math.min(Math.max(x, 0), COLS - 1)];
  return DESERT_SIDE.has(edge) ? "W" : "S";
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
  { id: "house", name: "家", x: 20, y: 5, w: 2, h: 2, door: { x: 20, y: 6 }, enterable: true },
  { id: "cafe", name: "カフェ", x: 8, y: 11, w: 3, h: 2, door: { x: 9, y: 12 }, enterable: true },
  { id: "hall", name: "村役場", x: 15, y: 5, w: 4, h: 3, door: { x: 16, y: 7 }, enterable: true }, // 焚き火の広場の真北
  { id: "library", name: "図書館", x: 21, y: 20, w: 3, h: 2, door: { x: 22, y: 21 }, enterable: false },
  { id: "harbor", name: "港の待合所", x: 10, y: 20, w: 2, h: 2, door: { x: 10, y: 21 }, enterable: false },
  { id: "radio", name: "ラジオ局", x: 5, y: 1, w: 2, h: 2, door: { x: 5, y: 2 }, enterable: false }, // 北西の丘の上。斜めの石段で下りる
  { id: "dev", name: "開発局", x: 32, y: 3, w: 3, h: 2, door: { x: 33, y: 4 }, enterable: false }, // 砂漠の中
  { id: "windmill", name: "風車", x: 11, y: 3, w: 3, h: 5, door: { x: 12, y: 7 }, enterable: false }, // 丘のふもと。村の目じるし
  { id: "lighthouse", name: "灯台", x: 3, y: 10, w: 2, h: 3, door: { x: 3, y: 12 }, enterable: false },
];
export const buildingAt = (x: number, y: number) =>
  BUILDINGS.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;

// いま村人がいる場所。農場か、建物の中（建物の id と同じ）
export type RoomId = "house" | "cafe" | "hall";
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
  // 村役場。N=掲示板（奥の壁。吃音についての情報） b=カウンターの内側 K=係員 C=窓口のカウンター
  // L=待合のベンチ P=鉢植え。係員に話しかけると住民登録の窓口（準備中）
  hall: {
    map: [
      "##############",
      "#NN.bbKbb..NN#",
      "#...CCCCC....#",
      "#............#",
      "#............#",
      "#.LLLL..LLLL.#",
      "#............#",
      "#.LLLL..LLLL.#",
      "#P...........#",
      "#............#",
      "######E#######",
    ],
    entry: { x: 6, y: 9 },
    walkable: new Set([".", "E"]),
  },
};
// 村役場の中に、ベンチで順番を待っている村人
export const HALL_GUESTS: Record<string, string> = { "4_5": "sheep", "10_7": "rabbit" };

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
