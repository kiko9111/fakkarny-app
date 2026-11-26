import type { SameKeys } from "./shape";

// Layout rebuild: the chat's "+" and what it starts (owner: the chat area). Reached as t.lay.chat.<key>. Same keys in both languages.
const ar = {};

const en: SameKeys<typeof ar> = {};

export const strings = { "ar-EG": ar, en } as const;
