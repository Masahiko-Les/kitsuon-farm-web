import { FarmScreen } from "@/screens/farm-screen";
import { LoadingScreen, NameScreen, TermsAgreeScreen } from "@/screens/onboarding";
import { useFarm } from "@/state/farm";

// 名前登録 → 規約同意 → 農場マップ
export default function Index() {
  const { phase, errorMessage } = useFarm();
  if (phase === "error") return <LoadingScreen message={errorMessage} />;
  if (phase === "name") return <NameScreen />;
  if (phase === "terms") return <TermsAgreeScreen />;
  if (phase === "ready") return <FarmScreen />;
  return <LoadingScreen />;
}
