import { Canvas, Group, Picture, Skia, createPicture } from "@shopify/react-native-skia";
import { useMemo, useState } from "react";
import { type LayoutChangeEvent, PixelRatio, StyleSheet, View } from "react-native";

import { drawAnimal, drawFarmerBack } from "./animals";

// カフェの会話画面の上に出す情景。カウンター席に座った「わたし」を後ろから見ている。
// カウンターの向こうにマスター、左隣に村人。言葉を紹介するときは、右隣にその村人が座る。
// 横に広めに描いておき、画面の幅に合わせて真ん中を切り出す。
const VW = 200; // 描く範囲（ドット単位）
const VH = 64;
const SHOW_TOP = 2; // 縦はこの範囲（ドット）を画面に収める
const SHOW_H = 60;
const BIG = 1.5; // 人物を描く倍率

type Props = {
  left: string; // 左隣に座っている村人
  neighbor: string | null; // 右隣の村人（言葉を紹介しているとき）
  talking: "master" | "neighbor";
  height?: number;
};

function scenePicture({ left, neighbor, talking }: Props) {
  return createPicture((canvas) => {
    const p = Skia.Paint();
    p.setAntiAlias(false);
    const r = (x: number, y: number, w: number, h: number, c: string) => {
      p.setColor(Skia.Color(c));
      canvas.drawRect(Skia.XYWHRect(x, y, w, h), p);
    };
    const person = (x: number, y: number, draw: () => void) => {
      canvas.save();
      canvas.translate(x, y);
      canvas.scale(BIG, BIG);
      draw();
      canvas.restore();
    };
    // 吹き出し（「…」）
    const bubble = (x: number, y: number) => {
      r(x, y, 13, 7, "#f6efd9");
      r(x + 2, y + 7, 2, 2, "#f6efd9");
      r(x + 3, y + 3, 1, 1, "#2f2a24");
      r(x + 6, y + 3, 1, 1, "#2f2a24");
      r(x + 9, y + 3, 1, 1, "#2f2a24");
    };

    // 奥の壁と棚
    r(0, 0, VW, VH, "#5a3e2b");
    for (let i = 0; i < 20; i++) r(i * 10 + 4, 0, 1, 30, "#523726");
    for (const sy of [9, 20]) {
      r(10, sy, VW - 20, 2, "#8a6a48");
      for (let i = 0; i < 18; i++) {
        const x = 14 + i * 10;
        const kind = (i * 7 + sy) % 4;
        if (kind === 0) r(x, sy - 6, 3, 6, "#6f9a44");
        else if (kind === 1) r(x, sy - 4, 4, 4, "#f6efd9");
        else if (kind === 2) r(x, sy - 5, 3, 5, "#c4473a");
        else r(x, sy - 3, 5, 3, "#e2c15a");
      }
    }
    // ペンダントライト
    for (const lx of [60, 140]) {
      r(lx, 0, 1, 4, "#3a2a1e");
      r(lx - 4, 4, 9, 3, "#e2c15a");
      r(lx - 3, 7, 7, 1, "#fff6c2");
    }

    // マスター（カウンターの向こう）
    person(92, 6, () => drawAnimal(r, "owl", 0, 0));

    // カウンター
    r(0, 30, VW, 4, "#c89060");
    r(0, 30, VW, 1, "#e0ad78");
    r(0, 34, VW, 14, "#7a5235");
    for (let i = 0; i < 10; i++) r(i * 20 + 2, 36, 16, 10, "#6b4a2e");

    // 床と丸椅子
    r(0, 48, VW, 16, "#a77a52");
    const stool = (x: number) => {
      r(x + 4, 50, 16, 4, "#c4473a");
      r(x + 4, 50, 16, 1, "#e06a5c");
      r(x + 11, 54, 2, 10, "#5a3e2b");
    };
    for (const sx of [12, 46, 74, 120, 152]) stool(sx);

    // 座っている人（後ろ姿）。左隣の村人・わたし・右隣の村人
    person(46, 27, () => drawAnimal(r, left, 0, 0, true));
    person(74, 27, () => drawFarmerBack(r, 0, 0));
    if (neighbor) person(120, 27, () => drawAnimal(r, neighbor, 0, 0, true));
    // 奥の席にも、ひとり
    person(152, 27, () => drawAnimal(r, "sheep", 0, 0, true));

    // 話している人に吹き出し
    if (talking === "master") bubble(116, 2);
    else if (neighbor) bubble(142, 18);
  }, Skia.XYWHRect(0, 0, VW, VH));
}

export function CafeScene({ left, neighbor, talking, height = 150 }: Props) {
  const [width, setWidth] = useState(0);
  const picture = useMemo(() => scenePicture({ left, neighbor, talking }), [left, neighbor, talking]);
  // 縦の SHOW_H ドットが高さに収まる倍率。ドットがにじまないよう端末の画素に合わせて丸める
  const pr = PixelRatio.get();
  const scale = Math.max(1, Math.round((height / SHOW_H) * pr) / pr);
  // 横はマスターが真ん中に来るように切り出す
  const ox = width / 2 - 104 * scale;
  const oy = -SHOW_TOP * scale;
  return (
    <View
      style={[s.wrap, { height }]}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="image"
      accessibilityLabel={neighbor ? "カウンター席で、隣の村人が話している" : "カウンター席で、マスターが話している"}
    >
      {width > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={[{ translateX: ox }, { translateY: oy }, { scale }]}>
            <Picture picture={picture} />
          </Group>
        </Canvas>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { width: "100%", overflow: "hidden", backgroundColor: "#5a3e2b" },
});
