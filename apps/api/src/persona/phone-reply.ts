import { addDays, type AppAction, type Understood } from "@fakkarni/shared";
import { PERSONA_PROMPT } from "./prompt";
import type { ReplyLang } from "../pipeline/rules";

/**
 * Phone mode, "the AI is for chatting only" (owner decision, 2026-11-25). The rule engine
 * (packages/shared/src/understand) has already decided every action; the phone's small model only
 * writes the friendly reply, told exactly what was done or what to ask. It can't add, change or
 * invent anything: the server ignores everything but its reply and its crisis flag.
 *
 * WELLBEING is copied from the main persona word for word (CLAUDE.md: never removed or weakened).
 */
export const PHONE_REPLY_VERSION = "phone-reply-2026-11-25.1";

const WELLBEING = PERSONA_PROMPT.slice(PERSONA_PROMPT.indexOf("# WELLBEING")).trim();

export const PHONE_REPLY_PROMPT = `You are Zaki (زكي), the user's warm, positive, honest AI friend in the Zaki app. You text like an Egyptian friend: 1 or 2 short messages, one or two sentences each. React to what they said like a friend would. Never a list unless they ask for their plans. You are an AI and say so if asked.

# Language
- Follow REPLY SCRIPT. Arabic or Franco (Arabic typed in Latin letters: 3=ع 7=ح 2=ء 5=خ) → reply in Egyptian colloquial Arabic in ARABIC letters (مش، عايز، إزيك، النهارده، بكرة), never Modern Standard (no سوف، لقد، هل، ماذا), never Latin letters. English → English.
- Follow ADDRESS THE USER AS (masculine or feminine Arabic).

# What the app did
The app has already done the work. DONE lists exactly what it saved or changed this turn; you only tell the user, warmly and briefly.
- Mention what DONE says, with its exact names, days and times. Don't read out every detail if there are several; the cards show them.
- If DONE is "nothing", you saved nothing: never say you saved, set, noted or will remind anything. Just talk.
- If ASK is given, ask exactly that one short question and nothing else is saved yet.
- Items marked "waiting for your OK" were not sent yet: say the user can confirm with the button.
- Never promise anything that isn't in DONE.

# Output
Answer ONLY with one JSON object: {"reply":["..."],"crisis":false}
crisis = true only when the user may be in danger (thoughts of suicide or self-harm).

${WELLBEING}`;

const pad = (n: number) => String(n).padStart(2, "0");
const AR_DAYS = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (d: string) => {
  const [y, m, da] = d.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, da!)).getUTCDay();
};

/** "بكرة الساعة ٣ العصر" / "tomorrow at 3pm", from local wall-clock strings. */
export function whenWords(local: string, nowLocal: string, lang: ReplyLang): string {
  const day = local.slice(0, 10);
  const today = nowLocal.slice(0, 10);
  const [h, m] = local.slice(11, 16).split(":").map(Number) as [number, number];
  const dayWord =
    day === today ? (lang === "english" ? "today" : "النهارده")
    : day === addDays(today, 1) ? (lang === "english" ? "tomorrow" : "بكرة")
    : day === addDays(today, 2) && lang !== "english" ? "بعد بكرة"
    : day <= addDays(today, 6) ? (lang === "english" ? `on ${EN_DAYS[weekday(day)]}` : `يوم ${AR_DAYS[weekday(day)]}`)
    : lang === "english" ? `on ${day}` : `يوم ${Number(day.slice(8))}/${Number(day.slice(5, 7))}`;
  if (lang === "english") {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${dayWord} at ${h12}${m ? `:${pad(m)}` : ""}${h < 12 ? "am" : "pm"}`;
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const part = h < 5 ? "بالليل" : h < 12 ? "الصبح" : h < 15 ? "الضهر" : h < 18 ? "العصر" : "بالليل";
  const mm = m === 30 ? " ونص" : m === 15 ? " وربع" : m ? `:${pad(m)}` : "";
  return `${dayWord} الساعة ${h12}${mm} ${part}`;
}

const repeatWords = (min: number, lang: ReplyLang) =>
  lang === "english"
    ? min % 10080 === 0 ? "every week" : min % 1440 === 0 ? "every day" : min % 60 === 0 ? `every ${min / 60 === 1 ? "hour" : `${min / 60} hours`}` : `every ${min} minutes`
    : min % 10080 === 0 ? "كل أسبوع" : min % 1440 === 0 ? "كل يوم" : min === 60 ? "كل ساعة" : min === 120 ? "كل ساعتين" : min % 60 === 0 ? `كل ${min / 60} ساعات` : `كل ${min} دقيقة`;

const WAITS: AppAction["kind"][] = ["assign_task", "ask_circle", "daftar_settle", "daftar_cancel", "task_answer", "task_nudge", "task_cancel", "homework_review", "checkin", "ask_checkin", "leave_circle", "delete_tracker"];

/** One plain line per thing the engine did (English, for the model; names stay as the user wrote them). */
function actionLine(a: AppAction): string {
  const wait = WAITS.includes(a.kind) ? " (waiting for your OK)" : "";
  switch (a.kind) {
    case "log_money": return `Logged ${a.money_kind === "income" ? "income" : "spending"} of ${a.amount}${a.section ? ` in «${a.section}»` : ""}`;
    case "create_section": return `New money section «${a.name}»${a.amount ? ` with a monthly budget of ${a.amount}` : ""}`;
    case "set_budget": return `Budget for «${a.section ?? "?"}» set to ${a.amount}`;
    case "delete_money_entry": return `Deleted the ${a.amount ?? ""} entry`;
    case "daftar_add": return `Daftar: ${a.direction === "i_owe" ? `the user owes ${a.person} ${a.amount}` : `${a.person} owes the user ${a.amount}`}`;
    case "daftar_settle": return `Daftar: ${a.person} is settled${wait}`;
    case "daftar_cancel": return `Daftar: entry with ${a.person} removed${wait}`;
    case "daftar_remind": return `Sent ${a.person} a gentle reminder about the money`;
    case "create_tracker": return `New tracker «${a.name}»`;
    case "log_tracker": return `Logged ${a.amount ?? 1} on the «${a.tracker}» tracker`;
    case "update_tracker": return `Tracker «${a.tracker ?? "?"}» updated${a.amount ? `: goal ${a.amount}` : ""}${a.ask_times?.length ? `: asks at ${a.ask_times.join(", ")}` : ""}`;
    case "undo_tracker": return `Took back the last log on «${a.tracker}»`;
    case "delete_tracker": return `Tracker «${a.tracker}» deleted${wait}`;
    case "create_circle": return `New circle «${a.name}»`;
    case "invite": return `Invite link for «${a.circle}» ready to share`;
    case "rename_circle": return `Circle «${a.circle}» renamed to «${a.name}»`;
    case "leave_circle": return `Leaving circle «${a.circle}»${wait}`;
    case "checkin": return `Check-in to «${a.circle}»: ${a.checkin_kind}${wait}`;
    case "ask_checkin": return `Asking ${a.person} to check in${wait}`;
    case "ask_circle": return `Message to «${a.circle}»: ${a.text}${wait}`;
    case "assign_task": return `${a.homework ? "Homework" : "Task"} for ${a.person}: «${a.title}»${wait}`;
    case "task_answer": return `${a.answer === "no" ? "Saying no" : "Saying yes"} to ${a.person}'s request${wait}`;
    case "task_nudge": return `Nudging ${a.person} about their task${wait}`;
    case "task_cancel": return `Cancelling the task for ${a.person}${wait}`;
    case "homework_review": return `${a.answer === "no" ? "Asking" : "Telling"} ${a.person} ${a.answer === "no" ? "to redo the homework" : "well done on the homework"}${wait}`;
    case "split_bill": return `Split ${a.amount} between the user and ${(a.people ?? []).join(", ")}`;
    case "split_paid": return `${a.person} paid their share`;
    case "forget": return `Forgot: ${a.text}`;
    case "settings": return `Setting ${a.setting} changed to ${a.text}`;
    case "open_screen": return `Opening the ${a.screen} screen`;
    default: return `Did: ${a.kind}`;
  }
}

const ASK_WORDS: Record<NonNullable<Understood["ask"]>, string> = {
  time: "what time (and day) should it be?",
  amount: "how much is it?",
  person: "who is it, or who should it go to?",
  confirm: "should it really be cancelled?",
  what: "what should it be called?",
};

/** The DONE / ASK block for the phone model's context. */
export function describeUnderstood(u: Understood, nowLocal: string, titles: Record<string, string> = {}): string {
  const lines: string[] = [];
  if (u.ask) return `ASK: ${ASK_WORDS[u.ask]}${u.askAbout ? ` (about «${u.askAbout}»)` : ""}\nDONE: nothing yet`;
  for (const i of u.create_items) {
    if (i.type === "debt" && i.debt) lines.push(`Daftar: ${i.debt.direction === "i_owe" ? `the user owes ${i.debt.person} ${i.debt.amount}` : `${i.debt.person} owes the user ${i.debt.amount}`}`);
    else if (i.type === "list_item") lines.push(`Added «${i.title}» to the shopping list`);
    else if (i.type === "note") lines.push(`Noted «${i.title}»`);
    else {
      const when = i.due_at_local ? ` ${whenWords(i.due_at_local, nowLocal, "english")}` : "";
      const extra = [i.repeat_every_minutes ? repeatWords(i.repeat_every_minutes, "english") : "", i.alarm ? "as an alarm" : "", i.follow_up_at_local ? "will ask how it went after" : ""].filter(Boolean).join(", ");
      lines.push(`${i.type === "reminder" ? "Reminder" : "To-do"} «${i.title}»${when}${extra ? ` (${extra})` : ""}`);
    }
  }
  for (const up of u.update_items) {
    const title = titles[up.id] ?? "that item";
    if (up.status === "done") lines.push(`Marked «${title}» done`);
    else if (up.status === "cancelled") lines.push(`Cancelled «${title}»`);
    else if (up.due_at_local) lines.push(`Moved «${title}» to ${whenWords(up.due_at_local, nowLocal, "english")}`);
  }
  for (const m of u.save_memories) lines.push(`Remembered: ${m.content}`);
  for (const a of u.app_actions) lines.push(actionLine(a));
  return lines.length ? `DONE:\n${lines.map((l) => `- ${l}`).join("\n")}` : "DONE: nothing (just chat; don't say you saved anything)";
}

/**
 * A plain reply in code, from what the engine did: used when the phone model fails or its reply
 * promises something the turn didn't do. Short and warm, never a list.
 */
export function templateReply(u: Understood, nowLocal: string, lang: ReplyLang, titles: Record<string, string> = {}): string[] {
  const ar = lang !== "english";
  if (u.ask) {
    const about = u.askAbout ? (ar ? ` «${u.askAbout}»` : ` «${u.askAbout}»`) : "";
    const q: Record<NonNullable<Understood["ask"]>, [string, string]> = {
      time: [`أكيد! أفكرك${about} إمتى بالظبط؟`, `Sure! When should I remind you${about}?`],
      amount: ["تمام، قد إيه المبلغ؟", "Got it, how much is it?"],
      person: ["مين ده؟ قولّي الاسم.", "Who's that? Tell me the name."],
      confirm: [`ألغي${about}؟`, `Cancel${about}?`],
      what: ["نسميها إيه؟", "What should we call it?"],
    };
    return [q[u.ask][ar ? 0 : 1]];
  }
  const parts: string[] = [];
  for (const i of u.create_items) {
    if (i.type === "debt" && i.debt) parts.push(ar ? `سجلت في الدفتر: ${i.debt.direction === "i_owe" ? `عليك ${i.debt.amount} لـ${i.debt.person}` : `${i.debt.person} عليه ${i.debt.amount}`}` : `Daftar: ${i.debt.direction === "i_owe" ? `you owe ${i.debt.person} ${i.debt.amount}` : `${i.debt.person} owes you ${i.debt.amount}`}`);
    else if (i.type === "list_item") parts.push(ar ? `«${i.title}» في قايمة الطلبات` : `«${i.title}» is on the list`);
    else if (i.due_at_local && i.type === "reminder") parts.push(ar ? `هفكرك «${i.title}» ${whenWords(i.due_at_local, nowLocal, lang)}${i.repeat_every_minutes ? ` و${repeatWords(i.repeat_every_minutes, lang)}` : ""}` : `I'll remind you «${i.title}» ${whenWords(i.due_at_local, nowLocal, lang)}${i.repeat_every_minutes ? `, ${repeatWords(i.repeat_every_minutes, lang)}` : ""}`);
    else parts.push(ar ? `كتبت «${i.title}»${i.due_at_local ? ` ${whenWords(i.due_at_local, nowLocal, lang).replace(/ الساعة.*$/, "")}` : ""}` : `Noted «${i.title}»`);
  }
  for (const up of u.update_items) {
    const t = titles[up.id] ?? (ar ? "دي" : "that");
    if (up.status === "done") parts.push(ar ? `برافو! «${t}» خلصت ✅` : `Nice, «${t}» is done ✅`);
    else if (up.status === "cancelled") parts.push(ar ? `لغيت «${t}»` : `«${t}» is cancelled`);
    else if (up.due_at_local) parts.push(ar ? `نقلت «${t}» لـ${whenWords(up.due_at_local, nowLocal, lang)}` : `Moved «${t}» to ${whenWords(up.due_at_local, nowLocal, lang)}`);
  }
  if (u.save_memories.length) parts.push(ar ? "حفظتها 👌" : "Got it, I'll remember 👌");
  if (u.app_actions.length) parts.push(ar ? "تمام، اتعملت 👇" : "Done 👇");
  if (!parts.length) return [ar ? "أنا معاك 💛 احكيلي أكتر؟" : "I'm here 💛 Tell me more?"];
  return [parts.slice(0, 2).join(ar ? "، و" : ", and ") + (parts.length > 2 ? (ar ? " والباقي تحت 👇" : ", and the rest is below 👇") : "")];
}
