import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import { useToast } from "@/components/toast";
import { Actions, Btn, Paper, Small, T } from "@/components/ui";
import { REACTIONS, questionById, themeById } from "@/lib/cafe";
import {
  type AnswerGroup, type CafeAnswer, type CafeReaction, type CafeStatus, deleteSeries, groupSeries, loadMyAnswers, loadReactionsToMe, setSeriesStatus,
} from "@/lib/cafe-api";
import { confirmDialog } from "@/lib/confirm";
import { millis } from "@/lib/farm-api";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

const STATUS_TEXT: Record<CafeStatus, string> = {
  draft: "あなただけの言葉です。ほかの村人には届きません。",
  pending: "運営の確認待ちです。確認のあと、未来の村人に届きます。",
  public: "未来の村人に届いています。",
  private: "あなただけの言葉です。ほかの村人には届きません。",
  review: "確認中のため、ほかの村人には届きません。",
};

// シリーズの中の言葉の状態が分かれているときは、いちばん強いものを見せる
const seriesStatus = (g: AnswerGroup): CafeStatus =>
  (["review", "public", "pending", "draft", "private"] as const).find((st) => g.answers.some((a) => a.status === st)) ?? "private";

// わたしの言葉：自分が残した回答と、届いた気持ちを静かに読み返す
export function CafeMine() {
  const { uid } = useFarm();
  const toast = useToast();
  const offline = !uid || uid === "offline";
  const [answers, setAnswers] = useState<CafeAnswer[] | null>(offline ? [] : null);
  const [reactions, setReactions] = useState<CafeReaction[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (offline) return;
    let alive = true;
    Promise.all([loadMyAnswers(uid), loadReactionsToMe(uid)])
      .then(([a, r]) => {
        if (!alive) return;
        setAnswers(a.sort((x, y) => millis(y.createdAt) - millis(x.createdAt)));
        setReactions(r);
      })
      .catch((e) => {
        console.error(e);
        if (!alive) return;
        setError("読み込めませんでした。通信を確認してください。");
        setAnswers([]);
      });
    return () => { alive = false; };
  }, [uid, offline]);

  const hide = async (g: AnswerGroup) => {
    const ids = g.answers.filter((a) => a.status === "pending" || a.status === "public").map((a) => a.id);
    const ok = await confirmDialog({
      message: "この会話の言葉を非公開にしますか？　ほかの村人には届かなくなります。もう一度公開することはできません。",
      ok: "非公開にする",
    });
    if (!ok) return;
    try {
      await setSeriesStatus(ids, "private");
      setAnswers((cur) => cur?.map((x) => (ids.includes(x.id) ? { ...x, status: "private" } : x)) ?? null);
      toast("非公開にしました。");
    } catch (e) {
      console.error(e);
      toast("変えられませんでした。通信を確認してください。");
    }
  };

  const remove = async (g: AnswerGroup) => {
    const ids = g.answers.map((a) => a.id);
    const ok = await confirmDialog({
      message: "この会話の言葉をすべて削除しますか？　元には戻せません。",
      ok: "削除する",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteSeries(ids);
      setAnswers((cur) => cur?.filter((x) => !ids.includes(x.id)) ?? null);
      toast("削除しました。");
    } catch (e) {
      console.error(e);
      toast("削除できませんでした。通信を確認してください。");
    }
  };

  if (answers === null) {
    return <View style={s.center}><ActivityIndicator color={C.leaf} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      {error ? <T style={s.error}>{error}</T> : null}
      {answers.length === 0 && !error ? (
        <Small>まだ言葉は残されていません。カフェでマスターと話してみましょう。</Small>
      ) : null}
      {groupSeries(answers).map((g) => {
        const status = seriesStatus(g);
        return (
          <View key={g.sessionId} style={s.item}>
            <T style={s.theme}>{themeById(g.answers[0].themeId)?.title ?? ""}</T>
            {g.answers.map((a) => {
              const got = reactions.filter((r) => r.answerId === a.id);
              const kinds = REACTIONS.filter((r) => got.some((x) => x.kind === r.id)).map((r) => `「${r.label}」`);
              return (
                <View key={a.id} style={s.answer}>
                  <T style={s.question}>{questionById(a.questionId)?.question.text ?? ""}</T>
                  <Paper text={a.text} minLines={2} />
                  {kinds.length > 0 ? (
                    <View style={s.gift}>
                      <T style={s.giftText}>{`あなたの言葉を読んだ村人から、${kinds.join("")}という気持ちが届いています。`}</T>
                    </View>
                  ) : null}
                </View>
              );
            })}
            <View style={s.status}><Small>{STATUS_TEXT[status]}</Small></View>
            <Actions>
              {status === "pending" || status === "public" ? <Btn kind="quiet" label="非公開にする" onPress={() => hide(g)} /> : null}
              <Btn kind="quiet" label="削除する" onPress={() => remove(g)} />
            </Actions>
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, width: "100%", maxWidth: 480, alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: C.error, marginBottom: 12 },
  item: {
    backgroundColor: C.mossSoft,
    borderColor: C.mossDeep,
    borderWidth: 2,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  theme: { fontSize: 12, color: C.sub },
  answer: { marginTop: 10 },
  question: { fontSize: 15, lineHeight: 22, marginBottom: 8 },
  status: { marginTop: 10 },
  gift: { backgroundColor: C.mossDeep, borderRadius: 6, padding: 10, marginTop: 10 },
  giftText: { fontSize: 14, lineHeight: 22, color: C.leaf },
});
