import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useToast } from "@/components/toast";
import { Actions, Btn, Paper, Small, T } from "@/components/ui";
import { questionById } from "@/lib/cafe";
import {
  type AnswerGroup, type CafeAnswer, type CafeReport, adminRetireSeries, groupSeries, loadOpenReports, loadPending, loadReview, markReportsHandled, setSeriesStatus,
} from "@/lib/cafe-api";
import { confirmDialog } from "@/lib/confirm";
import { dateText, millis } from "@/lib/farm-api";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

type Tab = "pending" | "review" | "reports";
type ReportGroup = { answer: CafeAnswer | null; targetId: string; reports: CafeReport[] };

// 運営用：カフェの言葉の承認と、通報の確認
export function CafeAdmin() {
  const { isAdmin } = useFarm();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<AnswerGroup[] | null>(null);
  const [review, setReview] = useState<CafeAnswer[] | null>(null);
  const [reports, setReports] = useState<ReportGroup[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // 処理中の回答ID

  const fetchAll = useCallback(async () => {
    const [p, v, r] = await Promise.all([loadPending(), loadReview(), loadOpenReports()]);
    return {
      v: v.sort((a, b) => millis(a.createdAt) - millis(b.createdAt)),
      p: groupSeries(p.sort((a, b) => millis(a.createdAt) - millis(b.createdAt))), // 古いものから
      r,
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    fetchAll()
      .then(({ p, v, r }) => { if (alive) { setPending(p); setReview(v); setReports(r); } })
      .catch((e) => {
        console.error(e);
        if (alive) { setError("読み込めませんでした。ルールが反映されているか確認してください。"); setPending([]); setReview([]); setReports([]); }
      });
    return () => { alive = false; };
  }, [isAdmin, fetchAll]);

  const reload = async () => {
    setPending(null);
    setReview(null);
    setReports(null);
    setError("");
    try {
      const { p, v, r } = await fetchAll();
      setPending(p);
      setReview(v);
      setReports(r);
    } catch (e) {
      console.error(e);
      setError("読み込めませんでした。");
      setPending([]);
      setReview([]);
      setReports([]);
    }
  };

  /* ---------- 承認待ち ---------- */
  const decide = async (g: AnswerGroup, status: "public" | "private") => {
    setBusy(g.sessionId);
    try {
      await setSeriesStatus(g.answers.map((a) => a.id), status);
      setPending((cur) => cur?.filter((x) => x.sessionId !== g.sessionId) ?? null);
      toast(status === "public" ? "承認しました。ほかの村人に届きます。" : "承認しませんでした。3つとも本人だけの言葉になります。");
    } catch (e) {
      console.error(e);
      toast("変えられませんでした。");
    }
    setBusy(null);
  };

  /* ---------- 要確認 ---------- */
  const confirmReview = async (a: CafeAnswer) => {
    setBusy(a.id);
    try {
      await setSeriesStatus([a.id], "private");
      setReview((cur) => cur?.filter((x) => x.id !== a.id) ?? null);
      toast("確認済みにしました。本人だけの言葉になります。");
    } catch (e) {
      console.error(e);
      toast("変えられませんでした。");
    }
    setBusy(null);
  };

  /* ---------- 通報 ---------- */
  const settle = async (g: ReportGroup, action: "ok" | "private" | "delete") => {
    const run = async () => {
      setBusy(g.targetId);
      try {
        if (g.answer && action !== "ok") await adminRetireSeries(g.answer, action === "delete");
        await markReportsHandled(g.reports.map((r) => r.id));
        setReports((cur) => cur?.filter((x) => x.targetId !== g.targetId) ?? null);
        toast(action === "ok" ? "問題なしにしました。" : action === "private" ? "シリーズを非公開にしました。" : "削除して、シリーズを非公開にしました。");
      } catch (e) {
        console.error(e);
        toast("処理できませんでした。");
      }
      setBusy(null);
    };
    if (action === "delete") {
      const ok = await confirmDialog({
        message: "この言葉を削除しますか？　元には戻せません。同じ会話のほかの言葉は非公開になります。",
        ok: "削除する",
        destructive: true,
      });
      if (ok) await run();
    } else {
      await run();
    }
  };

  if (!isAdmin) {
    return <View style={s.center}><Small>この画面は運営だけが使えます。</Small></View>;
  }

  const loading = pending === null || review === null || reports === null;
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabs}>
        <TabBtn label={`承認待ち${pending ? `（${pending.length}）` : ""}`} on={tab === "pending"} onPress={() => setTab("pending")} />
        <TabBtn label={`要確認${review ? `（${review.length}）` : ""}`} on={tab === "review"} onPress={() => setTab("review")} />
        <TabBtn label={`通報${reports ? `（${reports.length}）` : ""}`} on={tab === "reports"} onPress={() => setTab("reports")} />
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.leaf} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.wrap}>
          {error ? <T style={s.error}>{error}</T> : null}
          {tab === "pending" ? (
            <>
              <Small>「届けてもよい」を選んだ、3問1シリーズの言葉です。承認すると、同じテーマで話すほかの村人に、名前を出さずに紹介されます。1つでも問題があれば、シリーズ全体を承認しないでください。</Small>
              {pending.length === 0 ? <T style={s.empty}>承認待ちの言葉はありません。</T> : null}
              {pending.map((g) => (
                <View key={g.sessionId} style={s.item}>
                  {g.answers.map((a) => <AnswerHead key={a.id} a={a} />)}
                  {g.complete ? null : <Small>3問そろっていないため、承認できません。</Small>}
                  <Actions>
                    <Btn kind="quiet" label="シリーズを承認しない" onPress={() => decide(g, "private")} disabled={busy === g.sessionId} />
                    {g.complete ? <Btn label="シリーズを承認する" onPress={() => decide(g, "public")} disabled={busy === g.sessionId} /> : null}
                  </Actions>
                </View>
              ))}
            </>
          ) : tab === "review" ? (
            <>
              <Small>危機的な言葉を含む言葉です。ほかの村人には届いていません。本人には相談窓口を案内しています。匿名のため、運営から本人に連絡することはできません。</Small>
              {review.length === 0 ? <T style={s.empty}>要確認の言葉はありません。</T> : null}
              {review.map((a) => (
                <View key={a.id} style={s.item}>
                  <AnswerHead a={a} />
                  <Actions>
                    <Btn label="確認済みにする" onPress={() => confirmReview(a)} disabled={busy === a.id} />
                  </Actions>
                </View>
              ))}
            </>
          ) : (
            <>
              <Small>カフェの言葉への通報です（24時間以内に確認する）。非公開や削除をすると、同じシリーズの言葉もまとめて届かなくなります。</Small>
              {reports.length === 0 ? <T style={s.empty}>未確認の通報はありません。</T> : null}
              {reports.map((g) => (
                <View key={g.targetId} style={s.item}>
                  <T style={s.badge}>{`通報 ${g.reports.length}件`}</T>
                  {g.answer ? <AnswerHead a={g.answer} /> : <Small>この言葉はすでに削除されています。</Small>}
                  <Actions>
                    <Btn kind="quiet" label="問題なし" onPress={() => settle(g, "ok")} disabled={busy === g.targetId} />
                    {g.answer && g.answer.status !== "private"
                      ? <Btn kind="quiet" label="シリーズを非公開にする" onPress={() => settle(g, "private")} disabled={busy === g.targetId} />
                      : null}
                    {g.answer ? <Btn label="削除する" onPress={() => settle(g, "delete")} disabled={busy === g.targetId} /> : null}
                  </Actions>
                </View>
              ))}
            </>
          )}
          <View style={{ marginTop: 8 }}><Btn kind="quiet" label="読み込み直す" onPress={reload} /></View>
        </ScrollView>
      )}
    </View>
  );
}

function AnswerHead({ a }: { a: CafeAnswer }) {
  const q = questionById(a.questionId);
  return (
    <>
      <T style={s.meta}>{`${q ? q.theme.title : a.themeId}　${dateText(a.createdAt)}`}</T>
      <T style={s.question}>{q ? q.question.text : a.questionId}</T>
      <Paper text={a.text} minLines={2} />
    </>
  );
}

function TabBtn({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={onPress} style={[s.tab, on && s.tabOn]}>
      <T style={[s.tabText, on && { color: C.ink }]}>{label}</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 16, width: "100%", maxWidth: 480, alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  error: { color: C.error, marginBottom: 12 },
  empty: { fontSize: 15, color: C.soft, marginVertical: 20, textAlign: "center" },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: { flex: 1, borderWidth: 2, borderColor: C.mossDeep, borderRadius: 6, paddingVertical: 8, backgroundColor: C.mossSoft },
  tabOn: { backgroundColor: C.leaf },
  tabText: { fontSize: 14, textAlign: "center" },
  item: { backgroundColor: C.mossSoft, borderColor: C.mossDeep, borderWidth: 2, borderRadius: 8, padding: 12, marginTop: 14 },
  meta: { fontSize: 12, color: C.sub },
  question: { fontSize: 15, lineHeight: 22, marginTop: 2, marginBottom: 8 },
  badge: { alignSelf: "flex-start", fontSize: 12, color: "#fff", backgroundColor: C.mail, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 8, overflow: "hidden" },
});
