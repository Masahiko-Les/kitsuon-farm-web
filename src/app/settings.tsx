import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useToast } from "@/components/toast";
import { Small, T } from "@/components/ui";
import { confirmDialog } from "@/lib/confirm";
import { useFarm } from "@/state/farm";
import { C } from "@/theme";

export default function Settings() {
  const { deleteAllData, uid, isAdmin } = useFarm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    const ok = await confirmDialog({
      title: "すべてのデータを削除",
      message: "あなたが蒔いた種、送った手紙・届いた手紙、花、カフェの言葉、村人名をすべて消し、アカウントも削除します。元には戻せません。",
      ok: "削除する",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      // 農場から開いたときは農場へ戻る。URL を直接開いたときは、トップ（名前登録）へ移る
      if (router.canDismiss()) router.dismissAll();
      else router.replace("/");
      await deleteAllData();
      toast("すべてのデータを削除しました。");
    } catch (e) {
      setBusy(false);
      toast("削除できませんでした。通信を確認して、もう一度試してください。");
      console.error(e);
    }
  };

  return (
    <ScrollView contentContainerStyle={s.wrap}>
      <Row label="あそびかた" onPress={() => router.push("/help")} />
      <Row label="利用規約" onPress={() => router.push("/terms")} />
      <Row label="運営への連絡" onPress={() => router.push("/contact")} />
      {isAdmin ? (
        <>
          <View style={{ height: 24 }} />
          <Row label="運営：カフェの言葉の確認" onPress={() => router.push("/cafe-admin")} />
          <Row label="運営：開発局のアイデアの確認" onPress={() => router.push("/dev-admin")} />
          <Row label="運営：住民票の確認" onPress={() => router.push("/resident-admin")} />
          <Row label="運営：図書館の確認" onPress={() => router.push("/library-admin")} />
        </>
      ) : null}
      <View style={{ height: 24 }} />
      <Row label="すべてのデータを削除" danger onPress={confirmDelete} disabled={busy} />
      <Small>自分の種・手紙・花・カフェの言葉・開発局のアイデア・住民票・村人名を消し、匿名アカウントも削除します。</Small>
      <View style={{ height: 32 }} />
      <Small>村人ID（運営に問い合わせるときに使います。選択してコピーできます）</Small>
      <T selectable style={s.uid}>{uid}</T>
    </ScrollView>
  );
}

function Row({ label, onPress, danger, disabled }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: C.mossDeep }, disabled && { opacity: 0.5 }]}
    >
      <T style={[s.label, danger && { color: C.error }]}>{label}</T>
      <T style={s.chev}>›</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  wrap: { padding: 14, width: "100%", maxWidth: 480, alignSelf: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.mossSoft,
    borderColor: C.mossDeep,
    borderWidth: 2,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  label: { fontSize: 16 },
  chev: { fontSize: 20, color: C.sub },
  uid: { fontSize: 12, color: C.sub, marginTop: 4 },
});
