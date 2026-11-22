import "@/lib/web-boot";
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { t } from "@/i18n";
import { isDemo } from "@/lib/demo";
import { initSentry } from "@/lib/sentry";
import { startSync } from "@/sync";
import { FeedbackHost, fonts, palette, Text } from "@/ui";
import { appFonts } from "@/ui/fonts";

initSentry();

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts(appFonts);
  useEffect(() => {
    startSync();
  }, []);

  // A blank warm screen for the moment the fonts load (system fonts if they fail).
  if (!fontsReady && !fontError) return <View style={styles.boot} />;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {isDemo ? (
        <View style={styles.demo}>
          <Text variant="caption" color={palette.calm} align="center">
            {t.ui.demo}
          </Text>
        </View>
      ) : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: palette.bg },
          headerShadowVisible: false,
          headerTintColor: palette.ink,
          headerTitleStyle: { fontFamily: fonts.displaySemi, fontSize: 18, color: palette.ink },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: palette.bg },
        }}
      >
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
        <Stack.Screen name="session" options={{ title: t.session.title, headerStyle: { backgroundColor: palette.calmSoft }, contentStyle: { backgroundColor: palette.calmSoft } }} />
        <Stack.Screen name="tracker/new" options={{ presentation: "modal", title: t.trackers.newTitle }} />
        <Stack.Screen name="task/new" options={{ presentation: "modal", title: t.tasks.newTitle }} />
        <Stack.Screen name="daftar/new" options={{ presentation: "modal", title: t.daftar.newTitle }} />
        <Stack.Screen name="daftar/[code]" options={{ title: t.daftar.title }} />
      </Stack>
      <FeedbackHost />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  boot: { flex: 1, backgroundColor: palette.bg },
  demo: { backgroundColor: palette.calmSoft, paddingVertical: 4, paddingHorizontal: 12, paddingTop: Platform.OS === "web" ? 4 : 0 },
});
