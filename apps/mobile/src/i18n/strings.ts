/**
 * All user-facing strings live here (CLAUDE.md). Egyptian Arabic is the default.
 * Keep `en` keys identical to `ar-EG`; the type below enforces it.
 */
const arEG = {
  tabs: { chat: "الدردشة", upcoming: "الجاي", money: "الفلوس", settings: "الإعدادات" },
  chat: {
    greeting: "أهلاً! أنا فكّرني 👋 أناديك بإيه؟",
    placeholder: "اكتب أي حاجة…",
    send: "ابعت",
    offline: "إنت أوفلاين — هبعت رسايلك أول ما النت يرجع.",
    pending: "مستني النت",
    failed: "مااتبعتش",
    saved: "اتحفظ",
    quickReplies: ["عندي إيه الأسبوع ده؟", "فكّرني بحاجة", "يومي كان عامل إزاي؟"],
  },
  saved: {
    title: "اللي افتكرته",
    hint: "لو حاجة مش مظبوطة، صلّحها أو امسحها.",
    rename: "غيّر الاسم",
    save: "حفظ",
    remove: "امسح",
    memory: "معلومة",
    offline: "محتاج نت عشان أعدّل ده.",
  },
  upcoming: { title: "الجاي", empty: "مفيش حاجة جاية لسه." },
  money: { title: "الفلوس", empty: "مفيش ديون متسجلة." },
  settings: { title: "الإعدادات", language: "اللغة", aiDisclosure: "فكّرني ذكاء اصطناعي، مش إنسان." },
  onboarding: { title: "أهلاً بيك", start: "يلا نبدأ" },
  paywall: { title: "ابدأ تجربتك المجانية ٧ أيام", subtitle: "عشان نفضل نتكلم.", cta: "ابدأ التجربة" },
  health: { checking: "بنتأكد من السيرفر…", ok: "السيرفر شغال", down: "السيرفر مش متاح" },
};

type Strings = typeof arEG;
type DeepStringShape<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends readonly string[] ? string[] : DeepStringShape<T[K]>;
};

const en: DeepStringShape<Strings> = {
  tabs: { chat: "Chat", upcoming: "Upcoming", money: "Money", settings: "Settings" },
  chat: {
    greeting: "Ahlan! I'm Fakkarni 👋 What should I call you?",
    placeholder: "Write anything…",
    send: "Send",
    offline: "You're offline — I'll send your messages when you're back.",
    pending: "Waiting for internet",
    failed: "Not sent",
    saved: "Saved",
    quickReplies: ["What do I have this week?", "Remind me of something", "How was my day?"],
  },
  saved: {
    title: "What I remembered",
    hint: "If something's off, fix it or remove it.",
    rename: "Rename",
    save: "Save",
    remove: "Remove",
    memory: "Memory",
    offline: "I need internet to change this.",
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
