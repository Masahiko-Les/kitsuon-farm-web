import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useToast } from "@/components/toast";
import { Actions, Btn, Paper, Small, T } from "@/components/ui";
import { markReportsHandled } from "@/lib/cafe-api";
import { confirmDialog } from "@/lib/confirm";
import { dateText } from "@/lib/farm-api";
import {
  type Book, type EntryReportGroup, type LibraryTarget, type Note, type Review, SHELF_NAME, deleteEntry, loadBooksByStatus,
  loadEntryReports, loadReviewEntries, setBookStatus, setEntryStatus,
} from "@/lib/library";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

type Tab = "books" | "review" | "reports";

// 運営用：図書館の本の希望（村長の承認）、危機的な言葉を含む感想・ノート・希望、通報
export function LibraryAdmin() {
  const { isAdmin } = useFarm();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("books");
  const [pending, setPending] = useState<Book[] | null>(null);
  const [shelved, setShelved] = useState<Book[] | null>(null);
  const [review, setReview] = useState<{ books: Book[]; reviews: Review[]; notes: Note[] } | null>(null);
  const [reports, setReports] = useState<EntryReportGroup[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [p, pub, rb, entries, r] = await Promise.all([
        loadBooksByStatus("pending"), loadBooksByStatus("public"), loadBooksByStatus("review"), loadReviewEntries(), loadEntryReports(),
      ]);
      setPending(p); setShelved(pub); setReview({ books: rb, ...entries }); setReports(r);
    } catch (e) {
      console.error(e);
      setError("読み込めませんでした。0011 の SQL が実行されているか確認してください。");
      setPending([]); setShelved([]); setReview({ books: [], reviews: [], notes: [] }); setReports([]);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(t);
  }, [isAdmin, load]);

  const reload = () => { setPending(null); setShelved(null); setReview(null); setReports(null); void load(); };

  const decideBook = async (b: Book, status: "public" | "private") => {
    if (status === "private" && b.status === "public"
      && !(await confirmDialog({ message: `『${b.title}』を棚から外しますか？`, ok: "外す", destructive: true }))) return;
    setBusy(b.id);
    try {
      await setBookStatus(b.id, status);
      setPending((cur) => cur?.filter((x) => x.id !== b.id) ?? null);
      setReview((cur) => (cur ? { ...cur, books: cur.books.filter((x) => x.id !== b.id) } : cur));
      setShelved((cur) => {
        const rest = cur?.filter((x) => x.id !== b.id) ?? [];
        return status === "public" ? [...rest, { ...b, status }] : rest;
      });
      toast(status === "public" ? "承認しました。本棚に並びます。" : b.status === "public" ? "棚から外しました。" : "承認しませんでした。");
    } catch (e) {
      console.error(e);
      toast("変えられませんでした。");
    }
    setBusy(null);
  };

  // 要確認の感想・ノート：確かめたら hidden のまま閉じる（ほかの村人には出さない）
  const settleEntry = async (type: LibraryTarget, id: string) => {
    setBusy(id);
    try {
      await setEntryStatus(type, id, "hidden");
      setReview((cur) => cur ? {
        ...cur,
        reviews: cur.reviews.filter((x) => x.id !== id),
        notes: cur.notes.filter((x) => x.id !== id),
      } : cur);
      toast("確認済みにしました。");
    } catch (e) {
      console.error(e);
      toast("変えられませんでした。");
    }
    setBusy(null);
  };

  const settleReport = async (g: EntryReportGroup, action: "ok" | "hidden" | "delete") => {
    if (action === "delete" && !(await confirmDialog({ message: "削除しますか？　元には戻せません。", ok: "削除する", destructive: true }))) return;
    setBusy(g.targetId);
    try {
      const exists = g.review || g.note;
      if (exists && action === "hidden") await setEntryStatus(g.type, g.targetId, "hidden");
      if (exists && action === "delete") await deleteEntry(g.type, g.targetId);
      await markReportsHandled(g.reportIds);
      setReports((cur) => cur?.filter((x) => x.targetId !== g.targetId) ?? null);
      toast(action === "ok" ? "問題なしにしました。" : action === "hidden" ? "非公開にしました。" : "削除しました。");
    } catch (e) {
      console.error(e);
      toast("処理できませんでした。");
    }
    setBusy(null);
  };

  if (!isAdmin) return <View style={s.center}><Small>この画面は運営だけが使えます。</Small></View>;

  const loading = pending === null || shelved === null || review === null || reports === null;
  const reviewCount = review ? review.books.length + review.reviews.length + review.notes.length : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={s.tabs}>
        <TabBtn label={`本の希望${pending ? `（${pending.length}）` : ""}`} on={tab === "books"} onPress={() => setTab("books")} />
        <TabBtn label={`要確認${review ? `（${reviewCount}）` : ""}`} on={tab === "review"} onPress={() => setTab("review")} />
        <TabBtn label={`通報${reports ? `（${reports.length}）` : ""}`} on={tab === "reports"} onPress={() => setTab("reports")} />
      </View>
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.leaf} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.wrap}>
          {error ? <T style={s.error}>{error}</T> : null}
          {tab === "books" ? (
            <>
              <Small>司書に届いた「並べたい本」の希望です。承認すると、その棚に並びます（理由は名前を出さずに紹介として載ります）。</Small>
              {pending.length === 0 ? <T style={s.empty}>承認待ちの希望はありません。</T> : null}
              {pending.map((b) => (
                <View key={b.id} style={s.item}>
                  <T style={s.meta}>{`${SHELF_NAME[b.shelf]}　${dateText(b.createdAt)}`}</T>
                  <T style={s.title}>{`『${b.title}』${b.author ? `　${b.author}` : ""}`}</T>
                  {b.about ? <Paper text={b.about} minLines={2} /> : null}
                  <Actions>
                    <Btn kind="quiet" label="承認しない" onPress={() => decideBook(b, "private")} disabled={busy === b.id} />
                    <Btn label="承認する" onPress={() => decideBook(b, "public")} disabled={busy === b.id} />
                  </Actions>
                </View>
              ))}
              <T style={s.head}>村人の希望で並んでいる本</T>
              {shelved.length === 0 ? <T style={s.empty}>まだありません。</T> : null}
              {shelved.map((b) => (
                <View key={b.id} style={s.item}>
                  <T style={s.meta}>{SHELF_NAME[b.shelf]}</T>
                  <T style={s.title}>{`『${b.title}』${b.author ? `　${b.author}` : ""}`}</T>
                  <Actions><Btn kind="quiet" label="棚から外す" onPress={() => decideBook(b, "private")} disabled={busy === b.id} /></Actions>
                </View>
              ))}
            </>
          ) : tab === "review" ? (
            <>
              <Small>危機的な言葉を含む感想・ノート・本の希望です。ほかの村人には出ていません。本人には相談窓口を案内しています。匿名のため、運営から本人に連絡することはできません。</Small>
              {reviewCount === 0 ? <T style={s.empty}>要確認のものはありません。</T> : null}
              {review.books.map((b) => (
                <View key={b.id} style={s.item}>
                  <T style={s.meta}>{`本の希望　${dateText(b.createdAt)}`}</T>
                  <T style={s.title}>{`『${b.title}』${b.author ? `　${b.author}` : ""}`}</T>
                  {b.about ? <Paper text={b.about} minLines={2} /> : null}
                  <Actions>
                    <Btn kind="quiet" label="確認済みにする" onPress={() => decideBook(b, "private")} disabled={busy === b.id} />
                    <Btn label="承認する" onPress={() => decideBook(b, "public")} disabled={busy === b.id} />
                  </Actions>
                </View>
              ))}
              {review.reviews.map((r) => (
                <View key={r.id} style={s.item}>
                  <T style={s.meta}>{`感想　${dateText(r.createdAt)}`}</T>
                  <Paper text={r.text} minLines={2} />
                  <Actions><Btn label="確認済みにする" onPress={() => settleEntry("libraryReview", r.id)} disabled={busy === r.id} /></Actions>
                </View>
              ))}
              {review.notes.map((n) => (
                <View key={n.id} style={s.item}>
                  <T style={s.meta}>{`ノート　${dateText(n.createdAt)}`}</T>
                  <Paper text={n.quote} minLines={1} />
                  {n.feeling ? <Paper text={n.feeling} minLines={1} /> : null}
                  <Actions><Btn label="確認済みにする" onPress={() => settleEntry("libraryNote", n.id)} disabled={busy === n.id} /></Actions>
                </View>
              ))}
            </>
          ) : (
            <>
              <Small>図書館の感想とノートへの通報です（24時間以内に確認する）。</Small>
              {reports.length === 0 ? <T style={s.empty}>未確認の通報はありません。</T> : null}
              {reports.map((g) => {
                const exists = g.review || g.note;
                return (
                  <View key={g.targetId} style={s.item}>
                    <T style={s.badge}>{`${g.type === "libraryReview" ? "感想" : "ノート"}への通報 ${g.reportIds.length}件`}</T>
                    {g.review ? <><T style={s.meta}>{`『${g.bookTitle ?? "（棚から外れた本）"}』`}</T><Paper text={g.review.text} minLines={2} /></> : null}
                    {g.note ? <><Paper text={g.note.quote} minLines={1} />{g.note.feeling ? <Paper text={g.note.feeling} minLines={1} /> : null}</> : null}
                    {!exists ? <Small>すでに削除されています。</Small> : null}
                    <Actions>
                      <Btn kind="quiet" label="問題なし" onPress={() => settleReport(g, "ok")} disabled={busy === g.targetId} />
                      {exists && (g.review ?? g.note)!.status === "ok"
                        ? <Btn kind="quiet" label="非公開にする" onPress={() => settleReport(g, "hidden")} disabled={busy === g.targetId} />
                        : null}
                      {exists ? <Btn label="削除する" onPress={() => settleReport(g, "delete")} disabled={busy === g.targetId} /> : null}
                    </Actions>
                  </View>
                );
              })}
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
  head: { fontSize: 16, marginTop: 24 },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: { flex: 1, borderWidth: 2, borderColor: C.mossDeep, borderRadius: 6, paddingVertical: 8, backgroundColor: C.mossSoft },
  tabOn: { backgroundColor: C.leaf },
  tabText: { fontSize: 14, textAlign: "center" },
  item: { backgroundColor: C.mossSoft, borderColor: C.mossDeep, borderWidth: 2, borderRadius: 8, padding: 12, marginTop: 14 },
  meta: { fontSize: 12, color: C.sub, marginBottom: 6 },
  title: { fontSize: 16, marginBottom: 6 },
  badge: { alignSelf: "flex-start", fontSize: 12, color: "#fff", backgroundColor: C.mail, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 8, overflow: "hidden" },
});
