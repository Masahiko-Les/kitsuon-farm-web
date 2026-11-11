import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useToast } from "@/components/toast";
import { Actions, Btn, Paper, Small, T } from "@/components/ui";
import { markReportsHandled } from "@/lib/cafe-api";
import { confirmDialog } from "@/lib/confirm";
import { type DevIdea, type IdeaReportGroup, deleteIdea, loadIdeaReports, loadIdeasByStatus, setIdeaStatus } from "@/lib/dev-api";
import { dateText } from "@/lib/farm-api";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

type Tab = "pending" | "review" | "reports";

// 運営用：開発局のアイデアの承認と、通報の確認
export function DevAdmin() {
  const { isAdmin } = useFarm();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("pending");
  const [pending, setPending] = useState<DevIdea[] | null>(null);
  const [review, setReview] = useState<DevIdea[] | null>(null);
  const [reports, setReports] = useState<IdeaReportGroup[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [p, v, r] = await Promise.all([loadIdeasByStatus("pending"), loadIdeasByStatus("review"), loadIdeaReports()]);
      setPending(p); setReview(v); setReports(r);
    } catch (e) {
      console.error(e);
      setError("読み込めませんでした。0006 の SQL が実行されているか確認してください。");
      setPending([]); setReview([]); setReports([]);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    // 読み込みが終わってから一覧を入れる（描画中に状態を変えない）
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [isAdmin, load]);

  const reload = () => { setPending(null); setReview(null); setReports(null); void load(); };

  const decide = async (idea: DevIdea, status: "public" | "private") => {
    setBusy(idea.id);
    try {
      await setIdeaStatus(idea.id, status);
      setPending((cur) => cur?.filter((x) => x.id !== idea.id) ?? null);
      setReview((cur) => cur?.filter((x) => x.id !== idea.id) ?? null);
      toast(status === "public" ? "承認しました。黒板に並びます。" : "承認しませんでした。黒板には出ません。");
    } catch (e) {
      console.error(e);
      toast("変えられませんでした。");
    }
    setBusy(null);
  };

  const settle = async (g: IdeaReportGroup, action: "ok" | "private" | "delete") => {
    if (action === "delete" && !(await confirmDialog({ message: "このアイデアを削除しますか？　元には戻せません。", ok: "削除する", destructive: true }))) return;
    setBusy(g.targetId);
    try {
      if (g.idea && action === "private") await setIdeaStatus(g.idea.id, "private");
      if (g.idea && action === "delete") await deleteIdea(g.idea.id);
      await markReportsHandled(g.reportIds);
      setReports((cur) => cur?.filter((x) => x.targetId !== g.targetId) ?? null);
      toast(action === "ok" ? "問題なしにしました。" : action === "private" ? "黒板から外しました。" : "削除しました。");
    } catch (e) {
      console.error(e);
      toast("処理できませんでした。");
    }
    setBusy(null);
  };

  if (!isAdmin) return <View style={s.center}><Small>この画面は運営だけが使えます。</Small></View>;

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
              <Small>開発局で村人が伝えたアイデアです。承認すると、名前を出さずに開発局の黒板に並びます。</Small>
              {pending.length === 0 ? <T style={s.empty}>承認待ちのアイデアはありません。</T> : null}
              {pending.map((i) => (
                <View key={i.id} style={s.item}>
                  <T style={s.meta}>{dateText(i.createdAt)}</T>
                  <Paper text={i.text} minLines={2} />
                  <Actions>
                    <Btn kind="quiet" label="承認しない" onPress={() => decide(i, "private")} disabled={busy === i.id} />
                    <Btn label="承認する" onPress={() => decide(i, "public")} disabled={busy === i.id} />
                  </Actions>
                </View>
              ))}
            </>
          ) : tab === "review" ? (
            <>
              <Small>危機的な言葉を含むアイデアです。黒板には出ていません。本人には相談窓口を案内しています。匿名のため、運営から本人に連絡することはできません。</Small>
              {review.length === 0 ? <T style={s.empty}>要確認のアイデアはありません。</T> : null}
              {review.map((i) => (
                <View key={i.id} style={s.item}>
                  <T style={s.meta}>{dateText(i.createdAt)}</T>
                  <Paper text={i.text} minLines={2} />
                  <Actions><Btn label="確認済みにする" onPress={() => decide(i, "private")} disabled={busy === i.id} /></Actions>
                </View>
              ))}
            </>
          ) : (
            <>
              <Small>黒板のアイデアへの通報です（24時間以内に確認する）。</Small>
              {reports.length === 0 ? <T style={s.empty}>未確認の通報はありません。</T> : null}
              {reports.map((g) => (
                <View key={g.targetId} style={s.item}>
                  <T style={s.badge}>{`通報 ${g.reportIds.length}件`}</T>
                  {g.idea ? <Paper text={g.idea.text} minLines={2} /> : <Small>このアイデアはすでに削除されています。</Small>}
                  <Actions>
                    <Btn kind="quiet" label="問題なし" onPress={() => settle(g, "ok")} disabled={busy === g.targetId} />
                    {g.idea && g.idea.status === "public"
                      ? <Btn kind="quiet" label="黒板から外す" onPress={() => settle(g, "private")} disabled={busy === g.targetId} />
                      : null}
                    {g.idea ? <Btn label="削除する" onPress={() => settle(g, "delete")} disabled={busy === g.targetId} /> : null}
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
  meta: { fontSize: 12, color: C.sub, marginBottom: 6 },
  badge: { alignSelf: "flex-start", fontSize: 12, color: "#fff", backgroundColor: C.mail, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 8, overflow: "hidden" },
});
