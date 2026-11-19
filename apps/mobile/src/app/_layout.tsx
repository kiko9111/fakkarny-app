import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { t } from "@/i18n";
import { startSync } from "@/sync";

export default function RootLayout() {
  useEffect(() => {
    startSync();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: t.onboarding.title }} />
        <Stack.Screen name="paywall" options={{ presentation: "modal", title: "" }} />
        <Stack.Screen name="saved/[clientId]" options={{ presentation: "modal" }} />
      </Stack>
    </>
  );
}
