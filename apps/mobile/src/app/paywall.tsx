import { router } from "expo-router";
import { Button } from "react-native";
import { Placeholder } from "@/components/Placeholder";
import { t } from "@/i18n";
import { colors } from "@/lib/theme";

/** FR-9: RevenueCat paywall (M6). Shown after the first real exchange. */
export default function PaywallScreen() {
  return (
    <Placeholder title={t.paywall.title} body={t.paywall.subtitle}>
      <Button title={t.paywall.cta} color={colors.accent} onPress={() => router.back()} />
    </Placeholder>
  );
}
