import { type ReactNode, useState } from "react";
import {
  Pressable, type StyleProp, StyleSheet, Text, type TextProps, TextInput, type TextStyle, View, type ViewStyle,
} from "react-native";

import { MAX_CHARS, MAX_LINES } from "@/lib/game";
import { countContent, measure } from "@/lib/text";
import { C, F, LINE_H } from "@/theme";

/* ---------- 文字 ---------- */
export function T({ style, ...props }: TextProps) {
  return <Text {...props} style={[s.t, style]} />;
}

export const Title = ({ children }: { children: ReactNode }) => <T style={s.title} accessibilityRole="header">{children}</T>;
export const Body = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <T style={[s.body, style]}>{children}</T>;
export const Small = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <T style={[s.small, style]}>{children}</T>;
export const ErrorText = ({ children }: { children: ReactNode }) =>
  children ? <T style={s.error} accessibilityRole="alert">{children}</T> : null;
export const SectionLabel = ({ children }: { children: ReactNode }) => <T style={s.section}>{children}</T>;

export function Tips({ items }: { items: string[] }) {
  return (
    <View style={s.tips}>
      {items.map((t) => (
        <View key={t} style={s.tipRow}>
          <T style={s.tipDot}>・</T>
          <T style={s.tipText}>{t}</T>
        </View>
      ))}
    </View>
  );
}

/* ---------- ボタン ---------- */
type BtnKind = "primary" | "water" | "quiet";
export function Btn({ label, onPress, kind = "primary", disabled, style }: {
  label: string; onPress?: () => void; kind?: BtnKind; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = kind === "primary" ? C.leaf : kind === "water" ? C.water : "transparent";
  const fg = kind === "quiet" ? C.soft : C.ink;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : 1 },
        pressed && s.btnPressed,
        style,
      ]}
    >
      <T style={[s.btnText, { color: fg }]}>{label}</T>
    </Pressable>
  );
}

export function LinkBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
      <T style={s.link}>{label}</T>
    </Pressable>
  );
}

export const Actions = ({ children, center }: { children: ReactNode; center?: boolean }) => (
  <View style={[s.actions, center && { justifyContent: "center" }]}>{children}</View>
);
export const Links = ({ children }: { children: ReactNode }) => <View style={s.links}>{children}</View>;

/* ---------- 便箋 ---------- */
function Rules({ count, top }: { count: number; top: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} pointerEvents="none" style={[s.rule, { top: top + (i + 1) * LINE_H - 1 }]} />
      ))}
    </>
  );
}

// 読むための便箋。文章の高さに合わせて罫線を引く。
export function Paper({ text, from, minLines = 3 }: { text: string; from?: string; minLines?: number }) {
  const [lines, setLines] = useState(minLines);
  return (
    <View style={s.paper}>
      <Rules count={lines} top={PAD_TOP} />
      <Text
        style={s.paperText}
        onLayout={(e) => setLines(Math.max(minLines, Math.round(e.nativeEvent.layout.height / LINE_H)))}
      >
        {text}
      </Text>
      {from ? <Text style={s.paperFrom}>{from}</Text> : null}
    </View>
  );
}

// 書くための便箋。10行ぶんの罫線を引いておく。
export function PaperInput({ placeholder, onChangeText, initial = "", minChars = 0 }: {
  placeholder: string; onChangeText: (t: string) => void; initial?: string; minChars?: number;
}) {
  const [text, setText] = useState(initial);
  const { lines, chars } = measure(text);
  const short = minChars - countContent(text);
  const over = lines > MAX_LINES || chars > MAX_CHARS;
  return (
    <>
      <View style={s.paper}>
        <Rules count={MAX_LINES} top={PAD_TOP} />
        {/* 日本語入力が崩れないよう、value は渡さない */}
        <TextInput
          multiline
          defaultValue={initial}
          placeholder={placeholder}
          placeholderTextColor="#9b9384"
          accessibilityLabel={placeholder}
          onChangeText={(t) => { setText(t); onChangeText(t); }}
          scrollEnabled={false}
          textAlignVertical="top"
          style={s.paperInput}
        />
      </View>
      <T style={[s.counter, over && { color: C.over }]}>
        {`${lines} / ${MAX_LINES}行　${chars} / ${MAX_CHARS}字${short > 0 ? `　（あと${short}字）` : ""}`}
      </T>
    </>
  );
}

const PAD_TOP = 10;

const s = StyleSheet.create({
  t: { fontFamily: F.ui, color: C.text, fontSize: 16 },
  title: { fontSize: 19, color: C.leaf, marginBottom: 10 },
  body: { fontSize: 15, lineHeight: 24, marginBottom: 12 },
  small: { fontSize: 13, lineHeight: 20, color: C.sub, marginTop: 8 },
  error: { fontSize: 14, color: C.error, marginTop: 8 },
  section: { fontSize: 14, color: C.sub, marginTop: 14, marginBottom: 6 },
  tips: { marginBottom: 10 },
  tipRow: { flexDirection: "row", marginBottom: 4 },
  tipDot: { fontSize: 14, color: C.soft },
  tipText: { fontSize: 14, lineHeight: 22, color: C.soft, flex: 1 },

  btn: {
    borderWidth: 2,
    borderColor: C.mossDeep,
    borderRadius: 6,
    paddingVertical: 9,
    paddingHorizontal: 16,
    shadowColor: C.mossDeep,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  btnPressed: { transform: [{ translateY: 2 }], shadowOffset: { width: 0, height: 1 } },
  btnText: { fontSize: 15, textAlign: "center" },
  link: { fontSize: 13, color: C.sub, textDecorationLine: "underline" },
  actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 },
  links: { flexDirection: "row", gap: 16, marginTop: 16, flexWrap: "wrap" },

  paper: {
    backgroundColor: C.paper,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingTop: PAD_TOP,
    paddingBottom: 12,
    overflow: "hidden",
  },
  rule: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: C.rule },
  paperText: { fontFamily: F.letter, fontSize: 16, lineHeight: LINE_H, color: C.ink },
  paperFrom: { fontFamily: F.letterBold, fontSize: 16, lineHeight: LINE_H, color: C.ink, textAlign: "right", marginTop: 4 },
  paperInput: {
    fontFamily: F.letter,
    fontSize: 16,
    lineHeight: LINE_H,
    color: C.ink,
    height: LINE_H * MAX_LINES,
    padding: 0,
    paddingTop: 0,
  },
  counter: { marginTop: 6, fontSize: 13, textAlign: "right", color: C.sub },
});
