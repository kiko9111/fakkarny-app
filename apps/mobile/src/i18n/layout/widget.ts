import type { SameKeys } from "./shape";

// The home-screen widget (Android). Reached as t.lay.widget.<key>. Same keys in both languages.
const ar = {
  title: "زكي",
  /** The header pill with how many things wait for an answer. */
  needs: "مستنيك · {n}",
  tomorrow: "بكرة",
  /** A plan with no time. */
  anytime: "أي وقت",
  /** Before the next repeating reminder's time ("the next dose"). */
  next: "الجاي",
  done: "خلصت",
  empty: "مفيش حاجة جاية. قول لزكي أي حاجة.",
  talk: "كلّم زكي",
  remind: "فكّرني",
  /** The row in Me that puts the widget on the home screen. */
  addRow: "زكي على الشاشة الرئيسية",
  howTo: "اضغط مطوّل على الشاشة الرئيسية، وبعدين الأدوات، واختار زكي.",
};

const en: SameKeys<typeof ar> = {
  title: "Zaki",
  needs: "Needs you · {n}",
  tomorrow: "Tomorrow",
  anytime: "Anytime",
  next: "Next",
  done: "Done",
  empty: "Nothing coming up. Tell Zaki anything.",
  talk: "Talk to Zaki",
  remind: "Remind me",
  addRow: "Zaki on your home screen",
  howTo: "Long-press your home screen, tap Widgets, then pick Zaki.",
};

export const strings = { "ar-EG": ar, en } as const;
