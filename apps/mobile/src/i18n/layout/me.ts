import type { SameKeys } from "./shape";

// Layout rebuild: the Me tab and its /me/* pages (owner: the me area). Reached as t.lay.me.<key>. Same keys in both languages.
const ar = {
  /** The plan line under the name on Me, and the plan card in Payments. */
  planFree: "الباقة المجانية",
  planPro: "زكي برو",
  planFamily: "زكي فاميلي",
  planUntil: "{plan} لحد {date}",

  /** The rows on Me. Each opens one page with the same title. */
  zaki: "زكي وأنا",
  look: "الشكل واللغة",
  reminders: "التذكيرات والمنبّهات",
  payments: "الدفع",
  memory: "زكي فاكر إيه",
  privacy: "الخصوصية وبياناتي",
  advanced: "متقدم",
  invite: "ادعي صاحب",

  /** Value lines under the rows. */
  checkEvery2: "يطمّن كل ساعتين",
  checkEvery4: "يطمّن كل 4 ساعات",
  checkOff: "من غير اطمئنان",
  alarmsCount: "منبّهات: {n}",
  alarmsOne: "منبّه واحد",
  placesCount: "أماكن: {n}",
  placesOne: "مكان واحد",
  instapaySet: "لينك إنستاباي متسجّل",
  instapayNone: "مفيش لينك إنستاباي",

  /** Zaki and me. */
  aboutYou: "إنت",
  howZakiTalks: "كلام زكي",
  yourDay: "يومك",
  direct: "فكّرني بوضوح",

  /** Reminders and alarms. */
  alarmsNone: "مفيش منبّهات",

  /** Look and language. */
  theme: "اللون",

  /** Payments. */
  plan: "باقتك",

  /** What Zaki remembers: the one honest line (what is kept, and that it can be removed). */
  memoryLine: "زكي بيفتكر اللي بتقولهوله في الشات، وتقدر تمسح أي حاجة.",
  memoryRow: "اللي فاكره عنك",

  /** Privacy and my data. */
  account: "الحساب",
  yourData: "بياناتك",
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

  checkEvery2: "Checks in every 2 hours",
  checkEvery4: "Checks in every 4 hours",
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

  memoryLine: "Zaki remembers what you tell him in chat. You can remove anything.",
  memoryRow: "What he knows about you",

  account: "Account",
  yourData: "Your data",
};

export const strings = { "ar-EG": ar, en } as const;
