/**
 * Pure helpers for the calendar picker (src/ui/DateTimePicker.tsx). Everything is in the
 * phone's own time zone; no native date picker (existing builds take JS only, over the air).
 */

/** Days of one month laid out in weeks: null pads before the 1st and after the last day. */
export function monthGrid(year: number, month: number, weekStart: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const pad = (first.getDay() - weekStart + 7) % 7;
  const cells: (Date | null)[] = Array.from({ length: pad }, () => null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Before today's date (a whole past day can't be picked; today can). */
export const pastDay = (d: Date, now: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()) < new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** Move a month (year/month pair) by delta. */
export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** The picked day with a clock time. */
export function atTime(day: Date, hour: number, minute: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute, 0, 0);
}

/** 12-hour pieces of a 24-hour clock hour, and back. */
export const to12 = (hour: number) => ({ h: hour % 12 === 0 ? 12 : hour % 12, pm: hour >= 12 });
export const from12 = (h: number, pm: boolean) => (h % 12) + (pm ? 12 : 0);

/** A sensible first value: the next whole hour from now, at least an hour ahead. */
export function defaultPick(now: Date): Date {
  const d = new Date(now);
  d.setHours(d.getHours() + 1, 0, 0, 0);
  if (d.getTime() - now.getTime() < 30 * 60_000) d.setHours(d.getHours() + 1);
  return d;
}
