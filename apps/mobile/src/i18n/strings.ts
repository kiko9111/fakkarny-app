/**
 * All user-facing strings live here (CLAUDE.md). Egyptian Arabic is the default.
 * Keep `en` keys identical to `ar-EG`; the type below enforces it.
 */
const arEG = {
  tabs: { chat: "الدردشة", upcoming: "الجاي", money: "الفلوس", settings: "الإعدادات" },
  chat: {
    greeting: "أهلاً! أنا فكّرني 👋 أناديك بإيه؟",
    placeholder: "اكتب أي حاجة…",
    comingSoon: "الدردشة جاية في المرحلة الجاية.",
  },
  upcoming: { title: "الجاي", empty: "مفيش حاجة جاية لسه." },
  money: { title: "الفلوس", empty: "مفيش ديون متسجلة." },
  settings: { title: "الإعدادات", language: "اللغة", aiDisclosure: "فكّرني ذكاء اصطناعي، مش إنسان." },
  onboarding: { title: "أهلاً بيك", start: "يلا نبدأ" },
  paywall: { title: "ابدأ تجربتك المجانية ٧ أيام", subtitle: "عشان نفضل نتكلم.", cta: "ابدأ التجربة" },
  health: { checking: "بنتأكد من السيرفر…", ok: "السيرفر شغال", down: "السيرفر مش متاح" },
};

type Strings = typeof arEG;
type DeepStringShape<T> = { [K in keyof T]: T[K] extends string ? string : DeepStringShape<T[K]> };

const en: DeepStringShape<Strings> = {
  tabs: { chat: "Chat", upcoming: "Upcoming", money: "Money", settings: "Settings" },
  chat: {
    greeting: "Ahlan! I'm Fakkarni 👋 What should I call you?",
    placeholder: "Write anything…",
    comingSoon: "Chat arrives in the next milestone.",
  },
  upcoming: { title: "Upcoming", empty: "Nothing coming up yet." },
  money: { title: "Money", empty: "No debts tracked." },
  settings: { title: "Settings", language: "Language", aiDisclosure: "Fakkarni is an AI, not a person." },
  onboarding: { title: "Welcome", start: "Let's go" },
  paywall: { title: "Start your 7-day free trial", subtitle: "to keep chatting.", cta: "Start trial" },
  health: { checking: "Checking the server…", ok: "Server is up", down: "Server unreachable" },
};

export const strings = { "ar-EG": arEG, en } as const;
export type StringTable = DeepStringShape<Strings>;
