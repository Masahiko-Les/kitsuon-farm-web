import { StyleSheet, Text, View } from "react-native";

import { NOTE_FIELDS, type ResidentCard, SOUND_ROWS } from "@/lib/resident-api";
import { C, F } from "@/theme";

// 住民票を読む。生成りの紙に、書いてある項目だけを並べる
export function ResidentCardView({ card }: { card: ResidentCard }) {
  const [first, ...rest] = NOTE_FIELDS; // 自己紹介・好きなことは上、場面や吃音史は下
  const top = [first, rest[0]];
  const bottom = rest.slice(1);
  return (
    <View style={s.card}>
      <Text style={s.head}>吃音村　住民票</Text>
      <Text style={s.name}>{card.villagerName || "（名前なし）"}</Text>
      {card.stutterTypes.length > 0 ? <Text style={s.types}>{card.stutterTypes.join("・")}</Text> : null}

      {top.map((f) => (card[f.key] ? <Field key={f.key} label={f.label} text={card[f.key]} /> : null))}

      {card.difficultSounds.length > 0 ? (
        <View style={s.field}>
          <Text style={s.label}>言いにくい音</Text>
          <View style={s.grid}>
            {SOUND_ROWS.map((row) => (
              <View key={row.join("")} style={s.row}>
                {row.map((k) => {
                  const on = card.difficultSounds.includes(k);
                  return <Text key={k} style={[s.kana, on && s.kanaOn]}>{k}</Text>;
                })}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {card.difficultWords.length > 0 ? (
        <View style={s.field}>
          <Text style={s.label}>言いにくい言葉</Text>
          <View style={s.chips}>
            {card.difficultWords.map((w) => <Text key={w} style={s.chip}>{w}</Text>)}
          </View>
        </View>
      ) : null}

      {bottom.map((f) => (card[f.key] ? <Field key={f.key} label={f.label} text={card[f.key]} /> : null))}
    </View>
  );
}

function Field({ label, text }: { label: string; text: string }) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.text}>{text}</Text>
    </View>
  );
}

const RED = "#b5523b";

const s = StyleSheet.create({
  card: { backgroundColor: C.paper, borderRadius: 4, padding: 16, borderWidth: 3, borderColor: "#c9b98f" },
  head: { fontFamily: F.ui, fontSize: 13, color: "#8a7a55", textAlign: "center", letterSpacing: 4, marginBottom: 8 },
  name: { fontFamily: F.letterBold, fontSize: 22, color: C.ink, textAlign: "center" },
  types: { fontFamily: F.ui, fontSize: 13, color: "#6b6150", textAlign: "center", marginTop: 4 },
  field: { marginTop: 14, borderTopWidth: 1, borderTopColor: "#e2d7b8", paddingTop: 10 },
  label: { fontFamily: F.ui, fontSize: 12, color: "#8a7a55", marginBottom: 4 },
  text: { fontFamily: F.letter, fontSize: 15, lineHeight: 26, color: C.ink },
  grid: { gap: 3 },
  row: { flexDirection: "row", gap: 3 },
  kana: {
    width: 28, height: 28, lineHeight: 26, textAlign: "center", fontFamily: F.letter, fontSize: 14,
    color: "#c8bea5", borderWidth: 1, borderColor: "#e2d7b8", borderRadius: 4,
  },
  kanaOn: { color: RED, borderColor: RED, backgroundColor: "rgba(181,82,59,0.1)" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    fontFamily: F.letter, fontSize: 14, color: RED, backgroundColor: "rgba(181,82,59,0.1)",
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2, overflow: "hidden",
  },
});
