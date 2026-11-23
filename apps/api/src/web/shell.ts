/**
 * The small public web pages people land on from a WhatsApp link (invites, Daftar
 * confirmations). Plain server-rendered HTML: no account, no script, works on any phone.
 */
export type Lang = "ar" | "en";

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Egyptian Arabic is the default; English only when asked for, or for browsers that don't list Arabic at all. */
export const pickLang = (query: string | undefined, acceptLanguage: string | undefined): Lang => {
  if (query === "en" || query === "ar") return query;
  return acceptLanguage && /^en\b/i.test(acceptLanguage) && !/\bar\b/i.test(acceptLanguage) ? "en" : "ar";
};

/** `body` is trusted HTML built by the caller with `esc` on every user-supplied value. */
export function renderShell(lang: Lang, meta: { title: string; description: string; footer: string }, body: string): string {
  return `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
<title>${esc(meta.title)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; line-height: 1.7; color: #1f2430; background: #fff8ec; margin: 0; }
  main { max-width: 440px; margin: 0 auto; padding: 32px 20px 48px; text-align: center; }
  .face { font-size: 56px; line-height: 1; }
  .brand { font-weight: 700; color: #e07a1f; margin: 4px 0 20px; }
  .card { background: #fff; border-radius: 20px; padding: 24px 20px; box-shadow: 0 6px 24px rgba(224, 122, 31, 0.12); }
  h1 { font-size: 1.35rem; margin: 0 0 12px; }
  ul { text-align: start; padding-inline-start: 1.2em; margin: 12px 0 20px; }
  form { margin: 0; }
  .btn { display: block; box-sizing: border-box; width: 100%; background: #e07a1f; color: #fff; text-decoration: none; font: inherit; font-weight: 700; font-size: 1.1rem; border: 0; border-radius: 16px; padding: 14px 16px; margin-top: 12px; cursor: pointer; }
  .btn.ghost { background: #fff; color: #e07a1f; border: 2px solid #e07a1f; }
  .btn.quiet { background: transparent; color: #6b7280; font-weight: 600; font-size: 1rem; }
  .btn.pay { background: #5a2d82; }
  .small { color: #6b7280; font-size: 0.9rem; margin: 12px 0 0; }
  .amount { font-size: 2.2rem; font-weight: 800; margin: 8px 0; }
  .code { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.2em; margin: 4px 0 0; }
  .peek { background: #fff7ee; border-radius: 16px; padding: 4px 14px 12px; margin: 12px 0; }
  .peek p { margin: 8px 0 0; line-height: 2; }
  .chip { display: inline-block; background: #fff; border: 1px solid #f3d9bf; border-radius: 999px; padding: 0 12px; font-weight: 600; }
  footer { color: #9aa0aa; font-size: 0.8rem; margin-top: 20px; }
</style>
</head>
<body>
<main>
<div class="face">🌟</div>
<div class="brand">${lang === "ar" ? "زكي" : "Zaki"}</div>
<div class="card">
${body}
</div>
<footer>${esc(meta.footer)}</footer>
</main>
</body>
</html>`;
}
