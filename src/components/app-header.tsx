import { type Href, router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { C, R } from "@/theme";
import { T } from "./ui";

// 前の画面の記録がないとき（URL を直接開いた・再読み込みしたなど）の戻り先
const FALLBACK: Record<string, Href> = {
  cafe: "/",
  settings: "/",
  "cafe-mine": "/cafe",
  "cafe-admin": "/settings",
  help: "/settings",
  terms: "/settings",
  contact: "/settings",
};

// 前の画面に戻る。戻れないときは、その画面ごとの戻り先へ移る
export function goBack(screen: string) {
  if (router.canGoBack()) router.back();
  else router.replace(FALLBACK[screen] ?? "/");
}

// 農場のマップ以外のすべての画面の上の帯。いちばん上に、いつでも押せる「戻る」を置く
export function AppHeader({ title, screen }: { title: string; screen: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingTop: insets.top + 8, paddingLeft: insets.left + 12, paddingRight: insets.right + 12 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="戻る"
        onPress={() => goBack(screen)}
        hitSlop={6}
        style={({ pressed }) => [s.back, pressed && { backgroundColor: C.mossDeep }]}
      >
        <T style={s.backText}>‹ 戻る</T>
      </Pressable>
      <T style={s.title} numberOfLines={1} accessibilityRole="header">{title}</T>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 8,
    backgroundColor: C.mossDeep,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  back: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: R.pill,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  backText: { fontSize: 14, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "700", flexShrink: 1 },
});
