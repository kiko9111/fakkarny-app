import { cityById, holidaysBetween } from "@fakkarni/shared";

/**
 * The holiday Today mentions beside the date (pure): one that runs today, else one that starts
 * tomorrow, in the city the user picked. Nothing without a picked city.
 */
export function holidayNote(cityId: string | null, today: string, lang: "ar" | "en"): { when: "today" | "tomorrow"; name: string } | null {
  const city = cityById(cityId);
  if (!city) return null;
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const days = holidaysBetween(city.country, today, tomorrow);
  const running = days.find((h) => h.day <= today);
  const next = days.find((h) => h.day === tomorrow);
  const h = running ?? next;
  return h ? { when: running ? "today" : "tomorrow", name: lang === "ar" ? h.ar : h.en } : null;
}
