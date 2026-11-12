import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { C } from "@/theme";

// 起動画面。public/index.html の起動画面と同じ見た目で、アプリが動き出したあとの待ち時間
// （フォントやログインの読み込み）に出す。フォントは index.html に埋め込んだ KitsuonSplash
const FRAMES = [".  ", " . ", ". ."];

export function Splash() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 400);
    return () => clearInterval(t);
  }, []);
  return (
    <View style={s.root} accessibilityRole="progressbar" accessibilityLabel="吃音村を読み込んでいます">
      <Text style={s.title}>吃音村β版</Text>
      <Text style={s.dots} aria-hidden>{FRAMES[i]}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: C.moss },
  title: { fontFamily: "KitsuonSplash", fontSize: 44, letterSpacing: 6, color: C.text },
  dots: { fontFamily: "KitsuonSplash", fontSize: 44, lineHeight: 44, marginTop: 8, color: C.leaf, whiteSpace: "pre" } as object,
});
