// カフェの村人とマスターのドット絵。16×16 のマスに、正面を向いて座った姿を描く。
// マップとカフェの会話画面の両方で使うので、塗る関数を受け取って描く。
export type RectFn = (x: number, y: number, w: number, h: number, color: string) => void;

const EYE = "#2a2018";

// カフェの情景に座っている客の見た目。回答とは結びつかない、ただの背景
export const GUEST_LOOKS = ["rabbit", "cat", "dog", "tanuki", "fox", "sheep"];

type Look = { fur: string; dark: string; muzzle?: string };
const LOOKS: Record<string, Look> = {
  rabbit: { fur: "#f4f1ea", dark: "#f2b6c0" },
  cat: { fur: "#e8a050", dark: "#c47a30", muzzle: "#f6e2c4" },
  dog: { fur: "#c8945c", dark: "#7a5235", muzzle: "#efd9b8" },
  tanuki: { fur: "#9a7a58", dark: "#4a3a2a", muzzle: "#e9dcc4" },
  fox: { fur: "#e07a30", dark: "#8a4418", muzzle: "#f6efd9" },
  sheep: { fur: "#f4f1ea", dark: "#d9c3a5" },
};

// back = true で後ろ姿（カウンターに向かって座っているところ）
export function drawAnimal(r: RectFn, id: string, X: number, Y: number, back = false) {
  if (id === "owl") { drawOwl(r, X, Y); return; }
  if (back) { drawAnimalBack(r, id, X, Y); return; }
  const k = LOOKS[id] ?? LOOKS.dog;
  // 耳（頭の後ろに描く）
  if (id === "rabbit") {
    r(X + 4, Y - 4, 3, 8, k.fur); r(X + 9, Y - 4, 3, 8, k.fur);
    r(X + 5, Y - 3, 1, 6, k.dark); r(X + 10, Y - 3, 1, 6, k.dark);
  } else if (id === "cat" || id === "fox") {
    r(X + 3, Y + 1, 3, 3, k.fur); r(X + 10, Y + 1, 3, 3, k.fur);
    r(X + 3, Y, 1, 1, k.fur); r(X + 12, Y, 1, 1, k.fur);
    r(X + 4, Y + 2, 1, 1, k.dark); r(X + 11, Y + 2, 1, 1, k.dark);
  } else if (id === "tanuki") {
    r(X + 3, Y + 2, 3, 2, k.dark); r(X + 10, Y + 2, 3, 2, k.dark);
  } else if (id === "sheep") {
    r(X + 2, Y + 2, 12, 5, k.fur); r(X + 3, Y + 1, 10, 1, k.fur);
  }
  // 体と頭
  r(X + 4, Y + 11, 8, 5, k.fur);
  r(X + 3, Y + 3, 10, 8, id === "sheep" ? k.dark : k.fur);
  if (id === "sheep") { r(X + 2, Y + 2, 12, 3, k.fur); r(X + 1, Y + 6, 2, 2, k.dark); r(X + 13, Y + 6, 2, 2, k.dark); }
  if (id === "dog") { r(X + 2, Y + 4, 2, 6, k.dark); r(X + 12, Y + 4, 2, 6, k.dark); }
  if (id === "tanuki") { r(X + 4, Y + 5, 3, 3, k.dark); r(X + 9, Y + 5, 3, 3, k.dark); }
  if (k.muzzle) r(X + 5, Y + 8, 6, 3, k.muzzle);
  // 目と鼻
  r(X + 5, Y + 6, 1, 1, id === "tanuki" ? "#f6efd9" : EYE);
  r(X + 10, Y + 6, 1, 1, id === "tanuki" ? "#f6efd9" : EYE);
  r(X + 7, Y + 8, 2, 1, id === "rabbit" ? "#e08a9a" : EYE);
  // ほっぺ
  r(X + 4, Y + 8, 1, 1, "rgba(230,120,120,0.45)");
  r(X + 11, Y + 8, 1, 1, "rgba(230,120,120,0.45)");
  // 手（テーブルにのせている）
  r(X + 4, Y + 13, 2, 2, k.fur === "#f4f1ea" ? "#e6e0d2" : k.dark);
  r(X + 10, Y + 13, 2, 2, k.fur === "#f4f1ea" ? "#e6e0d2" : k.dark);
}

// マスターのふくろう。白いエプロンをつけている
function drawOwl(r: RectFn, X: number, Y: number) {
  const brown = "#8a6a4a", face = "#e3cfa8";
  r(X + 3, Y + 1, 2, 2, brown); r(X + 11, Y + 1, 2, 2, brown); // 耳羽
  r(X + 3, Y + 3, 10, 13, brown);
  r(X + 2, Y + 5, 12, 9, brown);
  r(X + 4, Y + 4, 8, 6, face);
  r(X + 4, Y + 5, 3, 3, "#f6efd9"); r(X + 9, Y + 5, 3, 3, "#f6efd9");
  r(X + 5, Y + 6, 1, 1, EYE); r(X + 10, Y + 6, 1, 1, EYE);
  r(X + 7, Y + 8, 2, 2, "#e0a040"); // くちばし
  r(X + 5, Y + 11, 6, 5, "#f6efd9"); // エプロン
  r(X + 5, Y + 11, 6, 1, "#d9d3c4");
}

function drawAnimalBack(r: RectFn, id: string, X: number, Y: number) {
  const k = LOOKS[id] ?? LOOKS.dog;
  // 耳
  if (id === "rabbit") {
    r(X + 4, Y - 4, 3, 8, k.fur); r(X + 9, Y - 4, 3, 8, k.fur);
  } else if (id === "cat" || id === "fox") {
    r(X + 3, Y + 1, 3, 3, k.fur); r(X + 10, Y + 1, 3, 3, k.fur);
    r(X + 3, Y, 1, 1, k.fur); r(X + 12, Y, 1, 1, k.fur);
  } else if (id === "tanuki") {
    r(X + 3, Y + 2, 3, 2, k.dark); r(X + 10, Y + 2, 3, 2, k.dark);
  }
  // 頭と体（顔は見えない）
  r(X + 3, Y + 3, 10, 8, k.fur);
  r(X + 4, Y + 11, 8, 5, k.fur);
  r(X + 4, Y + 10, 8, 1, "rgba(0,0,0,0.12)"); // 首の影
  if (id === "sheep") { r(X + 2, Y + 1, 12, 10, k.fur); r(X + 3, Y + 11, 10, 4, k.fur); r(X + 1, Y + 5, 2, 2, k.dark); r(X + 13, Y + 5, 2, 2, k.dark); }
  if (id === "dog") { r(X + 2, Y + 4, 2, 6, k.dark); r(X + 12, Y + 4, 2, 6, k.dark); }
  if (id === "tanuki") r(X + 6, Y + 12, 4, 4, k.dark); // しっぽの付け根
  if (id === "fox") { r(X + 11, Y + 12, 3, 4, k.fur); r(X + 12, Y + 15, 2, 1, "#f6efd9"); } // しっぽ
  if (id === "cat") r(X + 12, Y + 11, 1, 5, k.dark);
}

// 主人公の後ろ姿（2頭身。麦わら帽子の村人がカウンターに座っているところ）
export function drawFarmerBack(r: RectFn, X: number, Y: number) {
  r(X + 4, Y + 10, 8, 4, "#3f72c0"); // 服
  r(X + 4, Y + 10, 8, 1, "#5a8ad8");
  r(X + 3, Y + 10, 1, 3, "#3f72c0");
  r(X + 12, Y + 10, 1, 3, "#3f72c0");
  r(X + 3, Y + 4, 10, 5, "#7a4a2a"); // 髪
  r(X + 4, Y + 9, 8, 1, "#7a4a2a");
  r(X + 5, Y - 2, 6, 1, "#efc75e"); // 麦わら帽子
  r(X + 4, Y - 1, 8, 3, "#efc75e");
  r(X + 6, Y - 2, 3, 1, "#f8dc84");
  r(X + 4, Y + 1, 8, 1, "#c8402f");
  r(X + 1, Y + 2, 14, 2, "#efc75e");
  r(X + 1, Y + 2, 14, 1, "#f8dc84");
  r(X + 2, Y + 3, 12, 1, "#c99e3c");
}
