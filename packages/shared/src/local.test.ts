import { describe, expect, it } from "vitest";
import { CITIES, COUNTRIES, HIJRI_DAYS, cityById, guessCity, holidaysBetween, holidaysIn, isRamadan, localDay, localDefaults, moneyWords, orthodoxEaster, prayerTimes, swapCurrencyWords } from "./local";

const hm = (d: Date, tz: string) => d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
const minutes = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const near = (got: string, want: string, slack = 3) => expect(Math.abs(minutes(got) - minutes(want))).toBeLessThanOrEqual(slack);

describe("cities", () => {
  it("has unique ids, a known country and a real time zone for every city", () => {
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length);
    for (const c of CITIES) {
      expect(COUNTRIES[c.country]).toBeTruthy();
      expect(() => new Intl.DateTimeFormat("en", { timeZone: c.tz })).not.toThrow();
    }
  });

  it("guesses the city from the phone's time zone and prefers the user's pick", () => {
    expect(guessCity("Africa/Cairo")?.id).toBe("cairo");
    expect(guessCity("Europe/London")).toBeNull();
    // A guess gives prayer times and holidays, never another currency.
    expect(localDefaults(null, "Asia/Dubai")).toMatchObject({ guessed: true, country: "AE", currency: { code: "EGP" } });
    expect(localDefaults("jeddah", "Africa/Cairo")).toMatchObject({ guessed: false, country: "SA", currency: { code: "SAR" } });
    expect(localDefaults("nowhere", "Europe/London")).toMatchObject({ city: null, country: null, currency: { code: "EGP" } });
    expect(cityById(undefined)).toBeNull();
  });
});

describe("currency words", () => {
  it("writes amounts in the city's currency", () => {
    expect(moneyWords(120, COUNTRIES.SA.currency, "ar")).toBe("120 ريال");
    expect(moneyWords("1,500", COUNTRIES.AE.currency, "en")).toBe("AED 1,500");
  });

  it("swaps Egyptian pound words, and leaves Egypt's text alone", () => {
    const text = "سجّل {n} جنيه · المبلغ بالجنيه · {n} ج.م · Log EGP {n} · الجنيه";
    expect(swapCurrencyWords(text, COUNTRIES.EG.currency)).toBe(text);
    expect(swapCurrencyWords(text, COUNTRIES.SA.currency)).toBe("سجّل {n} ريال · المبلغ بالريال · {n} ر.س · Log SAR {n} · الريال");
    // Not inside another word.
    expect(swapCurrencyWords("جنيهاتك", COUNTRIES.AE.currency)).toBe("جنيهاتك");
  });
});

describe("prayer times", () => {
  // Published tables (Egyptian General Authority of Survey / Umm al-Qura / UAE awqaf) for the day,
  // within a few minutes: the tables add a safety margin of a minute or two.
  it("is close to Cairo's published times, in winter and in summer time", () => {
    const cairo = cityById("cairo")!;
    const t = prayerTimes("2026-11-27", cairo);
    near(hm(t.fajr, cairo.tz), "04:58");
    near(hm(t.sunrise, cairo.tz), "06:29");
    near(hm(t.dhuhr, cairo.tz), "11:43");
    near(hm(t.asr, cairo.tz), "14:35");
    near(hm(t.maghrib, cairo.tz), "16:57");
    near(hm(t.isha, cairo.tz), "18:17");
    const summer = prayerTimes("2026-07-01", cairo);
    near(hm(summer.dhuhr, cairo.tz), "12:58"); // Egypt keeps summer time (UTC+3)
  });

  it("uses Umm al-Qura's Isha: 90 minutes after Maghrib, 120 in Ramadan", () => {
    const riyadh = cityById("riyadh")!;
    const normal = prayerTimes("2026-11-27", riyadh);
    expect((normal.isha.getTime() - normal.maghrib.getTime()) / 60000).toBe(90);
    const ramadan = prayerTimes("2027-02-20", riyadh);
    expect((ramadan.isha.getTime() - ramadan.maghrib.getTime()) / 60000).toBe(120);
  });

  it("keeps the prayers in order", () => {
    for (const c of CITIES) {
      const t = prayerTimes("2027-03-01", c);
      const order = [t.fajr, t.sunrise, t.dhuhr, t.asr, t.maghrib, t.isha].map((d) => d.getTime());
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });
});

describe("holidays", () => {
  it("matches Node's Umm al-Qura calendar for every moon-based day", () => {
    const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "numeric", timeZone: "UTC" });
    const want = { ramadan: "9/1", eid_fitr: "10/1", arafat: "12/9", eid_adha: "12/10", new_year: "1/1", mawlid: "3/12" } as const;
    for (const [year, days] of Object.entries(HIJRI_DAYS)) {
      for (const [key, day] of Object.entries(days)) {
        expect(day.startsWith(year)).toBe(true);
        const parts = fmt.formatToParts(new Date(`${day}T12:00:00Z`));
        const md = `${parts.find((p) => p.type === "month")?.value}/${parts.find((p) => p.type === "day")?.value}`;
        expect(md, `${key} ${day}`).toBe(want[key as keyof typeof want]);
      }
    }
  });

  it("finds Orthodox Easter (Sham El Nessim is the Monday after)", () => {
    expect(orthodoxEaster(2026)).toBe("2026-04-12");
    expect(orthodoxEaster(2027)).toBe("2027-05-02");
    expect(orthodoxEaster(2028)).toBe("2028-04-16");
    expect(holidaysIn("EG", 2027).find((h) => h.en === "Sham El Nessim")?.day).toBe("2027-05-03");
  });

  it("lists each country's days, moon-based ones as expected", () => {
    const eg = holidaysIn("EG", 2027);
    expect(eg.find((h) => h.en === "Eid al-Fitr")).toMatchObject({ day: "2027-03-09", days: 3, expected: true, off: true });
    expect(eg.find((h) => h.en === "Ramadan starts")).toMatchObject({ off: false });
    expect(eg.find((h) => h.en === "Armed Forces Day")).toMatchObject({ day: "2027-10-06", expected: false });
    expect(holidaysIn("SA", 2027).map((h) => h.en)).toContain("Founding Day");
    expect(holidaysIn("SA", 2027).map((h) => h.en)).not.toContain("Prophet's Birthday");
    expect(holidaysIn("AE", 2026).find((h) => h.en === "National Day")).toMatchObject({ day: "2026-12-02", days: 2 });
  });

  it("includes a holiday that started before the window and still runs", () => {
    expect(holidaysBetween("EG", "2027-03-10", "2027-03-12").map((h) => h.en)).toEqual(["Eid al-Fitr"]);
    expect(holidaysBetween("AE", "2026-11-27", "2026-12-10").map((h) => h.en)).toEqual(["Commemoration Day", "National Day"]);
    expect(holidaysBetween("EG", "2026-12-30", "2027-01-08").map((h) => h.en)).toEqual(["Coptic Christmas"]);
  });

  it("knows Ramadan", () => {
    expect(isRamadan("2027-02-08")).toBe(true);
    expect(isRamadan("2027-03-08")).toBe(true);
    expect(isRamadan("2027-03-09")).toBe(false);
  });

  it("reads the local day at a time zone", () => {
    expect(localDay(new Date("2026-11-27T22:30:00Z"), "Africa/Cairo")).toBe("2026-11-28");
    expect(localDay(new Date("2026-11-27T22:30:00Z"), "UTC")).toBe("2026-11-27");
  });
});
