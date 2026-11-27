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
  right: "مظبوط",
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
  emptySay: "فكّرني أجيب عيش الساعة 6",
};

const en: SameKeys<typeof ar> = {
  needsCount: "Needs you · {n}",
  taskFrom: "From {name}",
  handedIn: "{name} handed it in",
  youOwe: "You owe {amount}",
  owedToYou: "Owes you {amount}",
  yourShare: "Your share {amount}",
  yes: "Yes",
  right: "Right",
  review: "Review",
  noPlans: "Nothing coming up",
  atPlace: "At {place}",
  addRemind: "Remind me",
  addList: "A list",
  addTracker: "A tracker",
  emptyTitle: "Nothing is waiting for you.",
  emptyAction: "Add a reminder",
  emptySay: "Remind me to buy bread at 6",
};

export const strings = { "ar-EG": ar, en } as const;
