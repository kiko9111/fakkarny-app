import type { SameKeys } from "./shape";

// Layout rebuild: a circle's job screens: tasks, homework, money (owner: the circle-jobs area). Reached as t.lay.circlejobs.<key>. Same keys in both languages.
const ar = {};

const en: SameKeys<typeof ar> = {};

export const strings = { "ar-EG": ar, en } as const;
