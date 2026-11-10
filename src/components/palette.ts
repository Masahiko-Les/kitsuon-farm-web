import { hex } from "./pixmap";

// 地図の色。光の当たる所は黄みの明るい色、影は黒ではなく青緑の暗い色。少しくすませて、懐かしい色味にする
// 並びは、暗い順
export const GRASS = ["#6a9150", "#88aa59", "#a6bf66", "#c3d07c"].map(hex);
export const TUFT_DARK = hex("#58804a");
export const TUFT_LIGHT = hex("#d3db94");
export const FLOWERS = ["#f4efdc", "#efb0b8", "#efd36e"].map(hex);

export const DIRT = ["#bba57b", "#cdb98f", "#dccb9f", "#e6d8b0"].map(hex);
export const DIRT_EDGE = hex("#9c8661");
export const PEBBLE = hex("#a8926b");

export const SOIL = { furrow: hex("#45302a"), body: hex("#654837"), ridge: hex("#7a5840"), light: hex("#93714f") };

export const WATER = { deep: hex("#2f6f8c"), body: hex("#3d87a2"), light: hex("#62aabd"), bank: hex("#24505d") };
export const STONE = [hex("#6f7a72"), hex("#8f998c"), hex("#b3baa9")];

// 木の葉。いちばん奥の青緑から、光の当たる黄緑まで
export const LEAVES = ["#21404a", "#2c5649", "#3b6c47", "#557f45", "#7aa24c", "#a8c162"].map(hex);
export const TRUNK = { dark: hex("#3d2e2a"), body: hex("#5c4535"), light: hex("#7a5d45") };

export const WOOD = { dark: hex("#6b4f3a"), body: hex("#9a7754"), light: hex("#c09a6c") };

export const HOUSE = {
  roof: [hex("#2b3443"), hex("#3a4557"), hex("#4f5c70"), hex("#6d7b8f")],
  wall: hex("#e4d6b4"),
  wallShade: hex("#c4b38d"),
  timber: hex("#5f4535"),
  glow: hex("#f3d27c"),
  glowLight: hex("#fbeab3"),
  door: hex("#7a5236"),
  doorDark: hex("#573a28"),
  pot: hex("#b5674a"),
};

// 影の色（半透明で重ねる）
export const SHADE = hex("#1d3c44");
