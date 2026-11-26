import type { SameKeys } from "./shape";

// Layout rebuild: the Me tab and its /me/* pages (owner: the me area). Reached as t.lay.me.<key>. Same keys in both languages.
const ar = {};

const en: SameKeys<typeof ar> = {};

export const strings = { "ar-EG": ar, en } as const;
