import { type ReactNode, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Actions, Body, Btn, ErrorText, SectionLabel, Small, T, Tips, Title } from "@/components/ui";
import { NAME_MAX } from "@/lib/game";
import { GUIDELINES, TERMS } from "@/lib/terms";
import { checkText } from "@/lib/text";
import { useFarm } from "@/state/farm";
import { C, F } from "@/theme";

function Frame({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={s.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.card}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function LoadingScreen({ message }: { message?: string }) {
  return (
    <SafeAreaView style={[s.root, s.center]}>
      {message ? <Body style={{ textAlign: "center", paddingHorizontal: 24 }}>{message}</Body> : <ActivityIndicator color={C.leaf} />}
      {message ? null : <T style={{ marginTop: 12, color: C.sub }}>読み込み中…</T>}
    </SafeAreaView>
  );
}

/* ---------- 村人名の登録（初回のみ） ---------- */
export function NameScreen() {
  const { register } = useFarm();
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = name.trim();
    if (!n) { setErr("村人名を入れてください。"); return; }
    if ([...n].length > NAME_MAX) { setErr(`${NAME_MAX}字以内にしてください。`); return; }
    if (checkText(n).error) { setErr("その名前は使えません。別の名前にしてください。"); return; }
    setBusy(true);
    try {
      await register(n);
    } catch (e) {
      setBusy(false);
      setErr("登録できませんでした。通信を確認して、もう一度押してください。");
      console.error(e);
    }
  };

  return (
    <Frame>
      <Title>ようこそ、吃音農場へ</Title>
      <Body>この農園での呼び名を決めてください。ほかの村人にはこの名前だけが見えます。本名やSNSの名前は使わないでください。</Body>
      <TextInput
        style={s.nameInput}
        maxLength={NAME_MAX}
        placeholder="例：のはらのタヌキ"
        placeholderTextColor="#9b9384"
        accessibilityLabel="村人名"
        onChangeText={setName}
        onSubmitEditing={submit}
        returnKeyType="done"
        autoCorrect={false}
      />
      <ErrorText>{err}</ErrorText>
      <Actions><Btn label="はじめる" onPress={submit} disabled={busy} /></Actions>
    </Frame>
  );
}

/* ---------- 利用規約とガイドライン ---------- */
export function TermsBody() {
  return (
    <>
      <SectionLabel>村のやくそく</SectionLabel>
      <Tips items={GUIDELINES} />
      <SectionLabel>利用規約</SectionLabel>
      {TERMS.map((t) => (
        <View key={t.heading} style={{ marginBottom: 10 }}>
          <T style={s.termHead}>{t.heading}</T>
          <T style={s.termBody}>{t.body}</T>
        </View>
      ))}
    </>
  );
}

export function TermsAgreeScreen() {
  const { agree } = useFarm();
  const [checked, setChecked] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await agree();
    } catch (e) {
      setBusy(false);
      setErr("送れませんでした。通信を確認して、もう一度押してください。");
      console.error(e);
    }
  };

  return (
    <Frame>
      <Title>利用規約とガイドライン</Title>
      <Body>農場に入る前に、読んでください。</Body>
      <TermsBody />
      <Pressable
        style={s.check}
        onPress={() => setChecked(!checked)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
      >
        <View style={[s.box, checked && s.boxOn]}>{checked ? <T style={s.tick}>✓</T> : null}</View>
        <T style={{ flex: 1, fontSize: 15 }}>利用規約とガイドラインに同意します</T>
      </Pressable>
      <Small>不適切な書き込みは一切許容されず、通報された内容は運営が確認します。</Small>
      <ErrorText>{err}</ErrorText>
      <Actions><Btn label="同意して農場へ" onPress={submit} disabled={!checked || busy} /></Actions>
    </Frame>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.moss },
  center: { alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 14 },
  card: {
    width: "100%",
    maxWidth: 440,
    alignSelf: "center",
    backgroundColor: C.mossSoft,
    borderColor: C.mossDeep,
    borderWidth: 3,
    borderRadius: 10,
    padding: 18,
  },
  nameInput: {
    width: "100%",
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontFamily: F.ui,
    fontSize: 16,
    borderColor: C.mossDeep,
    borderWidth: 2,
    borderRadius: 6,
    backgroundColor: C.paper,
    color: C.ink,
  },
  termHead: { fontSize: 15, color: C.leaf, marginBottom: 2 },
  termBody: { fontSize: 14, lineHeight: 22, color: C.soft },
  check: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
  box: { width: 26, height: 26, borderRadius: 4, borderWidth: 2, borderColor: C.mossDeep, backgroundColor: C.moss, alignItems: "center", justifyContent: "center" },
  boxOn: { backgroundColor: C.leaf },
  tick: { color: C.ink, fontSize: 16, lineHeight: 20 },
});
