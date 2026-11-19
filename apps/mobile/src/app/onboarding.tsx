import { router } from "expo-router";
import { Button } from "react-native";
import { Placeholder } from "@/components/Placeholder";
import { t } from "@/i18n";
import { colors } from "@/lib/theme";

/** F1: language pick + sign-in (M5). No tutorial screens — the friend opens the chat. */
export default function OnboardingScreen() {
  return (
    <Placeholder title={t.onboarding.title} body={t.settings.aiDisclosure}>
      <Button title={t.onboarding.start} color={colors.accent} onPress={() => router.replace("/")} />
    </Placeholder>
  );
}
