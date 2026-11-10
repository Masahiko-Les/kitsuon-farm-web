import { Platform, type ViewStyle } from "react-native";

// 色。深い緑がかった墨色の上に、やわらかい若葉色を差す。名前は以前のまま（moss = 背景 など）
export const C = {
  moss: "#1d2722", // 背景
  mossDeep: "#141b18", // いちばん暗い面（上の帯など）
  mossSoft: "#27342e", // カード・パネルの面
  surface2: "#31403a", // パネルの中の、もう一段明るい面
  line: "rgba(255,255,255,0.09)", // 細い枠
  glass: "rgba(18,26,22,0.62)", // すりガラス（地図の上に重ねる帯）
  leaf: "#a5d68e", // 強調の色
  leafDeep: "#78b363",
  onLeaf: "#13210f", // 強調の色の上の文字
  water: "#82c6e2",
  paper: "#fbf6ea",
  ink: "#2a2a26",
  rule: "#dce4ea",
  mail: "#ec6a57",
  text: "#f2f5ef",
  sub: "#a7b6ab",
  soft: "#d4ded5",
  error: "#ff9d8c",
  over: "#ff8f7a",
};

// 文字。画面はゴシック体（端末に入っているものを使う）、手紙の本文は手書き風の Klee One
const SANS = Platform.select({
  web: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic UI", "Yu Gothic", Meiryo, system-ui, sans-serif',
  default: undefined,
}) as string | undefined;

export const F = {
  ui: SANS as string,
  letter: "KleeOne_400Regular",
  letterBold: "KleeOne_600SemiBold",
};

// 角の丸み
export const R = { sm: 10, md: 14, lg: 20, pill: 999 };

// やわらかい影（Web は box-shadow になる）
export const shadow = (y = 6, blur = 18, opacity = 0.28): ViewStyle => ({
  shadowColor: "#000",
  shadowOffset: { width: 0, height: y },
  shadowOpacity: opacity,
  shadowRadius: blur,
  elevation: Math.round(y),
});

// すりガラス（Web だけ。ほかでは半透明の色だけになる）
export const blur = (px = 14): ViewStyle =>
  (Platform.OS === "web" ? ({ backdropFilter: `blur(${px}px)`, WebkitBackdropFilter: `blur(${px}px)` } as object) : {}) as ViewStyle;

// 便箋の1行の高さ
export const LINE_H = 30;
