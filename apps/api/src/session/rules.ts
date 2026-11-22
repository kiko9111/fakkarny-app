import { FREE_SESSIONS_PER_WEEK, SESSION_MAX_USER_MESSAGES, type SessionMode } from "@fakkarni/shared";
import type { ReplyLang } from "../pipeline/rules";

/** Pure rules and fixed wording for Session. The lines here never come from a model. */
export const WEEK_MS = 7 * 86_400_000;
/** An open session that was left is treated as ended after this long. */
export const SESSION_IDLE_HOURS = 12;

/**
 * Sessions a free user may still start, and when the next one frees up. `recent` = start
 * times in the last 7 days. Pro (limit null) is never limited.
 */
export function freeSessions(recent: readonly Date[], pro: boolean, now: Date): { left: number | null; nextAt: Date | null } {
  if (pro) return { left: null, nextAt: null };
  const inWeek = recent.filter((d) => now.getTime() - d.getTime() < WEEK_MS).sort((a, b) => a.getTime() - b.getTime());
  const left = Math.max(0, FREE_SESSIONS_PER_WEEK - inWeek.length);
  // The slot frees when the oldest session that still counts turns 7 days old.
  const blocking = inWeek[inWeek.length - FREE_SESSIONS_PER_WEEK];
  return { left, nextAt: left === 0 && blocking ? new Date(blocking.getTime() + WEEK_MS) : null };
}

export const isIdle = (startedAt: Date, lastAt: Date | null, now: Date) => now.getTime() - (lastAt ?? startedAt).getTime() > SESSION_IDLE_HOURS * 3600_000;
export const atMessageCap = (userMessages: number) => userMessages >= SESSION_MAX_USER_MESSAGES;

/** Said at the start of EVERY session, before anything else: Zaki is not a doctor. */
export const NOT_A_DOCTOR: Record<ReplyLang, string> = {
  arabic: "قبل ما نبدأ: أنا زكي، ذكاء اصطناعي وصاحب بيسمع، مش دكتور ولا مختص. دي مساحة تفكّر فيها بصوت عالي، وكلامنا هنا ليك لوحدك.",
  english: "Before we start: I'm Zaki, an AI and a friend who listens, not a doctor or a specialist. This is a space to think out loud, and what we say here is only for you.",
};

const OPENERS: Record<SessionMode, Record<ReplyLang, [low: string, mid: string, high: string]>> = {
  talk: {
    arabic: ["شكلك شايل حاجة تقيلة النهارده. أنا هنا وسامعك. إيه أكتر حاجة على بالك دلوقتي؟", "أنا معاك. إيه اللي حابب نتكلم فيه النهارده؟", "حلو إن يومك ماشي كويس 🌟 إيه اللي مخلّيك حاسس كده؟"],
    english: ["It sounds like today is heavy. I'm here and listening. What is weighing on you most right now?", "I'm with you. What would you like to talk through today?", "Lovely that today feels good 🌟 What is behind that feeling?"],
  },
  vent: {
    arabic: ["طلّع كل اللي جواك. أنا سامع، ومش هقاطعك ولا هديك نصايح.", "فضفض براحتك. أنا سامع بس.", "قول كل اللي عندك، أنا سامعك."],
    english: ["Let it all out. I'm listening, and I won't interrupt or give advice.", "Say whatever you need to. I'm just listening.", "Tell me everything, I'm listening."],
  },
  night: {
    arabic: ["اليوم كان تقيل، وخلص خلاص. خد نفس هادي. إيه حاجة واحدة صغيرة عدّت كويس النهارده؟", "يلا نهدّي الدماغ قبل النوم. إيه حاجة واحدة عدّت كويس النهارده؟", "يوم حلو يستاهل نختمه بهدوء 🌙 إيه أحلى لحظة فيه؟"],
    english: ["Today was heavy, and it is over now. Take a slow breath. What is one small thing that went okay today?", "Let's quiet the mind before sleep. What is one thing that went okay today?", "A good day deserves a calm ending 🌙 What was the best moment in it?"],
  },
  big_day: {
    arabic: ["القلق قبل يوم مهم طبيعي جداً. احكيلي، إيه اليوم ده وإيه أكتر حاجة مخوّفاك فيه؟", "عندك يوم مهم. احكيلي عنه، وإيه اللي جهّزته لحد دلوقتي؟", "شكلك جاهز 💪 احكيلي عن اليوم ده، وإيه اللي مخلّيك مطمّن؟"],
    english: ["Nerves before a big day are completely normal. Tell me, what is the day and what worries you most about it?", "You have a big day coming. Tell me about it, and what you've prepared so far.", "You sound ready 💪 Tell me about the day, and what is making you feel steady."],
  },
};

/** Zaki's first question, shaped by the mode and the mood face the user tapped. */
export function opener(mode: SessionMode, mood: number, lang: ReplyLang): string {
  return OPENERS[mode][lang][mood <= 2 ? 0 : mood === 3 ? 1 : 2];
}

export const CLOSE_LINE: Record<ReplyLang, string> = {
  arabic: "شكراً إنك اديت نفسك الوقت ده 💛 ولو فيه حد قريب منك، كلمة معاه النهارده هتفرق.",
  english: "Thank you for giving yourself this time 💛 And if there is someone close to you, a word with them today would mean a lot.",
};
export const CAP_LINE: Record<ReplyLang, string> = {
  arabic: "اتكلمنا كتير النهارده، وده كفاية لمرة واحدة. خد وقتك مع اللي قلناه، ونكمّل في مرة تانية 💛",
  english: "We've talked a lot today, and that is enough for one sitting. Give what we said some time, and we can continue another day 💛",
};
/** When the model is unavailable or its answer is unusable. */
export const SESSION_FALLBACK: Record<ReplyLang, string> = {
  arabic: "أنا سامعك، بس حصلت عندي مشكلة صغيرة. ممكن تقولّي تاني؟",
  english: "I'm listening, but something went wrong on my side. Could you say that again?",
};
/** Care line used with the helpline when the model gave nothing usable in a crisis. */
export const CRISIS_CARE: Record<ReplyLang, string> = {
  arabic: "أنا سامعك، واللي بتحس بيه مهم ومش لوحدك فيه.",
  english: "I hear you. What you're feeling matters, and you are not alone in it.",
};
