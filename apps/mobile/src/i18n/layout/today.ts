import type { SameKeys } from "./shape";

// Layout rebuild: the Today tab (owner: the today area). Reached as t.lay.today.<key>. Same keys in both languages.
const ar = {
  /** The inbox's title with how many wait. */
  needsCount: "مستنيك · {n}",
  /** One line under a row of the inbox. Arabic about another person avoids gendered verbs. */
  taskFrom: "من {name}",
  handedIn: "واجب {name} اتسلّم",
  youOwe: "عليك {amount}",
  owedToYou: "ليك {amount}",
  yourShare: "نصيبك {amount}",
  /** The one answer button of a row. */
  yes: "تمام",
  confirm: "تأكيد",
  review: "راجع",
  noPlans: "مفيش مواعيد جاية",
  atPlace: "عند {place}",
  /** The "+" sheet. */
  addRemind: "فكّرني",
  addList: "قايمة",
  addTracker: "متابعة",
  /** Nothing waits and nothing is planned. */
  emptyTitle: "مفيش حاجة مستنياك.",
  emptyAction: "ضيف تذكير",
  emptySay: "فكّرني بالعيش الساعة 6",
  /** Beside the date when a holiday starts tomorrow in the user's city. */
  tomorrowHoliday: "بكرة {name}",
  /** The numbers on top: what waits, the plans, what is late. */
  stripPlans: "مواعيد",
  late: "فات",
  /** The foot of a capped list. */
  more: "{n} كمان",
  /** A plan's day when it is not today. */
  tomorrow: "بكرة",
  /** Beside the date: the next dose still to come today, or the pot is this person's this round. */
  nextDose: "الجرعة الجاية {time} · {name}",
  gameyaTurn: "دورك في الجمعية · {name}",
  /** The three doors under the plans. */
  listsOpen: "{n} ناقص",
  trackingOf: "{done} من {n}",
  /** After an answer that only this person's side sees: said with an Undo. */
  markedTaken: "اتعلّمت اتاخدت",
  markedPaid: "اتعلّم مدفوع",
  planDone: "خلصت",
};

const en: SameKeys<typeof ar> = {
  needsCount: "Needs you · {n}",
  taskFrom: "From {name}",
  handedIn: "{name} handed it in",
  youOwe: "You owe {amount}",
  owedToYou: "Owes you {amount}",
  yourShare: "Your share {amount}",
  yes: "Yes",
  confirm: "Confirm",
  review: "Review",
  noPlans: "Nothing coming up",
  atPlace: "At {place}",
  addRemind: "Remind me",
  addList: "A list",
  addTracker: "A tracker",
  emptyTitle: "Nothing is waiting for you.",
  emptyAction: "Add a reminder",
  emptySay: "Remind me: bread at 6",
  tomorrowHoliday: "Tomorrow: {name}",
  stripPlans: "Plans",
  late: "Late",
  more: "{n} more",
  tomorrow: "Tomorrow",
  nextDose: "Next dose {time} · {name}",
  gameyaTurn: "Your gam'eya turn · {name}",
  listsOpen: "{n} open",
  trackingOf: "{done} of {n}",
  markedTaken: "Marked taken",
  markedPaid: "Marked paid",
  planDone: "Done",
};

export const strings = { "ar-EG": ar, en } as const;
