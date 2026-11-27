import { Stack } from "expo-router";
import { BrainSection, VoiceSection } from "@/brain/BrainSettings";
import { t } from "@/i18n";
import { FieldGroup } from "@/me/parts";
import { Screen } from "@/ui";

/** Advanced: Zaki's brain on the phone and voice typing, on builds that have them. */
export default function AdvancedScreen() {
  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: t.lay.me.advanced }} />
      <FieldGroup title={t.brain.title}>
        <BrainSection />
      </FieldGroup>
      <FieldGroup title={t.voice.title}>
        <VoiceSection />
      </FieldGroup>
    </Screen>
  );
}
