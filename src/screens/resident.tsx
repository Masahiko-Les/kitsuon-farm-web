import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { goBack } from "@/components/app-header";
import { ResidentCardView } from "@/components/resident-card";
import { useToast } from "@/components/toast";
import { Actions, Body, Btn, ErrorText, LinkBtn, Links, SectionLabel, Small, T } from "@/components/ui";
import { confirmDialog } from "@/lib/confirm";
import {
  type CardInput, NOTE_FIELDS, NOTE_MAX, type NoteKey, RESIDENT_HIDDEN_KEY, type ResidentCard, SOUND_ROWS, STUTTER_TYPES,
  WORDS_MAX, WORD_MAX, deleteMyCard, emptyCard, hasContent, loadCard, loadMyCard, loadPublicCards, reportCard, saveMyCard,
} from "@/lib/resident-api";
import { checkText } from "@/lib/text";
import { useActions } from "@/modals";
import { useFarm } from "@/state/farm";
import { C, F, LINE_H } from "@/theme";

const offlineOf = (uid: string) => !uid || uid === "offline";

/* =========================================================
   わたしの住民票
   ========================================================= */
export function ResidentMine() {
  const { uid } = useFarm();
  const offline = offlineOf(uid);
  const [card, setCard] = useState<ResidentCard | null | undefined>(offline ? null : undefined);
  const [error, setError] = useState("");

  // 書いて戻ってきたときにも読み直す
  useFocusEffect(useCallback(() => {
    if (offline) return;
    let alive = true;
    loadMyCard(uid)
      .then((c) => { if (alive) { setCard(c); setError(""); } })
      .catch((e) => {
        console.error(e);
        if (alive) { setCard(null); setError("読み込めませんでした。0008 の SQL が実行されているか、通信を確認してください。"); }
      });
    return () => { alive = false; };
  }, [uid, offline]));

  if (card === undefined) return <Loading />;
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {offline ? <Small>おためしモードでは住民票を書けません。</Small> : null}
      {card ? (
        <>
          <T style={s.status}>{statusText(card)}</T>
          <ResidentCardView card={card} />
          <Actions>
            <Btn label="住民票を直す" onPress={() => router.push("/resident-edit")} />
          </Actions>
        </>
      ) : !offline && !error ? (
        <>
          <Body>まだ住民票がありません。</Body>
          <Body>住民票には、自己紹介や、自分の吃音のことを書いておけます。どの項目も、書かなくてかまいません。</Body>
          <Actions><Btn label="住民票を書く" onPress={() => router.push("/resident-edit")} /></Actions>
        </>
      ) : null}
      <Links><LinkBtn label="村人の住民票を見る" onPress={() => router.push("/residents")} /></Links>
    </ScrollView>
  );
}

function statusText(c: ResidentCard) {
  if (c.status === "hidden") return "運営の確認により、ほかの村人には見えません。";
  if (!c.isPublic) return "あなただけが読めます。ほかの村人には見えません。";
  if (c.status === "review") return "確認中のため、ほかの村人には見えません。";
  return "ほかの村人も読めます。";
}

/* =========================================================
   住民票を書く・直す
   ========================================================= */
export function ResidentEdit() {
  const { uid } = useFarm();
  const offline = offlineOf(uid);
  const [initial, setInitial] = useState<CardInput | null>(offline ? emptyCard() : null);
  const [exists, setExists] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (offline) return;
    let alive = true;
    loadMyCard(uid)
      .then((c) => { if (alive) { setInitial(c ?? emptyCard()); setExists(!!c); } })
      .catch((e) => {
        console.error(e);
        if (alive) { setLoadError("読み込めませんでした。通信を確認して、開き直してください。"); }
      });
    return () => { alive = false; };
  }, [uid, offline]);

  if (loadError) return <View style={s.center}><ErrorText>{loadError}</ErrorText></View>;
  if (!initial) return <Loading />;
  return <EditForm initial={initial} exists={exists} offline={offline} />;
}

function EditForm({ initial, exists, offline }: { initial: CardInput; exists: boolean; offline: boolean }) {
  const { uid } = useFarm();
  const a = useActions();
  const toast = useToast();
  // 日本語入力が崩れないよう、文章の欄は value を渡さずに控えておく
  const notes = useRef<Record<NoteKey, string>>(
    Object.fromEntries(NOTE_FIELDS.map((f) => [f.key, initial[f.key]])) as Record<NoteKey, string>,
  );
  const [isPublic, setPublic] = useState(initial.isPublic);
  const [types, setTypes] = useState<string[]>(initial.stutterTypes);
  const [sounds, setSounds] = useState<string[]>(initial.difficultSounds);
  const [words, setWords] = useState<string[]>(initial.difficultWords);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const save = async () => {
    let crisis = false;
    for (const f of NOTE_FIELDS) {
      const t = notes.current[f.key];
      if (!t.trim()) continue;
      const res = checkText(t, 0, null);
      crisis ||= res.crisis;
      if (res.error) { setErr(`「${f.label}」：${res.error}`); return; }
    }
    if (words.length) {
      const res = checkText(words.join("\n"), 0, null);
      crisis ||= res.crisis;
      if (res.error) { setErr(`「言いにくい言葉」：${res.error}`); return; }
    }
    const card: CardInput = { ...notes.current, isPublic, stutterTypes: types, difficultSounds: sounds, difficultWords: words };
    if (!hasContent(card) && !exists) { setErr("何か1つ書くか、選んでから保存してください。"); return; }
    setErr("");
    setBusy(true);
    try {
      // 公開を選んでいて危機的な言葉があるときは、運営が確認するまで誰にも見せない
      await saveMyCard(uid, card, crisis && isPublic ? "review" : "ok");
      goBack("resident-edit");
      if (crisis) a.showSupport(isPublic ? "resident" : "residentPrivate");
      else toast("住民票を保存しました。");
    } catch (e) {
      console.error(e);
      setBusy(false);
      setErr("保存できませんでした。通信を確認して、もう一度押してください。");
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ message: "住民票を消しますか？　元には戻せません。", ok: "消す", destructive: true }))) return;
    setBusy(true);
    try {
      await deleteMyCard(uid);
      goBack("resident-edit");
      toast("住民票を消しました。");
    } catch (e) {
      console.error(e);
      setBusy(false);
      setErr("消せませんでした。通信を確認して、もう一度押してください。");
    }
  };

  const [first, second, ...rest] = NOTE_FIELDS;
  return (
    <ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
      <Small>どの項目も、書かなくてかまいません。名前は村人名がそのまま入ります。</Small>
      {[first, second].map((f) => (
        <NoteInput key={f.key} label={`${f.label}（任意）`} placeholder={f.placeholder} initial={initial[f.key]}
          onChange={(t) => { notes.current[f.key] = t; }} />
      ))}

      <SectionLabel>吃音のタイプ（複数選択可）</SectionLabel>
      <View style={s.pills}>
        {STUTTER_TYPES.map((t) => (
          <Choice key={t} label={t} on={types.includes(t)} onPress={() => toggle(types, setTypes, t)} style={s.pill} />
        ))}
      </View>

      <SectionLabel>言いにくい音（複数選択可）</SectionLabel>
      <View style={s.sounds}>
        {SOUND_ROWS.map((row) => (
          <View key={row.join("")} style={s.soundRow}>
            {row.map((k) => (
              <Choice key={k} label={k} on={sounds.includes(k)} onPress={() => toggle(sounds, setSounds, k)} style={s.kana} />
            ))}
          </View>
        ))}
      </View>

      <WordsInput words={words} setWords={setWords} />

      {rest.map((f) => (
        <NoteInput key={f.key} label={`${f.label}（任意）`} placeholder={f.placeholder} initial={initial[f.key]}
          onChange={(t) => { notes.current[f.key] = t; }} />
      ))}

      <SectionLabel>見せる相手</SectionLabel>
      <Choice label={isPublic ? "☑ ほかの村人に見せる" : "☐ ほかの村人に見せる"} on={isPublic} onPress={() => setPublic(!isPublic)} style={s.publicBtn} />
      <Small>
        {isPublic
          ? "村役場の「村人の住民票」に並び、ほかの村人が読めます。名前は村人名で出ます。連絡先は書けません。"
          : "あなただけが読めます。ほかの村人には見えません。"}
      </Small>

      <ErrorText>{err}</ErrorText>
      <Actions>
        {exists ? <Btn kind="quiet" label="住民票を消す" onPress={remove} disabled={busy || offline} /> : null}
        <Btn kind="quiet" label="やめる" onPress={() => goBack("resident-edit")} disabled={busy} />
        <Btn label={busy ? "保存中…" : "保存する"} onPress={save} disabled={busy || offline} />
      </Actions>
      {offline ? <Small>おためしモードでは保存できません。</Small> : null}
    </ScrollView>
  );
}

function NoteInput({ label, placeholder, initial, onChange }: {
  label: string; placeholder: string; initial: string; onChange: (t: string) => void;
}) {
  const [len, setLen] = useState([...initial].length);
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <TextInput
        multiline
        defaultValue={initial}
        placeholder={placeholder}
        placeholderTextColor="#9b9384"
        accessibilityLabel={label}
        onChangeText={(t) => { setLen([...t].length); onChange(t); }}
        textAlignVertical="top"
        style={s.note}
      />
      <T style={[s.counter, len > NOTE_MAX && { color: C.over }]}>{`${len} / ${NOTE_MAX}文字`}</T>
    </>
  );
}

function WordsInput({ words, setWords }: { words: string[]; setWords: (w: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [inputKey, setInputKey] = useState(0); // 追加したら作り直して欄を空にする（日本語入力のため value は渡さない）
  const add = () => {
    const w = draft.trim();
    setDraft("");
    setInputKey((k) => k + 1);
    if (!w || words.includes(w)) return;
    if ([...w].length > WORD_MAX) { setErr(`1つ${WORD_MAX}文字までです。`); return; }
    if (words.length >= WORDS_MAX) { setErr(`${WORDS_MAX}個までです。`); return; }
    setErr("");
    setWords([...words, w]);
  };
  return (
    <>
      <SectionLabel>言いにくい言葉（任意・複数追加可）</SectionLabel>
      <View style={s.wordRow}>
        <TextInput
          key={inputKey}
          autoFocus={inputKey > 0}
          defaultValue=""
          placeholder="例：ありがとう"
          placeholderTextColor="#9b9384"
          accessibilityLabel="言いにくい言葉"
          onChangeText={setDraft}
          onSubmitEditing={add}
          submitBehavior="submit"
          style={s.wordInput}
        />
        <Btn kind="quiet" label="追加" onPress={add} />
      </View>
      {err ? <ErrorText>{err}</ErrorText> : null}
      {words.length > 0 ? (
        <View style={s.chips}>
          {words.map((w) => (
            <Pressable key={w} accessibilityRole="button" accessibilityLabel={`${w} を消す`}
              onPress={() => setWords(words.filter((x) => x !== w))} style={s.chip}>
              <T style={s.chipText}>{`${w}　×`}</T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </>
  );
}

function Choice({ label, on, onPress, style }: { label: string; on: boolean; onPress: () => void; style?: object }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={onPress}
      style={[s.choice, style, on && s.choiceOn]}>
      <T style={[s.choiceText, on && { color: C.ink }]}>{label}</T>
    </Pressable>
  );
}

/* =========================================================
   村人の住民票（公開を選んだ人だけ）
   ========================================================= */
async function loadHidden(): Promise<Set<string>> {
  try { const v = await AsyncStorage.getItem(RESIDENT_HIDDEN_KEY); return new Set(v ? JSON.parse(v) : []); } catch { return new Set(); }
}

export function ResidentList() {
  const { uid, blocked } = useFarm();
  const offline = offlineOf(uid);
  const [cards, setCards] = useState<ResidentCard[] | null>(offline ? [] : null);
  const [error, setError] = useState("");

  useFocusEffect(useCallback(() => {
    if (offline) return;
    let alive = true;
    Promise.all([loadPublicCards(), loadHidden()])
      .then(([list, hidden]) => {
        if (alive) setCards(list.filter((c) => !blocked.has(c.uid) && !hidden.has(c.uid) && hasContent(c)));
      })
      .catch((e) => {
        console.error(e);
        if (alive) { setCards([]); setError("読み込めませんでした。通信を確認してください。"); }
      });
    return () => { alive = false; };
  }, [offline, blocked]));

  if (cards === null) return <Loading />;
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Small>住民票を「ほかの村人に見せる」にした村人です。</Small>
      {error ? <ErrorText>{error}</ErrorText> : null}
      {cards.length === 0 && !error ? <T style={s.empty}>まだ誰もいません。</T> : null}
      <View style={s.list}>
        {cards.map((c) => (
          <Pressable key={c.uid} accessibilityRole="button"
            onPress={() => router.push({ pathname: "/resident-view", params: { uid: c.uid } })}
            style={({ pressed }) => [s.item, pressed && { backgroundColor: C.mossSoft }]}>
            <T style={s.itemName}>{c.uid === uid ? `${c.villagerName}（あなた）` : c.villagerName}</T>
            {c.stutterTypes.length > 0 ? <T style={s.itemSub}>{c.stutterTypes.join("・")}</T> : null}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

/* =========================================================
   村人の住民票を読む
   ========================================================= */
export function ResidentView() {
  const { uid: me } = useFarm();
  const { uid } = useLocalSearchParams<{ uid?: string }>();
  const toast = useToast();
  const [card, setCard] = useState<ResidentCard | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid || offlineOf(me)) return;
    let alive = true;
    loadCard(uid).then((c) => { if (alive) setCard(c); }).catch((e) => { console.error(e); if (alive) setCard(null); });
    return () => { alive = false; };
  }, [uid, me]);

  const report = async () => {
    if (!card) return;
    const ok = await confirmDialog({
      message: "この住民票を運営に通報しますか？　通報すると、あなたの画面からは見えなくなります。",
      ok: "通報する",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await reportCard(me, card.uid);
      const hidden = await loadHidden();
      hidden.add(card.uid);
      await AsyncStorage.setItem(RESIDENT_HIDDEN_KEY, JSON.stringify([...hidden])).catch(() => {});
      toast("通報しました。運営が確認します。");
      goBack("resident-view");
    } catch (e) {
      console.error(e);
      setBusy(false);
      toast("通報できませんでした。通信を確認してください。");
    }
  };

  if (!uid || offlineOf(me) || card === null) {
    return <View style={s.center}><Small>この住民票は読めません。</Small></View>;
  }
  if (card === undefined) return <Loading />;
  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <ResidentCardView card={card} />
      {card.uid !== me ? <Links><LinkBtn label={busy ? "通報中…" : "この住民票を通報する"} onPress={report} /></Links> : null}
    </ScrollView>
  );
}

function Loading() {
  return <View style={s.center}><ActivityIndicator color={C.leaf} /></View>;
}

const s = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 40, width: "100%", maxWidth: 480, alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  status: { fontSize: 14, color: C.sub, marginBottom: 10 },
  empty: { fontSize: 15, color: C.soft, marginVertical: 20, textAlign: "center" },
  note: {
    backgroundColor: C.paper, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 6,
    fontFamily: F.letter, fontSize: 16, lineHeight: LINE_H, color: C.ink, minHeight: LINE_H * 3 + 12,
  },
  counter: { marginTop: 4, fontSize: 12, textAlign: "right", color: C.sub },
  choice: { borderWidth: 2, borderColor: C.mossDeep, borderRadius: 6, backgroundColor: C.mossSoft, alignItems: "center", justifyContent: "center" },
  choiceOn: { backgroundColor: C.leaf },
  choiceText: { fontSize: 15 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { paddingVertical: 7, paddingHorizontal: 14 },
  sounds: { gap: 4 },
  soundRow: { flexDirection: "row", gap: 4 },
  kana: { width: 40, height: 36 },
  publicBtn: { paddingVertical: 10, alignSelf: "flex-start", paddingHorizontal: 14 },
  wordRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  wordInput: {
    flex: 1, minWidth: 0, backgroundColor: C.paper, borderRadius: 4, paddingHorizontal: 12, paddingVertical: 8,
    fontFamily: F.letter, fontSize: 16, color: C.ink,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  chip: { backgroundColor: C.mossSoft, borderColor: C.mossDeep, borderWidth: 2, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  chipText: { fontSize: 14 },
  list: { gap: 8, marginTop: 10 },
  item: { backgroundColor: C.moss, borderColor: C.mossDeep, borderWidth: 2, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12 },
  itemName: { fontSize: 16 },
  itemSub: { fontSize: 12, color: C.sub, marginTop: 2 },
});
