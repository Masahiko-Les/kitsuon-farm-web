import { ScrollView } from "react-native";

import { TermsBody } from "@/screens/onboarding";

export default function Terms() {
  return (
    <ScrollView contentContainerStyle={{ padding: 18, width: "100%", maxWidth: 480, alignSelf: "center" }}>
      <TermsBody />
    </ScrollView>
  );
}
