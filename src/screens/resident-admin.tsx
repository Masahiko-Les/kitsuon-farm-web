import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { ResidentCardView } from "@/components/resident-card";
import { useToast } from "@/components/toast";
import { Actions, Btn, Small, T } from "@/components/ui";
import { markReportsHandled } from "@/lib/cafe-api";
import { type CardReportGroup, type ResidentCard, loadCardReports, loadReviewCards, setCardStatus } from "@/lib/resident-api";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

type Tab = "review" | "reports";

// 運営用：住民票の要確認（危機的な言葉）と通報
export function ResidentAdmin() {
  const { isAdmin } = useFarm();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("review");
  const [review, setReview] = useState<ResidentCard[] | null>(null);
  const [reports, setReports] = useState<CardReportGroup[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [v, r] = await Promise.all([loadReviewCards(), loadCardReports()]);
      setReview(v); setReports(r);
    } catch (e) {
      console.error(e);
      setError("読み込めませんでした。0008 の SQL が実行されているか確認してください。");
      setReview([]); setReports([]);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [isAdmin, load]);

  const reload = () => { setReview(null); setReports(null); void load(); };

  const decide = async (card: ResidentCard, status: "ok" | "hidden") => {
    setBusy(card.uid);
    try {
      await setCardStatus(card.uid, status);
      setReview((cur) => cur?.filter((x) => x.uid !== card.uid) ?? null);
      toast(status === "ok" ? "公開してよいことにしました。" : "非公開にしました。");
    } catch (e) {
      console.error(e);
      toast("変えられませんでした。");
    }
    setBusy(null);
  };

  const settle = async (g: CardReportGroup, action: "ok" | "hidden") => {
    setBusy(g.targetId);
    try {
      if (g.card && action === "hidden") await setCardStatus(g.card.uid, "hidden");
      await markReportsHandled(g.reportIds);
      setReports((cur) => cur?.filter((x) => x.targetId !== g.targetId) ?? null);
      toast(action === "ok" ? "問題なしにしました。" : "非公開にしました。");
    } catch (e) {
      console.error(e);
      toast("処理できませんでした。");
    }
    setBusy(null);
  };

  if (!isAdmin) return <View style={s.center}><Small>この画面は運営だけが使えます。</Small></View>;

  const loading = review === null || reports === null;
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabs}>
        <TabBtn label={`要確認${review ? `（${review.length}）` : ""}`} on={tab === "review"} onPress={() => setTab("review")} />
        <TabBtn label={`通報${reports ? `（${reports.length}）` : ""}`} on={tab === "reports"} onPress={() => setTab("reports")} />
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.leaf} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.wrap}>
          {error ? <T style={s.error}>{error}</T> : null}
          {tab === "review" ? (
            <>
              <Small>ほかの村人に見せることを選んだ住民票のうち、危機的な言葉を含むものです。いまはほかの村人に見えていません。本人には相談窓口を案内しています。</Small>
              {review.length === 0 ? <T style={s.empty}>要確認の住民票はありません。</T> : null}
              {review.map((c) => (
                <View key={c.uid} style={s.item}>
                  <ResidentCardView card={c} />
                  <Actions>
                    <Btn kind="quiet" label="非公開にする" onPress={() => decide(c, "hidden")} disabled={busy === c.uid} />
                    <Btn label="公開してよい" onPress={() => decide(c, "ok")} disabled={busy === c.uid} />
                  </Actions>
                </View>
              ))}
            </>
          ) : (
            <>
              <Small>住民票への通報です（24時間以内に確認する）。非公開にすると、本人が直しても非公開のままです。</Small>
              {reports.length === 0 ? <T style={s.empty}>未確認の通報はありません。</T> : null}
              {reports.map((g) => (
                <View key={g.targetId} style={s.item}>
                  <T style={s.badge}>{`通報 ${g.reportIds.length}件`}</T>
                  {g.card ? <ResidentCardView card={g.card} /> : <Small>この住民票は、消されたか、本人だけが読める状態になっています。</Small>}
                  <Actions>
                    <Btn kind="quiet" label="問題なし" onPress={() => settle(g, "ok")} disabled={busy === g.targetId} />
                    {g.card && g.card.status !== "hidden"
                      ? <Btn label="非公開にする" onPress={() => settle(g, "hidden")} disabled={busy === g.targetId} />
                      : null}
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
  badge: { alignSelf: "flex-start", fontSize: 12, color: "#fff", backgroundColor: C.mail, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 8, overflow: "hidden" },
});
