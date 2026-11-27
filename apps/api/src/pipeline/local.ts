import { COUNTRIES, PRAYER_NAMES, PRAYER_WORDS, holidaysBetween, localDay, localDefaults, prayerTimes } from "@fakkarni/shared";

/** How far ahead the model is told about holidays. */
export const HOLIDAY_DAYS_AHEAD = 30;

const plusDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
const hhmm = (d: Date, tz: string) => d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * The context lines from the user's city (pure): where they are and their money, today's prayer
 * times (so "remind me after Asr" has a time) and the holidays coming up. Times are in the user's
 * own time zone, like every other time in the context.
 */
export function describeLocal(cityId: string | null | undefined, tz: string, now: Date): string[] {
  const local = localDefaults(cityId, tz);
  const { city, currency } = local;
  const money = `money is ${currency.code}: write amounts as "120 ${currency.ar}" in Arabic, "${currency.code} 120" in English`;
  if (!city) return [`LOCAL: city not picked; ${money}.`];
  const where = `${city.en}, ${COUNTRIES[city.country].en}${local.guessed ? " (assumed from the time zone; the user has not picked a city)" : ""}`;
  const today = localDay(now, tz);
  const times = prayerTimes(today, city);
  const lines = [
    `LOCAL: ${where}; ${money}.`,
    `PRAYER TIMES today (about, local): ${PRAYER_NAMES.map((p) => `${PRAYER_WORDS[p].en} ${hhmm(times[p], tz)}`).join(", ")}. Use them for "after Asr", "before Maghrib", iftar and the like.`,
  ];
  const holidays = holidaysBetween(city.country, today, plusDays(today, HOLIDAY_DAYS_AHEAD));
  if (holidays.length) {
    const list = holidays.map((h) => `${weekday(h.day)} ${h.day} ${h.en}${h.days > 1 ? ` (${h.days} days)` : ""}${h.off ? "" : " (not a day off)"}${h.expected ? " (expected)" : ""}`);
    lines.push(`HOLIDAYS (next ${HOLIDAY_DAYS_AHEAD} days): ${list.join("; ")}. Official days off can be moved by decree; moon-based dates may move a day.`);
  }
  return lines;
}
