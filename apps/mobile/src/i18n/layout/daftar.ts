import type { SameKeys } from "./shape";

// Layout rebuild: the Daftar tab: Spending / People / Splits (owner: the daftar area). Reached as t.lay.daftar.<key>. Same keys in both languages.
const ar = {};

const en: SameKeys<typeof ar> = {};

export const strings = { "ar-EG": ar, en } as const;
