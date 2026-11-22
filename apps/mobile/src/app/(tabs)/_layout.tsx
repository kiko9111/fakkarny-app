import { Redirect, router, Tabs } from "expo-router";
import { t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { useUnlocked } from "@/lib/unlock-store";
import { fonts, Icon, IconButton, palette, type IconName } from "@/ui";

const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({ focused, color }: { focused: boolean; color: unknown }) {
    return <Icon name={focused ? filled : outline} size={24} color={String(color)} />;
  };

/**
 * Up to five places: Zaki, your day, your people, the Daftar, and you. Chat first: a new user
 * sees only Zaki (no tab bar); the others appear as they open (src/lib/unlock.ts).
 */
export default function TabsLayout() {
  const unlocked = useUnlocked();
  const chatOnly = unlocked.length === 0;
  const shown = (f: "daftar" | "people" | "today") => (unlocked.includes(f) ? {} : { href: null });
  if (prefs.get("onboarded") !== "1") return <Redirect href="/onboarding" />;
  // Came in through an invite link before setting up: finish that first.
  const pendingInvite = prefs.get("pending_invite");
  if (pendingInvite) {
    prefs.set("pending_invite", null);
    return <Redirect href={{ pathname: "/invite/[code]", params: { code: pendingInvite } }} />;
  }
  // Right after sign-up: offer the first tracker (Zaki's gift), once.
  if (prefs.get("offer_tracker") === "1" && unlocked.includes("today")) {
    prefs.set("offer_tracker", null);
    return <Redirect href={{ pathname: "/tracker/new", params: { first: "1" } }} />;
  }
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.primaryInk,
        tabBarInactiveTintColor: palette.inkFaint,
        tabBarHideOnKeyboard: true,
        tabBarStyle: chatOnly ? { display: "none" } : { backgroundColor: palette.surface, borderTopColor: palette.line, height: 76, paddingTop: 6, paddingBottom: 14 },
        tabBarItemStyle: { paddingBottom: 2 },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 18, paddingBottom: 2 },
        headerStyle: { backgroundColor: palette.bg },
        headerShadowVisible: false,
        headerTitleAlign: "left",
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 26, color: palette.ink },
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t.ui.tabZaki, tabBarIcon: icon("chatbubble-ellipses-outline", "chatbubble-ellipses") }} />
      <Tabs.Screen name="today" options={{ ...shown("today"), title: t.ui.tabToday, tabBarIcon: icon("sunny-outline", "sunny") }} />
      <Tabs.Screen name="circles" options={{ ...shown("people"), title: t.ui.tabPeople, tabBarIcon: icon("people-outline", "people") }} />
      <Tabs.Screen name="money" options={{ ...shown("daftar"), title: t.ui.tabMoney, tabBarIcon: icon("book-outline", "book") }} />
      <Tabs.Screen name="settings" options={{ ...(chatOnly ? { href: null, headerLeft: () => <IconButton name="arrow-back" label={t.ui.tabZaki} onPress={() => router.navigate("/")} /> } : {}), title: t.ui.tabMe, tabBarIcon: icon("person-circle-outline", "person-circle") }} />
      {/* Kept as routes (links and notifications open them), shown inside Today. */}
      <Tabs.Screen name="trackers" options={{ href: null, title: t.tabs.trackers }} />
      <Tabs.Screen name="upcoming" options={{ href: null, title: t.tabs.upcoming }} />
    </Tabs>
  );
}
