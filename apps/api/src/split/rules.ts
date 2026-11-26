import type { Split } from "@fakkarni/shared";
import { formatAmount, type Lang } from "../daftar/rules";

/** The WhatsApp message for a split: each share, who paid, and the link. Template words only. */
export function splitShareText(split: Pick<Split, "title" | "total" | "currency" | "people" | "paid_by" | "url" | "instapay">, lang: Lang): string {
  const money = (n: number) => formatAmount(n, split.currency, lang);
  const payer = split.paid_by !== null ? split.people[split.paid_by]?.name : null;
  const lines = split.people.map((p, i) => `• ${p.name}: ${money(p.share)}${i === split.paid_by ? (lang === "ar" ? " (دفع)" : " (paid)") : ""}`);
  if (lang === "ar") {
    return [
      `🧾 ${split.title ? `حساب «${split.title}»` : "الحساب"}: ${money(split.total)} بالخدمة والضريبة`,
      ...lines,
      payer ? `ابعتوا لـ${payer} نصيبكم 🙏` : "",
      payer && split.instapay ? `InstaPay: ${split.instapay}` : "",
      `شوف نصيبك، أو ضيف اللي طلبته وزكي يحسب الباقي: ${split.url}`,
      "اتقسم بزكي 🌟",
    ].filter(Boolean).join("\n");
  }
  return [
    `🧾 ${split.title ? `“${split.title}”` : "The bill"}: ${money(split.total)} with service and VAT`,
    ...lines,
    payer ? `Send ${payer} your share 🙏` : "",
    payer && split.instapay ? `InstaPay: ${split.instapay}` : "",
    `See your share, or add what you ordered and Zaki works out the rest: ${split.url}`,
    "Split with Zaki 🌟",
  ].filter(Boolean).join("\n");
}

/**
 * A group split, in a member's chat: who split what and their share. Arabic avoids gendered
 * verbs about other people ("من كريم", not "كريم قسم").
 */
export function memberShareLine(lang: Lang, x: { title: string; from: string; share: string; payer: string | "me" | null }): string {
  if (lang === "en") {
    const what = x.title ? `«${x.title}»` : "a bill";
    const tail = x.payer === "me" ? " You paid the bill, so the others owe you." : x.payer ? ` Send it to ${x.payer} 🙏` : "";
    return `🧾 ${x.from} split ${what} with you: your share is ${x.share}.${tail}`;
  }
  const what = x.title ? `«${x.title}»` : "الحساب";
  const tail = x.payer === "me" ? " انت اللي دفعت الحساب، فالباقيين عليهم نصيبهم ليك." : x.payer ? ` ابعته لـ${x.payer} 🙏` : "";
  return `🧾 ${what} من ${x.from}: نصيبك ${x.share}.${tail}`;
}

/** In the creator's chat: someone's share is marked paid (by them in the app, or on the web page). */
export function memberPaidLine(lang: Lang, x: { title: string; name: string; share: string; web: boolean }): string {
  if (lang === "en") {
    const what = x.title ? `«${x.title}»` : "the bill";
    return `✅ ${x.name}'s share of ${what} is marked paid (${x.share})${x.web ? ", from the bill's page. Not right? Untick it in the split." : "."}`;
  }
  const what = x.title ? `«${x.title}»` : "الحساب";
  return `✅ ${what}: نصيب ${x.name} اتعلّم إنه اتدفع (${x.share})${x.web ? "، من صفحة الحساب. لو مش مظبوط شيل العلامة من القسمة." : "."}`;
}
