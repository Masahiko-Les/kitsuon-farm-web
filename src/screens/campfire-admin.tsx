import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useToast } from "@/components/toast";
import { Actions, Btn, Paper, Small, T } from "@/components/ui";
import { markReportsHandled } from "@/lib/cafe-api";
import {
  type FireMessage, type FireReportGroup, agoText, deleteFireMessage, loadFireReports, loadFireReview, setFireStatus,
} from "@/lib/campfire";
import { confirmDialog } from "@/lib/confirm";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

type Tab = "review" | "reports";

// 運営用：焚き火のひとことの、要確認（危機的な言葉）と通報。ひとことは7日たつと消える（0012）
export function CampfireAdmin() {
  const { isAdmin } = useFarm();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("reports");
  const [review, setReview] = useState<FireMessage[] | null>(null);
  const [reports, setReports] = useState<FireReportGroup[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [v, r] = await Promise.all([loadFireReview(), loadFireReports()]);
      setReview(v); setReports(r);
    } catch (e) {
      console.error(e);
      setError("読み込めませんでした。0012 の SQL が実行されているか確認してください。");
      setReview([]); setReports([]);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [isAdmin, load]);

  const reload = () => { setReview(null); setReports(null); void load(); };

  const settleReview = async (m: FireMessage) => {
    setBusy(m.id);
    try {
      await setFireStatus(m.id, "hidden");
      setReview((cur) => cur?.filter((x) => x.id !== m.id) ?? null);
      toast("確認済みにしました。");
    } catch (e) { console.error(e); toast("変えられませんでした。"); }
    setBusy(null);
  };

  const settle = async (g: FireReportGroup, action: "ok" | "hidden" | "delete") => {
    if (action === "delete" && !(await confirmDialog({ message: "このひとことを削除しますか？　元には戻せません。", ok: "削除する", destructive: true }))) return;
    setBusy(g.targetId);
    try {
      if (g.message && action === "hidden") await setFireStatus(g.targetId, "hidden");
      if (g.message && action === "delete") await deleteFireMessage(g.targetId);
      await markReportsHandled(g.reportIds);
      setReports((cur) => cur?.filter((x) => x.targetId !== g.targetId) ?? null);
      toast(action === "ok" ? "問題なしにしました。" : action === "hidden" ? "非公開にしました。" : "削除しました。");
    } catch (e) { console.error(e); toast("処理できませんでした。"); }
    setBusy(null);
  };

  if (!isAdmin) return <View style={s.center}><Small>この画面は運営だけが使えます。</Small></View>;

  const loading = review === null || reports === null;
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabs}>
        <TabBtn label={`通報${reports ? `（${reports.length}）` : ""}`} on={tab === "reports"} onPress={() => setTab("reports")} />
        <TabBtn label={`要確認${review ? `（${review.length}）` : ""}`} on={tab === "review"} onPress={() => setTab("review")} />
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.leaf} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.wrap}>
          {error ? <T style={s.error}>{error}</T> : null}
          {tab === "reports" ? (
            <>
              <Small>焚き火のひとことへの通報です（24時間以内に確認する）。ひとことは村人には24時間で見えなくなり、7日たつと消えます。</Small>
              {reports.length === 0 ? <T style={s.empty}>未確認の通報はありません。</T> : null}
              {reports.map((g) => (
                <View key={g.targetId} style={s.item}>
                  <T style={s.badge}>{`通報 ${g.reportIds.length}件`}</T>
                  {g.message ? <><T style={s.meta}>{agoText(g.message.createdAt)}</T><Paper text={g.message.text} minLines={1} /></> : <Small>すでに消えています。</Small>}
                  <Actions>
                    <Btn kind="quiet" label="問題なし" onPress={() => settle(g, "ok")} disabled={busy === g.targetId} />
                    {g.message?.status === "ok" ? <Btn kind="quiet" label="非公開にする" onPress={() => settle(g, "hidden")} disabled={busy === g.targetId} /> : null}
                    {g.message ? <Btn label="削除する" onPress={() => settle(g, "delete")} disabled={busy === g.targetId} /> : null}
                  </Actions>
                </View>
              ))}
            </>
          ) : (
            <>
              <Small>危機的な言葉を含むひとことです。ほかの村人には出ていません。本人には相談窓口を案内しています。匿名のため、運営から本人に連絡することはできません。</Small>
              {review.length === 0 ? <T style={s.empty}>要確認のひとことはありません。</T> : null}
              {review.map((m) => (
                <View key={m.id} style={s.item}>
                  <T style={s.meta}>{agoText(m.createdAt)}</T>
                  <Paper text={m.text} minLines={1} />
                  <Actions><Btn label="確認済みにする" onPress={() => settleReview(m)} disabled={busy === m.id} /></Actions>
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
  meta: { fontSize: 12, color: C.sub, marginBottom: 6 },
  badge: { alignSelf: "flex-start", fontSize: 12, color: "#fff", backgroundColor: C.mail, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 8, overflow: "hidden" },
});
