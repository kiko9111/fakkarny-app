/**
 * Dates and times in Egyptian Arabic, Franco and English, as plain rules ("math", owner ask
 * 2026-11-25): "بكرة الساعة ٦", "el 7ad el sa3a 6", "next Wednesday at 9", "كمان نص ساعة",
 * "every day at 8am", "يوم ١٠", "أول الشهر". Works on the folded message (text.ts `fold`) and
 * reports which characters it used, so the rest of the engine can build a title from what's left.
 */

export interface Clock {
  h: number;
  m: number;
  /** The hour said its half of the day (pm, بالليل, 18:00); false for a bare "٨" read as 8 or 20. */
  explicit?: boolean;
}

export interface WhenResult {
  /** "YYYY-MM-DD" when a day was named (today, tomorrow, a weekday, the 5th...). */
  date?: string;
  /** Clock times in the order written ("٩ الصبح و ٩ بالليل" → two). */
  clocks: Clock[];
  /** "in 2 hours" / "كمان ساعة": minutes from now. */
  relMin?: number;
  /** Minutes between repeats ("every hour" 60, "every day" 1440, "every Sunday" 10080). */
  repeat?: number;
  /** A time of day with no hour ("tomorrow evening") was turned into a clock time. */
  namedTime?: boolean;
  /** "this week", "soon", "after the prayer": a time was meant but none can be computed. */
  vague?: boolean;
  /** It happened already ("yesterday", "امبارح"). */
  past?: boolean;
  /** "before 2" / "قبل الساعة ٢". */
  before?: boolean;
  /** Character spans of the folded text that were part of a date or time. */
  spans: [number, number][];
}

export interface Now {
  /** "YYYY-MM-DDTHH:mm" local. */
  local: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Wall-clock date arithmetic on "YYYY-MM-DD" (no time zone involved). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y!, m! - 1, d! + days));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}

/** "YYYY-MM-DDTHH:mm" + minutes. */
export function addMinutes(local: string, minutes: number): string {
  const [d, t] = local.split("T");
  const [y, mo, da] = d!.split("-").map(Number);
  const [h, mi] = (t ?? "00:00").split(":").map(Number);
  const x = new Date(Date.UTC(y!, mo! - 1, da!, h!, mi! + minutes));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

export const weekdayOf = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
};

export const clockStr = (c: Clock) => `${pad(c.h)}:${pad(c.m)}`;

// Folded spellings (text.ts fold: ا for alef, ه for ة, ي for ى).
const WEEKDAYS: [number, string][] = [
  [0, "الاحد|الحد|el ?7ad|7ad|sunday"],
  [1, "الاتنين|الاثنين|el ?etnein|el ?etneen|el ?etnen|etnein|etneen|itnein|monday"],
  [2, "التلات|الثلاثاء|التلاتاء|الثلاث|التلاته|el ?talat|talat|el ?tala|tuesday"],
  [3, "الاربعاء|الاربع|el ?arba3|arba3|arb3a|wednesday"],
  [4, "الخميس|خميس|el ?5amis|5amis|5ames|khamis|thursday"],
  [5, "الجمعه|جمعه|el ?gom3a|gom3a|gum3a|friday"],
  [6, "السبت|سبت|el ?sabt|sabt|saturday"],
];
const WD = WEEKDAYS.map(([, r]) => r).join("|");

const AM = "الصبح|صباحا|صباحًا|الصباح|el ?sob7|sob7|sobh|morning|am|a\\.m\\.?|الفجر|el ?fagr|fagr";
const NOON = "الضهر|الظهر|ضهرا|el ?dohr|dohr|noon|midday";
const PM = "العصر|el ?3asr|3asr|afternoon|المغرب|el ?maghrib|maghrib|pm|p\\.m\\.?|بعد الضهر";
const NIGHT = "بالليل|بليل|الليل|بالليل|belel|bel ?leil|bel ?lel|belleil|bllel|b ?el ?leil|night|tonight|evening|المسا|بالمسا|bel ?masa|masa2an";

const TODAY = "النهارده|النهارد|النهرده|انهارده|انهرده|النهاردا|enharda|naharda|el ?naharda|elnaharda|ennaharda|enaharda|innaharda|today|tonight|this evening|this morning";
const TOMORROW = "بكره|بكرا|بكرة|bokra|bukra|bokrah|bkra|bokra|tomorrow|tmrw|tomorow|tomorro|2morow|2morrow|2moro";
const AFTER_TOMORROW = "بعد بكره|بعد بكرا|ba3d bokra|b3d bokra|ba3d bukra|day after tomorrow";
const YESTERDAY = "last night|last week|last month|امبارح|امبارحه|embare7|mbare7|embar7|yesterday|كنت|kont\\b|was at";
const VAGUE = "this week|الاسبوع ده|الاسبوع دا|el ?esbo3 da|el ?esbo3 dah|soon|sometime|اخر الاسبوع|end of the week|بعد الصلاه|ba3d el salah|ba3d salat|بعد صلاه";

const re = (s: string, flags = "g") => new RegExp(s, flags);
/** A word boundary that also works next to Arabic letters. */
const B = "(?<![\\p{L}\\d])";
const E = "(?![\\p{L}\\d])";

/** Bare hour → 24h. "٦" alone means 18:00 in Egypt; 8–11 the morning; 12 noon. */
export function hourOf(h: number, period: "am" | "noon" | "pm" | "night" | null, nightContext = false): number {
  if (period === "am") return h === 12 ? 0 : h;
  if (period === "noon") return h < 12 && h <= 5 ? h + 12 : h;
  if (period === "pm") return h < 12 ? h + 12 : h;
  if (period === "night") return h === 12 ? 0 : h <= 3 ? h : h < 12 ? h + 12 : h;
  if (nightContext && h < 12) return h + 12;
  if (h >= 1 && h <= 7) return h + 12;
  return h;
}

function periodNear(f: string, from: number): { p: "am" | "noon" | "pm" | "night"; end: number } | null {
  const rest = f.slice(from, from + 22);
  const m = re(`^\\s*(${AM})|^\\s*(${NOON})|^\\s*(${PM})|^\\s*(${NIGHT})`, "iu").exec(rest);
  if (!m) return null;
  const end = from + m[0].length;
  if (m[1]) return { p: "am", end };
  if (m[2]) return { p: "noon", end };
  if (m[3]) return { p: "pm", end };
  return { p: "night", end };
}

/** Find dates and times in the folded text. */
export function parseWhen(f: string, now: Now): WhenResult {
  const today = now.local.slice(0, 10);
  const out: WhenResult = { clocks: [], spans: [] };
  const take = (m: RegExpExecArray, offset = 0) => out.spans.push([m.index + offset, m.index + offset + m[0].length]);
  const nightContext = re(`${B}(${NIGHT})${E}`, "iu").test(f);

  // --- past: not a plan ---
  if (re(`${B}(${YESTERDAY})${E}`, "iu").test(f)) out.past = true;

  // --- repeats ---
  let m: RegExpExecArray | null;
  const rep = re(
    `${B}(?:every|كل|kol|koll)\\s+(?:(\\d+)\\s+)?(hours?|hrs?|ساعه|ساعات|ساعتين|sa3a|sa3at|sa3teen|days?|يوم|ايام|yom|weeks?|اسبوع|esbo3|morning|night|${WD}|حد|احد|اتنين|تلات|اربع)${E}|${B}(daily|hourly|يوميا|weekly)${E}`,
    "iu",
  ).exec(f);
  let repeatPeriod: "am" | "night" | null = null;
  if (rep) {
    take(rep);
    if (/^(morning)$/i.test(rep[2] ?? "")) repeatPeriod = "am";
    if (/^(night)$/i.test(rep[2] ?? "")) repeatPeriod = "night";
    const n = rep[1] ? Number(rep[1]) : 1;
    const unit = (rep[2] ?? rep[3] ?? "").toLowerCase();
    if (/^(hours?|hrs?|ساعه|ساعات|sa3a|sa3at|hourly)$/.test(unit)) out.repeat = 60 * n;
    else if (/^(ساعتين|sa3teen)$/.test(unit)) out.repeat = 120;
    else if (/^(days?|يوم|ايام|yom|daily|يوميا|morning|night)$/.test(unit)) out.repeat = 1440 * n;
    else if (/^(weeks?|اسبوع|esbo3|weekly)$/.test(unit)) out.repeat = 10080;
    else {
      out.repeat = 10080;
      const bare: Record<string, number> = { حد: 0, احد: 0, اتنين: 1, تلات: 2, اربع: 3 };
      const wd = WEEKDAYS.find(([, r]) => re(`^(${r})$`, "iu").test(unit)) ?? (bare[unit] !== undefined ? ([bare[unit]!, ""] as [number, string]) : undefined);
      if (wd) out.date = nextWeekday(today, wd[0], false);
    }
  }

  // --- relative: "in 2 hours", "كمان ساعة", "kaman rob3 sa3a" ---
  const relRes: [RegExp, (m: RegExpExecArray) => number][] = [
    [re(`${B}in\\s+(\\d+|an?|one|two|three|four|five|ten|fifteen|twenty|thirty|half an?)\\s*(hours?|hrs?|h|minutes?|mins?|min)${E}`, "iu"), (x) => {
      const w = x[1]!.toLowerCase();
      const n = /^\d+$/.test(w) ? Number(w) : ({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30 } as Record<string, number>)[w] ?? 0.5;
      return /^h/.test(x[2]!.toLowerCase()) ? n * 60 : n;
    }],
    [re(`${B}in\\s+half\\s+an\\s+hour${E}`, "iu"), () => 30],
    // "snooze 20 min", "later, 10 minutes", "for 15 mins" (no "in").
    [re(`${B}(?:snooze|later|another)\\s*,?\\s+(\\d+)\\s*(hours?|hrs?|h|minutes?|mins?|min)${E}`, "iu"), (x) => Number(x[1]) * (/^h/i.test(x[2]!) ? 60 : 1)],
    [re(`${B}(?:كمان|بعد)\\s+(?:(\\d+)\\s*)?(نص ساعه|ربع ساعه|ساعه ونص|ساعه الا ربع|ساعتين|ساعات|ساعه|دقيقتين|دقايق|دقيقه|دقائق)${E}`, "u"), (x) => {
      const n = x[1] ? Number(x[1]) : 1;
      const u = x[2]!;
      if (u === "نص ساعه") return 30;
      if (u === "ربع ساعه") return 15;
      if (u === "ساعه ونص") return 90;
      if (u === "ساعه الا ربع") return 45;
      if (u === "ساعتين") return 120;
      if (u.startsWith("ساع")) return 60 * n;
      if (u === "دقيقتين") return 2;
      return n;
    }],
    [re(`${B}(?:kaman|kman|ba3d|b3d)\\s+(?:(\\d+)\\s*)?(nos sa3a|nos sa3a|rob3 sa3a|sa3a w nos|sa3teen|sa3at|sa3a|d2e2tein|d2aye2|da2aye2|d2ay2|de2i2a|de2e2a|d2e2a|d2i2a|d2y2a|minutes?|mins?)${E}`, "iu"), (x) => {
      const n = x[1] ? Number(x[1]) : 1;
      const u = x[2]!.toLowerCase();
      if (u.startsWith("nos")) return 30;
      if (u.startsWith("rob3")) return 15;
      if (u === "sa3a w nos") return 90;
      if (u === "sa3teen") return 120;
      if (u.startsWith("sa3")) return 60 * n;
      if (u === "d2e2tein") return 2;
      return n;
    }],
  ];
  for (const [r, fn] of relRes) {
    m = r.exec(f);
    if (m) {
      out.relMin = fn(m);
      take(m);
      break;
    }
  }
  if (out.repeat && out.repeat < 1440 && !out.relMin) out.relMin = out.repeat;

  // --- days ---
  if ((m = re(`${B}(${AFTER_TOMORROW})${E}`, "iu").exec(f))) {
    out.date = addDays(today, 2);
    take(m);
  } else if ((m = re(`${B}(${TOMORROW})${E}`, "iu").exec(f))) {
    // Late at night "tomorrow morning" can still mean tomorrow; after midnight people say "today".
    out.date = addDays(today, 1);
    take(m);
  } else if ((m = re(`${B}(${TODAY})${E}`, "iu").exec(f))) {
    out.date = today;
    take(m);
  }
  if (!out.date) {
    const wd = re(`${B}(?:(?:on|next|this|يوم|yom)\\s+)?(?:el\\s+)?(${WD})(?:\\s+(?:الجاي|اللي جاي|الي جاي|el ?gay|elly gay|gay|next|coming))?${E}`, "iu").exec(f);
    if (wd) {
      const name = wd[1]!;
      const hit = WEEKDAYS.find(([, r]) => re(`^(?:${r})$`, "iu").test(name));
      if (hit) {
        out.date = nextWeekday(today, hit[0], false);
        take(wd);
      }
    }
  }
  if (!out.date && (m = re(`${B}(اول الشهر|اول شهر|awel el shahr|awel shahr|first of the month|beginning of the month|the 1st)${E}`, "iu").exec(f))) {
    out.date = dayOfMonth(today, 1, true);
    take(m);
  }
  if (!out.date) {
    const dom =
      re(`${B}(?:(?:قبل|abl|before)\\s+)?(?:يوم|yom|on the|the|on)\\s+(\\d{1,2})(?:st|nd|rd|th)?${E}(?!\\s*(?:الساعه|ساعه|sa3a|hours?|days?|ايام|يوم|دقيق|min))`, "iu").exec(f) ??
      re(`${B}(\\d{1,2})(?:st|nd|rd|th)${E}`, "iu").exec(f);
    if (dom) {
      const d = Number(dom[1]);
      if (d >= 1 && d <= 31) {
        out.date = dayOfMonth(today, d, false);
        take(dom);
      }
    }
  }
  if ((m = re(`${B}(${VAGUE})${E}`, "iu").exec(f))) {
    out.vague = true;
    take(m);
  }

  // --- clock times ---
  const clockRe = re(
    `(?:${B}(before|قبل|abl)\\s+)?(?:(?<=(?:before|قبل|abl)\\s+)|${B}(?:و|w ?)?(?:at|الساعه|الساعة|el ?sa3a|elsa3a|asa3a|essa3a|sa3a|saa|الساعه)\\s*)(\\d{1,2})(?!\\d)(?:[:.](\\d{2}))?(\\s*(?:و ?نص|w ?nos|wnos|and a half|w ?rob3|وربع|الا ربع|ela rob3|illa rob3))?|${B}(\\d{1,2}):(\\d{2})|${B}(\\d{1,2})\\s*(am|pm|a\\.m\\.|p\\.m\\.)${E}|${B}(\\d{1,2})(?=\\s*(?:${AM}|${NOON}|${PM}|${NIGHT})${E})`,
    "giu",
  );
  const used: [number, number][] = [];
  while ((m = clockRe.exec(f))) {
    const h0 = Number(m[2] ?? m[5] ?? m[7] ?? m[9]);
    let mm = Number(m[3] ?? m[6] ?? 0);
    const extra = (m[4] ?? "").trim();
    if (/نص|nos|half/.test(extra)) mm = 30;
    else if (/الا ربع|ela rob3|illa rob3/.test(extra)) mm = -15;
    else if (/ربع|rob3/.test(extra)) mm = 15;
    if (h0 > 23 || mm > 59) continue;
    let period: "am" | "noon" | "pm" | "night" | null = m[8] ? (/^a/i.test(m[8]) ? "am" : "pm") : null;
    let end = m.index + m[0].length;
    if (!period) {
      const p = periodNear(f, end);
      if (p) {
        period = p.p;
        end = p.end;
      }
    }
    if (!period && repeatPeriod) period = repeatPeriod;
    if (m[1]) out.before = true;
    let h = h0 > 12 ? h0 : hourOf(h0, period, nightContext && !period);
    const explicit = Boolean(period) || h0 > 12 || h0 === 0;
    if (mm < 0) {
      h = (h + 23) % 24;
      mm += 60;
    }
    out.clocks.push({ h, m: mm, explicit });
    used.push([m.index, end]);
    // Chained hours: "at 9 and 9", "٩ الصبح و ٩ بالليل", "10 w 2 w 6", "9, 1 and 5".
    const chain = re(`^(?:\\s*(?:,|،|and|و|w|ثم|then)\\s*(?:at\\s+|الساعه\\s+|el sa3a\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?)`, "iu");
    let c: RegExpExecArray | null;
    while ((c = chain.exec(f.slice(end)))) {
      const ch = Number(c[1]);
      if (ch > 23) break;
      let cEnd = end + c[0].length;
      const p = periodNear(f, cEnd);
      if (p) cEnd = p.end;
      let chH = ch > 12 ? ch : hourOf(ch, p?.p ?? null, nightContext && !p);
      // "٢ و ٨" with no period words: a later hour in the same list goes forward (14:00 then 20:00).
      const prev = out.clocks[out.clocks.length - 1]!;
      if (!p && ch <= 12 && chH <= prev.h && chH + 12 < 24) chH += 12;
      out.clocks.push({ h: chH, m: Number(c[2] ?? 0) });
      used.push([end, cEnd]);
      end = cEnd;
    }
    clockRe.lastIndex = end;
  }
  out.spans.push(...used);
  if (!out.clocks.length && !out.relMin) bareHour(f, out, nightContext);
  // "6:30" / "5:45pm" were caught above; a period word alone ("tomorrow evening") is a named time.
  if (!out.clocks.length && !out.relMin) {
    const named: [string, Clock][] = [
      [AM.replace(/\|am\|a\\\.m\\\.\?/, ""), { h: 9, m: 0 }],
      [NOON, { h: 12, m: 0 }],
      ["العصر|el ?3asr|3asr|afternoon|بعد الضهر", { h: 16, m: 0 }],
      ["evening|المسا|بالمسا|المغرب|bel ?masa|el ?maghrib", { h: 19, m: 0 }],
      ["بالليل|بليل|belel|bel ?leil|bel ?lel|tonight|night", { h: 21, m: 0 }],
    ];
    for (const [words, clock] of named) {
      const n = re(`${B}(${words})${E}`, "iu").exec(f);
      if (n) {
        if (/fagr|الفجر/.test(n[1]!)) continue;
        out.clocks.push(clock);
        out.namedTime = true;
        take(n);
        if (/tonight/i.test(n[1]!) && !out.date) out.date = today;
        break;
      }
    }
  }
  // Remaining period words next to nothing ("الصبح" after a clock) are already in the clock spans.
  return out;
}

// A bare hour, as people type it: "bokra 9", "صحيني بكرة ٦ ونص", "فكرني ٢ أخد عمر", "5 ela rob3".
// Only right after a day word or a remind / alarm verb, or with a half / quarter after it, and
// never before a unit ("3 kobayat", "٥ جنيه", "10 pages").
const BARE_BEFORE = `${TOMORROW}|${AFTER_TOMORROW}|${TODAY}|${WD}|فكرني|فكريني|ذكرني|نبهني|صحيني|منبه|fakarny|fakkarny|fkrny|fakarni|fakrny|sa7eeny|sa7eny|sa7any|mnabeh|monabeh|remind me|wake me|alarm`;
const BARE_UNIT = "جنيه|ج|جنية|ريال|دولار|pounds?|egp|le|\\$|كوبايه|كوبايات|كوباية|kobaya|kobayat|glass|glasses|cups?|صفحه|صفحات|saf7a|saf7at|pages?|مرات|marat|times|ايام|يوم|days?|اسابيع|weeks?|شهور|months?|ساعه|ساعات|sa3a|sa3at|hours?|دقيقه|دقايق|d2aye2|da2aye2|minutes?|mins?|كيلو|kilo|kg|km|افراد|اشخاص|people|persons|عيال|wlad|ولاد|حاجات|حاجه|items?|%";
function bareHour(f: string, out: WhenResult, nightContext: boolean) {
  const r = re(
    `(?:${B}(?:${BARE_BEFORE})\\s*(?:,|،)?\\s*)(\\d{1,2})(?!\\d|[:.]\\d)(\\s*(?:و ?نص|w ?nos|wnos|and a half|w ?rob3|وربع|الا ربع|ela rob3|illa rob3))?${E}(?!\\s*(?:${BARE_UNIT})${E})|${B}(\\d{1,2})(\\s*(?:و ?نص|w ?nos|wnos|w ?rob3|وربع|الا ربع|ela rob3|illa rob3))${E}`,
    "iu",
  );
  const m = r.exec(f);
  if (!m) return;
  const h0 = Number(m[1] ?? m[3]);
  if (h0 < 1 || h0 > 12) return;
  const extra = (m[2] ?? m[4] ?? "").trim();
  let mm = /نص|nos|half/.test(extra) ? 30 : /الا ربع|ela rob3|illa rob3/.test(extra) ? -15 : /ربع|rob3/.test(extra) ? 15 : 0;
  let end = m.index + m[0].length;
  const p = periodNear(f, end);
  if (p) end = p.end;
  let h = hourOf(h0, p?.p ?? null, nightContext && !p);
  if (mm < 0) {
    h = (h + 23) % 24;
    mm += 60;
  }
  out.clocks.push({ h, m: mm, explicit: Boolean(p) });
  const numStart = m.index + m[0].search(/\d/);
  out.spans.push([numStart, end]);
}

export function nextWeekday(today: string, wd: number, allowToday: boolean): string {
  const diff = (wd - weekdayOf(today) + 7) % 7;
  return addDays(today, diff === 0 && !allowToday ? 7 : diff);
}

export function dayOfMonth(today: string, d: number, forceNext: boolean): string {
  const [y, m, cur] = today.split("-").map(Number);
  let yy = y!;
  let mm = m!;
  if (forceNext || d <= cur!) {
    mm += 1;
    if (mm > 12) {
      mm = 1;
      yy += 1;
    }
  }
  return `${yy}-${pad(mm)}-${pad(d)}`;
}

/**
 * The local times the parse means, one per clock (or one for "in N minutes").
 * A time with no day is today if still ahead, else tomorrow.
 */
export function resolveTimes(w: WhenResult, now: Now): string[] {
  const today = now.local.slice(0, 10);
  const nowHm = now.local.slice(11, 16);
  if (w.relMin && !w.clocks.length) return [addMinutes(now.local, w.relMin)];
  return w.clocks.map((c) => {
    // A bare 8–11 that already passed today while its evening twin is still ahead ("الساعة ٨"
    // said at 10 am) means the evening.
    const hm0 = clockStr(c);
    const hm = !w.date && c.explicit === false && c.h >= 8 && c.h <= 11 && hm0 <= nowHm && clockStr({ h: c.h + 12, m: c.m }) > nowHm ? clockStr({ h: c.h + 12, m: c.m }) : hm0;
    if (w.date) return `${w.date}T${hm}`;
    return hm > nowHm ? `${today}T${hm}` : `${addDays(today, 1)}T${hm}`;
  });
}
