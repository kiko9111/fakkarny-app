import type { ReactNode } from "react";
import { Redirect, Tabs } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import type { Feature } from "@/lib/unlock";
import { unlock, useUnlocked } from "@/lib/unlock-store";
import { useNeedsYouCount } from "@/today/useNeeds";
import { Backdrop, ChatTabButton, fonts, glass, GlassHeader, glassBar, Icon, IntroPanel, palette, radius, type IconName } from "@/ui";

const icon = (outline: IconName, filled: IconName) =>
  function TabIcon({ focused, color }: { focused: boolean; color: unknown }) {
    return <Icon name={focused ? filled : outline} size={24} color={String(color)} />;
  };

// The chat is home: Android back from any tab returns to it, and the app opens on it.
export const unstable_settings = { initialRouteName: "index" };

/** The place each gated tab belongs to, and Zaki's one sentence about it. */
const PLACE: Record<string, Feature> = { today: "today", circles: "people", money: "daftar" };
const INTRO: Record<Feature, string> = { today: t.lay.tabs.introToday, people: t.lay.tabs.introPeople, daftar: t.lay.tabs.introDaftar };

/**
 * Wraps every tab (`screenLayout`): its own ground, and for a place the user has not opened yet,
 * Zaki's one sentence with an Open button instead of the screen. The screen itself is not
 * mounted until then, so it asks the server for nothing and puts no "+" in the header.
 */
function Place({ children, route }: { children: ReactNode; route: { name: string } }) {
  const unlocked = useUnlocked();
  const place = PLACE[route.name];
  return (
    <View style={styles.ground}>
      <Backdrop />
      {place && !unlocked.includes(place) ? (
        <ScrollView contentContainerStyle={styles.intro}>
          <IntroPanel title={INTRO[place]} action={t.lay.common.open} onAction={() => unlock.open(place)} />
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}

// The navigator calls its `screenLayout` as a plain function, so the hooks live in a component.
const placeLayout = (props: { children: ReactNode; route: { name: string } }) => <Place {...props} />;

/**
 * Five places, always shown, always in the same order: Today, People, Zaki (centre), Daftar, Me
 * (owner decision, 2026-11-27). A place not opened yet shows Zaki's introduction (`Place`);
 * Zaki still introduces places in the chat (src/lib/unlock.ts). No back arrow in the headers:
 * the centre button and Android back go home.
 */
export default function TabsLayout() {
  const unlocked = useUnlocked();
  const needs = useNeedsYouCount();
  // Android is edge-to-edge: the bar has to clear the system buttons (3-button navigation is
  // 48dp tall) or the gesture line, whatever the phone uses.
  const bottom = Math.max(useSafeAreaInsets().bottom, 14);
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
  // Right after sign-up: offer the first tracker (Zaki's gift), once. Trackers live in Today,
  // so the offer waits until she has opened Today (a new user starts with the chat alone).
  if (prefs.get("offer_tracker") === "1" && unlocked.includes("today")) {
    prefs.set("offer_tracker", null);
    return <Redirect href={{ pathname: "/tracker/new", params: { first: "1" } }} />;
  }
  return (
    <Tabs
      screenLayout={placeLayout}
      backBehavior="initialRoute"
      screenOptions={{
        tabBarActiveTintColor: palette.primaryInk,
        tabBarInactiveTintColor: palette.inkFaint,
        tabBarHideOnKeyboard: true,
        tabBarStyle: { ...glass, borderTopColor: palette.glassEdge, borderTopWidth: 1, borderWidth: 0, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, height: 62 + bottom, paddingTop: 6, paddingBottom: bottom, backgroundColor: palette.surfaceStrong },
        tabBarItemStyle: { paddingBottom: 2 },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12, lineHeight: 18, paddingBottom: 2 },
        tabBarBadgeStyle: { backgroundColor: palette.primary, color: palette.onPrimary, fontFamily: fonts.bodySemi, fontSize: 11, lineHeight: 16 },
        headerStyle: { backgroundColor: glassBar },
        headerBackground: GlassHeader,
        headerShadowVisible: false,
        headerTitleAlign: "left",
        headerTitleStyle: { fontFamily: fonts.display, fontSize: 26, color: palette.ink },
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen name="today" options={{ title: t.ui.tabToday, tabBarIcon: icon("sunny-outline", "sunny"), tabBarBadge: needs > 0 && unlocked.includes("today") ? needs : undefined }} />
      <Tabs.Screen name="circles" options={{ title: t.ui.tabPeople, tabBarIcon: icon("people-outline", "people") }} />
      <Tabs.Screen
        name="index"
        options={{
          title: t.ui.tabZaki,
          tabBarIcon: icon("chatbubble-ellipses-outline", "chatbubble-ellipses"),
          tabBarButton: (props) => <ChatTabButton onPress={props.onPress} onLongPress={props.onLongPress} focused={props["aria-selected"] === true || props.accessibilityState?.selected === true} label={t.ui.tabZaki} />,
        }}
      />
      <Tabs.Screen name="money" options={{ title: t.ui.tabMoney, tabBarIcon: icon("book-outline", "book") }} />
      <Tabs.Screen name="settings" options={{ title: t.ui.tabMe, tabBarIcon: icon("person-outline", "person") }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  ground: { flex: 1 },
  intro: { flexGrow: 1, justifyContent: "center" },
});
