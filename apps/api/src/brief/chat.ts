import { BRIEF_TOPIC_NAMES, briefTopicLimit, DEFAULT_BRIEF_TIME, knownTopics, type BriefTopic } from "@fakkarni/shared";
import type { PrismaClient, User } from "../generated/prisma/client";
import { card } from "../chat/actions";
import { LABEL, type StoredCard } from "../chat/cards";
import type { ReplyLang } from "../pipeline/rules";

/**
 * The daily news brief from the chat, by rules (no AI call): "ابعتلي أخبار الكورة كل يوم الساعة 8",
 * "daily AI news at 9pm", "akhbar el 3arabeyat kol yom", "وقف الأخبار". Strict on purpose: a
 * message needs a news word AND a daily or stop word, so "شفت الأخبار؟" or "any news?" go to the
 * model as before. The answer carries an Open card to Me > Daily news (the brief's one home).
 */
export type BriefAsk = { kind: "on"; topics: BriefTopic[]; time: string | null } | { kind: "off"; topics: BriefTopic[] };

const NEWS = /(أخبار|اخبار|الاخبار|الأخبار|نشرة|akhbar|a5bar|\bnews\b)/i;
// Only words that say "every day": "عايز أخبار الكورة" alone is a one-off ask and goes to the model.
const DAILY = /(كل يوم|كل صباح|كل صبح|كل ليلة|يومي|يوميا|يومياً|kol yom|kol youm|kol sob7|daily|every (day|morning|evening|night)|each (day|morning)|subscribe)/i;
const STOP = /(وقف|وقّف|بطل|بطّل|الغي|الغى|ألغي|إلغي|مش عايز|مش عاوز|كفاية|stop|cancel|turn off|no more|unsubscribe|wa2af|batal|ba6al)/i;

const TOPIC_WORDS: [BriefTopic, RegExp][] = [
  ["football", /(كور[ةه]|كرة القدم|الدوري|football|soccer|koora|kora)/i],
  ["sports", /(رياض[ةه]|sports?|reyada)/i],
  ["ai", /(ذكاء اصطناعي|الذكاء الاصطناعي|\bai\b|artificial intelligence)/i],
  ["tech", /(تكنولوجيا|تقني[ةه]|موبايلات|\btech|technology|teknolog)/i],
  ["cars", /(عربيات|العربيات|سيارات|السيارات|\bcars?\b|3arabeyat|3arbeyat)/i],
  ["business", /(اقتصاد|الاقتصاد|بورص[ةه]|فلوس|business|econom|stocks?|markets?)/i],
  ["egypt", /(مصر|\begypt|masr\b)/i],
  ["world", /(العالم|عالمي[ةه]|\bworld\b|international)/i],
  ["science", /(علوم|العلوم|علمي[ةه]|science)/i],
  ["health", /(صح[ةه]|الصح[ةه]|health)/i],
  ["entertainment", /(أفلام|افلام|مسلسلات|سينما|movies?|series|\btv\b|cinema|aflam)/i],
  ["gaming", /(ألعاب|العاب|جيمز|games?|gaming)/i],
];

const TIME = /(?:الساعة|الساعه|at|el ?sa3a|sa3a)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.|ص|م|الصبح|صباحا|صباحاً|بالليل|مساء|مساءً|المسا|بليل|el sob7|bel leil)?/i;

function readTime(text: string): string | null {
  const m = text.match(TIME);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  const mark = (m[3] ?? "").toLowerCase();
  const pm = /^(pm|p\.m\.|م|بالليل|مساء|مساءً|المسا|بليل|bel leil)$/.test(mark);
  const am = /^(am|a\.m\.|ص|الصبح|صباحا|صباحاً|el sob7)$/.test(mark);
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** What a message asks of the brief, or null when it isn't about the daily brief (pure). */
export function readBriefAsk(text: string): BriefAsk | null {
  const t = text.trim();
  if (!t || t.length > 200 || !NEWS.test(t) || /[?؟]\s*$/.test(t)) return null;
  const found = TOPIC_WORDS.filter(([, re]) => re.test(t)).map(([k]) => k);
  // "وقف أخبار الكورة" drops that topic; "وقف الأخبار" all of them.
  if (STOP.test(t)) return { kind: "off", topics: knownTopics(found) };
  if (!DAILY.test(t)) return null;
  // "رياضة وكورة" is football and sports; "الكورة" alone is football, not sports too.
  return { kind: "on", topics: knownTopics(found), time: readTime(t) };
}

const names = (lang: ReplyLang, topics: BriefTopic[]) => topics.map((k) => (lang === "english" ? BRIEF_TOPIC_NAMES[k].en : BRIEF_TOPIC_NAMES[k].ar)).join(lang === "english" ? ", " : " و");

/**
 * Applies a brief ask to the user's settings and says so. `limited`: free plan with subscriptions
 * on (one topic). New topics are added to the ones followed, never replacing them.
 */
export async function briefFastPath(prisma: PrismaClient, user: User, text: string, lang: ReplyLang, limited: boolean): Promise<{ text: string; cards: StoredCard[] } | null> {
  const ask = readBriefAsk(text);
  if (!ask) return null;
  const en = lang === "english";
  const screen = en ? "Daily news" : "أخبارك كل يوم";
  const open = card(lang, "open_screen", "done", LABEL.open(lang, screen), "/me/news");
  const had = knownTopics(user.briefTopics ?? []);
  if (ask.kind === "off") {
    if (!had.length) return { text: en ? "The daily news is already off." : "الأخبار اليومية مقفولة أصلاً.", cards: [open] };
    const keep = ask.topics.length ? had.filter((k) => !ask.topics.includes(k)) : [];
    await prisma.user.update({ where: { id: user.id }, data: { briefTopics: keep, nextTickAt: null } });
    if (keep.length) return { text: en ? `Done, I'll keep sending ${names(lang, keep)} only.` : `تمام، هكمّل أبعتلك ${names(lang, keep)} بس.`, cards: [open] };
    return { text: en ? "Done, no more daily news. You can turn it back on any time." : "تمام، وقفت الأخبار اليومية. ترجّعها في أي وقت.", cards: [open] };
  }
  if (!ask.topics.length && !had.length) {
    return { text: en ? "Happily! Pick the topics you want here:" : "من عينيا! اختار المواضيع اللي تحبها من هنا:", cards: [open] };
  }
  const limit = briefTopicLimit(!limited);
  const wanted = knownTopics([...had, ...ask.topics]);
  // Over the limit: what was just asked for wins over what was followed before.
  const topics = wanted.length > limit ? knownTopics([...ask.topics, ...had.filter((k) => !ask.topics.includes(k))].slice(0, limit)) : wanted;
  const time = ask.time ?? user.briefTime ?? DEFAULT_BRIEF_TIME;
  await prisma.user.update({ where: { id: user.id }, data: { briefTopics: knownTopics(topics), briefTime: time, nextTickAt: null } });
  const left = wanted.filter((k) => !topics.includes(k));
  const lines = [en ? `Done! Every day at ${time} I'll send you the latest on ${names(lang, knownTopics(topics))}.` : `تمام! كل يوم الساعة ${time} هبعتلك آخر أخبار ${names(lang, knownTopics(topics))}.`];
  if (left.length) lines.push(en ? `Free has one topic; Zaki Pro follows up to five.` : `المجانية فيها موضوع واحد، وزكي برو لحد 5 مواضيع.`);
  return { text: lines.join("\n"), cards: [open] };
}
