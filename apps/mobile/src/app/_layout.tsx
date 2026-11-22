import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { t } from "@/i18n";
import { initSentry } from "@/lib/sentry";
import { startSync } from "@/sync";

initSentry();

export default function RootLayout() {
  useEffect(() => {
    startSync();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        <Stack.Screen name="memories" options={{ title: t.memories.title }} />
        <Stack.Screen name="paywall" options={{ presentation: "modal", title: "" }} />
        <Stack.Screen name="saved/[clientId]" options={{ presentation: "modal" }} />
        <Stack.Screen name="circle/new" options={{ presentation: "modal" }} />
        <Stack.Screen name="circle/[id]" options={{ title: "" }} />
        <Stack.Screen name="invite/index" options={{ presentation: "modal", title: t.circles.codeTitle }} />
        <Stack.Screen name="invite/[code]" options={{ title: "" }} />
        <Stack.Screen name="daftar/new" options={{ presentation: "modal", title: t.daftar.newTitle }} />
        <Stack.Screen name="daftar/[code]" options={{ title: t.daftar.title }} />
      </Stack>
    </>
  );
}
