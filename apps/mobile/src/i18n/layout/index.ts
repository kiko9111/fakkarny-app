import type { Language } from "@fakkarni/shared";
import { strings as chat } from "./chat";
import { strings as circle } from "./circle";
import { strings as circlejobs } from "./circlejobs";
import { strings as common } from "./common";
import { strings as daftar } from "./daftar";
import { strings as gameya } from "./gameya";
import { strings as me } from "./me";
import { strings as tabs } from "./tabs";
import { strings as today } from "./today";
import { strings as widget } from "./widget";

/**
 * The layout rebuild's words, one file per area so areas can be written side by side. Screens
 * read them as `t.lay.<area>.<key>`; each file checks that English has the Arabic keys.
 */
const areas = { common, circle, circlejobs, today, daftar, gameya, chat, me, tabs, widget };
type Areas = typeof areas;
export type LayoutStrings = { [A in keyof Areas]: Areas[A]["en"] };

export const layoutAreas = areas;
export function layoutStrings(language: Language): LayoutStrings {
  const out: Record<string, unknown> = {};
  for (const [name, table] of Object.entries(areas)) out[name] = table[language];
  return out as LayoutStrings;
}
