/**
 * Local defaults by city (2026-11-27, kareem: "local defaults by city"). The user picks a city once
 * (never an exact spot); it sets the currency, the prayer times, the holiday calendar and the
 * helpline country. Pure: used by the server (context, wording, new Daftar entries) and the phone
 * (City screen, currency words in the app's strings).
 *
 * Add a country: COUNTRIES (currency, prayer method), HOLIDAYS_FIXED / ISLAMIC_HOLIDAYS, cities in
 * CITIES, and its helpline in apps/api/src/persona/prompt.ts (checked against official sources).
 * Moon-based days come from HIJRI_DAYS (Umm al-Qura); add each new year there, local.test.ts
 * checks them against Node's islamic-umalqura calendar. Countries that sight the moon may differ
 * by a day, so those days are "expected".
 */

export type CountryCode = "EG" | "SA" | "AE";

export interface Currency {
  code: string;
  /** Written after the number in Arabic: "120 جنيه". */
  ar: string;
  /** The short sign in Arabic: "120 ج.م". */
  arShort: string;
}

interface PrayerMethod {
  fajr: number;
  /** Degrees below the horizon, or minutes after Maghrib (with ramadanIsha in Ramadan). */
  isha: { angle: number } | { minutes: number; ramadan: number };
}

export const COUNTRIES: Record<CountryCode, { en: string; ar: string; currency: Currency; prayer: PrayerMethod }> = {
  // Egyptian General Authority of Survey.
  EG: { en: "Egypt", ar: "مصر", currency: { code: "EGP", ar: "جنيه", arShort: "ج.م" }, prayer: { fajr: 19.5, isha: { angle: 17.5 } } },
  // Umm al-Qura: Isha 90 minutes after Maghrib, 120 in Ramadan.
  SA: { en: "Saudi Arabia", ar: "السعودية", currency: { code: "SAR", ar: "ريال", arShort: "ر.س" }, prayer: { fajr: 18.5, isha: { minutes: 90, ramadan: 120 } } },
  // UAE (General Authority of Islamic Affairs).
  AE: { en: "UAE", ar: "الإمارات", currency: { code: "AED", ar: "درهم", arShort: "د.إ" }, prayer: { fajr: 18.2, isha: { angle: 18.2 } } },
};

export interface City {
  id: string;
  en: string;
  ar: string;
  country: CountryCode;
  tz: string;
  lat: number;
  lon: number;
}

const c = (id: string, en: string, ar: string, country: CountryCode, tz: string, lat: number, lon: number): City => ({ id, en, ar, country, tz, lat, lon });
const EG = "Africa/Cairo";
const SA = "Asia/Riyadh";
const AE = "Asia/Dubai";

/** In the order the picker shows them: the country's biggest cities first. */
export const CITIES: City[] = [
  c("cairo", "Cairo", "القاهرة", "EG", EG, 30.0444, 31.2357),
  c("giza", "Giza", "الجيزة", "EG", EG, 30.0131, 31.2089),
  c("alexandria", "Alexandria", "الإسكندرية", "EG", EG, 31.2001, 29.9187),
  c("mansoura", "Mansoura", "المنصورة", "EG", EG, 31.0409, 31.3785),
  c("tanta", "Tanta", "طنطا", "EG", EG, 30.7865, 31.0004),
  c("zagazig", "Zagazig", "الزقازيق", "EG", EG, 30.5877, 31.502),
  c("damanhour", "Damanhour", "دمنهور", "EG", EG, 31.0341, 30.4682),
  c("kafr_el_sheikh", "Kafr El Sheikh", "كفر الشيخ", "EG", EG, 31.1107, 30.9388),
  c("port_said", "Port Said", "بورسعيد", "EG", EG, 31.2653, 32.3019),
  c("ismailia", "Ismailia", "الإسماعيلية", "EG", EG, 30.5965, 32.2715),
  c("suez", "Suez", "السويس", "EG", EG, 29.9668, 32.5498),
  c("fayoum", "Fayoum", "الفيوم", "EG", EG, 29.3084, 30.8428),
  c("beni_suef", "Beni Suef", "بني سويف", "EG", EG, 29.0661, 31.0994),
  c("minya", "Minya", "المنيا", "EG", EG, 28.0871, 30.7618),
  c("assiut", "Assiut", "أسيوط", "EG", EG, 27.1809, 31.1837),
  c("sohag", "Sohag", "سوهاج", "EG", EG, 26.5591, 31.6957),
  c("luxor", "Luxor", "الأقصر", "EG", EG, 25.6872, 32.6396),
  c("aswan", "Aswan", "أسوان", "EG", EG, 24.0889, 32.8998),
  c("hurghada", "Hurghada", "الغردقة", "EG", EG, 27.2579, 33.8116),
  c("sharm", "Sharm El Sheikh", "شرم الشيخ", "EG", EG, 27.9158, 34.33),
  c("marsa_matrouh", "Marsa Matrouh", "مرسى مطروح", "EG", EG, 31.3543, 27.2373),
  c("riyadh", "Riyadh", "الرياض", "SA", SA, 24.7136, 46.6753),
  c("jeddah", "Jeddah", "جدة", "SA", SA, 21.4858, 39.1925),
  c("makkah", "Makkah", "مكة", "SA", SA, 21.3891, 39.8579),
  c("madinah", "Madinah", "المدينة", "SA", SA, 24.5247, 39.5692),
  c("dammam", "Dammam", "الدمام", "SA", SA, 26.4207, 50.0888),
  c("dubai", "Dubai", "دبي", "AE", AE, 25.2048, 55.2708),
  c("abu_dhabi", "Abu Dhabi", "أبوظبي", "AE", AE, 24.4539, 54.3773),
  c("sharjah", "Sharjah", "الشارقة", "AE", AE, 25.3463, 55.4209),
];

export const CITY_IDS = CITIES.map((x) => x.id) as [string, ...string[]];

const BY_ID = new Map(CITIES.map((x) => [x.id, x]));
export function cityById(id: string | null | undefined): City | null {
  return (id && BY_ID.get(id)) || null;
}

/** The city a phone's time zone points to, before the user picks one. */
const ZONE_CITY: Record<string, string> = { "Africa/Cairo": "cairo", "Asia/Riyadh": "riyadh", "Asia/Dubai": "dubai" };
export function guessCity(timezone: string | null | undefined): City | null {
  return cityById(ZONE_CITY[timezone ?? ""]);
}

export interface LocalDefaults {
  /** The chosen city, else the one the time zone points to; null when neither is known. */
  city: City | null;
  /** True when the user has not picked the city (it was guessed from the time zone). */
  guessed: boolean;
  country: CountryCode | null;
  /** From the picked city only: a guess never changes the money the app writes. */
  currency: Currency;
}

/** Egyptian pounds unless the user is known to be somewhere else (the app started in Egypt). */
export const DEFAULT_CURRENCY = COUNTRIES.EG.currency;

export function localDefaults(cityId: string | null | undefined, timezone?: string | null): LocalDefaults {
  const chosen = cityById(cityId);
  const city = chosen ?? guessCity(timezone);
  const country = city?.country ?? null;
  return { city, guessed: !chosen, country, currency: currencyOf(cityId) };
}

/** The currency of the city the user picked; Egyptian pounds until they pick one. */
export function currencyOf(cityId: string | null | undefined): Currency {
  const city = cityById(cityId);
  return city ? COUNTRIES[city.country].currency : DEFAULT_CURRENCY;
}

/** The currency with this code, when the app knows its words. */
export function currencyByCode(code: string): Currency | null {
  return Object.values(COUNTRIES).find((x) => x.currency.code === code)?.currency ?? null;
}

/** "120 جنيه" / "EGP 120", in the currency of the user's city. */
export function moneyWords(amount: string | number, currency: Currency, lang: "ar" | "en"): string {
  return lang === "ar" ? `${amount} ${currency.ar}` : `${currency.code} ${amount}`;
}

/**
 * Rewrites Egyptian-pound words in a text written for Egypt ("120 جنيه", "EGP 120", "ج.م",
 * "بالجنيه") into another currency. The phone runs it over its strings once at start-up; a text
 * for EGP comes back unchanged.
 */
export function swapCurrencyWords(text: string, currency: Currency): string {
  if (currency.code === "EGP") return text;
  return text
    .replace(/(^|[^\u0621-\u064A])(ال|بال)?جنيه(?:ات)?(?![\u0621-\u064A])/g, (_m, pre: string, art: string | undefined) => `${pre}${art ?? ""}${currency.ar}`)
    .replace(/ج\.م/g, currency.arShort)
    .replace(/\bEGP\b/g, currency.code);
}

// ---------------------------------------------------------------- prayer times

export type PrayerName = "fajr" | "sunrise" | "dhuhr" | "asr" | "maghrib" | "isha";
export const PRAYER_NAMES: PrayerName[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
export const PRAYER_WORDS: Record<PrayerName, { en: string; ar: string }> = {
  fajr: { en: "Fajr", ar: "الفجر" },
  sunrise: { en: "Sunrise", ar: "الشروق" },
  dhuhr: { en: "Dhuhr", ar: "الظهر" },
  asr: { en: "Asr", ar: "العصر" },
  maghrib: { en: "Maghrib", ar: "المغرب" },
  isha: { en: "Isha", ar: "العشاء" },
};

const RAD = Math.PI / 180;
const sin = (d: number) => Math.sin(d * RAD);
const cos = (d: number) => Math.cos(d * RAD);
const tan = (d: number) => Math.tan(d * RAD);
const fix = (a: number, b: number) => ((a % b) + b) % b;

/** The sun's declination and the equation of time (hours) at a Julian day. */
function sun(jd: number): { decl: number; eqt: number } {
  const d = jd - 2451545.0;
  const g = fix(357.529 + 0.98560028 * d, 360);
  const q = fix(280.459 + 0.98564736 * d, 360);
  const l = fix(q + 1.915 * sin(g) + 0.02 * sin(2 * g), 360);
  const e = 23.439 - 0.00000036 * d;
  const ra = fix(Math.atan2(cos(e) * sin(l), cos(l)) / RAD / 15, 24);
  return { decl: Math.asin(sin(e) * sin(l)) / RAD, eqt: q / 15 - ra };
}

/**
 * Prayer times for one local date ("YYYY-MM-DD") at a city, as instants. The standard
 * astronomical method (as praytimes.org), with the city's country's angles and Shafi'i Asr.
 * Within a minute or two of the official tables; shown as "about".
 */
export function prayerTimes(day: string, city: City): Record<PrayerName, Date> {
  const [y, m, dd] = day.split("-").map(Number) as [number, number, number];
  const method = COUNTRIES[city.country].prayer;
  const midnightUtc = Date.UTC(y, m - 1, dd);
  // Julian day at local solar noon, where the sun's position is read.
  const jd = midnightUtc / 86400000 + 2440587.5 + 0.5 - city.lon / 360;
  const { decl, eqt } = sun(jd);
  const noon = 12 - eqt - city.lon / 15; // hours, UTC
  const hourAngle = (altitude: number) => {
    const x = (sin(altitude) - sin(city.lat) * sin(decl)) / (cos(city.lat) * cos(decl));
    return Math.acos(Math.max(-1, Math.min(1, x))) / RAD / 15;
  };
  const asrAltitude = Math.atan(1 / (1 + tan(Math.abs(city.lat - decl)))) / RAD;
  const at = (hours: number) => new Date(midnightUtc + Math.round(hours * 60) * 60000);
  const maghrib = noon + hourAngle(-0.833);
  const isha = "angle" in method.isha ? noon + hourAngle(-method.isha.angle) : maghrib + (isRamadan(day) ? method.isha.ramadan : method.isha.minutes) / 60;
  return {
    fajr: at(noon - hourAngle(-method.fajr)),
    sunrise: at(noon - hourAngle(-0.833)),
    // A minute after the sun's highest point, as the published tables do.
    dhuhr: at(noon + 1 / 60),
    asr: at(noon + hourAngle(asrAltitude)),
    maghrib: at(maghrib),
    isha: at(isha),
  };
}

// ---------------------------------------------------------------- holidays

/** Umm al-Qura dates (Gregorian) of the moon-based days, by year. Checked in local.test.ts. */
export const HIJRI_DAYS: Record<number, { ramadan: string; eid_fitr: string; arafat: string; eid_adha: string; new_year: string; mawlid: string }> = {
  2026: { ramadan: "2026-02-18", eid_fitr: "2026-03-20", arafat: "2026-05-26", eid_adha: "2026-05-27", new_year: "2026-06-16", mawlid: "2026-08-25" },
  2027: { ramadan: "2027-02-08", eid_fitr: "2027-03-09", arafat: "2027-05-15", eid_adha: "2027-05-16", new_year: "2027-06-06", mawlid: "2027-08-14" },
  2028: { ramadan: "2028-01-28", eid_fitr: "2028-02-26", arafat: "2028-05-04", eid_adha: "2028-05-05", new_year: "2028-05-25", mawlid: "2028-08-03" },
  2029: { ramadan: "2029-01-16", eid_fitr: "2029-02-14", arafat: "2029-04-23", eid_adha: "2029-04-24", new_year: "2029-05-14", mawlid: "2029-07-24" },
};

export function isRamadan(day: string): boolean {
  const y = Number(day.slice(0, 4));
  return [y, y - 1].some((yy) => {
    const h = HIJRI_DAYS[yy];
    return !!h && day >= h.ramadan && day < h.eid_fitr;
  });
}

export interface Holiday {
  /** First day, local "YYYY-MM-DD". */
  day: string;
  /** How many days in a row it lasts. */
  days: number;
  en: string;
  ar: string;
  /** Moon-based: the date may move by a day when the moon is sighted. */
  expected: boolean;
  /** False for an occasion that is not a day off (the start of Ramadan). */
  off: boolean;
}

type IslamicKey = keyof (typeof HIJRI_DAYS)[number];
const ISLAMIC_WORDS: Record<IslamicKey, { en: string; ar: string }> = {
  ramadan: { en: "Ramadan starts", ar: "أول رمضان" },
  eid_fitr: { en: "Eid al-Fitr", ar: "عيد الفطر" },
  arafat: { en: "Arafat Day", ar: "وقفة عرفات" },
  eid_adha: { en: "Eid al-Adha", ar: "عيد الأضحى" },
  new_year: { en: "Islamic New Year", ar: "رأس السنة الهجرية" },
  mawlid: { en: "Prophet's Birthday", ar: "المولد النبوي" },
};
/** Moon-based days each country keeps, with how many days off. */
const ISLAMIC_HOLIDAYS: Record<CountryCode, Partial<Record<IslamicKey, number>>> = {
  EG: { ramadan: 0, eid_fitr: 3, arafat: 1, eid_adha: 3, new_year: 1, mawlid: 1 },
  SA: { ramadan: 0, eid_fitr: 4, arafat: 1, eid_adha: 3 },
  AE: { ramadan: 0, eid_fitr: 3, arafat: 1, eid_adha: 3, new_year: 1, mawlid: 1 },
};
/** Fixed-date public holidays ("MM-DD"); "easter+1" is the Monday after Orthodox Easter. */
const HOLIDAYS_FIXED: Record<CountryCode, { date: string; days?: number; en: string; ar: string }[]> = {
  EG: [
    { date: "01-07", en: "Coptic Christmas", ar: "عيد الميلاد المجيد" },
    { date: "01-25", en: "Revolution and Police Day", ar: "عيد ثورة 25 يناير وعيد الشرطة" },
    { date: "easter+1", en: "Sham El Nessim", ar: "شم النسيم" },
    { date: "04-25", en: "Sinai Liberation Day", ar: "عيد تحرير سيناء" },
    { date: "05-01", en: "Labour Day", ar: "عيد العمال" },
    { date: "06-30", en: "June 30 Revolution", ar: "ذكرى ثورة 30 يونيو" },
    { date: "07-23", en: "Revolution Day", ar: "عيد ثورة 23 يوليو" },
    { date: "10-06", en: "Armed Forces Day", ar: "عيد القوات المسلحة" },
  ],
  SA: [
    { date: "02-22", en: "Founding Day", ar: "يوم التأسيس" },
    { date: "09-23", en: "National Day", ar: "اليوم الوطني" },
  ],
  AE: [
    { date: "01-01", en: "New Year's Day", ar: "رأس السنة الميلادية" },
    { date: "12-01", en: "Commemoration Day", ar: "يوم الشهيد" },
    { date: "12-02", days: 2, en: "National Day", ar: "عيد الاتحاد" },
  ],
};

/** Orthodox Easter Sunday (Gregorian "YYYY-MM-DD"), Meeus' Julian algorithm, years 1900-2099. */
export function orthodoxEaster(year: number): string {
  const a = year % 4;
  const b = year % 7;
  const cc = year % 19;
  const d = (19 * cc + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return isoDay(new Date(Date.UTC(year, month - 1, day + 13)));
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000));

/** A country's holidays in one year, in date order. */
export function holidaysIn(country: CountryCode, year: number): Holiday[] {
  const out: Holiday[] = [];
  for (const h of HOLIDAYS_FIXED[country]) {
    const day = h.date === "easter+1" ? plusDays(orthodoxEaster(year), 1) : `${year}-${h.date}`;
    out.push({ day, days: h.days ?? 1, en: h.en, ar: h.ar, expected: false, off: true });
  }
  const hijri = HIJRI_DAYS[year];
  if (hijri) {
    for (const [key, days] of Object.entries(ISLAMIC_HOLIDAYS[country]) as [IslamicKey, number][]) {
      out.push({ day: hijri[key], days: Math.max(1, days), ...ISLAMIC_WORDS[key], expected: true, off: days > 0 });
    }
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Holidays that are on, or start, from `from` to `to` (local days, both included), or still run on `from`. */
export function holidaysBetween(country: CountryCode, from: string, to: string): Holiday[] {
  const years = new Set([Number(from.slice(0, 4)) - 1, Number(from.slice(0, 4)), Number(to.slice(0, 4))]);
  return [...years]
    .flatMap((y) => holidaysIn(country, y))
    .filter((h) => h.day <= to && plusDays(h.day, h.days - 1) >= from)
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Today's local date at a time zone, "YYYY-MM-DD". */
export function localDay(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
