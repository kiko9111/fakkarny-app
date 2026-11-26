import type { SameKeys } from "./shape";

// Layout rebuild: the Today tab (owner: the today area). Reached as t.lay.today.<key>. Same keys in both languages.
const ar = {};

const en: SameKeys<typeof ar> = {};

export const strings = { "ar-EG": ar, en } as const;
