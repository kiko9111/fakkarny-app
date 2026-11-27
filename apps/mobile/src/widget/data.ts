import { awakeAtMinutes, nextOccurrences, type Item } from "@fakkarni/shared";

/**
 * What the home-screen widget shows (modules/zaki-widget draws it). Pure: built from the plans in
 * SQLite and "Needs you" rows the phone already holds, no request. Times are sent as instants and
 * the widget writes them itself, so "5:00 PM" and "Tomorrow" stay right while the app is closed,
 * and a row whose time has passed drops out on the widget's own redraws.
 */
export const WIDGET_VERSION = 1;
/** Plans sent; the widget shows the first three still ahead (so later ones move up on their own). */
export const MAX_PLANS = 8;
/** Repeating reminders sent, each with its next occurrences. */
export const MAX_DOSES = 3;
export const DOSE_TIMES = 12;
/** A plan whose times all passed this long ago is left out (Today's "still now" hour). */
export const STILL_NOW_MS = 60 * 60_000;

export interface WidgetWords {
  title: string;
  needs: string;
  tomorrow: string;
  anytime: string;
  next: string;
  done: string;
  empty: string;
  talk: string;
  remind: string;
}

export interface WidgetPlan {
  id: string;
  title: string;
  /** When the row says it happens (the next of its times), or null with no time. */
  at: number | null;
  /** When the row leaves the widget, or null (no time: it stays until done). */
  until: number | null;
}

export interface WidgetDose {
  id: string;
  title: string;
  /** The next occurrences, soonest first. */
  times: number[];
}

export interface WidgetData {
  v: number;
  rtl: boolean;
  /** For the widget's own date words (Latin digits in Arabic). */
  locale: string;
  /** The theme's main colour for the times. */
  accent: string;
  words: WidgetWords;
  needs: { count: number; first: string | null };
  doses: WidgetDose[];
  plans: WidgetPlan[];
}

export interface WidgetInput {
  items: readonly Item[];
  /** "Needs you" rows (today/needs.ts), already in the order Today shows them. */
  needs: readonly { title: string; line: string }[];
  now: Date;
  words: WidgetWords;
  rtl: boolean;
  locale: string;
  accent: string;
  /** Waking hours for repeating reminders (the phone assumes 07:00–23:00, as notifications do). */
  awake?: (at: Date) => boolean;
}

const ms = (at: string | null | undefined) => {
  const n = at ? Date.parse(at) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

const defaultAwake = (at: Date) => awakeAtMinutes(at.getHours() * 60 + at.getMinutes(), "07:00", "23:00");

const PLAN_TYPES = new Set(["reminder", "task"]);

export function widgetData(input: WidgetInput): WidgetData {
  const now = input.now.getTime();
  const from = now - STILL_NOW_MS;
  const awake = input.awake ?? defaultAwake;
  const timed: WidgetPlan[] = [];
  const untimed: WidgetPlan[] = [];
  const doses: (WidgetDose & { first: number })[] = [];

  for (const item of input.items) {
    if (item.status !== "open" || !PLAN_TYPES.has(item.type)) continue;
    const title = item.title.trim();
    if (!title) continue;
    if (item.repeat_every_minutes) {
      const anchor = ms(item.remind_at) ?? ms(item.due_at);
      if (anchor === null) continue;
      // The same occurrences the phone's notifications ring at (notifications/plan.ts).
      const first = anchor > now ? [anchor].filter((t) => awake(new Date(t))) : [];
      const more = nextOccurrences(new Date(anchor), item.repeat_every_minutes, new Date(Math.max(now, anchor)), DOSE_TIMES, awake).map((d) => d.getTime());
      const times = [...first, ...more].slice(0, DOSE_TIMES);
      if (times.length) doses.push({ id: item.id, title, times, first: times[0]! });
      continue;
    }
    const times = [ms(item.remind_at), ms(item.due_at)].filter((t): t is number => t !== null);
    if (!times.length) {
      untimed.push({ id: item.id, title, at: null, until: null });
      continue;
    }
    const latest = Math.max(...times);
    // Every time passed more than an hour ago: an old reminder still open, not something coming up.
    if (latest < from) continue;
    const ahead = times.filter((t) => t >= from);
    timed.push({ id: item.id, title, at: Math.min(...ahead), until: latest + STILL_NOW_MS });
  }

  timed.sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  doses.sort((a, b) => a.first - b.first);
  const first = input.needs[0];
  return {
    v: WIDGET_VERSION,
    rtl: input.rtl,
    locale: input.locale,
    accent: input.accent,
    words: input.words,
    needs: { count: input.needs.length, first: first ? `${first.title} · ${first.line}` : null },
    doses: doses.slice(0, MAX_DOSES).map(({ first: _f, ...d }) => d),
    plans: [...timed, ...untimed].slice(0, MAX_PLANS),
  };
}

/** A Done tap made on the widget (WidgetStore.markDone), as the native module hands it over. */
export interface WidgetTap {
  kind: "plan" | "dose";
  id: string;
  at: number;
  title: string;
}

/** The taps from the module's JSON; anything malformed is dropped, and each plan is answered once. */
export function parseTaps(json: string | null | undefined): WidgetTap[] {
  let raw: unknown;
  try {
    raw = JSON.parse(json || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: WidgetTap[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id) continue;
    const kind = o.kind === "dose" ? "dose" : "plan";
    const at = typeof o.at === "number" ? o.at : 0;
    const key = kind === "dose" ? `d:${o.id}@${at}` : `p:${o.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, id: o.id, at, title: typeof o.title === "string" ? o.title : "" });
  }
  return out;
}

/** Where a widget link opens (fakkarni://widget/<where>), or null for any other link. */
export function widgetRoute(path: string): string | null {
  const m = /^(?:fakkarni:\/\/|\/)?\/?widget\/(chat|remind|today|plans)\b/.exec(path);
  if (!m) return null;
  return { chat: "/", remind: "/?compose=remind", today: "/today", plans: "/upcoming" }[m[1] as "chat" | "remind" | "today" | "plans"];
}
