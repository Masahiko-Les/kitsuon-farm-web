import { type ReactNode, useState } from "react";
import {
  Pressable, type StyleProp, StyleSheet, Text, type TextProps, TextInput, type TextStyle, View, type ViewStyle,
} from "react-native";

import { MAX_CHARS, MAX_LINES } from "@/lib/game";
import { countContent, measure } from "@/lib/text";
import { C, F, LINE_H, R, shadow } from "@/theme";

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
  const bg = kind === "primary" ? C.leaf : kind === "water" ? C.water : "rgba(255,255,255,0.06)";
  const fg = kind === "quiet" ? C.text : C.onLeaf;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        kind === "quiet" ? s.btnQuiet : shadow(4, 12, 0.25),
        { backgroundColor: bg, opacity: disabled ? 0.45 : 1 },
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
// maxLines を null にすると行数の制限をなくし（種は文字数だけ）、書いた量に合わせて便箋が伸びる
export function PaperInput({ placeholder, onChangeText, initial = "", minChars = 0, maxLines = MAX_LINES }: {
  placeholder: string; onChangeText: (t: string) => void; initial?: string; minChars?: number; maxLines?: number | null;
}) {
  const [text, setText] = useState(initial);
  const [rows, setRows] = useState(MAX_LINES);
  const { lines, chars } = measure(text);
  const short = minChars - countContent(text);
  const over = (maxLines !== null && lines > maxLines) || chars > MAX_CHARS;
  const counter = maxLines === null
    ? `${chars} / ${MAX_CHARS}文字`
    : `${lines} / ${maxLines}行　${chars} / ${MAX_CHARS}文字`;
  const grow = maxLines === null;
  return (
    <>
      <View style={s.paper}>
        <Rules count={grow ? rows : MAX_LINES} top={PAD_TOP} />
        {/* 日本語入力が崩れないよう、value は渡さない */}
        <TextInput
          multiline
          defaultValue={initial}
          placeholder={placeholder}
          placeholderTextColor="#9b9384"
          accessibilityLabel={placeholder}
          onChangeText={(t) => { setText(t); onChangeText(t); }}
          onContentSizeChange={grow
            ? (e) => setRows(Math.max(MAX_LINES, Math.ceil(e.nativeEvent.contentSize.height / LINE_H)))
            : undefined}
          scrollEnabled={false}
          textAlignVertical="top"
          style={[s.paperInput, grow && { height: rows * LINE_H }]}
        />
      </View>
      <T style={[s.counter, over && { color: C.over }]}>
        {`${counter}${short > 0 ? `　（あと${short}文字）` : ""}`}
      </T>
    </>
  );
}

const PAD_TOP = 10;

const s = StyleSheet.create({
  t: { fontFamily: F.ui, color: C.text, fontSize: 16, letterSpacing: 0.2 },
  title: { fontSize: 20, fontWeight: "700", color: C.text, marginBottom: 12, letterSpacing: 0.3 },
  body: { fontSize: 15, lineHeight: 25, marginBottom: 12, color: C.soft },
  small: { fontSize: 13, lineHeight: 20, color: C.sub, marginTop: 8 },
  error: { fontSize: 14, color: C.error, marginTop: 8 },
  section: { fontSize: 12, fontWeight: "700", color: C.sub, marginTop: 18, marginBottom: 8, letterSpacing: 1 },
  tips: { marginBottom: 10, gap: 8 },
  tipRow: { flexDirection: "row", gap: 8 },
  tipDot: { fontSize: 14, color: C.leaf, lineHeight: 22 },
  tipText: { fontSize: 14, lineHeight: 22, color: C.soft, flex: 1 },

  btn: {
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    minWidth: 96,
  },
  btnQuiet: { borderWidth: 1, borderColor: C.line },
  btnPressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  btnText: { fontSize: 15, fontWeight: "700", textAlign: "center", letterSpacing: 0.4 },
  link: { fontSize: 13, color: C.sub, textDecorationLine: "underline" },
  actions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 18 },
  links: { flexDirection: "row", gap: 16, marginTop: 16, flexWrap: "wrap" },

  paper: {
    backgroundColor: C.paper,
    borderRadius: R.sm,
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
