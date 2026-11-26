import "@/lib/web-boot";
import { useEffect } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useFonts } from "expo-font";
import { DefaultTheme, Stack, ThemeProvider, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { routePattern } from "@/lib/analytics-queue";
import { isDemo } from "@/lib/demo";
import { initSentry } from "@/lib/sentry";
import { startSync } from "@/sync";
// Defines the place reminders' geofence task as the bundle loads (also when the system starts the app only for it).
import "@/places/fire";
import { startUpdates } from "@/lib/updates";
import { Backdrop, FeedbackHost, fonts, GlassHeader, glassBar, palette, Text, withGround } from "@/ui";
import { appFonts } from "@/ui/fonts";

initSentry();

// See-through navigation, so the colour mesh behind the app shows on every screen.
const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "transparent",
    card: "transparent",
    border: "transparent",
    primary: palette.primary,
    text: palette.ink,
  },
};

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts(appFonts);
  useEffect(() => {
    startSync();
    if (Platform.OS !== "web" && !isDemo) startUpdates();
  }, []);
  // Analytics: which screens people use (the route pattern only, never ids or content).
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) track("screen", { route: routePattern(pathname) });
  }, [pathname]);

  // A blank warm screen for the moment the fonts load (system fonts if they fail).
  if (!fontsReady && !fontError) return <View style={styles.boot} />;

  return (
    <ThemeProvider value={navTheme}>
      <View style={styles.root}>
        <Backdrop />
        <StatusBar style="dark" />
        {isDemo ? (
          <View style={styles.demo}>
            <Text variant="caption" color={palette.calm} align="center">
              {t.ui.demo}
            </Text>
          </View>
        ) : null}
        <Stack
        screenLayout={withGround}
          screenOptions={{
            headerStyle: { backgroundColor: glassBar },
        headerBackground: GlassHeader,
            headerShadowVisible: false,
            headerTintColor: palette.ink,
            headerTitleStyle: {
              fontFamily: fonts.displaySemi,
              fontSize: 18,
              color: palette.ink,
            },
            headerBackButtonDisplayMode: "minimal",
            contentStyle: { backgroundColor: palette.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
          <Stack.Screen name="memories" options={{ title: t.memories.title }} />
          <Stack.Screen name="places" options={{ title: t.places.title }} />
          <Stack.Screen
            name="paywall"
            options={{ presentation: "modal", title: "" }}
          />
          <Stack.Screen
            name="saved/[clientId]"
            options={{ presentation: "modal" }}
          />
          <Stack.Screen name="circle/new" options={{ presentation: "modal" }} />
          <Stack.Screen name="circle/[id]" options={{ title: "" }} />
          <Stack.Screen
            name="invite/index"
            options={{ presentation: "modal", title: t.circles.codeTitle }}
          />
          <Stack.Screen name="invite/[code]" options={{ title: "" }} />
          <Stack.Screen name="ref/[code]" options={{ title: "" }} />
          <Stack.Screen name="split/new" options={{ presentation: "modal", title: t.split.title }} />
          <Stack.Screen name="split/[id]" options={{ title: "" }} />
          <Stack.Screen name="receipt" options={{ presentation: "modal", title: t.receipt.title }} />
          <Stack.Screen
            name="session"
            options={{
              title: t.session.title,
              headerStyle: { backgroundColor: palette.calmSoft },
              headerBackground: () => <View style={styles.calmBar} />,
            }}
          />
          <Stack.Screen
            name="tracker/new"
            options={{ presentation: "modal", title: t.trackers.newTitle }}
          />
          <Stack.Screen
            name="task/new"
            options={{ presentation: "modal", title: t.tasks.newTitle }}
          />
          <Stack.Screen
            name="money/new"
            options={{ presentation: "modal", title: t.book.newTitle }}
          />
          <Stack.Screen name="money/[id]" options={{ title: "" }} />
          <Stack.Screen
            name="daftar/new"
            options={{ presentation: "modal", title: t.daftar.newTitle }}
          />
          <Stack.Screen
            name="daftar/[code]"
            options={{ title: t.daftar.title }}
          />
        </Stack>
        <FeedbackHost />
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.ground },
  boot: { flex: 1, backgroundColor: palette.ground },
  calmBar: { flex: 1, backgroundColor: palette.calmSoft },
  demo: {
    backgroundColor: "rgba(255,255,255,0.55)",
    paddingVertical: 4,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "web" ? 4 : 0,
  },
});
