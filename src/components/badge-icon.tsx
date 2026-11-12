import { View } from "react-native";

import type { BadgeId } from "@/lib/badges";

/* =========================================================
   村長からもらったバッジの絵（8×8 ドットの絵を、金色のメダルの上に描く）
   a・b・c は絵の色。もらっていないバッジは灰色の影だけ
   ========================================================= */
type Art = { rows: string[]; a: string; b?: string; c?: string };
const ART: Record<BadgeId, Art> = {
  // 足あと
  "first-step": { rows: ["........", ".aa.....", ".aa.....", "..a..aa.", ".....aa.", "......a.", "........", "........"], a: "#6b4a2e" },
  // 種
  sow: { rows: ["........", "...bb...", "..baab..", ".baaaab.", ".baaaab.", "..baab..", "...bb...", "........"], a: "#8a5a2a", b: "#4a3018" },
  // しずく
  water: { rows: ["...a....", "...a....", "..aaa...", ".aaaaa..", ".aabaa..", ".aaaba..", "..aaa...", "........"], a: "#3f8fc4", b: "#d8f0fa" },
  // 花
  bloom: { rows: ["...a....", ".a.a.a..", "..aba...", ".aabaa..", "..aba...", ".a.c.a..", "...c....", "..ccc..."], a: "#e86a8a", b: "#f6d24a", c: "#4f8f3a" },
  // サボテン
  challenge: { rows: ["...a....", "...a.a..", ".a.a.a..", ".a.aaa..", ".aaa....", "...a....", "...a....", "..bbb..."], a: "#4f8f3a", b: "#b5714a" },
  // カップ
  cafe: { rows: ["..a.a...", "...a.a..", "........", ".bbbbb..", ".bbbbbbb", ".bbbbb.b", "..bbbbb.", "........"], a: "#ffffff", b: "#7a5235" },
  // 家
  resident: { rows: ["...a....", "..aaa...", ".aaaaa..", "aaaaaaa.", ".abbba..", ".abcba..", ".abcba..", "........"], a: "#c4473a", b: "#f6efd9", c: "#7a5235" },
  // 本
  book: { rows: ["........", ".aa.aa..", "abbabba.", "abbabba.", "abbabba.", "aaaaaaa.", "........", "........"], a: "#3f6fb0", b: "#f6efd9" },
};

export function BadgeIcon({ id, size = 48, locked = false }: { id: BadgeId; size?: number; locked?: boolean }) {
  const art = ART[id];
  const px = Math.max(1, Math.floor((size * 0.6) / 8));
  const colorOf = (ch: string) => (locked ? "#6f7a6a" : ch === "a" ? art.a : ch === "b" ? art.b : art.c);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center",
        backgroundColor: locked ? "#4a5546" : "#e2c15a", borderWidth: Math.max(2, size / 16), borderColor: locked ? "#3a4436" : "#b8933a",
      }}
    >
      <View style={{ width: px * 8, height: px * 8 }}>
        {art.rows.map((row, y) => (
          <View key={y} style={{ flexDirection: "row", height: px }}>
            {[...row].map((ch, x) => (
              <View key={x} style={{ width: px, height: px, backgroundColor: ch === "." ? "transparent" : colorOf(ch) }} />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}
