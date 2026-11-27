import type { SameKeys } from "./shape";

// Layout rebuild: the circle summary, feed and Circle info screens (owner: the circle area). Reached as t.lay.circle.<key>. Same keys in both languages.
const ar = {
  // The summary's top card.
  noCheckins: "لسه محدش طمّن",
  checkinLine: "{name}: {what}",
  more: "كمان",
  inviteFirst: "اعزم ناسك",
  // The tiles.
  tasks: "المهام",
  waiting: "{n} مستنيينك",
  homework: "الواجب",
  pocket: "المصروف {n}",
  lists: "القوايم",
  money: "الفلوس",
  yourShare: "نصيبك",
  startBook: "ابدأ دفتر مشترك",
  trackers: "المتابعات",
  startTracker: "ابدأ واحدة",
  // The newest lines and the feed's own screen.
  latest: "آخر الأخبار",
  weekTitle: "أسبوع زكي",
  weekLocked: "ملخص الأسبوع من إضافات زكي برو.",
  trialDays: "{n} يوم ببلاش",
  // Circle info.
  infoTitle: "معلومات الدايرة",
  members: "الأعضاء",
  // The circle's shared trackers.
  trackersEmpty: "لسه مفيش متابعات مشتركة.",
};

const en: SameKeys<typeof ar> = {
  noCheckins: "No check-ins yet",
  checkinLine: "{name}: {what}",
  more: "More",
  inviteFirst: "Invite your people",
  tasks: "Tasks",
  waiting: "{n} waiting for you",
  homework: "Homework",
  pocket: "Pocket money {n}",
  lists: "Lists",
  money: "Money",
  yourShare: "Your share",
  startBook: "Start a shared book",
  trackers: "Trackers",
  startTracker: "Start one",
  latest: "Latest",
  weekTitle: "Zaki's week",
  weekLocked: "The weekly review is a Pro extra.",
  trialDays: "{n} free days",
  infoTitle: "Circle info",
  members: "Members",
  trackersEmpty: "No shared trackers yet.",
};

export const strings = { "ar-EG": ar, en } as const;
