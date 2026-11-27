import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { authAvailable } from "@/auth";
import { dateLocale, language, t } from "@/i18n";
import { countLine, joinLine, planLine, planNow } from "@/me/lines";
import { InviteCard } from "@/me/parts";
import { useAccount, useAlarms, useMe } from "@/me/useMe";
import { usePlaces } from "@/places/store";
import { shareInvite } from "@/referral/share";
import { pinWidget, widgetAvailable, widgetsPlaced } from "@/widget";
import { Button, glass, Icon, NavRow, notify, palette, PersonAvatar, radius, RowGroup, Screen, space, Text, themeId } from "@/ui";

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });

/** Me: who she is, her plan, and one row per topic. Nothing is edited here; each row opens its page. */
export default function MeScreen() {
  const m = t.lay.me;
  const { user } = useMe();
  const [account] = useAccount();
  const { alarms } = useAlarms();
  const places = usePlaces();

  const name = user?.name ?? "";
  const plan = planLine(planNow(user, new Date()), m, shortDate);
  const tone = { playful: t.settings.playful, balanced: t.settings.balanced, calm: t.settings.calm }[user?.tone ?? "balanced"];
  const checkins = { "2": m.checkEvery2, "4": m.checkEvery4, off: m.checkOff }[user?.checkin_interval_h ?? "2"];
  const theme = { sunrise: t.ui.themeSunrise, mint: t.ui.themeMint, cloud: t.ui.themeCloud }[themeId];

  return (
    <Screen>
      <View style={styles.profile}>
        <Pressable onPress={() => router.push("/me/payments")} accessibilityRole="button" accessibilityLabel={`${name || t.ui.tabMe}, ${plan}`} style={({ pressed }) => [styles.who, pressed && styles.pressed]}>
          <PersonAvatar name={name || "Z"} size={56} color={palette.primaryInk} bg={palette.primarySoft} />
          <View style={styles.flex}>
            <Text variant="title" numberOfLines={1}>
              {name || t.ui.tabMe}
            </Text>
            <Text variant="small" color={user?.pro ? palette.primaryInk : palette.inkSoft} numberOfLines={1}>
              {plan}
            </Text>
          </View>
          {authAvailable && !account ? null : <Icon name="chevron-forward" size={18} color={palette.inkFaint} />}
        </Pressable>
        {authAvailable && !account ? <Button label={t.settings.signIn} kind="tonal" size="sm" onPress={() => router.push("/onboarding")} /> : null}
      </View>

      <RowGroup>
        <NavRow icon="chatbubble-ellipses-outline" title={m.zaki} value={user ? joinLine([tone, checkins]) : undefined} onPress={() => router.push("/me/zaki")} />
        <NavRow icon="color-palette-outline" title={m.look} value={joinLine([theme, language === "en" ? t.onboarding.english : t.onboarding.arabic])} onPress={() => router.push("/me/look")} />
        <NavRow icon="notifications-outline" kind="alarm" title={m.reminders} value={joinLine([countLine(alarms.length, m.alarmsOne, m.alarmsCount), countLine(places.length, m.placesOne, m.placesCount)])} onPress={() => router.push("/me/reminders")} />
        {/* The home-screen widget: offered on Android builds that have it, until one is placed. */}
        {widgetAvailable && widgetsPlaced() === 0 ? (
          <NavRow icon="apps-outline" kind="neutral" title={t.lay.widget.addRow} onPress={() => (pinWidget() ? undefined : notify(t.lay.widget.howTo))} />
        ) : null}
        <NavRow icon="card-outline" kind="money" title={m.payments} value={user ? (user.instapay_link ? m.instapaySet : m.instapayNone) : undefined} onPress={() => router.push("/me/payments")} />
      </RowGroup>

      <RowGroup>
        <NavRow icon="bulb-outline" kind="alarm" title={m.memory} onPress={() => router.push("/memories")} />
        <NavRow icon="shield-checkmark-outline" kind="place" title={m.privacy} onPress={() => router.push("/me/privacy")} />
      </RowGroup>

      <InviteCard title={m.invite} onInvite={() => void shareInvite("settings")} codeLabel={t.ui.haveCode} onCode={() => router.push("/invite")} />

      <RowGroup>
        <NavRow icon="hardware-chip-outline" kind="neutral" title={m.advanced} onPress={() => router.push("/me/advanced")} />
      </RowGroup>

      <Text variant="caption" color={palette.inkSoft} align="center">
        {t.settings.aiDisclosure}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.7 },
  profile: { ...glass, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  who: { flex: 1, minWidth: 0, minHeight: 56, flexDirection: "row", alignItems: "center", gap: space.md },
});
