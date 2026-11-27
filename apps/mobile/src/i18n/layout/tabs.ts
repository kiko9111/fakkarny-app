import type { SameKeys } from "./shape";

// Layout rebuild: a not-yet-opened tab's introduction (Zaki's one sentence, then "Open"). Reached as t.lay.tabs.<key>. Same keys in both languages.
const ar = {
  introToday: "هنا اللي مستنيك ومواعيدك، كله في نظرة.",
  introPeople: "هنا عيلتك وصحابك: طلبات، واجبات واطمئنان.",
  introDaftar: "هنا فلوسك: مصاريفك واللي ليك واللي عليك.",
  /** People with no circle yet. */
  peopleEmpty: "اعمل دايرة لعيلتك أو صحابك.",
};

const en: SameKeys<typeof ar> = {
  introToday: "What needs you and your plans, at a glance.",
  introPeople: "Your family and friends: tasks, homework and check-ins.",
  introDaftar: "Your money: spending and who owes whom.",
  peopleEmpty: "Make a circle for your family or friends.",
};

export const strings = { "ar-EG": ar, en } as const;
