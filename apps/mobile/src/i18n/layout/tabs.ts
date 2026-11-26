import type { SameKeys } from "./shape";

// Layout rebuild: the tab bar and a not-yet-opened tab's introduction (owner: the tabs area). Reached as t.lay.tabs.<key>. Same keys in both languages.
const ar = {};

const en: SameKeys<typeof ar> = {};

export const strings = { "ar-EG": ar, en } as const;
