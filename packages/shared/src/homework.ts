import { z } from "zod";
import { PhotoUpload } from "./photos";
import { MAX_REWARD, MAX_SUBJECT, CircleTask } from "./tasks";
import { addDays, nextWeekday } from "./understand/when";
import { fold } from "./understand/text";

/**
 * Homework, grown up (2026-11-26, kareem: "attach pocket money to homework, and Zaki helps the
 * mom with homework"):
 * - Pocket money: a homework can carry a reward. "Well done" adds it to the child's record with
 *   that parent; the parent marks what they handed over. Records only: no money ever moves.
 * - A week's homework from one pasted message (the school's WhatsApp group text): parsed here,
 *   in pure code, so the phone shows the list before anything is sent.
 * - Zaki helps: explains a lesson to the parent and makes practice questions; gives the child
 *   hints on their answers, never the answers. Each is one AI call, counted like a chat message.
 */
const Instant = z.iso.datetime({ offset: true });

// ── Pocket money ─────────────────────────────────────────────────────────────

export const PocketEntry = z.object({
  id: z.string(),
  /** earned = a reward for homework marked Well done; paid = the parent handed money over. */
  kind: z.enum(["earned", "paid"]),
  amount: z.number().int().positive(),
  /** The homework's title, for an earned entry. */
  title: z.string().nullable(),
  created_at: Instant,
});
export type PocketEntry = z.infer<typeof PocketEntry>;

/** One child's record with one parent in one circle, from the caller's side. */
export const PocketAccount = z.object({
  circle_id: z.string(),
  circle_name: z.string(),
  child_id: z.string(),
  child_name: z.string().nullable(),
  parent_id: z.string(),
  parent_name: z.string().nullable(),
  /** The caller is the child (sees what they earned) or the parent (marks what they paid). */
  role: z.enum(["child", "parent"]),
  earned: z.number().int().nonnegative(),
  paid: z.number().int().nonnegative(),
  /** What the parent still owes the child: earned − paid. */
  balance: z.number().int(),
  /** Earned in the last 7 days. */
  week_earned: z.number().int().nonnegative(),
  /** Newest first, at most 20. */
  entries: z.array(PocketEntry),
});
export type PocketAccount = z.infer<typeof PocketAccount>;

export const PocketMoneyResponse = z.object({ accounts: z.array(PocketAccount) });
export type PocketMoneyResponse = z.infer<typeof PocketMoneyResponse>;

/** The parent handed some of it over. `id` (made on the phone) makes a resend harmless. */
export const PocketPaidRequest = z.object({
  id: z.uuid().optional(),
  circle_id: z.uuid(),
  child_id: z.uuid(),
  amount: z.number().int().min(1).max(100_000),
});
export type PocketPaidRequest = z.infer<typeof PocketPaidRequest>;

/** Pure: totals for one record. `entries` in any order. */
export function pocketTotals(entries: { kind: "earned" | "paid"; amount: number; createdAt: Date }[], now: Date): { earned: number; paid: number; balance: number; weekEarned: number } {
  let earned = 0;
  let paid = 0;
  let weekEarned = 0;
  const weekAgo = now.getTime() - 7 * 86_400_000;
  for (const e of entries) {
    if (e.kind === "earned") {
      earned += e.amount;
      if (e.createdAt.getTime() >= weekAgo) weekEarned += e.amount;
    } else paid += e.amount;
  }
  return { earned, paid, balance: earned - paid, weekEarned };
}

/** Quick reward picks on the new-homework screen (whole EGP). */
export const REWARD_CHOICES = [5, 10, 20, 50] as const;

// ── A week's homework from one message ──────────────────────────────────────

export const HomeworkDraft = z.object({
  title: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(MAX_SUBJECT).nullable().default(null),
  /** Local calendar day it is due, if the message said ("بكرة", "الأحد"). */
  due_day: z.iso.date().nullable().default(null),
});
export type HomeworkDraft = z.infer<typeof HomeworkDraft>;

/** Most homework one pasted message turns into. */
export const MAX_BATCH = 15;

/** POST /circles/:id/homework: a week's homework for one child in one go (one chat line for the child, not fifteen). */
export const HomeworkBatchRequest = z.object({
  assignee_id: z.uuid(),
  items: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        subject: z.string().trim().max(MAX_SUBJECT).nullable().optional(),
        due_at: Instant.nullable().optional(),
        note: z.string().trim().max(500).nullable().optional(),
        reward: z.number().int().min(1).max(MAX_REWARD).nullable().optional(),
      }),
    )
    .min(1)
    .max(MAX_BATCH),
});
export type HomeworkBatchRequest = z.infer<typeof HomeworkBatchRequest>;
export const HomeworkBatchResponse = z.object({ tasks: z.array(CircleTask) });
export type HomeworkBatchResponse = z.infer<typeof HomeworkBatchResponse>;

/** Subjects as schools in Egypt write them. `name` is what is stored, in the message's language. */
const SUBJECTS: { ar: string; en: string; words: string[] }[] = [
  { ar: "عربي", en: "Arabic", words: ["عربي", "لغه عربيه", "اللغه العربيه", "العربي", "arabic"] },
  { ar: "رياضيات", en: "Math", words: ["رياضيات", "الرياضيات", "ماث", "حساب", "الحساب", "جبر", "هندسه", "math", "maths", "mathematics"] },
  { ar: "إنجليزي", en: "English", words: ["انجليزي", "انجلش", "الانجليزي", "لغه انجليزيه", "english"] },
  { ar: "علوم", en: "Science", words: ["علوم", "العلوم", "ساينس", "science"] },
  { ar: "دراسات", en: "Social studies", words: ["دراسات", "الدراسات", "دراسات اجتماعيه", "social studies", "social"] },
  { ar: "دين", en: "Religion", words: ["دين", "الدين", "تربيه دينيه", "التربيه الدينيه", "religion"] },
  { ar: "فرنساوي", en: "French", words: ["فرنساوي", "فرنسي", "الفرنساوي", "لغه فرنسيه", "french"] },
  { ar: "ألماني", en: "German", words: ["الماني", "german"] },
  { ar: "كمبيوتر", en: "Computer", words: ["كمبيوتر", "حاسب الي", "الحاسب الالي", "تكنولوجيا", "ict", "computer"] },
  { ar: "قرآن", en: "Quran", words: ["قران", "القران", "قرآن", "quran"] },
];

/** Weekday words → JS weekday (0 = Sunday). Folded spellings. */
const DAYS: [RegExp, number][] = [
  [/(^|\s)(ال)?احد($|\s)|sunday/, 0],
  [/(^|\s)(ال)?(اتنين|اثنين)($|\s)|monday/, 1],
  [/(^|\s)(ال)?(تلات|ثلاثاء|تلاتاء)($|\s)|tuesday/, 2],
  [/(^|\s)(ال)?(اربع|اربعاء|اربعا)($|\s)|wednesday/, 3],
  [/(^|\s)(ال)?خميس($|\s)|thursday/, 4],
  [/(^|\s)(ال)?جمعه($|\s)|friday/, 5],
  [/(^|\s)(ال)?سبت($|\s)|saturday/, 6],
];

/** Lines that are a greeting or a sign-off, not homework. */
const NOT_HOMEWORK = /(صباح|مساء) (الخير|النور)|السلام عليكم|اولياء الامور|ولي الامر|مع (خالص )?تحيات|تحياتي|شكرا|ربنا يوفق|dear parents|good (morning|evening)|regards|thank you/;

const BULLET = /^[\s\-–—•*·▪●◦>]+|^\s*[\d٠-٩]{1,2}\s*[-.)\]:]\s*/u;

function subjectIn(folded: string): (typeof SUBJECTS)[number] | null {
  for (const s of SUBJECTS) {
    for (const w of s.words) {
      const f = fold(w);
      if (new RegExp(`(^|[\\s:،,(/-])${f.replace(/\s+/g, "\\s+")}($|[\\s:،,)/-])`).test(folded)) return s;
    }
  }
  return null;
}

function dayIn(folded: string, today: string): string | null {
  if (/(^|\s)(بكره|بكرا)($|\s)|tomorrow/.test(folded)) return addDays(today, 1);
  if (/(^|\s)النهارده($|\s)|today/.test(folded)) return today;
  for (const [re, wd] of DAYS) if (re.test(folded)) return nextWeekday(today, wd, false);
  return null;
}

/**
 * One pasted message (typed, or forwarded from the school group) → homework drafts, one per line.
 * A line that is only a subject ("عربي:" / "Math") names the subject of the lines under it; a line
 * that is only a day ("الأحد:") names their due day. Greetings and sign-offs are skipped.
 * `today` is the local calendar day ("YYYY-MM-DD"). Pure.
 */
export function parseHomeworkMessage(text: string, today: string): HomeworkDraft[] {
  const out: HomeworkDraft[] = [];
  let subject: (typeof SUBJECTS)[number] | null = null;
  let day: string | null = null;
  const english = !/[؀-ۿ]/.test(text);
  const name = (s: (typeof SUBJECTS)[number] | null) => (s ? (english ? s.en : s.ar) : null);
  for (const raw of text.split(/\r?\n|؛|;/)) {
    const line = raw.replace(BULLET, "").replace(/[*_~]/g, "").trim();
    if (!line) continue;
    const folded = fold(line).replace(/[.!؟?:،,\-–()]/g, " ").replace(/\s+/g, " ").trim();
    if (NOT_HOMEWORK.test(folded)) continue;
    const s = subjectIn(folded);
    const d = dayIn(folded, today);
    // What is left once the subject and day words are taken out: a header line has nothing left.
    const rest = folded
      .split(" ")
      .filter((w) => w && !(s && s.words.some((x) => fold(x).split(" ").includes(w))) && !dayIn(w, today) && !/^(واجب|الواجب|homework|يوم|day|ال)$/.test(w));
    if (rest.length === 0) {
      if (s) subject = s;
      if (d) day = d;
      continue;
    }
    if (line.length < 3) continue;
    out.push({ title: line.slice(0, 120), subject: name(s ?? subject), due_day: d ?? day });
    if (out.length >= MAX_BATCH) break;
  }
  return out;
}

// ── Zaki helps ───────────────────────────────────────────────────────────────

/** Page photos one help or check request may carry (read once, never stored). */
export const MAX_HELP_PHOTOS = 3;

/** POST /homework/help: the parent asks Zaki to explain a lesson and make practice questions. */
export const HomeworkHelpRequest = z
  .object({
    /** The homework it is about (the caller must be the parent who set it). */
    task_id: z.uuid().optional(),
    text: z.string().trim().max(2000).default(""),
    photos: z.array(PhotoUpload).max(MAX_HELP_PHOTOS).default([]),
  })
  .refine((v) => v.text.length > 0 || v.photos.length > 0 || v.task_id, "Nothing to help with");
export type HomeworkHelpRequest = z.infer<typeof HomeworkHelpRequest>;

export const HomeworkHelp = z.object({
  /** The lesson in plain words, for the parent. */
  explain: z.string().max(2500),
  /** How to explain it to the child: one or two simple ideas. */
  teach: z.string().max(1500),
  /** 3–5 practice questions for the child, with no answers. */
  practice: z.array(z.string().max(300)).max(5),
  /** The answers to the practice questions, for the parent only (same order). */
  answers: z.array(z.string().max(300)).max(5).default([]),
});
export type HomeworkHelp = z.infer<typeof HomeworkHelp>;

/** POST /tasks/:id/check: the child asks Zaki to look at their answers before handing in. */
export const HomeworkCheckRequest = z
  .object({ text: z.string().trim().max(2000).default(""), photos: z.array(PhotoUpload).max(MAX_HELP_PHOTOS).default([]) })
  .refine((v) => v.text.length > 0 || v.photos.length > 0, "Nothing to check");
export type HomeworkCheckRequest = z.infer<typeof HomeworkCheckRequest>;

export const HomeworkCheck = z.object({
  /** Something true and kind about the work. */
  praise: z.string().max(400),
  /** Where to look again, as hints and questions. Never the right answer. Empty = looks good. */
  hints: z.array(z.string().max(300)).max(5),
});
export type HomeworkCheck = z.infer<typeof HomeworkCheck>;

const Allowance = z.object({ limit: z.number().int().nullable(), used: z.number().int() });

export const HomeworkHelpResponse = z.object({
  help: HomeworkHelp.nullable(),
  /** limit = today's AI messages are used up; unreadable = Zaki couldn't make out the page or question. */
  error: z.enum(["limit", "unreadable"]).nullable(),
  /** Set when the words looked like someone in danger: Zaki answers with a helpline instead. */
  helpline: z.string().nullable().default(null),
  ai_allowance: Allowance,
});
export type HomeworkHelpResponse = z.infer<typeof HomeworkHelpResponse>;

export const HomeworkCheckResponse = z.object({
  check: HomeworkCheck.nullable(),
  error: z.enum(["limit", "unreadable"]).nullable(),
  helpline: z.string().nullable().default(null),
  ai_allowance: Allowance,
});
export type HomeworkCheckResponse = z.infer<typeof HomeworkCheckResponse>;
