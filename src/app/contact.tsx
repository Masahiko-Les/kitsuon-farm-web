import { Linking, Pressable, ScrollView } from "react-native";

import { Body, SectionLabel, Small, T } from "@/components/ui";
import { OPERATOR, SUPPORT_NOTE } from "@/lib/safety";
import { SupportList } from "@/modals";
import { C } from "@/theme";

export default function Contact() {
  return (
    <ScrollView contentContainerStyle={{ padding: 18, width: "100%", maxWidth: 480, alignSelf: "center" }}>
      <Body>困ったこと、気になる書き込み、ご意見は、運営までお知らせください。</Body>
      <SectionLabel>運営</SectionLabel>
      <Body>{OPERATOR.name}</Body>
      <Pressable onPress={() => Linking.openURL(`mailto:${OPERATOR.email}`)} accessibilityRole="link">
        <T style={{ fontSize: 16, color: C.leaf, textDecorationLine: "underline" }}>{OPERATOR.email}</T>
      </Pressable>
      <Small>通報は24時間以内に確認します。</Small>

      <SectionLabel>つらいときの相談窓口</SectionLabel>
      <SupportList />
      <Small>{SUPPORT_NOTE}</Small>
    </ScrollView>
  );
}
