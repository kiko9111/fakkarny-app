import type { Item } from "@fakkarni/shared";

export type UpcomingBucket = "today" | "tomorrow" | "later" | "noDate";

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/**
 * Upcoming tab sections, in the phone's local time, soonest first within each. Overdue open items
 * show under today. A plan with only a reminder time is placed by it (it used to sit under "No
 * date", as if Zaki would never remind).
 */
export function groupUpcoming(items: Item[], now: Date): { bucket: UpcomingBucket; items: Item[] }[] {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const buckets: Record<UpcomingBucket, Item[]> = { today: [], tomorrow: [], later: [], noDate: [] };
  const timeOf = (item: Item) => item.due_at || item.remind_at;
  for (const item of items) {
    const at = timeOf(item);
    if (!at) {
      buckets.noDate.push(item);
      continue;
    }
    const due = new Date(at);
    if (due <= now || localDay(due) === localDay(now)) buckets.today.push(item);
    else if (localDay(due) === localDay(tomorrow)) buckets.tomorrow.push(item);
    else buckets.later.push(item);
  }
  const soonest = (a: Item, b: Item) => Date.parse(timeOf(a)!) - Date.parse(timeOf(b)!);
  for (const bucket of ["today", "tomorrow", "later"] as const) buckets[bucket].sort(soonest);
  return (["today", "tomorrow", "later", "noDate"] as const).filter((b) => buckets[b].length).map((bucket) => ({ bucket, items: buckets[bucket] }));
}

export interface PersonTotal {
  person: string;
  total: number;
  items: Item[];
}

/** Money tab: totals per person, split by direction, largest first. Names match case-insensitively. */
export function summarizeDebts(items: Item[]): { owedToMe: PersonTotal[]; iOwe: PersonTotal[] } {
  const group = (dir: "owed_to_me" | "i_owe") => {
    const map = new Map<string, PersonTotal>();
    for (const i of items) {
      if (i.type !== "debt" || i.status !== "open" || i.debt_direction !== dir) continue;
      const person = (i.debt_person ?? "?").trim();
      const key = person.toLowerCase();
      const entry = map.get(key) ?? { person, total: 0, items: [] };
      entry.total += i.debt_amount ?? 0;
      entry.items.push(i);
      map.set(key, entry);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  };
  return { owedToMe: group("owed_to_me"), iOwe: group("i_owe") };
}
