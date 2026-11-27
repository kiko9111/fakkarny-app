import type { SameKeys } from "./shape";

// Layout rebuild: a circle's job screens: tasks, homework, money (owner: the circle-jobs area). Reached as t.lay.circlejobs.<key>. Same keys in both languages.
const ar = {
  /** /circle/tasks */
  tasksTitle: "المهام",
  open: "شغّالة",
  done: "خلصت",
  tasksEmpty: "اطلب حاجة من حد في الدايرة.",
  tasksAlone: "اعزم حد عشان تطلب منه.",
  askSomeone: "اطلب من حد",
  tasksSay: "اطلب من أحمد يجيب عيش",
  invite: "اعزم على واتساب",

  /** /circle/homework */
  homeworkTitle: "الواجبات",
  week: "الأسبوع ده",
  pocket: "المصروف",
  toReview: "للمراجعة",
  late: "متأخر",
  tomorrow: "بكرة",
  noDay: "من غير يوم",
  explain: "زكي، اشرحلي درس",
  addWeek: "أسبوع من رسالة المدرسة",
  addOne: "واجب واحد",
  homeworkEmpty: "مفيش واجبات الأسبوع ده.",
  homeworkAlone: "اعزم ابنك يسلّم واجباته هنا.",
  homeworkSay: "واجب لعمر: حساب صفحة 12",
  pocketEmpty: "حط مكافأة على واجب وتظهر هنا.",

  /** /circle/money */
  moneyTitle: "الفلوس",
  books: "دفاتر مشتركة",
  splits: "تقسيم حسابات",
  addBook: "دفتر مشترك",
  addSplit: "قسّم حساب",
  moneyEmpty: "مصاريف الدايرة المشتركة مكانها هنا.",
};

const en: SameKeys<typeof ar> = {
  tasksTitle: "Tasks",
  open: "Open",
  done: "Done",
  tasksEmpty: "Ask someone in the circle for something.",
  tasksAlone: "Invite someone to ask them.",
  askSomeone: "Ask someone",
  tasksSay: "Ask Ahmed to get bread",
  invite: "Invite on WhatsApp",

  homeworkTitle: "Homework",
  week: "This week",
  pocket: "Pocket money",
  toReview: "To review",
  late: "Late",
  tomorrow: "Tomorrow",
  noDay: "No day",
  explain: "Zaki, explain a lesson",
  addWeek: "Week from school message",
  addOne: "One homework",
  homeworkEmpty: "No homework this week.",
  homeworkAlone: "Invite your child to hand in homework here.",
  homeworkSay: "Homework for Omar: math page 12",
  pocketEmpty: "Put a reward on a homework to see it here.",

  moneyTitle: "Money",
  books: "Shared books",
  splits: "Splits",
  addBook: "Shared book",
  addSplit: "Split a bill",
  moneyEmpty: "The circle's shared costs live here.",
};

export const strings = { "ar-EG": ar, en } as const;
