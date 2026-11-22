import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { t } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { colors } from "@/lib/theme";

const icon = (glyph: string) => () => <Text style={{ fontSize: 20 }}>{glyph}</Text>;

export default function TabsLayout() {
  if (prefs.get("onboarded") !== "1") return <Redirect href="/onboarding" />;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.accent, tabBarHideOnKeyboard: true }}>
      <Tabs.Screen name="index" options={{ title: t.tabs.chat, tabBarIcon: icon("💬") }} />
      <Tabs.Screen name="upcoming" options={{ title: t.tabs.upcoming, tabBarIcon: icon("📅") }} />
      <Tabs.Screen name="money" options={{ title: t.tabs.money, tabBarIcon: icon("💰") }} />
      <Tabs.Screen name="settings" options={{ title: t.tabs.settings, tabBarIcon: icon("⚙️") }} />
    </Tabs>
  );
}
