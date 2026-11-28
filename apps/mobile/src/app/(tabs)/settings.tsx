import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { authAvailable } from "@/auth";
import { dateLocale, language, listComma, t } from "@/i18n";
import { countLine, joinLine, nextPrayer, planLine, planNow } from "@/me/lines";
import { newsLine } from "@/me/news";
import { InviteCard } from "@/me/parts";
import { useAccount, useAlarms, useMe } from "@/me/useMe";
import { usePlaces } from "@/places/store";
import { cityById, PRAYER_NAMES, PRAYER_WORDS, prayerTimes } from "@fakkarni/shared";
import { peekMemories, serverKnowsCity } from "@/lib/api";
import { useLive } from "@/lib/live";
import { localDayOf } from "@/lib/unlock";
import { runningUpdate } from "@/lib/updates";
import { shareInvite } from "@/referral/share";
import { Button, glass, Icon, NavRow, palette, PersonAvatar, radius, RowGroup, Screen, space, Text, themeId } from "@/ui";

/** The city, and the prayer that comes next there today. */
const cityLine = (id: string | null, now: Date) => {
  const city = cityById(id);
  if (!city) return t.lay.me.cityNone;
  const en = language === "en";
  const next = nextPrayer(prayerTimes(localDayOf(now), city), PRAYER_NAMES, now);
  const at = next ? next.at.toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit", timeZone: city.tz }) : null;
  return joinLine([en ? city.en : city.ar, next && at ? `${en ? PRAYER_WORDS[next.name].en : PRAYER_WORDS[next.name].ar} ${at}` : null]);
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(dateLocale, { day: "numeric", month: "short" });

/** Me: who she is, her plan, and one row per topic. Nothing is edited here; each row opens its page. */
export default function MeScreen() {
  const m = t.lay.me;
  const { user } = useMe();
  const [account] = useAccount();
  const { alarms } = useAlarms();
  const places = usePlaces();
  // Value lines come from saved copies only: Me never waits for the server.
  const [memories, setMemories] = useState(() => peekMemories()?.length ?? 0);
  useLive(useCallback(async () => setMemories(peekMemories()?.length ?? 0), []));
  const now = new Date();
  const update = runningUpdate();

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

      <RowGroup title={m.groupZaki}>
        <NavRow icon="chatbubble-ellipses-outline" title={m.zaki} value={user ? joinLine([tone, checkins]) : undefined} onPress={() => router.push("/me/zaki")} />
        <NavRow icon="newspaper-outline" title={m.news} value={user ? newsLine(user.brief_topics, user.brief_time, m.topics, m.newsOff, listComma) : undefined} onPress={() => router.push("/me/news")} />
        <NavRow icon="bulb-outline" kind="alarm" title={m.memory} value={countLine(memories, m.memoriesOne, m.memoriesCount) ?? undefined} onPress={() => router.push("/memories")} />
      </RowGroup>

      <RowGroup title={m.groupPhone}>
        <NavRow icon="color-palette-outline" title={m.look} value={joinLine([theme, language === "en" ? t.onboarding.english : t.onboarding.arabic])} onPress={() => router.push("/me/look")} />
        {serverKnowsCity() || user?.city ? (
          <NavRow icon="business-outline" kind="place" title={m.city} value={user ? cityLine(user.city, now) : undefined} onPress={() => router.push("/me/city")} />
        ) : null}
        <NavRow icon="notifications-outline" kind="alarm" title={m.reminders} value={joinLine([countLine(alarms.length, m.alarmsOne, m.alarmsCount), countLine(places.length, m.placesOne, m.placesCount)])} onPress={() => router.push("/me/reminders")} />
        <NavRow icon="hardware-chip-outline" kind="neutral" title={m.advanced} value={update.id ? joinLine([update.id.slice(0, 8), update.at ? shortDate(update.at.toISOString()) : null]) : m.builtIn} onPress={() => router.push("/me/advanced")} />
      </RowGroup>

      <RowGroup title={m.groupAccount}>
        <NavRow icon="card-outline" kind="money" title={m.payments} value={user ? (user.instapay_link ? m.instapaySet : m.instapayNone) : undefined} onPress={() => router.push("/me/payments")} />
        <NavRow icon="shield-checkmark-outline" kind="place" title={m.privacy} value={authAvailable ? (account ? m.signedIn : m.signedOut) : undefined} onPress={() => router.push("/me/privacy")} />
      </RowGroup>

      <InviteCard title={m.invite} onInvite={() => void shareInvite("settings")} codeLabel={t.ui.haveCode} onCode={() => router.push("/invite")} />

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
