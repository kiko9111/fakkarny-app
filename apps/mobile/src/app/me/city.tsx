import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { CITIES, COUNTRIES, currencyOf, holidaysBetween, localDefaults, PRAYER_NAMES, PRAYER_WORDS, prayerTimes, type CountryCode } from "@fakkarni/shared";
import { dateLocale, language, t } from "@/i18n";
import { track } from "@/lib/analytics";
import { prefs } from "@/lib/prefs";
import { reloadApp } from "@/lib/reload";
import { localDayOf } from "@/lib/unlock";
import { Choice, Field, FieldGroup } from "@/me/parts";
import { useMe } from "@/me/useMe";
import { ask, glass, palette, radius, Screen, space, Text } from "@/ui";

const ar = language === "ar-EG";
const HOLIDAY_DAYS = 120;
const HOLIDAY_ROWS = 4;
const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** In the city's own time (the phone may still be set to another zone); the phone's if that fails. */
const clock = (d: Date, tz: string) => {
  try {
    return d.toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit", timeZone: tz });
  } catch {
    return d.toLocaleTimeString(dateLocale, { hour: "numeric", minute: "2-digit" });
  }
};
const dayName = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });
const COUNTRY_ORDER: CountryCode[] = ["EG", "SA", "AE"];

/**
 * City: the user's city sets prayer times, holidays and the money the app writes. Picked once
 * (Zaki asks in the chat), changed here. Times are the phone's local time: the user is there.
 */
export default function CityScreen() {
  const m = t.lay.me;
  const { user, save } = useMe();
  const picked = user?.city ?? prefs.get("city");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const local = localDefaults(picked, timezone);
  const city = local.guessed ? null : local.city;

  const today = localDayOf(new Date());
  const times = useMemo(() => (city ? prayerTimes(today, city) : null), [city, today]);
  const holidays = useMemo(() => (city ? holidaysBetween(city.country, today, plusDays(today, HOLIDAY_DAYS)).slice(0, HOLIDAY_ROWS) : []), [city, today]);

  const pick = (id: string) => {
    if (id === picked) return;
    const before = currencyOf(picked).code;
    prefs.set("city", id);
    track("city_picked", { changed: Boolean(picked) });
    void save({ city: id });
    // The app's money words are set at start-up.
    if (currencyOf(id).code !== before) ask(t.settings.restart, undefined, [{ label: t.ui.ok, onPress: () => void reloadApp() }]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: m.city }} />

      {city && times ? (
        <View style={styles.card}>
          <Text variant="smallStrong" color={palette.inkSoft}>
            {`${m.prayerToday} · ${ar ? city.ar : city.en}`}
          </Text>
          <View style={styles.grid}>
            {PRAYER_NAMES.map((p) => (
              <View key={p} style={styles.cell} accessible accessibilityLabel={`${ar ? PRAYER_WORDS[p].ar : PRAYER_WORDS[p].en} ${clock(times[p], city.tz)}`}>
                <Text variant="small" color={palette.inkSoft}>
                  {ar ? PRAYER_WORDS[p].ar : PRAYER_WORDS[p].en}
                </Text>
                <Text variant="bodyStrong">{clock(times[p], city.tz)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {holidays.length ? (
        <FieldGroup title={m.holidaysAhead}>
          {holidays.map((h, i) => {
            const notes = [h.days > 1 ? m.holidayDays.replace("{n}", String(h.days)) : "", h.off ? "" : m.notOff, h.expected ? m.expected : ""].filter(Boolean).join(" · ");
            return (
              <View key={`${h.day}-${h.en}`} style={[styles.holiday, i > 0 && styles.line]}>
                <Text variant="body" numberOfLines={1}>
                  {ar ? h.ar : h.en}
                </Text>
                <Text variant="small" color={palette.inkSoft}>
                  {notes ? `${dayName(h.day)} · ${notes}` : dayName(h.day)}
                </Text>
              </View>
            );
          })}
        </FieldGroup>
      ) : null}

      <FieldGroup title={local.guessed ? m.cityPick : undefined}>
        {COUNTRY_ORDER.map((code, i) => (
          <Field key={code} label={ar ? COUNTRIES[code].ar : COUNTRIES[code].en} first={i === 0}>
            <Choice value={local.guessed ? null : picked} onChange={pick} options={CITIES.filter((c) => c.country === code).map((c) => ({ key: c.id, label: ar ? c.ar : c.en }))} />
          </Field>
        ))}
      </FieldGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { ...glass, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: space.md },
  cell: { width: "33.33%", gap: 2 },
  holiday: { gap: 2, minHeight: 52, justifyContent: "center", paddingVertical: space.sm },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
});
