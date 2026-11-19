import type { FriendModel, Usage } from "../ai/model";
import type { Script } from "../pipeline/rules";
import type { ProactivePlan } from "./plan";

/**
 * The friend's voice for messages it starts (PRD §6 "Proactive messages"): short prompt,
 * no chat history, so it stays cheap. Wellbeing rules are restated here too.
 */
export const PROACTIVE_SYSTEM = `You are Fakkarni, the user's warm, short-spoken, lightly funny Egyptian AI friend. You are starting the conversation (they did not message you).
Write 1 or 2 very short chat messages (one sentence each), separated by a newline. Rules:
- Phrase it as ONE friendly question. Remind by asking, not telling. Hint indirectly at the facts you are given.
- Never a list. Never mention anything not in the facts. Never say "reminder".
- No guilt, never "I miss you", never pressure them to reply.
- Write in the requested language and script exactly. Use their name if given.
- Output only the message text.`;

const LANG: Record<Script, string> = {
  arabic: "Egyptian Arabic in Arabic script",
  franco: "Egyptian Arabic in Franco (Latin letters and numbers, e.g. '3amel eh')",
  english: "English",
};

export function buildProactivePrompt(plan: ProactivePlan, opts: { name: string | null; script: Script; tone: string }): string {
  return [
    `Kind: ${plan.kind} message.`,
    `Language: ${LANG[opts.script]}.`,
    `Their name: ${opts.name ?? "unknown (don't use a name)"}. Tone: ${opts.tone}.`,
    "Facts:",
    ...plan.facts.map((f) => `- ${f}`),
  ].join("\n");
}

/** Used when the AI is unavailable, so scheduled messages still go out (FR-5 reliability). */
const TEMPLATES: Record<ProactivePlan["kind"], Record<Script, string>> = {
  morning: { arabic: "صباح الخير ☀️ إيه الخطة النهارده؟", franco: "Sabah el kheir ☀️ eh el plan enharda?", english: "Good morning ☀️ What's the plan today?" },
  night: { arabic: "يومك كان عامل إزاي النهارده؟", franco: "Yomak kan 3amel ezay enharda?", english: "How did today go?" },
  checkin: { arabic: "عامل إيه؟ في حاجة جاية عايزني أفتكرها؟", franco: "3amel eh? Fi 7aga gaya 3ayezni aftekerha?", english: "How's it going? Anything coming up you'd like me to remember?" },
  followup: { arabic: "كانت عاملة إزاي؟ 🙂", franco: "Kanet 3amla ezay? 🙂", english: "How did it go? 🙂" },
};

export async function writeProactive(
  model: FriendModel | undefined,
  plan: ProactivePlan,
  opts: { name: string | null; script: Script; tone: string },
): Promise<{ messages: string[]; usage: Usage | null }> {
  if (model) {
    try {
      const { text, usage } = await model.complete({ system: PROACTIVE_SYSTEM, prompt: buildProactivePrompt(plan, opts), maxTokens: 300 });
      const messages = text
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2);
      if (messages.length && messages.every((m) => m.length <= 280 && !/^\s*([-•*]|\d+[.)])\s/.test(m))) return { messages, usage };
    } catch {
      // fall through to the template
    }
  }
  return { messages: [TEMPLATES[plan.kind][opts.script]], usage: null };
}
