import type { SameKeys } from "./shape";

// Layout rebuild: the Daftar tab: Spending / People / Splits (owner: the daftar area). Reached as t.lay.daftar.<key>. Same keys in both languages.
const ar = {
  /** The switch's three parts: one word each. */
  spending: "مصاريف",
  people: "ناس",
  splits: "قسمة",
  /** The "+" sheet's rows, the same in every part. */
  addMoney: "مصروف أو دخل",
  addDebt: "ليك أو عليك",
  addSplit: "قسّم حساب",
  addReceipt: "صوّر فاتورة",
  addSection: "قسم جديد",
  /** The title of the short sheet that asks where an amount goes. */
  pickSection: "في أنهي قسم؟",
  /** Empty states: one sentence, and the words she could say in the chat. */
  spendEmpty: "لسه مفيش أقسام.",
  spendSay: "دفعت 300 بنزين",
  peopleEmpty: "مفيش حساب بينك وبين حد.",
  peopleSay: "أحمد عليه 200",
  splitsEmpty: "لسه مقسّمتش حساب.",
  /** Pocket money rows in People: the parent's side, the child's side, nothing left. */
  pocketYouOwe: "عليك {n} جنيه",
  pocketOwedYou: "ليك {n} جنيه",
  pocketClear: "خالص",
};

const en: SameKeys<typeof ar> = {
  spending: "Spending",
  people: "People",
  splits: "Splits",
  addMoney: "Money in or out",
  addDebt: "A debt",
  addSplit: "Split a bill",
  addReceipt: "Scan a receipt",
  addSection: "New section",
  pickSection: "Which section?",
  spendEmpty: "No sections yet.",
  spendSay: "spent 300 on gas",
  peopleEmpty: "Nothing between you and anyone yet.",
  peopleSay: "Ahmed owes me 200",
  splitsEmpty: "No bills split yet.",
  pocketYouOwe: "You owe EGP {n}",
  pocketOwedYou: "You're owed EGP {n}",
  pocketClear: "All paid",
};

export const strings = { "ar-EG": ar, en } as const;
