import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { t } from "@/i18n";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ title: t.onboarding.title }} />
        <Stack.Screen name="paywall" options={{ presentation: "modal", title: "" }} />
      </Stack>
    </>
  );
}
