/**
 * Zaki's rule engine (owner decision, 2026-11-25: "the AI is for chatting only and the tasks are
 * math"). Plain code reads the user's message and decides every action: reminders, tasks, debts,
 * lists, memories, updates to open items, and app actions (money, Daftar, circles, tasks,
 * homework, trackers, split the bill, screens, settings). The model only writes the friendly
 * reply around what this decided (`summary`), or the question in `ask`.
 *
 * Output is the same FriendResponse shape the cloud model produces, so the server's apply path,
 * cards, undo and safety net are unchanged. When something needed is missing (a time, an amount,
 * a person), nothing is saved and `ask` says what to ask. Pure: no I/O, no clock.
 */
import type { AppAction, CreateItemAction, SaveMemoryAction, UpdateItemAction } from "../index";
import { addDays, addMinutes, clockStr, parseWhen, resolveTimes, type WhenResult } from "./when";
import { FRANCO_WORDS, STOP, fold, numberAt, scriptOf, type Script } from "./text";

export { fold, scriptOf, type Script } from "./text";
export { parseWhen, resolveTimes, addDays, addMinutes } from "./when";

export interface UnderstandItem {
  id: string;
  type: "task" | "reminder" | "note" | "list_item" | "debt";
  title: string;
  due_local?: string;
  repeat?: number | null;
  debt_person?: string | null;
  debt_amount?: number | null;
  debt_direction?: "owed_to_me" | "i_owe" | null;
}

export interface UnderstandInput {
  text: string;
  /** Local "YYYY-MM-DDTHH:mm" in the user's zone. */
  nowLocal: string;
  /** Earlier turns, oldest first (the message being read is not included). */
  history?: { role: "user" | "assistant"; text: string }[];
  openItems?: UnderstandItem[];
  app?: {
    circles?: { name: string; kind?: string; members: string[] }[];
    sections?: { name: string; kind?: string }[];
    trackers?: { kind: string; name?: string | null }[];
  };
}

export type AskSlot = "time" | "amount" | "person" | "confirm" | "what";

export interface Understood {
  create_items: CreateItemAction[];
  update_items: UpdateItemAction[];
  save_memories: SaveMemoryAction[];
  app_actions: AppAction[];
  crisis: boolean;
  /** Something needed is missing: ask this and save nothing for that intent. */
  ask: AskSlot | null;
  /** What the ask is about, for the question ("أكلم خالد"). */
  askAbout?: string;
  /** How the user writes; replies follow it (Franco → Arabic letters). */
  script: Script;
  /** The message is a question or small talk: the model just chats. */
  chat: boolean;
}

// ======================================================================================
// Tokens
// ======================================================================================

interface Toks {
  orig: string[];
  f: string[];
  text: string;
  starts: number[];
  used: boolean[];
}

function tokenize(msg: string): Toks {
  const padded = msg.replace(/([,،!?؟;()"“”«»])/g, " $1 ").replace(/(\D)\.(\s|$)/g, "$1 $2").replace(/[ـ]/g, "");
  const orig = padded.split(/\s+/).filter(Boolean);
  const f = orig.map(fold);
  const starts: number[] = [];
  let pos = 0;
  for (const w of f) {
    starts.push(pos);
    pos += w.length + 1;
  }
  return { orig, f, text: f.join(" "), starts, used: f.map(() => false) };
}

function useSpan(t: Toks, a: number, b: number) {
  t.f.forEach((w, i) => {
    const s = t.starts[i]!;
    if (s < b && s + w.length > a) t.used[i] = true;
  });
}
function useMatch(t: Toks, m: RegExpExecArray | null) {
  if (m) useSpan(t, m.index, m.index + m[0].length);
}

const B = "(?<![\\p{L}\\d])";
const E = "(?![\\p{L}\\d])";
const R = (s: string, flags = "iu") => new RegExp(s, flags);
const has = (t: Toks, s: string) => R(`${B}(?:${s})${E}`).test(t.text);
/** Like has(), also through the clinging prefixes و ب ل ف ك and ال ("بالدوا", "للدكتور"). */
const hasP = (t: Toks, s: string) => R(`${B}(?:و|ب|ل|ف|ك)?(?:ال|ل)?(?:${s})${E}`).test(t.text);
const find = (t: Toks, s: string) => R(`${B}(?:${s})${E}`).exec(t.text);

/** Strip Arabic clitics for matching: و / ب / ل / ال / بال / لل / عال; Franco el- / l- / b-. */
function stem(w: string): string {
  let x = fold(w);
  x = x.replace(/^(و)(?=ال|بال|لل)/, "");
  x = x.replace(/^(بال|وبال|عال|لل|فال|كال)/, "ال");
  x = x.replace(/^ال(?=\S{2,})/, "");
  x = x.replace(/^(el-|al-|l-|b-)/, "");
  return x;
}

// Concepts: the same thing across scripts ("كلمت ماما" ~ "Call mom").
const SYN: Record<string, string[]> = {
  call: ["call", "called", "calling", "كلم", "اكلم", "كلمت", "بكلم", "klmt", "kalemt", "kallemt", "akalem", "akalm", "aklem"],
  mom: ["mom", "mother", "mum", "ماما", "امي", "والدتي", "mama"],
  dad: ["dad", "father", "بابا", "ابويا", "baba"],
  report: ["report", "تقرير", "ريبورت"],
  electricity: ["electricity", "electric", "كهربا", "كهرباء", "kahraba"],
  pay: ["pay", "paid", "دفع", "ادفع", "دفعت", "dafa3t", "adfa3", "dafa3"],
  dentist: ["dentist", "سنان", "اسنان", "asnan"],
  doctor: ["doctor", "دكتور", "doktor", "dr"],
  meeting: ["meeting", "اجتماع", "ميتنج", "ميتينج"],
  water: ["water", "مية", "ميه", "مياه", "maya", "mayya", "mya", "ماء"],
  medicine: ["medicine", "meds", "pills", "pill", "دوا", "دواء", "dawa", "antibiotic"],
  rent: ["rent", "egar", "ايجار"],
  gym: ["gym", "جيم"],
  wedding: ["wedding", "فرح", "fara7"],
  laundry: ["laundry", "غسيل", "مكوجي"],
  bank: ["bank", "بنك"],
  milk: ["milk", "لبن", "laban"],
  bread: ["bread", "عيش", "3esh", "3eesh"],
  mohamed: ["محمد", "mhmd", "mohamed", "mo7amed", "mohammed"],
  khaled: ["خالد", "khaled", "5aled"],
  mahmoud: ["محمود", "mahmoud", "ma7moud"],
  tarek: ["طارق", "tarek", "tareq"],
  ahmed: ["احمد", "ahmed", "a7med"],
  hassan: ["حسن", "hassan", "7assan"],
  karim: ["كريم", "karim", "kareem"],
  mona: ["منى", "مني", "mona"],
  omar: ["عمر", "omar"],
  laila: ["ليلى", "ليلي", "laila", "layla", "leila"],
  medicine2: ["جبت الدوا"],
};
const SYN_INDEX = new Map<string, string>();
for (const [id, words] of Object.entries(SYN)) for (const w of words) SYN_INDEX.set(stem(w), id);

function concept(w: string): string | null {
  const s = stem(w);
  if (!s || s.length < 2 || STOP.has(s) || STOP.has(fold(w))) return null;
  const fr = FRANCO_WORDS[s];
  const s2 = fr ? stem(fr.split(" ").pop()!) : s;
  // "لأحمد", "بالدوا": a one-letter clitic before a known word.
  const s3 = s.replace(/^(ل|ب|و|ف|ك)(?=\S{3,})/, "");
  return SYN_INDEX.get(s) ?? SYN_INDEX.get(s2) ?? SYN_INDEX.get(s3) ?? SYN_INDEX.get(stem(s3)) ?? s2;
}
function concepts(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of tokenize(text).orig) {
    const c = concept(w);
    if (c) out.add(c);
  }
  return out;
}

// ======================================================================================
// Names: circle members, people
// ======================================================================================

interface Member {
  name: string;
  circle: string;
}

function members(input: UnderstandInput): Member[] {
  return (input.app?.circles ?? []).flatMap((c) => c.members.map((m) => ({ name: m, circle: c.name })));
}

/** Does word w name this person ("mona" ~ "منى", "حسن" ~ "Hassan")? */
function sameName(w: string, name: string): boolean {
  const a = stem(w);
  const b = stem(name);
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = SYN_INDEX.get(a) ?? SYN_INDEX.get(stem(FRANCO_WORDS[a] ?? ""));
  const cb = SYN_INDEX.get(b) ?? SYN_INDEX.get(stem(FRANCO_WORDS[b] ?? ""));
  return Boolean(ca && ca === cb);
}

function findMember(t: Toks, input: UnderstandInput, from = 0): { m: Member; i: number } | null {
  const ms = members(input);
  for (let i = from; i < t.orig.length; i++) {
    const w = t.orig[i]!.replace(/^(ل|لـ|l|le|li)(?=\p{L}{2,})/u, "");
    for (const m of ms) if (sameName(t.orig[i]!, m.name) || sameName(w, m.name)) return { m, i };
  }
  return null;
}

function findCircle(t: Toks, input: UnderstandInput): { name: string; kind?: string; i: number } | null {
  const circles = input.app?.circles ?? [];
  let best: { name: string; kind?: string; i: number; score: number } | null = null;
  for (const c of circles) {
    const words = c.name.split(/\s+/).map(stem).filter((w) => w.length >= 2);
    const en = words.map((w) => ({ جيم: "gym", بيت: "beit" })[w as "جيم"] ?? w);
    for (let i = 0; i < t.orig.length; i++) {
      const raw = t.orig[i]!.replace(/^(lel|lil|le|l)(?=\p{L}{2,})/u, "");
      const w0 = stem(raw);
      const w = words.includes(w0) ? w0 : stem(raw.replace(/^لـ?(?!ل)(?=\p{L}{3,})/u, ""));
      const wf = stem(FRANCO_WORDS[w] ?? w);
      const alt = { home: "بيت", family: "بيت", house: "بيت", beit: "بيت", bet: "بيت" }[w] ?? w;
      const hit = words.some((cw) => cw === w || cw === wf || cw === stem(alt)) || en.some((cw) => cw === w);
      if (hit) {
        const score = words.length === 1 ? 2 : 1;
        if (!best || score > best.score) best = { name: c.name, kind: c.kind, i, score };
      }
    }
  }
  return best;
}

// ======================================================================================
// Amounts
// ======================================================================================

interface Num {
  value: number;
  i: number;
}

function numbers(t: Toks, skipUsed = true): Num[] {
  const out: Num[] = [];
  for (let i = 0; i < t.f.length; i++) {
    if (skipUsed && t.used[i]) continue;
    const n = numberAt(t.f[i]!, t.f[i + 1]);
    if (n) {
      out.push({ value: n.value, i });
      if (n.used === 2) i++;
    }
  }
  return out;
}

// ======================================================================================
// Titles
// ======================================================================================

function cleanWord(orig: string, script: Script): string {
  if (script === "franco") {
    const w = orig.toLowerCase().replace(/^(el|l|b)-/, "");
    return FRANCO_WORDS[w] ?? orig;
  }
  if (script === "arabic") {
    return orig
      .replace(/^و(?=ال)/, "")
      .replace(/^(بال|عال|فال)/, "ال")
      .replace(/^لل/, "ال")
      .replace(/^بـ?(?=\p{L}{3,})/u, (x) => x)
      .replace(/^ب(?=ال)/, "");
  }
  return orig;
}

const TITLE_DROP_AR = /^(فكرني|فكريني|ذكرني|نبهني|عندي|عندنا|لازم|محتاج|محتاجه|عايز|عايزه|ناوي|ناويه|هروح|هعدي|انا|ان|اني|إن|إني|يوم|الساعه|الساعة|ساعه|بتاع|بتاعت|بتاعي|بتاعتي|ميعاد|موعد|ده|دي|دا|كمان|بعد|قبل|و|في|من|على|علي|عن|مع|ل|ب|بس|يا|خلاص|اعملي|اعمل|حط|سجل|منبه|منبّه|صحيني|اشوف|عشان|علشان|يعني|اوي|شويه|جدا|يتدفع|تتدفع)$/;
const TITLE_DROP_FR = /^(fakarny|fakkarny|fkrny|fakarni|fakkarni|3andy|3andi|3ndy|lazem|lazm|me7tag|3ayez|3ayza|ha|h|hroo7|hro7|ana|yom|el|al|sa3a|elsa3a|bta3|bta3t|bta3ty|bta3y|ma3ad|m3ad|da|dy|de|kaman|ba3d|abl|w|fe|fel|men|3ala|3al|b|bel|l|lel|le|ya|5alas|keda|ba2a|3ashan|ghareeb|gedan|awi|shwaya|yetedfe3|tetedfe3|sa7eeny|monabeh|mnabeh)$/i;
const TITLE_DROP_EN = /^(i|i'm|im|i've|me|my|you|your|the|a|an|to|of|for|on|at|in|by|is|are|am|be|was|it|its|and|or|with|about|please|pls|just|really|need|needs|have|has|had|remind|reminder|don't|dont|let|forget|should|must|got|gotta|going|will|would|can|could|that|this|up|hopefully|finally|again|ugh|so|some|sometime|soon|next|every|then|also|there|late|fee|if|miss|weird|making|noise|is|due|coming|book)$/i;

function titleOf(t: Toks, script: Script, from = 0, to = t.orig.length): string {
  const words: string[] = [];
  for (let i = from; i < to; i++) {
    if (t.used[i]) continue;
    const o = t.orig[i]!;
    if (/^[,،!?؟;()"“”«».:]+$/.test(o)) continue;
    if (/^\d+([.:]\d+)?$/.test(fold(o))) continue;
    const f = fold(o);
    if (script === "arabic" && TITLE_DROP_AR.test(f)) continue;
    if (script === "franco" && (TITLE_DROP_FR.test(f) || TITLE_DROP_EN.test(f))) continue;
    if (script === "english" && TITLE_DROP_EN.test(f)) continue;
    words.push(cleanWord(o, script));
  }
  return words.join(" ").replace(/\s+/g, " ").trim().slice(0, 60);
}

// ======================================================================================
// Vocabulary (folded; Arabic, Franco, English)
// ======================================================================================

const REMIND = "tfakarny|tfkrny|tfakkarny|tefakarny|tfakarni|تفكرني|تفكريني|فكرني|فكريني|ذكرني|ذكريني|نبهني|نبهيني|متنسانيش|متخلينيش انسي|fakarny|fakkarny|fkrny|fakarni|fakkarni|fakrny|remind me|remind|don't let me forget|dont let me forget|don't forget|reminder";
const OBLIGE = "is due|are due|due on|due by|لازم|محتاج اني|محتاج|محتاجه|ناوي|ناويه|مفروض|المفروض|lazem|lazm|me7tag|na2wy|el mafroud|need to|have to|has to|must|should|gotta|got to|i need|need";
const APPT = "دكتور|الدكتور|دكتوره|ميعاد|موعد|كشف|اجتماع|ميتنج|امتحان|انترفيو|مقابله|فرح|درس|تمرين|طياره|رحله|سفر|doctor|doktor|dentist|dermatologist|appointment|meeting|exam|interview|flight|class|lesson|training|mo2abla|tayara|emte7an|kashf|dars|tamreen";
const FOLLOW = "دكتور|الدكتور|دكتوره|كشف|امتحان|انترفيو|مقابله|doctor|doktor|dentist|dermatologist|exam|interview|mo2abla|emte7an|kashf|asnan|سنان|اسنان";
const IMPORTANT = "دوا|الدوا|دواء|علاج|dawa|pill|pills|medicine|meds|antibiotic|insulin|انسولين|طياره|طيارتي|رحله|flight|tayara|امتحان|امتحاني|exam|emte7an|انترفيو|interview|مقابله|mo2abla|غرامه|gharama|late fee|هيفصل|هيقطع|deadline|urgent|ضروري|مهم";
const ALARM = "منبه|منبّه|صحيني|صحّيني|alarm|wake me|mnabeh|monabeh|menabeh|sa7eny|sa7eeny|sa7any";
const DONE_VERB =
  "خلصت|خلصنا|خلصتها|خلصته|خلاص|عملت|عملتها|كلمت|جبت|جبته|جبتها|بعت|بعته|بعتها|دفعت|دفعتها|اشتريت|روحت|رحت|اخدت|اخدته|خدت|5alast|5alas|5las|5lst|klmt|kalemt|kallemt|gebt|ba3att|ba3at|b3t|dafa3t|eshtarait|ro7t|done|finished|did|called|paid|sent|bought|got|picked up|took|already|completed";
const MOVE_VERB = "اتاجل|اتأجل|اتأخر|اجل|اجلت|أجل|خليه|خليها|خلي|غير|غيرت|بدل|انقل|حول|et2agel|et2a5ar|2agel|2agelt|5aleeh|5aleeha|5ali|ghayar|moved|move|postpone|postponed|reschedule|rescheduled|push|pushed|change|changed|instead";
const STOP_REMIND = "بطل تفكرني|متفكرنيش|بلاش تفكرني|وقف التذكير|كفايه تفكرني|batal tfakarny|batal tfakkarny|matfakarneesh|stop reminding|don't remind|dont remind|no more reminders";
const CANCEL = "الغي|الغيه|الغيها|ألغي|امسح|امسحه|امسحها|شيل|شيله|شيلها|cancel|delete|remove|forget|olghy|olgheeh|olgheha|elghy|ems7|ems7o|sheel";
const YES = "اه|ايوه|ايوا|اكيد|تمام|ماشي|اوك|اوكي|حاضر|موافق|ابعت|ابعتها|صح|yes|yeah|yep|sure|ok|okay|aywa|aiwa|ah|tamam|mashy|maashi|akeed|7ader|olgheeh|olgheha|sa7";
const NO = "لا|لأ|لاء|مش هقدر|مقدرش|مش قادر|بلاش|مش عايز|no|nope|nah|can't|cannot|la2|la|msh ha2dar|mesh ha2dar|ma2darsh|balash";
const QUESTION = "ايه|إيه|امتي|إمتى|كام|ليه|فين|ازاي|مين|هل|eh|emta|kam|leh|feen|ezay|meen|what|when|how|why|where|who|which|do i|did i|am i|are you|can you tell";

// ======================================================================================
// The engine
// ======================================================================================

// Franco typed with no spaces ("3andydoctorbokraelsa3a5"): split it back into known words.
const GLUE_VOCAB = new Set(
  [
    ...Object.keys(FRANCO_WORDS),
    ..."3andy 3andi fakarny fakkarny fkrny bokra enharda naharda ba3d el sa3a elsa3a w nos rob3 lazem me7tag ana yom ma3 meeting gym el sob7 belleil bel leil 3asr dohr kaman sa3teen de2i2a".split(" "),
  ].map((w) => w.toLowerCase()),
);
function unglue(text: string): string {
  return text.replace(/[a-z0-9]{10,}/gi, (tok) => {
    const s = tok.toLowerCase();
    const best: (string[] | null)[] = [[]];
    for (let i = 1; i <= s.length; i++) {
      best[i] = null;
      for (let j = Math.max(0, i - 14); j < i; j++) {
        const w = s.slice(j, i);
        if (!best[j] || !(GLUE_VOCAB.has(w) || /^\d{1,2}$/.test(w))) continue;
        const cand = [...best[j]!, w];
        if (!best[i] || cand.length < best[i]!.length) best[i] = cand;
      }
    }
    const seg = best[s.length];
    return seg && seg.length >= 3 ? seg.join(" ") : tok;
  });
}

export function understand(input: UnderstandInput): Understood {
  if (/[a-z0-9]{10,}/i.test(input.text) && !/[؀-ۿ]/.test(input.text)) input = { ...input, text: unglue(input.text) };
  const out: Understood = { create_items: [], update_items: [], save_memories: [], app_actions: [], crisis: false, ask: null, script: scriptOf(input.text), chat: false };
  const text = input.text.trim();
  if (!text) return { ...out, chat: true };
  const script = out.script;
  const now = { local: input.nowLocal };
  const history = input.history ?? [];
  const lastAssistant = [...history].reverse().find((h) => h.role === "assistant")?.text ?? "";
  const lastUser = [...history].reverse().find((h) => h.role === "user")?.text ?? "";
  const open = input.openItems ?? [];

  if (isCrisis(text)) return { ...out, crisis: true };

  // 0. Lines the reminder notification sends: «title» in the text.
  const quoted = /«([^»]+)»/.exec(text);
  if (quoted) {
    const item = open.find((o) => fold(o.title) === fold(quoted[1]!));
    if (item) {
      const t = tokenize(text.replace(/«[^»]+»/, " "));
      if (has(t, "خلصت|done|5alast") && /✅|خلصت|done/i.test(text)) {
        if (!item.repeat) out.update_items.push({ id: item.id, status: "done" });
        return out;
      }
      const w = parseWhen(t.text, now);
      if (w.relMin || w.clocks.length) {
        const when = resolveTimes(w, now)[0]!;
        out.update_items.push({ id: item.id, due_at_local: when, remind_at_local: when });
        return out;
      }
    }
  }

  // 1. Answers to Zaki's last question or card (yes / no / a missing time or amount).
  const answered = answerToLastTurn(input, text, lastAssistant, lastUser, out);
  if (answered) return out;

  // 2. Several requests in one message: "سجل ٢٠٠ أكل وفكرني بالدكتور بكرة ٦".
  splitRequests(text).forEach((part, i) => handleClause(part, input, out, i > 0));
  if (!out.create_items.length && !out.update_items.length && !out.app_actions.length && !out.save_memories.length && !out.ask) out.chat = true;
  return out;
}

const CRISIS = [
  /\b(kill myself|killing myself|suicid\w*|end my life|want to die|wanna die|hurt myself|self[- ]harm|no reason to live)\b/i,
  /(انتحر|انتحار|اقتل نفسي|عايز اموت|عايزه اموت|عاوز اموت|نفسي اموت|انهي حياتي|اذي نفسي|مش عايز اعيش|مش عايزه اعيش|مبقتش عايز اعيش|مبقتش عايزه اعيش)/,
  /\b(ant[ae]?7ar|a2tel nafsy|a2tel nafsi|3ayez amoot|3ayza amoot|nefsy amoot|nefsi amoot|mesh 3ayez a3eesh|msh 3ayez a3ish|msh 3ayez a3eesh)\b/i,
];
export function isCrisis(text: string): boolean {
  const f = fold(text);
  return CRISIS.some((r) => r.test(text) || r.test(f));
}

function splitRequests(text: string): string[] {
  const parts = text.split(
    /\s+(?=(?:و|w |and |, ?and )?(?:فكرني|سجل|اعملي|fakarny|sagel|sgl|remind me|log )(?![\p{L}]))|\s*(?:وبعدين|و بعدين|w ba3den|w b3den|and then|, then)\s*|,?\s+(?=and (?:i have|i need|i've got|i gotta|remind)(?![\p{L}]))|\s+(?=و(?:عندي|لازم)(?![\p{L}])(?!.*(?:ارجعهم|ارجعها|ارجعه|أرجعهم|أرجعها|أرجعه|ادفعهم|أدفعهم|اسددهم)))|\s+(?=w (?:3andy|3andi|lazem|lazm)(?![\p{L}]))/iu,
  );
  const cleaned = parts.map((p) => p.replace(/^(?:و(?=فكرني|سجل|اعملي|عندي|لازم)|w |and )/i, "").trim()).filter(Boolean);
  // A part that is only a time ("every day at 8am" / "in 3 hours") belongs to the request after it.
  for (let i = 0; i < cleaned.length - 1; i++) {
    const p = cleaned[i]!;
    const w = parseWhen(fold(p), { local: "2000-01-01T00:00" });
    let rest = fold(p);
    for (const [a, b] of [...w.spans].sort((x, y) => y[0] - x[0])) rest = rest.slice(0, a) + rest.slice(b);
    if (!/\p{L}{2,}/u.test(rest.replace(/\b(at|on|in|the|في|الساعه|el|sa3a)\b/giu, ""))) {
      cleaned.splice(i, 2, `${p} ${cleaned[i + 1]}`);
      i--;
    }
  }
  if (cleaned.length <= 1) return [text];
  // A later part with a time but no day takes the first part's day ("بكرة البنك ٩ وبعدين غدا ٢").
  const day = /(بكره|بكرة|bokra|tomorrow|النهارده|today|بعد بكره|ba3d bokra)/i.exec(cleaned[0]!);
  return cleaned.map((p, i) => (i > 0 && day && !/(بكره|بكرة|bokra|tomorrow|النهارده|today|يوم|yom|on )/i.test(p) ? `${p} ${day[1]}` : p));
}

// ======================================================================================
// Answers to the previous turn
// ======================================================================================

function answerToLastTurn(input: UnderstandInput, text: string, lastAssistant: string, lastUser: string, out: Understood): boolean {
  const t = tokenize(text);
  const short = t.orig.length <= 6;
  const isYes = short && has(t, YES);
  const isNo = short && has(t, NO) && !isYes;
  const la = fold(lastAssistant);
  const open = input.openItems ?? [];

  // A task someone asked of the user: "منى طلبت منك: «تجيب العيش»" → yes / no.
  const asked = /^(.+?)\s+(?:طلب|طلبت|asked you|asked)(?![\p{L}])/u.exec(lastAssistant);
  if (asked && /«/.test(lastAssistant) && (isYes || isNo || has(t, "هجيبه|هجيبها|هعمله|هعملها|حاضر|on it"))) {
    out.app_actions.push({ kind: "task_answer", person: asked[1]!.trim(), answer: isNo ? "no" : "yes" });
    return true;
  }
  // Homework handed in: "عمر سلّم واجب «…» ✅" → well done / redo.
  const hw = /^(.+?)\s+(?:سلم|سلمت|سلّم|سلّمت|handed in|submitted)(?![\p{L}])/u.exec(lastAssistant);
  if (hw) {
    const redo = has(t, "يعيده|يعيدها|تعيده|تعيدها|تاني|يعيد|تعيد|redo|again|t3eedo|y3eedo|t3eed|y3eed|اعاده|لا|la2|no");
    const praise = has(t, "برافو|شاطر|شاطره|شطور|شطوره|جميل|ممتاز|حلو|فخور|فخوره|well done|great|good job|bravo|brafo|tamam|تمام");
    if (redo || praise) {
      out.app_actions.push({ kind: "homework_review", person: hw[1]!.trim(), answer: redo ? "no" : "yes" });
      return true;
    }
  }
  // "ألغي «فرح»؟" → yes cancels it.
  if (isYes && /(الغي|ألغي|cancel|امسح|delete)/i.test(lastAssistant) && /[؟?]/.test(lastAssistant)) {
    const item = bestItem(open, lastAssistant) ?? (open.length === 1 ? open[0] : undefined);
    if (item) {
      out.update_items.push({ id: item.id, status: "cancelled" });
      return true;
    }
  }
  // "ahh hlw el sa3a 4" after Zaki confirmed a reminder: change that item's time.
  {
    const w = parseWhen(t.text, { local: input.nowLocal });
    if ((w.clocks.length || w.relMin) && t.orig.length <= 6 && lastAssistant) {
      const item = bestItem(open, lastAssistant);
      if (item && item.due_local) {
        const rest = titleOf(markWhen(t, w), out.script);
        if (!rest || rest.split(" ").length <= 2) {
          const when = w.relMin && !w.clocks.length ? resolveTimes(w, { local: input.nowLocal })[0]! : `${w.date ?? item.due_local.slice(0, 10)}T${clockStr(w.clocks[0]!)}`;
          out.update_items.push({ id: item.id, due_at_local: when, remind_at_local: when });
          return true;
        }
      }
    }
  }
  // Zaki asked for a name ("what's her name? / tell me and I'll keep it"): the answer is a memory.
  if (/(اسمه|اسمها|اسمك|name)/i.test(lastAssistant) && /[؟?]|قولي|قوليلي|tell me/i.test(lastAssistant) && t.orig.length <= 3 && !parseWhen(t.text, { local: input.nowLocal }).clocks.length) {
    const subj = /مراتي|زوجتي|wife|meraty/i.test(lastUser + lastAssistant) ? "wife" : "name";
    out.save_memories.push({ kind: "person", subject: subj === "wife" ? "مرات المستخدم" : "اسم", content: `${subj === "wife" ? "اسم مراته" : "الاسم"}: ${cleanWord(text.trim(), out.script === "franco" ? "franco" : out.script)} (${text.trim()})` });
    return true;
  }
  // Zaki asked for a missing piece: read the earlier request again with this answer.
  if (/[؟?]\s*\S{0,3}\s*$/.test(lastAssistant.trim()) && lastUser && short) {
    const w = parseWhen(t.text, { local: input.nowLocal });
    const onlyNum = numbers(t, false).length > 0 && t.orig.length <= 3;
    const askedName = false;
    if (askedName) {
      const subj = /مراتي|زوجتي|wife|meraty/i.test(lastUser + lastAssistant) ? "wife" : "name";
      out.save_memories.push({ kind: "person", subject: subj === "wife" ? "مرات المستخدم" : "اسم", content: `${subj === "wife" ? "اسم مراته" : "الاسم"}: ${cleanWord(text.trim(), out.script === "franco" ? "franco" : out.script)} (${text.trim()})` });
      return true;
    }
    if (w.clocks.length || w.date || w.relMin || onlyNum || (has(t, "و|w|and") && (w.date || w.clocks.length))) {
      const merged = `${lastUser} ${text}`;
      const sub: Understood = { ...out, create_items: [], update_items: [], save_memories: [], app_actions: [], ask: null };
      handleClause(merged, input, sub);
      if (sub.create_items.length || sub.app_actions.length) {
        out.create_items.push(...sub.create_items);
        out.app_actions.push(...sub.app_actions);
        out.script = scriptOf(lastUser) === "english" && out.script === "english" ? "english" : out.script;
        return true;
      }
    }
  }
  return false;
}

function markWhen(t: Toks, w: WhenResult): Toks {
  for (const [a, b] of w.spans) useSpan(t, a, b);
  return t;
}

/** The open item a text talks about, by shared words across scripts. */
function bestItem(open: UnderstandItem[], text: string): UnderstandItem | undefined {
  const want = concepts(text);
  let best: UnderstandItem | undefined;
  let bestScore = 0;
  let tie = false;
  for (const o of open) {
    const have = concepts(`${o.title} ${o.debt_person ?? ""}`);
    let score = 0;
    for (const c of have) if (want.has(c)) score += c.length >= 3 ? 1 : 0.5;
    if (score > bestScore) {
      best = o;
      bestScore = score;
      tie = false;
    } else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore > 0 && !tie ? best : undefined;
}

// ======================================================================================
// One request
// ======================================================================================

function handleClause(text: string, input: UnderstandInput, out: Understood, chained = false) {
  const t = tokenize(text);
  // A short Latin part ("7pm") follows the message's script; a real English sentence keeps its own.
  const script = scriptOf(text) === "english" && out.script !== "english" && (text.match(/[a-z]{2,}/gi) ?? []).length < 3 ? out.script : scriptOf(text);
  const now = { local: input.nowLocal };
  const open = input.openItems ?? [];
  const isQuestion = (/[?؟]\s*$/.test(text) && !has(t, REMIND)) || (has(t, QUESTION) && !has(t, REMIND) && !has(t, "سجل|sagel|sgl|قسم|split|اعمل|a3mel|قول|2ol|خلي|5ali"));

  // ---- settings ----
  if (has(t, "كلمني بالمؤنث|كلميني|بالمؤنث|bel mo2anath|bel mo2nas|mo2anath|as a woman|as female|female")) {
    out.app_actions.push({ kind: "settings", setting: "address", text: "female" });
    return;
  }
  if (has(t, "بالمذكر|bel mozakar|bel mo2zakar|mozakar|as a man|as male")) {
    out.app_actions.push({ kind: "settings", setting: "address", text: "male" });
    return;
  }
  const wake = find(t, "i wake up|i get up|بصحي|بصحى|بقوم من النوم|bas7a|bas7as|ba2oom");
  const sleep = find(t, "i sleep|i go to bed|بنام|banam|bnam");
  if ((wake || sleep) && has(t, "now|دلوقتي|delwa2ty|dlw2ty|update|عدلها|غيرها|change|بقيت|بقى|ba2a")) {
    const w = parseWhen(t.text, now);
    const c = w.clocks[0];
    if (c) {
      const h = sleep && c.h === 12 ? 0 : sleep && c.h < 6 ? c.h : c.h;
      const val = wake && c.h >= 13 && c.h <= 19 ? `${String(c.h - 12).padStart(2, "0")}:${String(c.m).padStart(2, "0")}` : clockStr({ h, m: c.m });
      out.app_actions.push({ kind: "settings", setting: wake ? "wake_time" : "sleep_time", text: val });
      return;
    }
  }

  // ---- forget a memory ----
  const forget = find(t, "انسى ان|انسي ان|انسى إن|انسي|انسى|forget that|forget about|ensa en|ensa");
  if (forget && !bestItem(open, text)) {
    const what = text.slice(text.search(/انسى|انسي|forget|ensa/i)).replace(/^(انسى|انسي|forget|ensa)\s*(that|about|ان|إن|en)?\s*/i, "");
    if (what.trim()) {
      out.app_actions.push({ kind: "forget", text: what.trim().slice(0, 200) });
      return;
    }
  }

  // ---- screens ----
  const show = find(t, "وريني|ورينى|افتح|افتحلي|اعرض|open|show me|show|go to|warrini|wareeny|warriny|efta7|eft7");
  if (show) {
    const screens: [string, string][] = [
      ["قسمه الحساب|قسمة الحساب|تقسيم الحساب|split|el2esma|2esmet el 7esab", "split"],
      ["الدفتر|دفتر|daftar|el daftar|eldaftar", "daftar"],
      ["متابعات|المتابعات|متابعاتي|trackers|tracker|el motab3at", "trackers"],
      ["النهارده|اليوم|today|enharda|naharda", "today"],
      ["الفلوس|المصاريف|مصاريفي|money|expenses|el felous", "money"],
      ["الدواير|دوايري|الدوائر|circles|el dawayer", "circles"],
      ["ذكرياتي|اللي فاكره|memories", "memories"],
      ["الاعدادات|الإعدادات|settings|el e3dadat", "settings"],
    ];
    for (const [w, screen] of screens) if (has(t, w)) {
      out.app_actions.push({ kind: "open_screen", screen: screen as "today" });
      return;
    }
  }

  // ---- split the bill ----
  if (has(t, "قسم|قسملي|اقسم|قسّم|split|2asem|2assem|e2sem|2sem|2asemly") && !has(t, "قسم جديد|ميزانيه|ميزانيته|ميزانيتها|budget|section|اعمل قسم|افتح قسم")) {
    const paidShare = has(t, "نصيبه|نصيبها|share|naseebo|naseebha");
    if (paidShare) {
      const who = findMember(t, input) ;
      const name = who?.m.name ?? firstName(t, script);
      if (name) out.app_actions.push({ kind: "split_paid", person: name });
      return;
    }
    const nums = numbers(t);
    const people: string[] = [];
    for (let i = 0; i < t.orig.length; i++) {
      const raw = t.orig[i]!;
      const w = raw.replace(/^(و|w)(?=\p{L}{2,})/u, "").replace(/^ل(?=\p{L}{2,})/u, "");
      if (/^(me|ana|انا|بيني|عليا|وعليا|بين|وبين|between|ben|and|و|w|me,)$/i.test(fold(raw))) continue;
      const m = members(input).find((x) => sameName(w, x.name) || sameName(raw, x.name));
      if (m && !people.includes(m.name)) people.push(m.name);
    }
    const between = /(?:between|بين|ben|bein|عليا وعلى|عليا و)\s+(.+)$/iu.exec(text);
    if (between && !people.length) {
      for (const p of between[1]!.split(/\s*(?:,|،|\band\b|\bو|\bw\b)\s*/u)) {
        const n = p.replace(/^(me|ana|انا|بيني|و)$/i, "").trim();
        if (n && !/^(me|ana|انا|بيني)$/i.test(n)) people.push(n);
      }
    }
    if (!nums.length) {
      out.ask = "amount";
      out.askAbout = script === "english" ? "the bill" : "الحساب";
      return;
    }
    if (!people.length) {
      out.ask = "person";
      return;
    }
    out.app_actions.push({ kind: "split_bill", amount: Math.max(...nums.map((n) => n.value)), people, name: titleOf(t, script) || undefined });
    return;
  }
  if (has(t, "paid his share|paid her share|دفع نصيبه|دفعت نصيبها|dafa3 naseebo")) {
    const who = findMember(t, input);
    if (who) out.app_actions.push({ kind: "split_paid", person: who.m.name });
    return;
  }

  // ---- circles ----
  const circleWord = "دايره|دائره|دايرة|circle|dayra|dayera|group|جروب|مجموعه|شله";
  if (has(t, "اعمل|اعملي|انشئ|ابدا|make|create|start|new|a3mel|a3ml|e3mel") && has(t, circleWord) && !has(t, "دعوه|invite")) {
    const m = R(`(?:${circleWord})\\s+(?:جديده\\s+|new\\s+)?(?:for|ل|لل|lel|le|l|li)?\\s*(.+)$`).exec(t.text);
    let name = m ? m[1]! : "";
    if (m) {
      const startTok = t.starts.findIndex((s) => s >= m.index + m[0].length - m[1]!.length);
      name = t.orig.slice(startTok).join(" ");
    }
    name = name.replace(/^(for|my|the|ل|لل|lel|le|l)\s+/i, "").replace(/^ل(?=\p{L}{3,})/u, "").replace(/^(my|the)\s+/i, "");
    if (script === "franco") name = name.split(/\s+/).map((w) => FRANCO_WORDS[w.replace(/^(el|l|lel)/, "")] ?? FRANCO_WORDS[w] ?? w).join(" ");
    if (!name.trim()) {
      out.ask = "what";
      return;
    }
    out.app_actions.push({ kind: "create_circle", name: name.trim().slice(0, 60) });
    return;
  }
  const circle = findCircle(t, input);
  if (circle && has(t, "دعوه|دعوة|ادعي|invite|da3wa|e3zem|ad3y|link")) {
    out.app_actions.push({ kind: "invite", circle: circle.name });
    return;
  }
  if (circle && has(t, "غير اسم|سمي|rename|ghayar esm|change the name")) {
    const to = /(?:\s+ل\s*|\s+لـ\s*|\s+to\s+|\s+l\s+)(\S.*)$/iu.exec(text.slice(text.indexOf(circle.name.split(" ").pop()!) + 1));
    if (to) {
      out.app_actions.push({ kind: "rename_circle", circle: circle.name, name: to[1]!.trim().slice(0, 60) });
      return;
    }
  }
  if (circle && has(t, "اخرج من|اطلع من|سيب|leave|exit|o5rog|atla3 men")) {
    out.app_actions.push({ kind: "leave_circle", circle: circle.name });
    return;
  }
  // Check-ins: "قول للبيت إني وصلت", "2ol lel beit eny fel taree2", "tell Family I'm home".
  const arrived = has(t, "وصلت|اني وصلت|arrived|i'm here|wselt|wasalt|w9lt");
  const home = has(t, "في البيت|روحت البيت|وصلت البيت|i'm home|im home|got home|fel beit|ro7t el beit");
  const onWay = has(t, "في الطريق|في السكه|جاي|on my way|omw|fel taree2|fel sekka|gai");
  if (circle && (arrived || home || onWay) && has(t, "قول|قولي|بلغ|عرف|tell|let|2ol|2oly|ballagh")) {
    const kind = onWay ? "on_way" : home || (arrived && circle.kind === "family" && /بيت|beit|home/i.test(circle.name + " " + text)) ? "home" : "arrived";
    out.app_actions.push({ kind: "checkin", circle: circle.name, checkin_kind: kind });
    return;
  }
  // Ask a member to check in: "اسأل ليلى وصلت ولا لأ".
  const askWho = has(t, "اسال|اسأل|اسألي|ask|es2al|is2al") ? findMember(t, input) : null;
  if (askWho && (arrived || has(t, "وصل|وصلت|arrived|wesel|weslet|got home|okay|كويس"))) {
    out.app_actions.push({ kind: "ask_checkin", person: askWho.m.name });
    return;
  }

  // ---- Daftar (debts with people) ----
  const daftar = daftarIntent(t, text, input, script, out);
  if (daftar) return;

  // ---- tasks for other people ----
  if (taskIntent(t, text, input, script, out, circle)) return;

  // ---- trackers ----
  if (trackerIntent(t, text, input, script, out, isQuestion)) return;

  // ---- money ----
  if (moneyIntent(t, text, input, script, out, isQuestion)) return;

  // ---- open items: done / moved / stopped / cancelled ----
  if (updateIntent(t, text, input, out)) return;

  // ---- memories ----
  if (memoryIntent(t, text, script, out)) return;

  // ---- shopping list ----
  if (listIntent(t, text, script, out)) return;

  if (isQuestion) return;

  // ---- reminders and tasks ----
  reminderIntent(t, text, input, script, out, chained);
}

function firstName(t: Toks, script: Script): string | null {
  for (const o of t.orig) {
    const f = fold(o);
    if (/^[A-Z][a-z]+$/.test(o) && !TITLE_DROP_EN.test(f)) return o;
    if (script === "franco" && FRANCO_WORDS[f] && SYN_INDEX.has(stem(FRANCO_WORDS[f]!))) return FRANCO_WORDS[f]!;
  }
  return null;
}

// ======================================================================================
// Daftar
// ======================================================================================

function daftarIntent(t: Toks, text: string, input: UnderstandInput, script: Script, out: Understood): boolean {
  const open = input.openItems ?? [];
  const now = { local: input.nowLocal };
  const money = "فلوس|الفلوس|فلوسه|فلوسها|فلوسي|دين|الدين|felous|flos|el felous|money|debt";

  // Remind someone of what they owe: "فكر كريم بالفلوس اللي عليه".
  if (has(t, "فكر|فكري|نبه|remind|fakar|fakkar") && has(t, money + "|اللي عليه|اللي عليها|what he owes|what she owes")) {
    const who = findMember(t, input);
    if (who) {
      out.app_actions.push({ kind: "daftar_remind", person: who.m.name });
      return true;
    }
  }
  // Remove a Daftar entry: "امسح دين حسن من الدفتر".
  if (has(t, CANCEL) && has(t, "دين|الدفتر|debt|daftar|dein")) {
    const who = findMember(t, input);
    if (who) {
      out.app_actions.push({ kind: "daftar_cancel", person: who.m.name });
      return true;
    }
  }
  // Settled: "طارق رجعلي الفلوس", "Hassan paid me back", "رجعت لأحمد فلوسه", "محمود دفع الفلوس".
  const paidMe = has(t, "رجعلي|رجعتلي|رجع لي|رجعهم|دفعلي|دفع الفلوس|دفعت الفلوس|سدد|paid me back|paid me|gave me back|returned|paid back|rag3li|rag3ly|rag3etly|rag3etli|rag3itly|gave me back|dafa3ly|dafa3 el felous");
  const iPaid = (has(t, "رجعت|rag3t") && has(t, money)) || has(t, "رجعتله|رجعتلها|سددت|i paid back|i returned|paid him back|paid her back|rag3tlo|rag3tlaha");
  if (paidMe || iPaid || (has(t, "دفع|دفعت|dafa3|paid") && has(t, money))) {
    const words = concepts(text);
    const debt = open.find((o) => o.type === "debt" && o.debt_person && [...concepts(o.debt_person)].some((c) => words.has(c)));
    if (debt) {
      out.update_items.push({ id: debt.id, status: "done" });
      return true;
    }
    const who = findMember(t, input);
    if (who && paidMe) {
      out.app_actions.push({ kind: "daftar_settle", person: who.m.name });
      return true;
    }
  }

  // New debt.
  const d = parseDebt(t, text, script);
  if (!d) return false;
  if (!d.amount) {
    out.ask = "amount";
    out.askAbout = d.person;
    return true;
  }
  const w = parseWhen(t.text, now);
  const due = w.date ? `${w.date}T${w.clocks[0] ? clockStr(w.clocks[0]) : "09:00"}` : undefined;
  const title =
    script === "english"
      ? d.direction === "owed_to_me" ? `${d.person} owes me ${d.amount}` : `I owe ${d.person} ${d.amount}`
      : d.direction === "owed_to_me" ? `${d.person} عليه ${d.amount}` : `عليا ${d.amount} لـ${d.person}`;
  out.create_items.push({ type: "debt", title, ...(due ? { due_at_local: due } : {}), debt: { person: d.person, amount: d.amount, direction: d.direction } });
  if (has(t, "الدفتر|في الدفتر|daftar|ابعتله|ابعتلها|تأكد|تاكد|send him|send her|share")) {
    const who = findMember(t, input);
    if (who) out.app_actions.push({ kind: "daftar_add", person: who.m.name, amount: d.amount, direction: d.direction });
  }
  return true;
}

interface Debt {
  person: string;
  amount: number | null;
  direction: "owed_to_me" | "i_owe";
}

function parseDebt(t: Toks, text: string, script: Script): Debt | null {
  const f = t.text;
  const amountOf = (preferAfter?: RegExp): number | null => {
    const w = parseWhen(f, { local: "2000-01-01T00:00" });
    const tt = tokenize(text);
    markWhen(tt, w);
    const nums = numbers(tt).filter((n) => n.value >= 5);
    if (!nums.length) return null;
    if (preferAfter) {
      const m = preferAfter.exec(f);
      if (m) {
        const after = nums.find((n) => tt.starts[n.i]! > m.index);
        if (after) return after.value;
      }
    }
    return Math.max(...nums.map((n) => n.value));
  };
  const person = (raw: string): string => {
    let p = raw.trim().replace(/^(ان|إن|en|that)\s+/i, "");
    p = p.replace(/^(يا\s+)/, "");
    if (script === "franco") p = p.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    return p;
  };
  const tokensBefore = (idx: number, n = 2) => {
    const before = t.orig.slice(0, idx).filter((w) => !/^(ya3ni|يعني|و|w|and|so|ان|إن|en|that|في|الدفتر|daftar|سجل|حط|اكتب)$/i.test(fold(w)));
    const last = before.slice(-n);
    if (last.length === 2 && !/^(ام|ابو|عم|خاله|طنط|ست|um|om|abu|abo|3am|tant)$/i.test(fold(last[0]!))) return last.slice(1).join(" ");
    return last.join(" ");
  };
  const idxOf = (re: RegExp) => {
    const m = re.exec(f);
    if (!m) return -1;
    return t.starts.findIndex((s) => s >= m.index);
  };

  // English
  let m = /\b([a-z]+(?: [a-z]+)?)\s+(?:borrowed|took|owes me|owe me)\b/i.exec(text);
  if (m && !/^(i|we|you|ya3ni)$/i.test(m[1]!.split(" ").pop()!)) {
    const name = m[1]!.split(" ").filter((w) => !/^(ya3ni|so|and|that)$/i.test(w)).pop()!;
    return { person: cap(name), amount: amountOf(), direction: "owed_to_me" };
  }
  m = /\bi\s+(?:lent|loaned|gave)\s+([a-z]+)\s+(?:\d|[a-z]+\s+\d)/i.exec(text);
  if (m && !/^(him|her|them|it|my|the|a)$/i.test(m[1]!)) return { person: cap(m[1]!), amount: amountOf(), direction: "owed_to_me" };
  m = /\bi\s+(?:borrowed|took)\s+(?:\d+\s+)?(?:from|off)\s+([a-z]+)/i.exec(text) ?? /\bi\s+owe\s+([a-z]+)/i.exec(text);
  if (m) return { person: cap(m[1]!), amount: amountOf(), direction: "i_owe" };

  // Arabic
  let i = idxOf(/(?<![\p{L}])(خد|خدت|استلف|استلفت|سلفته|اخدت مني)(?![\p{L}])/u);
  if (i > 0 && !/^(انا|ana)$/.test(t.f[i - 1]!) && !R(`^(?:${REMIND})$`).test(t.f[i - 1]!)) {
    const p = tokensBefore(i);
    if (p) return { person: person(p), amount: amountOf(/(هيدفع|هتدفع|هيرجع|hayedfa3|hatedfa3|بـ|ب\d)/u), direction: "owed_to_me" };
  }
  m = /(?:^|\s)(?:سلفت|سلّفت|ادّيت|اديت)\s+(?!من(?:\s|$))(\S+)/u.exec(text);
  if (m && !/^(فلوس|الفلوس|\d)/.test(fold(m[1]!))) return { person: person(m[1]!.replace(/^ل(?=\p{L}{3,})/u, "")), amount: amountOf(), direction: "owed_to_me" };
  m = /(\S+(?:\s+\S+)?)\s+(عليه|عليها)\s+/u.exec(text);
  if (m) {
    const words = m[1]!.split(/\s+/);
    const p = words.length === 2 && /^(أم|ام|أبو|ابو|عم|خالة|طنط)$/.test(words[0]!) ? m[1]! : words.pop()!;
    if (!/^(اللي|إن|ان|مين)$/.test(p)) return { person: person(p.replace(/^(إن|ان)\s+/, "")), amount: amountOf(), direction: "owed_to_me" };
  }
  m = /(?:عليا|عليّا|عليّ)\s+\S+\s+(?:لـ|ل)\s*(\S+)/u.exec(text) ?? /(?:عليا|عليّا)\s+(?:لـ|ل)(\S+)/u.exec(text);
  if (m) return { person: person(m[1]!), amount: amountOf(), direction: "i_owe" };
  m = /(?:مستلف|مستلفه|استلفت|اتسلفت)\s+(?:\S+\s+)?من\s+(\S+)/u.exec(text);
  if (m) return { person: person(m[1]!), amount: amountOf(), direction: "i_owe" };

  // Franco
  i = idxOf(/\b(5ad|5adet|5adt|akhad|estalaf|estalafet|esstalaf)\b/i);
  if (i > 0 && !/^(ana)$/.test(t.f[i - 1]!)) {
    const p = tokensBefore(i, 1);
    if (p && /^[a-z]+$/i.test(p)) return { person: person(p), amount: amountOf(/(hayedfa3|hatedfa3|hayrag3)/i), direction: "owed_to_me" };
  }
  m = /\b([a-z]+)\s+(?:3aleh|3aleha|3alih|3aleeh)\b/i.exec(text);
  if (m && !/^(elly|ely)$/i.test(m[1]!)) return { person: person(m[1]!), amount: amountOf(), direction: "owed_to_me" };
  m = /\b(?:3alaya|3alaia|3alya)\s+\S+\s+(?:l|le|li|lel)\s+([a-z]+)/i.exec(text);
  if (m) return { person: person(m[1]!), amount: amountOf(), direction: "i_owe" };
  m = /\b(?:msalef|mestalef|mtsalef|estalaft|metsalef)\s+(?:\S+\s+)?men\s+([a-z]+)/i.exec(text);
  if (m) return { person: person(m[1]!), amount: amountOf(), direction: "i_owe" };
  return null;
}

const cap = (s: string) => (/^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// ======================================================================================
// Tasks for other people, homework
// ======================================================================================

function taskIntent(t: Toks, text: string, input: UnderstandInput, script: Script, out: Understood, circle: { name: string } | null): boolean {
  const now = { local: input.nowLocal };
  // Nudge / cancel an assigned task: "فكر منى باللبن", "الغي طلب اللبن من منى".
  const who = findMember(t, input);
  if (who && has(t, "فكر|فكري|نبه|nudge|remind|fakar|fakkar") && !has(t, REMIND)) {
    out.app_actions.push({ kind: "task_nudge", person: who.m.name });
    return true;
  }
  if (who && has(t, CANCEL) && has(t, "طلب|task|talab|المهمه")) {
    out.app_actions.push({ kind: "task_cancel", person: who.m.name });
    return true;
  }
  // Remind a whole circle: "فكر الجماعة في الجيم بالتمرين", "remind everyone in Family".
  if (circle && has(t, "فكر|فكري|remind everyone|remind|fakar|fakkar|قول للكل|tell everyone|ask everyone|ask")) {
    out.app_actions.push({ kind: "ask_circle", circle: circle.name, text: text.slice(0, 200) });
    return true;
  }
  // Assign: "قول لعمر يرتب أوضته", "خلي ليلى تحل واجب", "ask Mona to buy milk", "2ol l mona tgeeb".
  const ask = find(t, "قول|قوله|قولها|قولي ل|خلي|خليه|خليها|اطلب من|ask|tell|get|have|give|2ol l|2ol le|2ol|5ali|5aly|otlob men|e2ol");
  if (!ask) return false;
  const askTok = t.starts.findIndex((s) => s >= ask.index);
  // The person right after the verb.
  let target: Member | null = null;
  let targetTok = -1;
  for (let i = askTok; i < Math.min(t.orig.length, askTok + 4); i++) {
    const raw = t.orig[i]!;
    const w = raw.replace(/^(ل|لـ)(?=\p{L}{2,})/u, "");
    const m = members(input).find((x) => sameName(w, x.name) || sameName(raw, x.name));
    if (m) {
      target = m;
      targetTok = i;
      break;
    }
  }
  const nextWord = t.orig[askTok + 1] ?? "";
  if (!target) {
    // "قول لسامح يجيب" with someone not in any circle: ask who that is.
    const looksLikeName = /^ل\p{L}{2,}/u.test(t.orig[askTok]! === "قول" ? nextWord : t.orig[askTok]!) || (/^(ask|tell)$/i.test(t.orig[askTok]!) && /^[A-Z]/.test(nextWord));
    if (looksLikeName && t.orig.length >= 3 && !has(t, "اني|إني|eny|i'm|im")) {
      out.ask = "person";
      out.askAbout = nextWord.replace(/^ل/, "");
      return true;
    }
    return false;
  }
  for (let i = askTok; i <= targetTok; i++) t.used[i] = true;
  const w = parseWhen(t.text, now);
  markWhen(t, w);
  // Drop "to" and the verb prefix, keep the job.
  let title = titleOf(t, script, targetTok + 1);
  title = title.replace(/^(to|ي|ت)\s+/i, "");
  if (script === "franco") title = title.replace(/^(t|y)(?=\S)/i, "");
  if (!title) {
    out.ask = "what";
    return true;
  }
  const due = w.date ? `${w.date}T${w.clocks[0] ? clockStr(w.clocks[0]) : "09:00"}` : w.clocks.length ? resolveTimes(w, now)[0] : undefined;
  const homework = has(t, "واجب|الواجب|homework|wageb|صفحه|page|صفحة");
  out.app_actions.push({ kind: "assign_task", person: target.name, title: title.slice(0, 60), ...(due ? { due_at_local: due } : {}), ...(homework ? { homework: true } : {}) });
  return true;
}

// ======================================================================================
// Trackers
// ======================================================================================

const TRACKER_WORDS: { kind: string; words: string; ar: string; en: string }[] = [
  { kind: "water", words: "مية|ميه|مياه|ماء|كوبايه|كوبايات|كوباية|water|maya|mayya|mya|glass|glasses|cups?|kobaya|kobayat", ar: "مية", en: "Water" },
  { kind: "quran", words: "قران|القران|قرآن|القرآن|quran|2oran|el2oran", ar: "القرآن", en: "Quran" },
  { kind: "prayer", words: "صلاه|الصلاه|صلوات|prayers?|salah|salat|sala", ar: "الصلاة", en: "Prayer" },
  { kind: "gym", words: "جيم|الجيم|gym|tamreen|تمرين", ar: "الجيم", en: "Gym" },
  { kind: "medicine", words: "دوا|الدوا|medicine|dawa", ar: "الدوا", en: "Medicine" },
];

function trackerOf(input: UnderstandInput, t: Toks): { kind: string; name: string } | null {
  const trackers = input.app?.trackers ?? [];
  for (const tr of trackers) {
    if (tr.name) {
      const n = stem(tr.name);
      const root = n.slice(0, 3);
      for (const o of t.orig) {
        const w = stem(o);
        const wf = stem(FRANCO_WORDS[w] ?? w);
        if (w === n || wf === n || (root.length >= 3 && (w.startsWith(root) || wf.startsWith(root))) || readingWord(w, n) || stepsWord(w, n)) return { kind: tr.kind, name: tr.name };
      }
    }
  }
  for (const tw of TRACKER_WORDS) if (has(t, tw.words)) {
    const tr = trackers.find((x) => x.kind === tw.kind);
    if (tr) return { kind: tr.kind, name: tr.name ?? tw.ar };
  }
  return null;
}
const readingWord = (w: string, name: string) => /قراي|قرايه|قراءه/.test(name) && /^(قريت|صفحه|صفحات|pages?|2reet|saf7a|saf7at|read)$/.test(w);
const stepsWord = (w: string, name: string) => /خطو/.test(name) && /^(steps?|خطوه|خطوات|walked|مشيت|5atwa|5atwat)$/.test(w);

function trackerIntent(t: Toks, text: string, input: UnderstandInput, script: Script, out: Understood, isQuestion: boolean): boolean {
  const now = { local: input.nowLocal };
  const tr = trackerOf(input, t);
  // Undo the last log: "غلطت، مشربتش الكوباية دي", "undo that, I didn't drink it".
  if (has(t, "undo|غلطت|مشربتش|ماشربتش|متحسبهاش|didn't drink|didnt drink|ma shrebtsh|mashrebtsh|ghelte|8let")) {
    const hist = (input.history ?? []).filter((h) => h.role === "user").pop()?.text ?? "";
    const htr = tr ?? trackerOf(input, tokenize(hist));
    if (htr || /مية|water|drank|شربت/i.test(hist)) {
      out.app_actions.push({ kind: "undo_tracker", tracker: htr?.name ?? (script === "english" ? "water" : "مية") });
      return true;
    }
  }
  // Delete: "امسح متابعة القراية", "stop tracking water".
  if ((has(t, CANCEL) && has(t, "متابعه|متابعة|tracker|motab3a")) || has(t, "stop tracking|وقف متابعه|بطل متابعه")) {
    if (tr) {
      out.app_actions.push({ kind: "delete_tracker", tracker: tr.name });
      return true;
    }
  }
  // Ask times: "اسألني على المية الساعة ١٠ و ٢ و ٦", "ask me about water at 9, 1 and 5".
  if (has(t, "اسالني|اسألني|اسأليني|es2alny|is2alny|ask me|check on me")) {
    const w = parseWhen(t.text, now);
    if (w.clocks.length && (tr || has(t, "مية|water|maya|mayya"))) {
      const times = w.clocks.map((c) => clockStr({ h: c.h < 7 ? c.h + 12 : c.h, m: c.m }));
      const target = tr ?? { name: "مية" };
      out.app_actions.push({ kind: "update_tracker", tracker: target.name, ask_times: times.slice(0, 3) });
      return true;
    }
  }
  // Goal: "خلي هدف القراية ٣٠ صفحة", "track my water, goal 10 glasses".
  if (tr && has(t, "هدف|الهدف|goal|target|hadaf")) {
    const n = numbers(t).filter((x) => x.value > 0);
    if (n.length) {
      out.app_actions.push({ kind: "update_tracker", tracker: tr.name, amount: n[n.length - 1]!.value });
      return true;
    }
  }
  // Start following something: "عايز أتابع القرآن", "3ayez atabe3 el mashy kol yom nos sa3a w es2alny el sa3a 8 belel".
  const startWord = find(t, "اتابع|أتابع|تابع معايا|تابعلي|track|follow|atabe3|tabe3 ma3aya|e3mel tracker");
  if (startWord && !isQuestion) {
    const after = t.starts.findIndex((s) => s > startWord.index);
    const w = parseWhen(t.text, now);
    if (tr && !has(t, "هدف|goal")) {
      // Already followed: a goal in the same sentence updates it.
      const n = numbers(t).filter((x) => x.value > 0);
      if (n.length) {
        out.app_actions.push({ kind: "update_tracker", tracker: tr.name, amount: n[n.length - 1]!.value });
        return true;
      }
    }
    const known = TRACKER_WORDS.find((x) => has(t, x.words));
    let goal: number | undefined;
    const half = has(t, "نص ساعه|nos sa3a|half an hour");
    if (half) goal = 30;
    const askIdx = t.text.search(/اسالني|اسألني|es2alny|ask me/);
    const times = askIdx >= 0 ? parseWhen(t.text.slice(askIdx), now).clocks.map((c) => clockStr(c)) : [];
    for (let i = 0; i < t.orig.length; i++) if (i <= (after < 0 ? 0 : after - 1)) t.used[i] = true;
    markWhen(t, w);
    const nums = numbers(t).filter((x) => x.value > 0 && x.value < 100000);
    if (!goal && nums.length) goal = nums[0]!.value;
    let name = known ? (script === "english" ? known.en : known.ar) : titleOf(t, script, after < 0 ? 0 : after, askIdx >= 0 ? t.starts.findIndex((s) => s >= askIdx) : undefined);
    name = name.replace(/^(my|نومي)$/i, (x) => (x === "نومي" ? "النوم" : x)).replace(/\b(\d+ )?(marat|مرات|times)\b.*$/i, "").trim();
    if (/^(نومي|نوم)$/.test(name)) name = "النوم";
    if (!name) return false;
    out.app_actions.push({
      kind: "create_tracker",
      name: name.slice(0, 60),
      ...(known ? { tracker_kind: known.kind as "water" } : { tracker_kind: "custom" as const }),
      ...(goal ? { amount: goal } : {}),
      ...(times.length ? { ask_times: times.slice(0, 3) } : {}),
    });
    return true;
  }
  // Log: "شربت ٢ كوباية مية", "walked 6500 steps", "قريت ١٢ صفحه", "2reet 15 saf7a".
  if (tr && has(t, "شربت|اشربت|قريت|مشيت|صليت|اتمرنت|خدت|drank|had|read|walked|did|prayed|took|shrebt|2reet|mesheet|saleet|et2amart|logged|log|سجل|sagel")) {
    const n = numbers(t).filter((x) => x.value > 0);
    out.app_actions.push({ kind: "log_tracker", tracker: tr.name, ...(n.length ? { amount: n[0]!.value } : {}) });
    return true;
  }
  return false;
}

// ======================================================================================
// Money
// ======================================================================================

const SECTION_HINTS: [string, string[]][] = [
  ["أكل|اكل|الاكل|عالاكل|akl|food|lunch|dinner|breakfast|groceries|ghada|3asha|fetar|grocer|supermarket|سوبر ماركت|السوبر|مطعم|restaurant|غدا|عشا|فطار|coffee|قهوه", ["أكل", "food"]],
  ["عربيه|العربيه|3arabeya|3arabiya|car|بنزين|benzeen|gas|fuel|ميكانيكي", ["العربية", "car"]],
  ["اوبر|uber|careem|كريم باص|تاكسي|taxi|مواصلات|metro|مترو|bus|اتوبيس|mowaslat", ["مواصلات", "transport"]],
];

function sectionFor(t: Toks, input: UnderstandInput, kind: "expense" | "income"): string | undefined {
  const sections = (input.app?.sections ?? []).filter((s) => (s.kind ?? "expense") === kind);
  // A section named in the text.
  for (const s of sections) {
    const n = stem(s.name);
    for (const o of t.orig) {
      const w = stem(o.replace(/^(lel|lil|le|l|3al|3la)(?=\p{L}{2,})/u, "").replace(/^(على|عل|علي)/, ""));
      const wf = stem(FRANCO_WORDS[w] ?? w);
      if (n && (w === n || wf === n || (n.length >= 3 && (w.startsWith(n) || wf.startsWith(n))))) return s.name;
    }
  }
  // A category word that points at one of their sections.
  for (const [words, names] of SECTION_HINTS) if (has(t, words)) {
    const s = sections.find((x) => names.some((n) => stem(x.name) === stem(n)));
    if (s) return s.name;
  }
  return undefined;
}

function moneyIntent(t: Toks, text: string, input: UnderstandInput, script: Script, out: Understood, isQuestion: boolean): boolean {
  if (isQuestion) return false;
  const nums = () => numbers(t).filter((n) => n.value > 0);
  // Budget: "اعملي ميزانيه للعربيه ٢٠٠٠", "set my food budget to 4000".
  const newSection = has(t, "قسم جديد|قسم|section|2esm|2ism|category|بند");
  if (has(t, "ميزانيه|ميزانية|budget|mizaneya|mezaneya") && !newSection) {
    const n = nums();
    const section = sectionFor(t, input, "expense");
    if (!n.length) {
      out.ask = "amount";
      return true;
    }
    if (section) {
      out.app_actions.push({ kind: "set_budget", section, amount: n[0]!.value });
      return true;
    }
  }
  if (newSection && has(t, "اعمل|اعملي|ضيف|افتح|make|create|add|new|a3mel|a3ml|zawed|جديد|gedeed")) {
    const m = /(?:قسم|section|2esm|2ism|category|بند)\s+(?:جديد\s+|gedeed\s+|new\s+)?(?:for\s+|called\s+|named\s+|اسمه\s+|esmo\s+|ل|لل|lel\s*|le\s+|l\s+)?\s*([^\s،,]+)/iu.exec(text);
    let name = m ? m[1]!.replace(/^(لل|ل)/, "") : "";
    if (/^(lel|le|l)$/i.test(name)) name = "";
    if (script === "franco") {
      const f = fold(name).replace(/^(lel|l|el)/, "");
      name = FRANCO_WORDS[f] ?? FRANCO_WORDS[fold(name)] ?? name;
    }
    const after = /(?:lel|for)\s+(\S+)/i.exec(text);
    if ((!name || /^(gedeed|new)$/i.test(name)) && after) name = FRANCO_WORDS[fold(after[1]!)] ?? after[1]!;
    if (!name) return false;
    const n = nums();
    out.app_actions.push({ kind: "create_section", name: name.replace(/[،,]$/, ""), money_kind: "expense", ...(n.length ? { amount: n[0]!.value } : {}) });
    return true;
  }
  // Delete an entry: "امسح الـ٢٠٠ اللي سجلتها على الأكل", "delete the 85 I logged for uber".
  if (has(t, "امسح|شيل|اشطب|delete|remove|ems7|sheel") && has(t, "سجلتها|سجلته|سجلت|logged|entry|added|sagelt")) {
    const n = numbers(t, false).filter((x) => x.value > 0);
    const raw = /ال?ـ?(\d+)/.exec(fold(text));
    const amount = n[0]?.value ?? (raw ? Number(raw[1]) : undefined);
    out.app_actions.push({ kind: "delete_money_entry", ...(amount ? { amount } : {}), ...(sectionFor(t, input, "expense") ? { section: sectionFor(t, input, "expense") } : {}) });
    return true;
  }
  const income = has(t, "قبضت|قبضنا|جالي|جاتلي|اخدت المرتب|استلمت المرتب|got paid|received|earned|salary|bonus|2abadt|2abaddt|geli|gali|استلمت");
  const expense = has(t, "حطيت بنزين|عبيت بنزين|موّنت|مونت|7atet benzeen|fawelt|صرفت|دفعت|سجل|سجلي|اشتريت|spent|paid|bought|log|sgl|sagel|sagal|saraft|dafa3t|eshtarait|masroof|مصروف");
  if (!income && !expense) return false;
  // Debts and bills are not money logs.
  if (has(t, "عليه|عليها|عليا|استلف|خد مني|3aleh|3aleha|5ad meny|borrowed|owes|lazem|لازم|هدفع|have to|need to")) return false;
  const w = parseWhen(t.text, { local: input.nowLocal });
  markWhen(t, w);
  const n = nums();
  if (!n.length) {
    if (has(t, "مصروف|masroof|expense|سجل|sagel|sgl")) {
      out.ask = "amount";
      return true;
    }
    return false; // "paid the electricity finally!" is about an open item
  }
  const kind = income ? "income" : "expense";
  const section = sectionFor(t, input, kind);
  const titleToks = tokenize(text);
  markWhen(titleToks, parseWhen(titleToks.text, { local: input.nowLocal }));
  out.app_actions.push({ kind: "log_money", amount: n[0]!.value, money_kind: kind, ...(section ? { section } : {}) });
  return true;
}

// ======================================================================================
// Updates to open items
// ======================================================================================

function updateIntent(t: Toks, text: string, input: UnderstandInput, out: Understood): boolean {
  const open = input.openItems ?? [];
  if (!open.length) return false;
  const now = { local: input.nowLocal };
  const item = bestItem(open, text);
  // Stop a reminder: "5alas batal tfakarny bel maya".
  if (has(t, STOP_REMIND)) {
    const target = item ?? (open.filter((o) => o.repeat).length === 1 ? open.find((o) => o.repeat) : undefined);
    if (target) {
      out.update_items.push({ id: target.id, status: "cancelled" });
      return true;
    }
  }
  // Cancel: ask first ("ألغي «فرح»؟").
  if (item && has(t, CANCEL)) {
    out.ask = "confirm";
    out.askAbout = item.title;
    return true;
  }
  // Moved: "el dentist et2agel le yom el etnein nafs el ma3ad", "move the dentist to Wednesday", "خلي الدكتور الساعة ٧ بدل ٥".
  const w = parseWhen(t.text, now);
  if (item && has(t, MOVE_VERB) && (w.date || w.clocks.length)) {
    const cur = item.due_local ?? `${now.local.slice(0, 10)}T09:00`;
    // "الساعة ٧ بدل ٥": the first time is the new one.
    const clock = w.clocks[0];
    const date = w.date ?? cur.slice(0, 10);
    const when = `${date}T${clock ? clockStr(clock) : cur.slice(11, 16)}`;
    out.update_items.push({ id: item.id, due_at_local: when, remind_at_local: when });
    return true;
  }
  // Pushed by a span: "push the oven reminder by an hour", "أخر الدكتور ساعة", "a5ar el meeting nos sa3a".
  const by = /\b(?:push|delay|move)\b.*?\bby\s+(an?|one|two|half an?|\d+)\s*(hours?|minutes?|mins?)\b/i.exec(text) ?? /(?:اخر|أخر|أخّر|اخّر|a5ar|a5ar)\s+\S+(?:\s+\S+)?\s+(نص|ساعه|ساعتين|ربع|nos|sa3a|sa3teen|rob3)(?:\s*(ساعه|sa3a))?/iu.exec(fold(text));
  if (item && item.due_local && by) {
    const n = by[1]!.toLowerCase();
    const mins = /^(نص|nos|half)/.test(n) ? 30 : /^(ربع|rob3)$/.test(n) ? 15 : /^(ساعتين|sa3teen|two)$/.test(n) ? 120 : /^(ساعه|sa3a|an?|one)$/.test(n) ? 60 : Number(n) * (/^h/i.test(by[2] ?? "h") ? 60 : 1);
    const when = addMinutes(item.due_local, mins);
    out.update_items.push({ id: item.id, due_at_local: when, remind_at_local: when });
    return true;
  }
  // Later: "فكرني بيها كمان ساعة" right after its reminder.
  if (w.relMin && has(t, REMIND + "|بيها|بيه|beeha|beeh")) {
    const last = (input.history ?? []).filter((h) => h.role === "assistant").pop()?.text ?? "";
    const target = item ?? bestItem(open, last);
    if (target) {
      const when = addMinutes(now.local, w.relMin);
      out.update_items.push({ id: target.id, due_at_local: when, remind_at_local: when });
      return true;
    }
  }
  // Done: "paid the electricity finally!", "كلمت ماما خلاص", "ba3att el report 5alas".
  if (item && has(t, DONE_VERB) && !has(t, OBLIGE + "|" + REMIND)) {
    if (item.repeat) return true; // a repeating reminder stays on
    out.update_items.push({ id: item.id, status: "done" });
    return true;
  }
  return false;
}

// ======================================================================================
// Memories
// ======================================================================================

function memoryIntent(t: Toks, text: string, script: Script, out: Understood): boolean {
  const add = (kind: SaveMemoryAction["kind"], subject: string, content: string) => {
    out.save_memories.push({ kind, subject: subject.slice(0, 60), content: content.slice(0, 300) });
    return true;
  };
  let m = /\b([A-Z][a-z]+)\s+is\s+my\s+(son|daughter|wife|husband|brother|sister|mom|mother|dad|father|boss|friend|best friend|cousin|nephew|niece)\b/.exec(text);
  if (m) return add("person", m[1]!, text);
  m = /\bmy\s+(son|daughter|wife|husband|brother|sister|mom|dad|boss|best friend)(?:'s name)?\s+is\s+([A-Z][a-z]+)/i.exec(text);
  if (m) return add("person", m[2]!, text);
  m = /\bmy\s+(dentist|doctor|gym|school|clinic|work|office)\s+is\s+(.+)/i.exec(text);
  if (m) return add("place", m[1]!, text);
  if (/(مراتي|جوزي|ابني|بنتي|اخويا|اختي|امي|ابويا|مديري|صاحبي|صاحبتي)\s+(اسمه|اسمها)\s+\S+/u.test(fold(text)) || /(\S+)\s+(ابني|بنتي|مراتي|جوزي|اخويا|اختي)(?![\p{L}])/u.test(text)) return add("person", text.split(/\s+/)[0]!, text);
  m = /(?:^|\s)(?:اسمي|my name is|i'm called|ana esmy|ana esmi|esmy|esmi)\s+(\S+)/iu.exec(text);
  if (m) return add("person", "اسم المستخدم", `اسم المستخدم ${m[1]} (${cleanWord(m[1]!, script)})`);
  m = /(?:esmak|اسمك|سميتك|call you|your name is)\s+(?:ba3d keda\s+|بعد كده\s+)?(?:enta esmak\s+)?(.{2,40}?)(?:\s+ba3d keda|$)/iu.exec(text);
  if (m) {
    const nick = /abo el so7ab|ابو الصحاب/i.test(text) ? "أبو الصحاب (abo el so7ab)" : m[1]!;
    return add("preference", "اسم زكي", `المستخدم بيسمي زكي: ${nick}`);
  }
  // Likes and dislikes: "أنا بحب القهوة من غير سكر", "I love sushi", "ana b7eb el shay".
  if (!/[?؟]/.test(text) && !parseWhen(t.text, { local: "2000-01-01T00:00" }).clocks.length && has(t, "بحب|مبحبش|بموت في|i love|i like|i hate|i prefer|i don't like|ba7eb|b7eb|mb7ebsh|mab7ebsh")) {
    const rest = text.replace(/^(انا|أنا|ana|i)\s+/i, "");
    if (rest.split(/\s+/).length >= 2) return add("preference", "ذوق", text);
  }
  if (has(t, "عندي حساسيه|حساسيه من|allergic to|i'm allergic|3andy 7asaseya")) return add("fact", "حساسية", text);
  // Habits said as "I don't…": "ana mabashrabsh ahwa ba3d el sa3a 5".
  if (/\b(ana\s+)?ma?ba\S*sh\b/i.test(text) && /\b(ba3d|abl|kol|3ashan)\b/i.test(text)) return add("preference", "عادة", text);
  if (/\bi (?:don't|never|always|usually)\b/i.test(text) && !/remind|tomorrow|today/i.test(text)) return add("preference", "habit", text);
  if (/(انا\s+)?(مبشربش|مباكلش|بحب|مبحبش|دايما|ابدا)\s/u.test(fold(text)) && /(بعد|قبل|عشان|كل)/.test(text)) return add("preference", "عادة", text);
  return false;
}

// ======================================================================================
// Shopping list
// ======================================================================================

function listIntent(t: Toks, text: string, script: Script, out: Understood): boolean {
  const trig = /(?:we're out of|we are out of|out of|we need|need to buy|buy|add to the list|محتاجين|محتاج|ناقصنا|ناقص|خلص|هات|اشتري|me7tageen|me7tag|na2esna|na2es|5eles|hat|eshtery)\s+(.+)$/iu.exec(text);
  if (!trig) return false;
  const rest = trig[1]!.trim();
  const words = rest.split(/\s+/);
  // "محتاج أكلم…", "need to buy" with a verb next: not a list.
  if (/^(ا|أ|to\b|a[a-z0-9]{2,}\b(?<!akl))/iu.test(words[0]!) && !/^(ahwa|aish|akl|eggs?|apples?)$/i.test(words[0]!) && /^(أ|ا)[^ل]/u.test(words[0]!)) return false;
  if (has(t, REMIND + "|tomorrow|بكره|bokra|الساعه|sa3a|at \\d")) return false;
  const parts = rest
    .split(/\s*(?:,|،|\band\b|\bw\b|\s+و(?=\S)|\s+و\s+|\+)\s*/u)
    .map((p) => p.replace(/^و(?=\S{2,})/u, "").replace(/^(some|the|a|el|al)\s+/i, "").trim())
    .filter((p) => p && p.split(/\s+/).length <= 3);
  if (!parts.length || parts.length > 8) return false;
  for (const p of parts) {
    const title = script === "franco" ? p.split(/\s+/).map((w) => FRANCO_WORDS[fold(w).replace(/^el/, "")] ?? FRANCO_WORDS[fold(w)] ?? w).join(" ") : p;
    out.create_items.push({ type: "list_item", title: title.slice(0, 60) });
  }
  return true;
}

// ======================================================================================
// Reminders and tasks
// ======================================================================================

function reminderIntent(t: Toks, text: string, input: UnderstandInput, script: Script, out: Understood, chained = false) {
  const now = { local: input.nowLocal };
  const w = parseWhen(t.text, now);
  if (w.past) return;
  markWhen(t, w);
  // Drop the filler around the request.
  const remind = find(t, REMIND);
  if (remind) useMatch(t, remind);
  const alarm = has(t, ALARM);
  if (alarm) useMatch(t, find(t, ALARM));
  const oblige = has(t, OBLIGE);
  const appt = hasP(t, APPT);
  const hasTime = w.clocks.length > 0 || Boolean(w.relMin);
  const important = hasP(t, IMPORTANT) || (alarm && hasP(t, "طياره|flight|tayara|سفر"));
  const followUp = hasP(t, FOLLOW);
  let title = titleOf(t, script);
  if (alarm && !title) title = script === "english" ? "Wake up" : "صحيان";
  const futureVerb =
    /(?:^|\s)ه(?!دي|نا|ناك|و\s|ي\s)\p{L}{2,}/u.test(text) || /\bh(?!a?y|lw|elw|ena|edey|owa)a?[a-z0-9]{2,}/i.test(text) || /\b(will|going to|gonna|i'll)\b/i.test(text);
  const having = has(t, "عندي|عندنا|3andy|3andi|3ndy|i have|i've got|we have|my") || /^(3andy|3andi)/i.test(text);

  // English news about something else ("the new episode comes out Friday at 9, can't wait").
  if (script === "english" && !remind && !oblige && !having && !appt && !alarm && /\b(comes out|come out|airs|is out|releases|drops|premieres|can't wait|cant wait)\b/i.test(text)) return;
  if (!title && !alarm) return;
  // Nothing to do here: plain talk with no time and no request.
  if (!hasTime && !remind && !oblige && !alarm && !w.vague && !(appt && having) && !(w.date && futureVerb)) return;
  // A time anchored to something we can't compute ("after the dawn prayer"): ask.
  if (!hasTime && (alarm || (remind && !w.date && !w.vague))) {
    out.ask = "time";
    out.askAbout = title;
    return;
  }
  if (!hasTime && !w.date && appt && having && !oblige) {
    out.ask = "time";
    out.askAbout = title;
    return;
  }
  // Statements about events without a request or plan ("el match bokra el sa3a 9 hayb2a nar").
  if (hasTime && !chained && !remind && !oblige && !having && !futureVerb && !appt && !alarm && script !== "english" && !w.repeat) {
    // Short Franco/Arabic notes like "gym tonight at 8" still count when they are just a noun + time.
    if (title.split(" ").length > 2) return;
  }

  // An alarm at a bare 1–7 wakes you in the morning ("sa7eeny bokra 5 w nos" is 05:30).
  if (alarm && !hasP(t, "pm|م|مساء|مساءا|بالليل|بليل|الليل|العصر|المغرب|3asr|belleil|bel leil|masa|evening|night")) {
    for (const c of w.clocks) if (c.h >= 13 && c.h <= 19) c.h -= 12;
  }
  const times = hasTime ? resolveTimes(w, now) : [];
  if (w.repeat && w.repeat < 1440 && !w.clocks.length) times.splice(0, times.length, addMinutes(now.local, w.repeat));

  if (!times.length) {
    // A day but no time: a task on that day; no day: an undated task.
    const due = w.date ? `${w.date}T09:00` : undefined;
    out.create_items.push({ type: "task", title, ...(due ? { due_at_local: due } : {}), ...(important ? { important: true } : {}) });
    return;
  }
  for (const when of times) {
    const remindAt = appt && !remind && having && !w.relMin ? addMinutes(when, -60) : when;
    out.create_items.push({
      type: "reminder",
      title,
      due_at_local: when,
      remind_at_local: remindAt < now.local ? when : remindAt,
      ...(followUp ? { follow_up_at_local: addMinutes(when, 60) } : {}),
      ...(important ? { important: true } : {}),
      ...(alarm ? { alarm: true } : {}),
      ...(w.repeat ? { repeat_every_minutes: w.repeat } : {}),
    });
  }
}

// Re-exported for tests.
export const _internal = { tokenize, concepts, bestItem, parseDebt, splitRequests, titleOf };
void addDays;
