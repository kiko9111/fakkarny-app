import { Redirect, router, Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isRTL, t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { useUnlocked } from "@/lib/unlock-store";
import { ChatTabButton, fonts, glass, GlassHeader, glassBar, Icon, IconButton, palette, radius, withGround, type IconName } from "@/ui";

const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({ focused, color }: { focused: boolean; color: unknown }) {
    return <Icon name={focused ? filled : outline} size={24} color={String(color)} />;
  };

// The chat is home: Android back from any tab returns to it, and the app opens on it.
export const unstable_settings = { initialRouteName: "index" };

/** Back to Zaki's chat, on every tab that is not the chat. */
const backToChat = () => <IconButton name={isRTL ? "arrow-forward" : "arrow-back"} label={t.ui.backToChat} onPress={() => router.navigate("/")} />;

/**
 * Up to five places: Zaki, your day, your people, the Daftar, and you. Chat first: a new user
 * sees Zaki and Me; the others appear as they open (src/lib/unlock.ts). The bar is always
 * there: hidden, the app read as broken, and a tab with `href: null` can't be opened by a link
 * either (the old header Settings button did nothing).
 */
export default function TabsLayout() {
  const unlocked = useUnlocked();
  // Android is edge-to-edge: the bar has to clear the system buttons (3-button navigation is
  // 48dp tall) or the gesture line, whatever the phone uses.
  const bottom = Math.max(useSafeAreaInsets().bottom, 14);
  const shown = (f: "daftar" | "people" | "today") => (unlocked.includes(f) ? {} : { href: null });
  if (prefs.get("onboarded") !== "1") return <Redirect href="/onboarding" />;
  // Came in through an invite link before setting up: finish that first.
  const pendingInvite = prefs.get("pending_invite");
  if (pendingInvite) {
    prefs.set("pending_invite", null);
    return <Redirect href={{ pathname: "/invite/[code]", params: { code: pendingInvite } }} />;
  }
  // Came in through a friend's personal invite link: claim the gift for both.
  const pendingReferral = prefs.get("pending_referral");
  if (pendingReferral) {
    prefs.set("pending_referral", null);
    return <Redirect href={{ pathname: "/ref/[code]", params: { code: pendingReferral } }} />;
  }
  // Right after sign-up: offer the first tracker (Zaki's gift), once.
  if (prefs.get("offer_tracker") === "1" && unlocked.includes("today")) {
    prefs.set("offer_tracker", null);
    return <Redirect href={{ pathname: "/tracker/new", params: { first: "1" } }} />;
  }
  return (
    <Tabs
      screenLayout={withGround}
      backBehavior="initialRoute"
      screenOptions={{
        tabBarActiveTintColor: palette.primaryInk,
        tabBarInactiveTintColor: palette.inkFaint,
        tabBarHideOnKeyboard: true,
        tabBarStyle: { ...glass, borderTopColor: palette.glassEdge, borderTopWidth: 1, borderWidth: 0, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, height: 62 + bottom, paddingTop: 6, paddingBottom: bottom, backgroundColor: palette.surfaceStrong },
        tabBarItemStyle: { paddingBottom: 2 },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 18, paddingBottom: 2 },
        headerStyle: { backgroundColor: glassBar },
        headerBackground: GlassHeader,
        headerShadowVisible: false,
        headerTitleAlign: "left",
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 26, color: palette.ink },
        sceneStyle: { backgroundColor: palette.bg },
        headerLeft: backToChat,
      }}
    >
      {/* Order puts the chat in the middle when every tab is open. */}
      <Tabs.Screen name="today" options={{ ...shown("today"), title: t.ui.tabToday, tabBarIcon: icon("sunny-outline", "sunny") }} />
      <Tabs.Screen name="circles" options={{ ...shown("people"), title: t.ui.tabPeople, tabBarIcon: icon("people-outline", "people") }} />
      <Tabs.Screen
        name="index"
        options={{
          title: t.ui.tabZaki,
          headerLeft: () => null,
          tabBarIcon: icon("chatbubble-ellipses-outline", "chatbubble-ellipses"),
          tabBarButton: (props) => <ChatTabButton onPress={props.onPress} onLongPress={props.onLongPress} focused={props["aria-selected"] === true || props.accessibilityState?.selected === true} label={t.ui.tabZaki} />,
        }}
      />
      <Tabs.Screen name="money" options={{ ...shown("daftar"), title: t.ui.tabMoney, tabBarIcon: icon("book-outline", "book") }} />
      <Tabs.Screen name="settings" options={{ title: t.ui.tabMe, tabBarIcon: icon("person-circle-outline", "person-circle") }} />
      {/* Kept as routes (links and notifications open them), shown inside Today. */}
      <Tabs.Screen name="trackers" options={{ href: null, title: t.tabs.trackers }} />
      <Tabs.Screen name="upcoming" options={{ href: null, title: t.tabs.upcoming }} />
    </Tabs>
  );
}
