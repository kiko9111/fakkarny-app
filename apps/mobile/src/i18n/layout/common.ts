import type { SameKeys } from "./shape";

// Layout rebuild: words every area needs. Owner: the foundation step. Reached as t.lay.common.<key>.
const ar = {
  /** The "+" in a header (its spoken label) and the title of the sheet it opens. */
  add: "إضافة",
  seeAll: "شوف الكل",
  open: "افتح",
  done: "تم",
  undo: "تراجع",
  cancel: "إلغاء",
  close: "اقفل",
  /** Under an empty screen's button: the words she could say in the chat instead. */
  orTellZaki: "أو قول: «{words}»",
  needsYou: "مستنيك",
  nothingYet: "لسه مفيش حاجة",
  tryAgain: "جرّب تاني",
  info: "معلومات",
  today: "النهارده",
  /** The four names that are the same everywhere (spec rule 9). */
  daftar: "الدفتر",
  people: "الناس",
  circle: "دايرة",
  spaceForYou: "مساحة ليك",
  plans: "مواعيدك",
};

const en: SameKeys<typeof ar> = {
  add: "Add",
  seeAll: "See all",
  open: "Open",
  done: "Done",
  undo: "Undo",
  cancel: "Cancel",
  close: "Close",
  orTellZaki: "Or say: “{words}”",
  needsYou: "Needs you",
  nothingYet: "Nothing here yet",
  tryAgain: "Try again",
  info: "Info",
  today: "Today",
  daftar: "Daftar",
  people: "People",
  circle: "Circle",
  spaceForYou: "A space for you",
  plans: "Plans",
};

export const strings = { "ar-EG": ar, en } as const;
