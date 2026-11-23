import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { claimReferral } from "@/lib/api";
import { prefs } from "@/lib/prefs";
import { HttpError } from "@/sync/queue";
import { Button, EmptyState, IconTile, palette, plain, space, Text } from "@/ui";

type Outcome = "welcome" | "used" | "unknown" | "offline";

/**
 * Opened from a friend's personal invite link (fakkarni://ref/CODE) or a typed code. New here:
 * set up first (sign-in is required), then come back. Both people get 7 days of Zaki Pro.
 */
export default function ReferralScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const onboarded = prefs.get("onboarded") === "1";

  useEffect(() => {
    if (!onboarded) return;
    let active = true;
    claimReferral(code)
      .then(() => {
        track("referral_claimed");
        if (active) setOutcome("welcome");
      })
      .catch((err) => {
        if (!active) return;
        const status = err instanceof HttpError ? err.status : null;
        setOutcome(status === 404 ? "unknown" : status === 409 ? "used" : "offline");
      });
    return () => {
      active = false;
    };
  }, [code, onboarded]);

  if (!onboarded) {
    prefs.set("pending_referral", code);
    return <Redirect href="/onboarding" />;
  }

  const home = () => router.replace("/");
  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: "" }} />
      {!outcome ? <ActivityIndicator color={palette.primary} /> : null}
      {outcome === "welcome" ? (
        <>
          <View style={styles.hero}>
            <IconTile name="gift" size={80} />
          </View>
          <Text variant="title" align="center">
            {plain(t.referral.welcomeTitle)}
          </Text>
          <Text variant="body" color={palette.inkSoft} align="center">
            {plain(t.referral.welcomeBody)}
          </Text>
          <Button label={t.referral.start} size="lg" block icon="chatbubble-ellipses" onPress={home} />
        </>
      ) : null}
      {outcome && outcome !== "welcome" ? (
        <>
          <EmptyState title={plain(t.referral[outcome])} />
          <Button label={t.referral.start} kind="tonal" block onPress={home} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.bg, padding: space.xl, gap: space.md, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: space.sm },
});
