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
import { startShareIntake } from "@/forward/intake";
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
  // "Share → Zaki" from WhatsApp (Android builds from 2026-11-27): words go to the chat, a receipt photo to the reader.
  useEffect(() => (Platform.OS !== "web" && !isDemo ? startShareIntake() : undefined), []);
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
          <Stack.Screen name="memories" options={{ title: t.lay.me.memory }} />
          <Stack.Screen name="places" options={{ title: t.places.title }} />
          <Stack.Screen name="forward" options={{ title: t.lay.chat.forwardTitle }} />
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
          {/* The circle's own screens and the Me pages: the title is known before they draw. */}
          <Stack.Screen name="circle/feed" options={{ title: t.lay.circle.latest }} />
          <Stack.Screen name="circle/info" options={{ title: t.lay.circle.infoTitle }} />
          <Stack.Screen name="circle/tasks" options={{ title: t.lay.circlejobs.tasksTitle }} />
          <Stack.Screen name="circle/homework" options={{ title: t.lay.circlejobs.homeworkTitle }} />
          <Stack.Screen name="circle/money" options={{ title: t.lay.circlejobs.moneyTitle }} />
          <Stack.Screen name="circle/trackers" options={{ title: t.lay.circle.trackers }} />
          <Stack.Screen name="circle/care" options={{ title: t.lay.care.title }} />
          <Stack.Screen name="care/new" options={{ presentation: "modal", title: t.lay.care.newTitle }} />
          <Stack.Screen name="care/[id]" options={{ title: "" }} />
          <Stack.Screen name="me/zaki" options={{ title: t.lay.me.zaki }} />
          <Stack.Screen name="me/look" options={{ title: t.lay.me.look }} />
          <Stack.Screen name="me/news" options={{ title: t.lay.me.news }} />
          <Stack.Screen name="me/reminders" options={{ title: t.lay.me.reminders }} />
          <Stack.Screen name="me/payments" options={{ title: t.lay.me.payments }} />
          <Stack.Screen name="me/memory" options={{ title: t.lay.me.memory }} />
          <Stack.Screen name="me/privacy" options={{ title: t.lay.me.privacy }} />
          <Stack.Screen name="me/advanced" options={{ title: t.lay.me.advanced }} />
          {/* Pushed from Today (they were hidden tabs, which a push could not open). */}
          <Stack.Screen name="upcoming" options={{ title: t.lay.common.plans }} />
          <Stack.Screen name="trackers" options={{ title: t.tabs.trackers }} />
          <Stack.Screen name="pocket" options={{ title: t.homework.pocketTitle }} />
          <Stack.Screen name="list/index" options={{ title: t.lists.title }} />
          <Stack.Screen name="list/[id]" options={{ title: "" }} />
          <Stack.Screen name="homework/plan" options={{ title: t.homework.planTitle }} />
          <Stack.Screen name="homework/help" options={{ title: t.homework.helpTitle }} />
          <Stack.Screen name="homework/check" options={{ title: t.homework.checkTitle }} />
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
