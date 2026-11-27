import type { DoseState } from "@fakkarni/shared";
import { localParts, localToUtc } from "../lib/time";

/**
 * Care circles: when a medicine's doses fall, what state each one is in, and Zaki's words.
 * Pure. Arabic lines about another person avoid gendered verbs, as the circle lines do. The
 * words never judge or advise: they say the time, the family's own name for the medicine and
 * dose, and who marked it.
 */

type Lang = "ar" | "en";

const pad = (n: number) => String(n).padStart(2, "0");

/** The local date ("2026-11-27") of an instant in a zone. */
export function localDate(at: Date, tz: string): string {
  const p = localParts(at, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** The date `days` after a local date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export interface Slot {
  dueAt: Date;
  time: string;
  date: string;
}

/** The doses of one local day, soonest first. */
export function slotsOn(date: string, times: readonly string[], tz: string): Slot[] {
  return [...times]
    .sort()
    .map((time) => ({ dueAt: localToUtc(`${date}T${time}`, tz), time, date }))
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/** Every dose from `from` to `to` (both included), soonest first. */
export function slotsBetween(times: readonly string[], tz: string, from: Date, to: Date): Slot[] {
  if (to < from || times.length === 0) return [];
  const out: Slot[] = [];
  // A day either side covers zones far from UTC.
  const last = addDays(localDate(to, tz), 1);
  for (let date = addDays(localDate(from, tz), -1); date <= last; date = addDays(date, 1)) {
    for (const s of slotsOn(date, times, tz)) if (s.dueAt >= from && s.dueAt <= to) out.push(s);
    if (out.length > 1000) break;
  }
  return out;
}

/** A dose's state now, from its mark (if any). */
export function doseState(dueAt: Date, status: string | null | undefined, now: Date, missedAfterMinutes: number): DoseState {
  if (status === "taken" || status === "skipped") return status;
  if (dueAt > now) return "later";
  return now.getTime() - dueAt.getTime() >= missedAfterMinutes * 60_000 ? "missed" : "due";
}

/** Is the dose still open for a mark (its time came, not more than a day ago)? Also a dose up to an hour ahead. */
export function canMark(dueAt: Date, now: Date, withinHours: number): boolean {
  const ago = now.getTime() - dueAt.getTime();
  return ago >= -60 * 60_000 && ago <= withinHours * 3_600_000;
}

/** Zaki reminds at dose time only while it is fresh: a reminder 15 minutes late is still useful, an old one is noise. */
export const REMIND_WINDOW_MS = 15 * 60_000;
/** A missed dose is told to the family only if its wait ended in the last few hours (no late floods after an outage). */
export const ALERT_WINDOW_MS = 6 * 3_600_000;
/** How far back the tick looks for doses. */
export const TICK_LOOKBACK_MS = ALERT_WINDOW_MS + 4 * 3_600_000;

/** "8:00 م" / "8:00 PM". */
export function clock(lang: Lang, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const h12 = ((h! + 11) % 12) + 1;
  const am = h! < 12;
  return lang === "en" ? `${h12}:${pad(m!)} ${am ? "AM" : "PM"}` : `${h12}:${pad(m!)} ${am ? "ص" : "م"}`;
}

const withDose = (lang: Lang, name: string, dose: string | null) => (dose ? (lang === "en" ? `${name} (${dose})` : `${name} (${dose})`) : name);
const who = (lang: Lang, name: string | null | undefined) => name?.trim() || (lang === "en" ? "someone" : "حد");

/** At dose time, to the people picked. `self`: the reader is the one who takes it. */
export function remindLine(lang: Lang, o: { self: boolean; person: string; name: string; dose: string | null; time: string }): string {
  const what = withDose(lang, o.name, o.dose);
  if (o.self) return lang === "en" ? `💊 Time for your ${what} · ${clock(lang, o.time)}` : `💊 ميعاد دواك: ${what} · ${clock(lang, o.time)}`;
  return lang === "en" ? `💊 Time for ${o.person}'s ${what} · ${clock(lang, o.time)}` : `💊 ميعاد دوا ${o.person}: ${what} · ${clock(lang, o.time)}`;
}

/** To the rest of the family: nobody marked the dose a while after its time. */
export function missedLine(lang: Lang, o: { person: string; name: string; time: string }): string {
  return lang === "en"
    ? `⏰ ${o.person}'s ${clock(lang, o.time)} ${o.name} isn't marked as taken yet. Can someone check?`
    : `⏰ دوا ${o.person} بتاع ${clock(lang, o.time)} (${o.name}) لسه محدش علّم إنه اتاخد. حد يطمّن؟`;
}

/** To the family after they were told it was missed: someone marked it. */
export function markedLine(lang: Lang, o: { person: string; name: string; time: string; by: string | null; status: "taken" | "skipped" }): string {
  if (o.status === "skipped")
    return lang === "en"
      ? `ℹ️ ${o.person}'s ${clock(lang, o.time)} ${o.name} was marked as skipped (by ${who(lang, o.by)})`
      : `ℹ️ دوا ${o.person} بتاع ${clock(lang, o.time)} (${o.name}) اتعلّم إنه اتفوّت (من ${who(lang, o.by)})`;
  return lang === "en"
    ? `✅ ${o.person}'s ${clock(lang, o.time)} ${o.name} was taken (marked by ${who(lang, o.by)})`
    : `✅ دوا ${o.person} بتاع ${clock(lang, o.time)} (${o.name}) اتاخد، الحمد لله (من ${who(lang, o.by)})`;
}

/** The answer card on a reminder or a missed line. */
export const CARD = {
  ask: (lang: Lang) => (lang === "en" ? "Mark as taken" : "اتاخد؟"),
  done: (lang: Lang) => (lang === "en" ? "Marked as taken" : "اتعلّم إنه اتاخد ✅"),
  gone: (lang: Lang) => (lang === "en" ? "That medicine isn't in the circle anymore" : "الدوا ده مبقاش في الدايرة"),
  late: (lang: Lang) => (lang === "en" ? "Too late to mark that dose" : "فات وقت التعليم على الجرعة دي"),
};

/** The route of a circle's medicine screen. */
export const careRoute = (circleId: string) => `/circle/care?id=${circleId}`;

/** To the people who will be reminded (and the one who takes it), when someone else adds a medicine. */
export function addedLine(lang: Lang, o: { by: string | null; self: boolean; person: string; name: string; times: readonly string[] }): string {
  const at = o.times.map((t) => clock(lang, t)).join(lang === "en" ? ", " : "، ");
  if (o.self)
    return lang === "en"
      ? `💊 ${who(lang, o.by)} added your ${o.name} (${at}). I'll remind you at those times.`
      : `💊 اتضافت مواعيد ${o.name} بتاعك (${at}) من ${who(lang, o.by)}. هفكّرك في المواعيد دي.`;
  return lang === "en"
    ? `💊 ${who(lang, o.by)} added ${o.person}'s ${o.name} (${at}). I'll remind you at those times.`
    : `💊 اتضافت مواعيد ${o.name} بتاع ${o.person} (${at}) من ${who(lang, o.by)}. هفكّرك في المواعيد دي.`;
}
