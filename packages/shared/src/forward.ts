/**
 * A message forwarded to Zaki from WhatsApp (or pasted from it): Zaki reads someone else's words
 * and pulls out what the user may want to keep (dates, reminders, homework, things to buy,
 * amounts). It travels as an ordinary chat message whose text starts with FORWARD_MARK, so it
 * is saved on the phone first and sent by the outbox like any message, works offline, needs no
 * new column, and an old app build shows it as "↪ the text". Pure.
 */

/** The start of a forwarded message's text. */
export const FORWARD_MARK = "↪ ";

/** Room left for the forwarded words in a chat message (the message limit is 4000). */
export const MAX_FORWARD_CHARS = 3900;

// Direction marks, zero-width characters and the like that WhatsApp puts around names and times.
const INVISIBLE = /[​-‏‪-‮⁦-⁩﻿]/g;

/** "[27/11/2026, 10:31 AM] Mona: …", "[10:31 ص، 27/11/2026] منى: …" (copied from WhatsApp). */
const COPIED_HEADER = /^\[([^\]\n]{4,40})\]\s*/;
/** "27/11/2026, 10:31 - Mona: …" (an exported chat). */
const EXPORT_HEADER = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?(?:[AaPp]\.?[Mm]\.?|ص|م))?)\s+-\s+/;

/** Lines that carry nothing to read. */
const NOISE = [
  /^<?\s*(media omitted|image omitted|video omitted|sticker omitted|gif omitted|audio omitted|document omitted)\s*>?$/i,
  /^<?\s*(تم استبعاد الوسائط|الوسائط غير مضمنة|تم حذف الوسائط)\s*>?$/,
  /^(this message was deleted|you deleted this message|تم حذف هذه الرسالة|لقد حذفت هذه الرسالة)\.?$/i,
  /^(forwarded|forwarded many times|معاد توجيهها|معاد توجيهها عدة مرات|تمت إعادة توجيهها)$/i,
];
const EDITED = /\s*<\s*(this message was edited|تم تعديل هذه الرسالة)\s*>\s*$/i;

/**
 * Tidy what WhatsApp gives when messages are shared or copied: the time stamp in front of each
 * line goes (the sender's name stays, "Mona: bring bread" means something), "<Media omitted>"
 * and "deleted" lines go, *bold* / _italic_ / ~strike~ markers go, and blank lines fold. When
 * the lines carried a time stamp, the newest one is kept on the first line ("(sent …)"), so
 * "tomorrow" in an old message can be read from the day it was written.
 */
export function cleanForwarded(raw: string): string {
  let sent: string | null = null;
  const lines: string[] = [];
  for (const original of raw.replace(INVISIBLE, "").replace(/\r\n?/g, "\n").split("\n")) {
    let line = original.trimEnd();
    const copied = COPIED_HEADER.exec(line);
    const exported = copied ? null : EXPORT_HEADER.exec(line);
    const header = copied ?? exported;
    if (header && /\d/.test(header[1]!)) {
      sent = header[1]!.trim();
      line = line.slice(header[0].length);
    }
    line = line.replace(EDITED, "").replace(/(^|[\s(])[*_~]([^*_~\n]+?)[*_~](?=[\s.,،!?؟:)]|$)/g, "$1$2");
    const bare = line.replace(/^[^:\n]{1,40}:\s*/, "").trim();
    if (NOISE.some((re) => re.test(line.trim()) || (bare !== line.trim() && re.test(bare)))) continue;
    lines.push(line);
  }
  const body = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!body) return "";
  return sent ? `(sent ${sent})\n${body}` : body;
}

/** The chat message for forwarded words: the mark, then the tidied words (cut to fit). Empty when nothing is left. */
export function markForwarded(raw: string): string {
  const body = cleanForwarded(raw);
  if (!body) return "";
  return FORWARD_MARK + (body.length > MAX_FORWARD_CHARS ? `${body.slice(0, MAX_FORWARD_CHARS - 1).trimEnd()}…` : body);
}

/** Whether a chat message is forwarded words, and the words without the mark. */
export function readForwarded(text: string): { forwarded: boolean; body: string } {
  if (text.startsWith(FORWARD_MARK)) return { forwarded: true, body: text.slice(FORWARD_MARK.length).trim() };
  // Spelled with a line break after the mark (typed or pasted by hand).
  if (/^↪︎?️?\s/.test(text)) return { forwarded: true, body: text.replace(/^↪︎?️?\s+/, "").trim() };
  return { forwarded: false, body: text };
}

/** What a shared item is, decided on the phone: words go to Zaki's chat, a photo to the receipt reader. */
export type SharedIn = { text?: string | null; subject?: string | null; images?: readonly string[] | null };
export type ShareRoute = { kind: "chat"; text: string } | { kind: "receipt"; uri: string } | { kind: "none" };

/**
 * Where something shared to Zaki goes. Photos are read for one thing only, receipts (owner
 * decision, 2026-11-23: receipts and homework pages are the only photos), so a photo opens the
 * receipt reader and is sent nowhere until the user taps. Words become a forwarded message.
 * A photo shared with a caption: the words win when they say something on their own.
 */
export function routeShare(s: SharedIn): ShareRoute {
  const words = [s.subject, s.text]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .filter((x, i, all) => all.indexOf(x) === i)
    .join("\n");
  const image = (s.images ?? []).find((u) => typeof u === "string" && u.length > 0);
  // A bare link or a few letters under a photo is a caption, not a message.
  const saysSomething = words.replace(/https?:\/\/\S+/g, "").trim().length >= 12;
  if (image && !saysSomething) return { kind: "receipt", uri: image };
  const text = markForwarded(words);
  if (text) return { kind: "chat", text };
  return image ? { kind: "receipt", uri: image } : { kind: "none" };
}
