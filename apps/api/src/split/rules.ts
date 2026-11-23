import type { Split } from "@fakkarni/shared";
import { formatAmount, type Lang } from "../daftar/rules";

/** The WhatsApp message for a split: each share, who paid, and the link. Template words only. */
export function splitShareText(split: Pick<Split, "title" | "total" | "currency" | "people" | "paid_by" | "url">, lang: Lang): string {
  const money = (n: number) => formatAmount(n, split.currency, lang);
  const payer = split.paid_by !== null ? split.people[split.paid_by]?.name : null;
  const lines = split.people.map((p, i) => `• ${p.name}: ${money(p.share)}${i === split.paid_by ? (lang === "ar" ? " (دفع)" : " (paid)") : ""}`);
  if (lang === "ar") {
    return [
      `🧾 ${split.title ? `حساب «${split.title}»` : "الحساب"}: ${money(split.total)} بالخدمة والضريبة`,
      ...lines,
      payer ? `ابعتوا لـ${payer} نصيبكم 🙏` : "",
      `شوف نصيبك، أو ضيف اللي طلبته وزكي يحسب الباقي: ${split.url}`,
      "اتقسم بزكي 🌟",
    ].filter(Boolean).join("\n");
  }
  return [
    `🧾 ${split.title ? `“${split.title}”` : "The bill"}: ${money(split.total)} with service and VAT`,
    ...lines,
    payer ? `Send ${payer} your share 🙏` : "",
    `See your share, or add what you ordered and Zaki works out the rest: ${split.url}`,
    "Split with Zaki 🌟",
  ].filter(Boolean).join("\n");
}
