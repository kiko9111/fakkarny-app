import type { Lang } from "../tasks/rules";

/**
 * Zaki's weekly circle summary, written from counts by templates (no AI, no gendered Arabic verbs about others, nothing private:
 * Daftar entries never appear). `done` holds the name of whoever finished each task.
 */
export function summaryLines(lang: Lang, week: { done: (string | null)[]; open: number; checkins: number }): string[] {
  const ar = lang === "ar";
  const lines: string[] = [];
  const n = week.done.length;
  if (n === 0) lines.push(ar ? "الأسبوع ده كان هادي، مفيش مهام اتقفلت لسه 🌱" : "A quiet week: no tasks finished yet 🌱");
  else lines.push(ar ? `خلّصتوا ${n} ${n === 1 ? "مهمة" : "مهام"} الأسبوع ده 🎉` : `You finished ${n} ${n === 1 ? "task" : "tasks"} together this week 🎉`);
  const counts = new Map<string, number>();
  for (const name of week.done) if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) lines.push(ar ? `نجم الأسبوع: ${top[0]} بـ${top[1]} مهام 🌟` : `${top[0]} finished the most (${top[1]}) 🌟 A big thank-you!`);
  if (week.open > 0) lines.push(ar ? `فاضل ${week.open} ${week.open === 1 ? "مهمة مفتوحة" : "مهام مفتوحة"}، خطوة خطوة 💪` : `${week.open} still open. One step at a time 💪`);
  if (week.checkins > 0) lines.push(ar ? `${week.checkins} طمّنوا بعض الأسبوع ده 🤍` : `${week.checkins} check-ins to put each other's minds at ease 🤍`);
  return lines;
}
