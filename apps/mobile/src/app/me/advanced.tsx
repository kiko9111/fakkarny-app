import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { BrainSection, VoiceSection, showBrainSettings } from "@/brain/BrainSettings";
import { dateLocale, t } from "@/i18n";
import { runningUpdate, updateNow } from "@/lib/updates";
import { FieldGroup } from "@/me/parts";
import { Button, Screen, Text, palette, space } from "@/ui";
import { notify } from "@/ui/feedback";

/** Advanced: which update is running, Zaki's brain on the phone and voice typing. */
export default function AdvancedScreen() {
  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: t.lay.me.advanced }} />
      <FieldGroup title={t.lay.me.appUpdate}>
        <UpdateSection />
      </FieldGroup>
      {showBrainSettings() ? (
        <>
          <FieldGroup title={t.brain.title}>
            <BrainSection />
          </FieldGroup>
          <FieldGroup title={t.voice.title}>
            <VoiceSection />
          </FieldGroup>
        </>
      ) : null}
    </Screen>
  );
}

/** The update that is running (short id and date) and a button that fetches the newest at once. */
function UpdateSection() {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const now = runningUpdate();
  const when = now.at
    ? now.at.toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "";
  const line = now.id ? `${now.id.slice(0, 8)} · ${when}` : [t.lay.me.builtIn, when].filter(Boolean).join(" · ");
  const press = async () => {
    setBusy(true);
    const got = await updateNow();
    setBusy(false);
    if (got === "reloading") return;
    const words = got === "none" ? t.lay.me.upToDate : got === "off" ? t.lay.me.updateOff : got.error;
    setSaid(words);
    notify(words);
  };
  return (
    <View style={styles.update}>
      <Text variant="small" color={palette.inkSoft} selectable>
        {said ? `${line}\n${said}` : line}
      </Text>
      <Button label={t.lay.me.updateNow} size="sm" kind="tonal" busy={busy} onPress={press} />
    </View>
  );
}

const styles = StyleSheet.create({
  update: { padding: space.md, gap: space.sm, alignItems: "flex-start" },
});
