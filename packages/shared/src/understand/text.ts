/**
 * Text helpers for Zaki's rule engine (understand/): folding Arabic spelling variants, digits,
 * number words, script detection, and a small Franco → Arabic word list for titles and names.
 * Pure functions, no I/O: the same code runs on the server and (later) on the phone.
 */

/** Arabic-Indic and Persian digits → ASCII. */
export const asciiDigits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** One spelling for matching: lower case, ASCII digits, no diacritics/tatweel, ا for every alef, ه for ة, ي for ى. */
export function fold(s: string): string {
  return asciiDigits(s)
    // "١٬٢٠٠" / "1,200": thousands separators go, so the number reads as one.
    .replace(/(\d)[٬,](\d{3})(?!\d)/g, "$1$2")
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[’‘`]/g, "'");
}

export type Script = "arabic" | "franco" | "english";

const FRANCO_HINT =
  /\b(ana|enta|enty|3andy|3andi|fakarny|fakkarny|fkrny|bokra|bukra|enharda|naharda|lazem|3ayez|3ayza|msh|mesh|el|w|ya|ba3d|abl|sa3a|yom|ma3|bta3|bta3ty|kaman|5alas|5las|aywa|la2|tayeb|tyb|keda|eh|leh|feen|ezay|2ol|5ali|sagel|sgl|dafa3t|me7tag|3aleh|3aleha|meny|men|lel|fel|bel|yalla|mashy|tamam|salaft|sallaft|sraft|saraft|raga3ly|raga3li|shrebt|2areet|gebt|3amalt|klmt|kalemt|mestalef|olghy|e3mel|2assem|2asem|sa7eeny|la2|mafeesh|2e2flo|5aly|5ali|edeet|wageb|3eila)\b/i;

/** How the user writes. A Latin message with Franco words or digits inside words is Franco. */
export function scriptOf(text: string): Script {
  if (/[؀-ۿ]/.test(text)) return "arabic";
  const t = text.toLowerCase();
  if (/[a-z][2357893][a-z]|\b[2357](?!(?:am|pm|th|st|nd|rd)\b)[a-z]{2,}|[a-z]{2,}[2357]\b/.test(t)) return "franco";
  const words = t.match(/[a-z']+/g) ?? [];
  const hits = words.filter((w) => FRANCO_HINT.test(w)).length;
  return hits >= 1 && hits >= words.length / 5 ? "franco" : "english";
}

// ---------- numbers ----------

const UNITS: Record<string, number> = {
  // Arabic (folded)
  واحد: 1, واحده: 1, اتنين: 2, اثنين: 2, تلاته: 3, ثلاثه: 3, اربعه: 4, خمسه: 5, سته: 6, سبعه: 7, تمانيه: 8, ثمانيه: 8, تسعه: 9, عشره: 10,
  حداشر: 11, اتناشر: 12, خمستاشر: 15, عشرين: 20, تلاتين: 30, اربعين: 40, خمسين: 50, ستين: 60, سبعين: 70, تمانين: 80, تسعين: 90,
  ميتين: 200, تلتميه: 300, ربعميه: 400, خمسميه: 500, ستميه: 600, سبعميه: 700, تمنميه: 800, تسعميه: 900, الف: 1000, الفين: 2000,
  // Franco
  wa7ed: 1, etnein: 2, etneen: 2, talata: 3, arba3a: 4, "5amsa": 5, khamsa: 5, setta: 6, sab3a: 7, tamanya: 8, tes3a: 9, "3ashara": 10, "3eshreen": 20,
  "5amseen": 50, miteen: 200, meteen: 200, alf: 1000, alfeen: 2000,
  // English
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, hundred: 100,
};

/** A number written as digits (with k / alf / ألف after it) or as one number word. */
export function numberAt(tok: string, next?: string): { value: number; used: number } | null {
  const t = fold(tok).replace(/^(ب|بـ|b)/, "").replace(/[,،]$/, "");
  const m = /^(\d+(?:[.,]\d+)?)(k|K|ك|الف|alf)?$/.exec(t);
  let value: number | null = null;
  let used = 1;
  if (m) {
    value = Number(m[1]!.replace(",", "."));
    if (m[2]) value *= 1000;
    else if (next && /^(الف|الاف|alf|thousand|k)$/i.test(fold(next))) {
      value *= 1000;
      used = 2;
    }
  } else if (UNITS[t] !== undefined) value = UNITS[t]!;
  return value === null || !Number.isFinite(value) ? null : { value, used };
}

// ---------- Franco → Arabic (titles, names) ----------

/** Common Franco words → Arabic, for titles in Arabic letters ("fakarny akalem mama" → "أكلم ماما"). */
export const FRANCO_WORDS: Record<string, string> = {
  dentist: "دكتور السنان", doctor: "دكتور", doktor: "دكتور", dr: "دكتور", asnan: "السنان", "3eyoon": "العيون", "3uyoon": "العيون",
  meeting: "ميتنج", manager: "المدير", modeer: "المدير", gym: "الجيم", bus: "باص", madrasa: "المدرسة", omar: "عمر", dawa: "الدوا",
  tayara: "الطيارة", sabak: "السباك", mechanic: "الميكانيكي", mekaneeky: "الميكانيكي", "3arabeya": "العربية", "3arabiya": "العربية",
  "3eyal": "العيال", tamreen: "التمرين", report: "التقرير", egar: "الإيجار", kahraba: "الكهربا", mama: "ماما", baba: "بابا",
  bank: "البنك", ghada: "الغدا", "3asha": "العشا", mariam: "مريم", passport: "الباسبور", forn: "الفرن", maya: "مية", mayya: "مية",
  mayyah: "مية", mya: "مية", mo2abla: "مقابلة", sara: "سارة", hedeya: "هدية", hedeyya: "هدية", "3esh": "عيش", "3eesh": "عيش",
  gebna: "جبنة", laban: "لبن", akalem: "أكلم", akalm: "أكلم", aklem: "أكلم", adfa3: "أدفع", ashrab: "أشرب", a2fel: "أقفل",
  agaded: "أجدد", a7gez: "أحجز", ab3at: "أبعت", ageb: "أجيب", ageblaha: "أجيبلها", agebloh: "أجيبله", ageblo: "أجيبله", ma3: "مع",
  kashf: "الكشف", dars: "درس", training: "تمرين", "3agala": "العجلة", mashy: "المشي", "mashi": "المشي", nom: "النوم", "2oran": "القرآن",
  quran: "القرآن", akl: "أكل", benzeen: "بنزين", madares: "مدارس", "3eela": "العيلة", "3ela": "العيلة", "3eila": "العيلة", "3eyla": "العيلة", "3ayla": "العيلة", beit: "البيت", bet: "البيت",
  shoghl: "الشغل", "sho8l": "الشغل", ahwa: "قهوة", "2ahwa": "قهوة", "3omra": "عمرة", hagz: "حجز", "3ezooma": "عزومة", fara7: "فرح",
  khaled: "خالد", "5aled": "خالد", mona: "منى", laila: "ليلى", layla: "ليلى", leila: "ليلى", hassan: "حسن", "7assan": "حسن", karim: "كريم",
  kareem: "كريم", ahmed: "أحمد", a7med: "أحمد", mohamed: "محمد", mhmd: "محمد", mo7amed: "محمد", ma7moud: "محمود", mahmoud: "محمود",
  nour: "نور", ali: "علي", tarek: "طارق", youssef: "يوسف", yousef: "يوسف", yara: "يارا", "5alty": "خالتي", "3amty": "عمتي", tita: "تيتا",
  gedety: "جدتي", "o5ty": "أختي", a5oya: "أخويا", "wa7ed": "واحد",
};

/** Words that carry no content in a title (all scripts, folded). */
export const STOP = new Set(
  (
    "i me my you your the a an to of for on at in by is are am be was it its and or with about please pls just really need needs have has had " +
    "remind reminder dont don't let forget should must got gotta going will would can could tomorrow today tonight that this from up " +
    "el al w we ya ana enta 3andy 3andi fakarny fakkarny fkrny fakarni lazem 3ayez 3ayza bta3 bta3y bta3ty bta3et yom el sa3a b bel lel le l " +
    "fe fel men ma3ad m3ad abl ba3d keda kaman ba2a ya3ni y3ni da dy de " +
    "انا انت عندي فكرني فكريني ذكرني لازم محتاج عايز عايزه يوم الساعه في من على علي عن ل ب و ده دي دا بتاع بتاعي بتاعتي ميعاد موعد " +
    "قبل بعد كمان خلاص بقى يعني يا بس اني ان"
  ).split(/\s+/),
);
