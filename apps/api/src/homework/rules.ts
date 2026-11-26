import type { Lang } from "../tasks/rules";

/**
 * Wording for homework rewards and a week's homework (template words, no AI). Lines about the
 * parent avoid gendered verbs; lines to the child speak to them as the rest of the app does.
 */
const nameOr = (name: string | null | undefined, lang: Lang) => name?.trim() || (lang === "en" ? "Your parent" : "حد من العيلة");
const egp = (lang: Lang, n: number) => (lang === "en" ? `EGP ${n.toLocaleString("en-US")}` : `${n.toLocaleString("en-US")} جنيه`);

/** Added to a homework request: what it earns. */
export function rewardTag(lang: Lang, amount: number): string {
  return lang === "en" ? ` Reward: ${egp(lang, amount)} pocket money 🐷` : ` المكافأة: ${egp(lang, amount)} مصروف 🐷`;
}

/** To the child, under "Well done": the reward went into their pocket-money record. */
export function rewardLine(lang: Lang, parent: string | null | undefined, amount: number, balance: number): string {
  const n = nameOr(parent, lang);
  return lang === "en" ? `+${egp(lang, amount)} pocket money from ${n} 🐷 Your total is ${egp(lang, balance)}.` : `+${egp(lang, amount)} مصروف من ${n} 🐷 رصيدك دلوقتي ${egp(lang, balance)}.`;
}

/** To the child: the parent marked some of it as handed over. */
export function paidLine(lang: Lang, parent: string | null | undefined, amount: number, balance: number): string {
  const n = nameOr(parent, lang);
  return lang === "en"
    ? `${n} marked ${egp(lang, amount)} of your pocket money as handed over 💛 Still to come: ${egp(lang, Math.max(0, balance))}.`
    : `${egp(lang, amount)} من مصروفك اتسلّموا من ${n} 💛 الباقي: ${egp(lang, Math.max(0, balance))}.`;
}

/** To the child: a week's homework arrived in one go (one line, not fifteen). */
export function batchLine(lang: Lang, parent: string | null | undefined, circle: string, items: { title: string; reward: number | null }[]): string {
  const n = nameOr(parent, lang);
  const total = items.reduce((s, i) => s + (i.reward ?? 0), 0);
  const list = items
    .slice(0, 10)
    .map((i) => `• ${i.title}`)
    .join("\n");
  const more = items.length > 10 ? (lang === "en" ? `\n…and ${items.length - 10} more` : `\n…و${items.length - 10} كمان`) : "";
  const prize = total > 0 ? (lang === "en" ? `\nAll of it can earn you ${egp(lang, total)} 🐷` : `\nلو خلّصتهم كلهم: ${egp(lang, total)} مصروف 🐷`) : "";
  return lang === "en"
    ? `New homework from ${n} in «${circle}» (${items.length}):\n${list}${more}${prize}\nSay yes to each one there and I'll remind you, then hand it in when it's done 📚`
    : `واجبات جديدة من ${n} في «${circle}» (${items.length}):\n${list}${more}${prize}\nوافق على كل واحد هناك وأنا هفكّرك بيه، ولما تخلّصه سلّمه 📚`;
}
