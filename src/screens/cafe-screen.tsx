import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { type ComponentRef, useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GUEST_LOOKS } from "@/components/animals";
import { CafeScene } from "@/components/cafe-scene";
import { useToast } from "@/components/toast";
import { Actions, Btn, ErrorText, LinkBtn, Links, Paper, PaperInput, Small, T } from "@/components/ui";
import { REACTIONS, type ReactionId, THEMES, type Theme } from "@/lib/cafe";
import {
  CAFE_HIDDEN_KEY, type CafeSeries, type Voice, canReact, loadSeries, newSessionId, reportAnswer, saveAnswer, sendReaction, setSeriesStatus, voicesFor,
} from "@/lib/cafe-api";
import { confirmDialog } from "@/lib/confirm";
import { checkText } from "@/lib/text";
import { useActions } from "@/modals";
import { useFarm } from "@/state/farm";
import { C, F } from "@/theme";

type Step =
  | { kind: "themes" }
  | { kind: "ask"; theme: Theme; index: number }
  | { kind: "voices"; theme: Theme; index: number; answered: boolean; voices: Voice[]; at: number }
  | { kind: "end"; theme: Theme; entries: Entry[]; crisis: boolean };

// この会話で残した言葉
type Entry = { id: string; question: string; text: string };
type Session = { id: string; entries: Entry[]; crisis: boolean; series: CafeSeries[] | null };
const newSession = (): Session => ({ id: newSessionId(), entries: [], crisis: false, series: null });

/* ---------- 通報して隠した回答（端末に保存） ---------- */
function useHiddenAnswers() {
  const [hidden, setHidden] = useState(new Set<string>());
  useEffect(() => {
    AsyncStorage.getItem(CAFE_HIDDEN_KEY)
      .then((v) => { if (v) setHidden(new Set(JSON.parse(v))); })
      .catch(() => {});
  }, []);
  const hide = useCallback((id: string) => {
    setHidden((prev) => {
      const next = new Set(prev).add(id);
      AsyncStorage.setItem(CAFE_HIDDEN_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);
  return { hidden, hide };
}

export function CafeScreen() {
  const { uid } = useFarm();
  const insets = useSafeAreaInsets();
  const { hidden, hide } = useHiddenAnswers();
  const [step, setStep] = useState<Step>({ kind: "themes" });
  // 1回の会話（3問1シリーズ）の記録。隣に座る村人は会話のあいだ同じにする
  const session = useRef<Session | null>(null);
  // 左隣に座っている村人（カフェにいるあいだは同じ）
  const [leftGuest] = useState(() => GUEST_LOOKS[Math.floor(Math.random() * GUEST_LOOKS.length)]);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  // キーボードが出たら、情景とマスターの名札を上へ送って、書く場所を広くする
  const scrollBox = useRef({ head: 0, view: 0, content: 0 });
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      const { head, view, content } = scrollBox.current;
      scroll.current?.scrollTo({ y: Math.max(0, Math.min(head, content - view)), animated: true });
    });
    return () => sub.remove();
  }, []);

  const go = (next: Step) => {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  const startTheme = (theme: Theme) => {
    session.current = newSession();
    go({ kind: "ask", theme, index: 0 });
  };

  const showVoices = async (theme: Theme, index: number, answered: boolean) => {
    const cur = session.current;
    if (!cur) return;
    cur.series ??= await loadSeries(theme.id, uid, hidden);
    go({ kind: "voices", theme, index, answered, voices: voicesFor(theme.questions[index].id, cur.series), at: 0 });
  };

  const nextQuestion = (theme: Theme, index: number) => {
    if (index + 1 < theme.questions.length) go({ kind: "ask", theme, index: index + 1 });
    else go({ kind: "end", theme, entries: session.current?.entries ?? [], crisis: session.current?.crisis ?? false });
  };

  const voice = step.kind === "voices" ? step.voices[step.at] : null;
  const speakerName = voice
    ? (voice.sample ? "お手本（運営が用意した言葉）" : "隣の席の村人")
    : "マスター（ふくろう）";

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 44 : 0}
    >
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => { scrollBox.current.view = e.nativeEvent.layout.height; }}
        onContentSizeChange={(_, h) => { scrollBox.current.content = h; }}
      >
        <View onLayout={(e) => { scrollBox.current.head = e.nativeEvent.layout.height; }}>
          <CafeScene
            left={leftGuest}
            neighbor={step.kind === "voices" && voice ? GUEST_LOOKS[step.at % GUEST_LOOKS.length] : null}
            talking={voice ? "neighbor" : "master"}
            height={step.kind === "ask" ? 120 : 150}
          />
          <View style={s.nameplate}><T style={s.nameText}>{speakerName}</T></View>
        </View>
        <View style={s.body}>
          {step.kind === "themes" ? <ThemeStep onPick={startTheme} /> : null}
          {step.kind === "ask" ? (
            <AskStep
              key={`${step.theme.id}-${step.index}`}
              theme={step.theme}
              index={step.index}
              onSave={async (text) => {
                const res = checkText(text);
                // 危機的な言葉があるときは、NGワードや連絡先では止めない（review で保存し、誰にも届かない）
                if (res.error && !(res.crisis && res.filtered)) return { error: res.error, crisis: res.crisis };
                const cur = session.current;
                if (!cur) return {};
                const q = step.theme.questions[step.index];
                if (uid && uid !== "offline") {
                  try {
                    const id = await saveAnswer({
                      uid, sessionId: cur.id, themeId: step.theme.id, questionId: q.id,
                      text: text.trim(), status: res.crisis ? "review" : "draft",
                    });
                    cur.entries.push({ id, question: q.text, text: text.trim() });
                  } catch (e) {
                    console.error(e);
                    return { error: "言葉を残せませんでした。通信を確認して、もう一度押してください。", crisis: res.crisis };
                  }
                }
                if (res.crisis) cur.crisis = true;
                await showVoices(step.theme, step.index, true);
                return { crisis: res.crisis };
              }}
              onSkip={() => showVoices(step.theme, step.index, false)}
            />
          ) : null}
          {step.kind === "voices" ? (
            <VoicesStep
              step={step}
              onMore={() => go({ ...step, at: step.at + 1 })}
              onNext={() => nextQuestion(step.theme, step.index)}
              onReported={(id) => {
                hide(id);
                // 通報した人には、その村人の続きの言葉も出さない
                const cur = session.current;
                if (cur?.series) cur.series = cur.series.filter((x) => !x.answers.some((a) => a.id === id));
                const rest = step.voices.filter((v) => v.key !== id);
                if (rest.length === 0) nextQuestion(step.theme, step.index);
                else go({ ...step, voices: rest, at: Math.min(step.at, rest.length - 1) });
              }}
            />
          ) : null}
          {step.kind === "end" ? <EndStep step={step} onAgain={() => go({ kind: "themes" })} /> : null}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ---------- マスターのことば ---------- */
function Speech({ children }: { children: string }) {
  return (
    <Animated.View entering={FadeIn.duration(300)} style={s.speech}>
      <T style={s.speechText}>{children}</T>
    </Animated.View>
  );
}

/* ---------- テーマを選ぶ ---------- */
function ThemeStep({ onPick }: { onPick: (t: Theme) => void }) {
  return (
    <>
      <Speech>{"いらっしゃい。今日はどんなお話をしますか？\n話したいテーマを選んでください。"}</Speech>
      <View style={s.themes}>
        {THEMES.map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="button"
            onPress={() => onPick(t)}
            style={({ pressed }) => [s.theme, pressed && s.themePressed]}
          >
            <T style={s.themeTitle}>{t.title}</T>
            <T style={s.themeDesc}>{t.description}</T>
            {t.gentle ? <T style={s.themeGentle}>{t.gentle}</T> : null}
          </Pressable>
        ))}
      </View>
      <Small>質問はいつでもスキップできます。3つの質問すべてに答えて、届けてもよいと選んだ言葉だけが、運営の確認のあとで未来の村人に届きます。</Small>
      <Links>
        <LinkBtn label="わたしの言葉を見る" onPress={() => router.push("/cafe-mine")} />
      </Links>
    </>
  );
}

/* ---------- 質問に答える ---------- */
function AskStep({ theme, index, onSave, onSkip }: {
  theme: Theme;
  index: number;
  onSave: (text: string) => Promise<{ error?: string; crisis?: boolean }>;
  onSkip: () => Promise<void>;
}) {
  const a = useActions();
  const text = useRef("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const q = theme.questions[index];

  const submit = async () => {
    setBusy(true);
    setErr("");
    const res = await onSave(text.current);
    // 保存できなかったときも、相談窓口は必ず出す
    if (res.crisis) a.showSupport(res.error ? "unsaved" : "cafe");
    if (res.error) { setErr(res.error); setBusy(false); }
  };
  const skip = async () => {
    setBusy(true);
    await onSkip();
  };

  return (
    <>
      {index === 0 ? <Speech>{theme.lead}</Speech> : null}
      <View style={s.question}>
        <T style={s.qCount}>{`${theme.title}　質問 ${index + 1} / ${theme.questions.length}`}</T>
        <T style={s.qText}>{q.text}</T>
      </View>
      <PaperInput placeholder="思ったことを、自由に書いてみてください" onChangeText={(t) => { text.current = t; }} />
      <ErrorText>{err}</ErrorText>
      <Actions>
        <Btn kind="quiet" label="答えずに次へ" onPress={skip} disabled={busy} />
        <Btn label="こたえる" onPress={submit} disabled={busy} />
      </Actions>
    </>
  );
}

/* ---------- ほかの村人の言葉にふれる ---------- */
function VoicesStep({ step, onMore, onNext, onReported }: {
  step: Extract<Step, { kind: "voices" }>;
  onMore: () => void;
  onNext: () => void;
  onReported: (id: string) => void;
}) {
  const { uid } = useFarm();
  const toast = useToast();
  const [sent, setSent] = useState<Record<string, ReactionId>>({});
  const v = step.voices[step.at];
  const last = step.index + 1 >= step.theme.questions.length;

  const lead = step.at > 0
    ? "隣の席に、また別の村人が座りました。この方の言葉も、聞いてみましょうか。"
    : step.answered
      ? "話してくれて、ありがとうございます。隣の席の村人も、同じ質問にこんな言葉を残していますよ。"
      : "答えなくても大丈夫ですよ。隣の席の村人の言葉を、そっと置いておきますね。";

  const react = async (kind: ReactionId) => {
    if (!v?.answer) return;
    const prev = sent[v.key];
    setSent({ ...sent, [v.key]: kind });
    try {
      await sendReaction(uid, v.answer, kind);
      toast("気持ちを、そっと届けました。");
    } catch (e) {
      console.error(e);
      setSent((cur) => {
        const next = { ...cur };
        if (prev) next[v.key] = prev; else delete next[v.key];
        return next;
      });
      toast("届けられませんでした。通信を確認してください。");
    }
  };

  const report = async () => {
    if (!v?.answer) return;
    const id = v.key;
    const ok = await confirmDialog({
      message: "この言葉を通報しますか？　あなたの画面からは見えなくなり、運営が確認します。",
      ok: "通報する",
      destructive: true,
    });
    if (!ok) return;
    try { await reportAnswer(uid, id); } catch (e) { console.error(e); }
    toast("通報しました。運営が確認します。");
    onReported(id);
  };

  return (
    <>
      <Speech>{lead}</Speech>
      {v ? (
        <Animated.View key={v.key} entering={FadeIn.duration(400)}>
          <T style={s.qSmall}>{`「${step.theme.questions[step.index].text}」`}</T>
          {v.sample ? (
            <View style={s.sampleTag}>
              <T style={s.sampleText}>これは運営が用意したお手本の言葉です。実際の村人の言葉ではありません。</T>
            </View>
          ) : null}
          <Paper text={v.text} from={v.sample ? "お手本（運営）" : "村人より"} />
          {v.answer && canReact(v.answer) ? (
            <>
              <T style={s.reactLead}>読んで感じた気持ちを、そっと届けられます（書いた人にだけ届きます）</T>
              <View style={s.reactions}>
                {REACTIONS.map((r) => {
                  const on = sent[v.key] === r.id;
                  return (
                    <Pressable
                      key={r.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => react(r.id)}
                      style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.8 }]}
                    >
                      <T style={[s.chipText, on && { color: C.ink }]}>{r.label}</T>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
          {v.answer ? <Links><LinkBtn label="この言葉を通報する" onPress={report} /></Links> : null}
        </Animated.View>
      ) : null}
      <Actions>
        {step.at + 1 < step.voices.length ? <Btn kind="quiet" label="ほかの村人の言葉も読む" onPress={onMore} /> : null}
        <Btn label={last ? "会話をおえる" : "次の質問へ"} onPress={onNext} />
      </Actions>
    </>
  );
}

/* ---------- 会話のおわり ---------- */
function EndStep({ step, onAgain }: { step: Extract<Step, { kind: "end" }>; onAgain: () => void }) {
  const toast = useToast();
  const [decided, setDecided] = useState<"shared" | "kept" | null>(null);
  const [busy, setBusy] = useState(false);
  const full = step.entries.length === step.theme.questions.length && !step.crisis;

  const decide = async (share: boolean) => {
    setBusy(true);
    try {
      await setSeriesStatus(step.entries.map((e) => e.id), share ? "pending" : "private");
      setDecided(share ? "shared" : "kept");
    } catch (e) {
      console.error(e);
      toast("変えられませんでした。通信を確認してください。");
    }
    setBusy(false);
  };

  // 3問そろったら、3つまとめて届けるかどうかを聞く
  if (full && !decided) {
    return (
      <>
        <Speech>{"今日は、ゆっくり話してくれてありがとうございました。\nこの3つの言葉を、ひとまとまりで未来の村人に届けてもよいですか？"}</Speech>
        {step.entries.map((e) => (
          <View key={e.id} style={s.entry}>
            <T style={s.qSmall}>{`「${e.question}」`}</T>
            <Paper text={e.text} minLines={2} />
          </View>
        ))}
        <T style={s.consentSub}>名前は出ません。運営が確認してから、3つまとめて届きます。あとから「わたしの言葉」で取り消せます。</T>
        <Actions>
          <Btn kind="quiet" label="自分だけにしておく" onPress={() => decide(false)} disabled={busy} />
          <Btn label="届けてもよい" onPress={() => decide(true)} disabled={busy} />
        </Actions>
      </>
    );
  }

  const lines = full ? [] : ["今日は、ゆっくり話してくれてありがとうございました。"];
  if (step.entries.length > 0) lines.push("あなたの言葉は、ここに大切にしまっておきますね。");
  if (step.entries.length > 0 && !full && !step.crisis) lines.push("未来の村人に届けられるのは、3つの質問すべてに答えたときです。");
  if (decided === "shared") lines.push("運営が確認したあと、未来の村人のもとへ届きます。きっと、誰かの支えになります。");
  lines.push("また、いつでも寄ってくださいね。");
  return (
    <>
      <Speech>{lines.join("\n")}</Speech>
      <Actions>
        <Btn kind="quiet" label="ほかのテーマで話す" onPress={onAgain} />
        <Btn label="カフェにもどる" onPress={() => router.back()} />
      </Actions>
      <Links><LinkBtn label="わたしの言葉を見る" onPress={() => router.push("/cafe-mine")} /></Links>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.moss },
  nameplate: { backgroundColor: C.mossDeep, paddingVertical: 4, paddingHorizontal: 14 },
  nameText: { fontSize: 13, color: C.leaf },
  body: { padding: 16, width: "100%", maxWidth: 480, alignSelf: "center" },
  speech: {
    backgroundColor: C.mossSoft,
    borderColor: C.mossDeep,
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  speechText: { fontSize: 15, lineHeight: 24 },
  themes: { gap: 8 },
  theme: {
    backgroundColor: C.paper,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.mossDeep,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  themePressed: { transform: [{ translateY: 2 }], opacity: 0.9 },
  themeTitle: { fontSize: 16, color: C.ink },
  themeDesc: { fontSize: 14, lineHeight: 21, color: "#4a4338", marginTop: 6 },
  themeGentle: { fontSize: 12, lineHeight: 18, color: "#6b6254", marginTop: 4 },
  question: { marginBottom: 10 },
  qCount: { fontSize: 13, color: C.sub, marginBottom: 4 },
  qText: { fontFamily: F.letterBold, fontSize: 18, lineHeight: 28, color: C.text },
  qSmall: { fontSize: 13, lineHeight: 20, color: C.sub, marginBottom: 8 },
  consentSub: { fontSize: 12, lineHeight: 18, color: C.sub, marginTop: 10 },
  entry: { marginBottom: 12 },
  sampleTag: { backgroundColor: "#e2c15a", borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 8 },
  sampleText: { fontSize: 12, lineHeight: 18, color: C.ink },
  reactLead: { fontSize: 13, lineHeight: 20, color: C.sub, marginTop: 12, marginBottom: 6 },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 2, borderColor: C.soft, borderRadius: 16, paddingVertical: 5, paddingHorizontal: 12 },
  chipOn: { backgroundColor: C.leaf, borderColor: C.leaf },
  chipText: { fontSize: 14 },
});
