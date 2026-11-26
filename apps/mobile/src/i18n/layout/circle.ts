import type { SameKeys } from "./shape";

// Layout rebuild: the circle summary, feed and Circle info screens (owner: the circle area). Reached as t.lay.circle.<key>. Same keys in both languages.
const ar = {};

const en: SameKeys<typeof ar> = {};

export const strings = { "ar-EG": ar, en } as const;
