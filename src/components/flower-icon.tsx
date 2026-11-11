// 花のドット絵を、ふつうの画像として出す（収穫・思い出帳・図鑑・郵便受け）
// Skia の Canvas をたくさん並べると重いので、1ドットを整数倍に広げた PNG を作って Image で出す
import { Image, PixelRatio, type StyleProp, type ImageStyle } from "react-native";

import { FLOWER_SIZE, flowerPixels } from "./flowers";
import { PixMap, hex } from "./pixmap";

const SHADOW = hex("#8a7f6a"); // まだ持っていない花は、この色の影にする
const uris = new Map<string, string>();

function uriFor(id: string, px: number, dim: boolean) {
  const key = `${id}:${px}:${dim ? 1 : 0}`;
  let u = uris.get(key);
  if (!u) {
    const k = Math.max(1, Math.round(px / FLOWER_SIZE));
    const src = flowerPixels(id);
    const pm = new PixMap(FLOWER_SIZE * k, FLOWER_SIZE * k);
    for (let y = 0; y < FLOWER_SIZE; y++) {
      for (let x = 0; x < FLOWER_SIZE; x++) {
        const i = (y * FLOWER_SIZE + x) * 4;
        const a = src[i + 3];
        if (!a) continue;
        const c = dim ? SHADOW : ([src[i], src[i + 1], src[i + 2]] as const);
        pm.rect(x * k, y * k, k, k, c, a / 255);
      }
    }
    u = `data:image/png;base64,${pm.toImage().encodeToBase64()}`;
    uris.set(key, u);
  }
  return u;
}

// size は表示の大きさ（16 の倍数にすると、ドットがそろう）
export function FlowerIcon({ id, size, dim = false, style }: { id: string; size: number; dim?: boolean; style?: StyleProp<ImageStyle> }) {
  const px = Math.round(size * PixelRatio.get());
  return (
    <Image
      source={{ uri: uriFor(id, px, dim) }}
      style={[{ width: size, height: size }, dim && { opacity: 0.45 }, style]}
      accessibilityIgnoresInvertColors
    />
  );
}
