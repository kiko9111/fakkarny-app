/**
 * The hidden "clear form" step (owner idea, 2026-11-25): before the rule engine reads a message,
 * a small model may rewrite it into a plain, explicit sentence the code reads easily. Typos fixed,
 * words split, Franco written in Arabic letters, numbers as digits, the day and time spelled out.
 * The model never decides anything: understand() still does all the work, on the rewrite, and the
 * user never sees it. Used only when understand() finds nothing on the original message
 * (`pickUnderstood`), so a rewrite can't overrule something the code already read correctly.
 */
import type { Understood } from "./index";

export const CLARIFY_VERSION = "clarify-2026-11-25.1";

export const CLARIFY_PROMPT = `You rewrite one chat message so a simple program can read it. You do not answer it.

Rules:
- Keep the meaning exactly. Never add a time, day, amount, name or request that is not in the message or the conversation.
- Arabic or Franco (Arabic in Latin letters) → write simple Egyptian Arabic in Arabic letters. English → simple English.
- Fix typos and split words typed together. Write numbers as digits (ميتين → 200, ٣ → 3).
- If the message answers Zaki's last question, write the full request with the answer in it.
- Requests start with the verb: فكرني / سجل / قول لـ / قسم / remind me / log / tell / split.
- Days: write بكرة, النهارده, يوم السبت, tomorrow, on Saturday. Times: الساعة 5 العصر, at 5pm.
- Plain talk, feelings, news and questions stay as they are, short.
- Write only the rewritten message, one line, nothing else.

Examples:
Message: 3andydoctorbokraelsa3a5
Rewrite: عندي دكتور بكرة الساعة 5

Message: fakarny kaman sa3teen a2fel el forn
Rewrite: فكرني كمان ساعتين أقفل الفرن

Message: ahmed khad meny mitein
Rewrite: أحمد خد مني 200

Message: rmind me 2morow 2 pay the rent
Rewrite: remind me tomorrow to pay the rent

Message: el wad omar 3ayzo yzaker el 3oloom
Rewrite: قول لعمر يذاكر العلوم

Message: ana ta3ban awi enharda
Rewrite: أنا تعبان أوي النهارده

Zaki: الساعة كام؟
Message: 4 el 3asr
Rewrite: الساعة 4 العصر`;

/** The chat messages for the clarify call: the last two turns for context, then the message. */
export function clarifyMessages(text: string, history: { role: "user" | "assistant"; text: string }[] = []) {
  const recent = history.slice(-2).map((h) => `${h.role === "assistant" ? "Zaki" : "User"}: ${h.text}`).join("\n");
  return [
    { role: "system" as const, content: CLARIFY_PROMPT },
    { role: "user" as const, content: `${recent ? `${recent}\n` : ""}Message: ${text}\nRewrite:` },
  ];
}

/** The model's rewrite, trimmed to one line; null when it is empty or runs away. */
export function cleanRewrite(raw: string): string | null {
  const line = raw.replace(/^\s*(rewrite|الرسالة)\s*:\s*/i, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  if (!line || line.length > 400) return null;
  return line.replace(/^["“«]|["”»]$/g, "").trim();
}

/** Did the code find anything to do (or to ask)? */
export const didSomething = (u: Understood) =>
  u.crisis || Boolean(u.ask) || u.create_items.length > 0 || u.update_items.length > 0 || u.save_memories.length > 0 || u.app_actions.length > 0;

/** The original reading wins; the rewrite's reading is used only when the original found nothing. */
export function pickUnderstood(original: Understood, rewritten: Understood | null): Understood {
  if (didSomething(original) || !rewritten) return original;
  return { ...rewritten, script: original.script };
}
