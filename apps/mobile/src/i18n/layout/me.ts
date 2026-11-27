import type { SameKeys } from "./shape";

// Layout rebuild: the Me tab and its /me/* pages (owner: the me area). Reached as t.lay.me.<key>. Same keys in both languages.
const ar = {
  /** The plan line under the name on Me, and the plan card in Payments. */
  planFree: "الباقة المجانية",
  planPro: "زكي برو",
  planFamily: "زكي فاميلي",
  planUntil: "{plan} لحد {date}",

  /** The rows on Me. Each opens one page with the same title. */
  zaki: "أنا وزكي",
  look: "الشكل واللغة",
  reminders: "التذكيرات والمنبّهات",
  payments: "الدفع",
  memory: "زكي فاكر إيه",
  privacy: "الخصوصية وبياناتي",
  advanced: "متقدم",
  invite: "اعزم صاحبك",
  city: "مدينتك",

  /** Value lines under the rows. */
  checkEvery2: "كل ساعتين",
  checkEvery4: "كل 4 ساعات",
  checkOff: "مش بيطمّن",
  alarmsCount: "منبّهات: {n}",
  alarmsOne: "منبّه واحد",
  placesCount: "أماكن: {n}",
  placesOne: "مكان واحد",
  instapaySet: "لينك إنستاباي متسجّل",
  instapayNone: "مفيش لينك إنستاباي",

  /** Zaki and me. */
  aboutYou: "عنك",
  howZakiTalks: "كلام زكي",
  yourDay: "يومك",
  direct: "فكّرني بوضوح",

  /** Reminders and alarms. */
  alarmsNone: "مفيش منبّهات",

  /** Look and language. */
  theme: "اللون",

  /** Payments. */
  plan: "باقتك",

  /** Privacy and my data. */
  account: "الحساب",
  yourData: "بياناتك",

  /** Advanced: which update is running. */
  appUpdate: "تحديث التطبيق",
  builtIn: "النسخة الأصلية",
  updateNow: "حدّث دلوقتي",
  upToDate: "آخر تحديث عندك",
  updateOff: "النسخة دي مش بتاخد تحديثات",

  /** City: sets prayer times, holidays and money. */
  cityNone: "مش متحددة",
  prayerToday: "الصلاة النهارده",
  holidaysAhead: "الإجازات الجاية",
  holidayDays: "{n} أيام",
  expected: "متوقّع",
  notOff: "مش إجازة",
  cityAsk: "مدينتك إيه؟ عشان أظبط مواعيد الصلاة والإجازات والعملة عليها.",
  cityPick: "اختار مدينتك",
};

const en: SameKeys<typeof ar> = {
  planFree: "Free plan",
  planPro: "Zaki Pro",
  planFamily: "Zaki Family",
  planUntil: "{plan} until {date}",

  zaki: "Zaki and me",
  look: "Look and language",
  reminders: "Reminders and alarms",
  payments: "Payments",
  memory: "What Zaki remembers",
  privacy: "Privacy and my data",
  advanced: "Advanced",
  invite: "Invite a friend",
  city: "City",

  checkEvery2: "Every 2 hours",
  checkEvery4: "Every 4 hours",
  checkOff: "No check-ins",
  alarmsCount: "{n} alarms",
  alarmsOne: "1 alarm",
  placesCount: "{n} places",
  placesOne: "1 place",
  instapaySet: "InstaPay link added",
  instapayNone: "No InstaPay link",

  aboutYou: "You",
  howZakiTalks: "How Zaki talks",
  yourDay: "Your day",
  direct: "Remind me plainly",

  alarmsNone: "No alarms yet",

  theme: "Colour",

  plan: "Your plan",

  account: "Account",
  yourData: "Your data",

  appUpdate: "App update",
  builtIn: "Built-in version",
  updateNow: "Update now",
  upToDate: "You have the latest",
  updateOff: "This build takes no updates",

  cityNone: "Not set",
  prayerToday: "Prayer today",
  holidaysAhead: "Holidays ahead",
  holidayDays: "{n} days",
  expected: "expected",
  notOff: "not a day off",
  cityAsk: "Which city are you in? I'll match prayer times, holidays and money to it.",
  cityPick: "Pick your city",
};

export const strings = { "ar-EG": ar, en } as const;
