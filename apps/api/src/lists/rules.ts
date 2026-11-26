/**
 * Words for household lists, per reader language. Arabic lines about another person avoid
 * gendered verbs (the reader may be anyone), as the circle lines do.
 */

type Lang = "ar" | "en";

const join = (lang: Lang, things: string[]): string => {
  const shown = things.slice(0, 5);
  const more = things.length - shown.length;
  if (lang === "en") {
    const list =
      shown.length > 1
        ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}`
        : (shown[0] ?? "");
    return more > 0 ? `${list} and ${more} more` : list;
  }
  const list =
    shown.length > 1
      ? `${shown.slice(0, -1).join("، ")} و${shown.at(-1)}`
      : (shown[0] ?? "");
  return more > 0 ? `${list} و${more} كمان` : list;
};

const who = (lang: Lang, name: string | null) =>
  name ?? (lang === "en" ? "Someone" : "حد");

/** To the person out shopping: someone added something while they are out. */
export function addedLine(
  lang: Lang,
  name: string | null,
  list: string,
  things: string[],
): string {
  return lang === "en"
    ? `🛒 ${who(lang, name)} added ${join(lang, things)} to ${list}`
    : `🛒 «${list}»: اتضاف ${join(lang, things)} (من ${who(lang, name)})`;
}

/** To the others: someone is going shopping for this list. */
export function tripStartLine(
  lang: Lang,
  name: string | null,
  list: string,
): string {
  return lang === "en"
    ? `🛒 ${who(lang, name)} is going shopping now. Need anything? Add it to ${list} and it will be on the way.`
    : `🛒 ${who(lang, name)} في الطريق للمشتريات دلوقتي. محتاج حاجة؟ ضيفها في «${list}» وهتوصل مع المشوار.`;
}

/** To the others: the shopper is back. */
export function tripEndLine(
  lang: Lang,
  name: string | null,
  list: string,
  got: number,
): string {
  return lang === "en"
    ? `✅ ${who(lang, name)} is back with ${got} ${got === 1 ? "thing" : "things"} from ${list}`
    : `✅ «${list}»: رجعت ${got} ${got === 1 ? "حاجة" : got <= 10 ? "حاجات" : "حاجة"} مع ${who(lang, name)}`;
}

/** Zaki's reply in the chat after adding (rules or the model's list items). */
export function addReply(
  lang: Lang,
  list: string,
  added: string[],
  already: string[],
  shared: boolean,
): string {
  if (!added.length && already.length)
    return lang === "en"
      ? `${join(lang, already)} ${already.length === 1 ? "is" : "are"} already on ${list} 👍`
      : `${join(lang, already)} موجودين في «${list}» أصلاً 👍`;
  const base =
    lang === "en"
      ? `Added ${join(lang, added)} to ${list} 🛒`
      : `ضفت ${join(lang, added)} في «${list}» 🛒`;
  const tail = shared
    ? lang === "en"
      ? " Everyone in the circle sees it."
      : " وكل اللي في الدايرة شايفينها."
    : "";
  return base + tail;
}

/** A chat card's label. */
export function addLabel(lang: Lang, list: string, added: string[]): string {
  return lang === "en"
    ? `Added to ${list}: ${join(lang, added)}`
    : `اتضاف في «${list}»: ${join(lang, added)}`;
}

export function doneLabel(lang: Lang, list: string, got: string[]): string {
  return lang === "en"
    ? `Ticked off on ${list}: ${join(lang, got)}`
    : `اتشطب من «${list}»: ${join(lang, got)}`;
}

export function tripAskLabel(lang: Lang, list: string): string {
  return lang === "en"
    ? `Tell the circle you're going shopping (${list})`
    : `أقول للدايرة إن في مشوار مشتريات دلوقتي («${list}»)؟`;
}

export function tripSentLabel(lang: Lang, list: string): string {
  return lang === "en"
    ? `Told the circle you're going shopping (${list})`
    : `قلت للدايرة إن في مشوار مشتريات («${list}»)`;
}

/** "What's on the list?" from the rules: the open things, or that it is empty. */
export function showReply(lang: Lang, list: string, open: string[]): string {
  if (!open.length)
    return lang === "en"
      ? `${list} is empty right now ✨`
      : `«${list}» فاضية دلوقتي ✨`;
  const lines = open.slice(0, 15).map((t) => `• ${t}`);
  const more = open.length - lines.length;
  const head =
    lang === "en"
      ? `On ${list} (${open.length}):`
      : `في «${list}» (${open.length}):`;
  return [
    head,
    ...lines,
    ...(more > 0
      ? [lang === "en" ? `…and ${more} more` : `…و${more} كمان`]
      : []),
  ].join("\n");
}
