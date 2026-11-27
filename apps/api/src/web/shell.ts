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

/** Zaki's spark smile on its Sunrise tile (assets/logo/zaki-mark.svg, drawn small). */
const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="zt" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFC592"/><stop offset="1" stop-color="#FF9F7C"/></linearGradient></defs><rect width="64" height="64" rx="18" fill="url(#zt)"/><circle cx="23" cy="27" r="4.2" fill="#fff"/><path d="M41 20.5l1.6 4.4 4.4 1.6-4.4 1.6L41 32.5l-1.6-4.4-4.4-1.6 4.4-1.6z" fill="#fff"/><path d="M19 38c3.4 6 8 8.5 13 8.5s9.6-2.5 13-8.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/></svg>`;

/** `body` is trusted HTML built by the caller with `esc` on every user-supplied value. */
export function renderShell(lang: Lang, meta: { title: string; description: string; footer: string; image?: string; css?: string }, body: string): string {
  return `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<meta property="og:title" content="${esc(meta.title)}">
<meta property="og:description" content="${esc(meta.description)}">
${meta.image ? `<meta property="og:image" content="${esc(meta.image)}">\n<meta property="og:image:width" content="1080">\n<meta property="og:image:height" content="1920">\n` : ""}<title>${esc(meta.title)}</title>
<style>
  /* The app's look (Layout map, 2026-11-27): Sunrise colours, a soft mesh, 86% white cards, pill buttons. */
  :root { --ink: #1d1b1a; --soft: #5e5955; --primary: #c54315; --primary-ink: #a9461e; --primary-soft: #ffe9dd; --line: #e6dad0; --wash: #f8f0ea; --ok: #1f7a4d; --ok-soft: #e3f4ea; }
  * { box-sizing: border-box; }
  body { font-family: Rubik, system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; line-height: 1.6; color: var(--ink); margin: 0; min-height: 100vh;
    background: radial-gradient(60% 40% at 0% 0%, #ffe3c8 0%, transparent 70%), radial-gradient(50% 40% at 100% 10%, #ffd6df 0%, transparent 70%), radial-gradient(70% 50% at 50% 100%, #fff0d6 0%, transparent 70%), #fffaf5; }
  main { max-width: 440px; margin: 0 auto; padding: 28px 16px 40px; text-align: center; }
  .brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--primary-ink); margin: 0 0 18px; }
  .brand svg { width: 36px; height: 36px; }
  .card { background: rgba(255, 255, 255, 0.86); border: 1px solid rgba(255, 255, 255, 0.9); border-radius: 28px; padding: 24px 20px; box-shadow: 0 10px 30px rgba(197, 67, 21, 0.10); }
  h1 { font-size: 1.35rem; line-height: 1.4; margin: 0 0 12px; }
  h2 { font-size: 1.05rem; margin: 22px 0 0; }
  p { margin: 8px 0; }
  ul { text-align: start; padding-inline-start: 1.2em; margin: 12px 0 20px; }
  form { margin: 0; }
  a { color: var(--primary-ink); }
  .btn { display: block; width: 100%; background: var(--primary); color: #fff; text-decoration: none; font: inherit; font-weight: 700; font-size: 1.05rem; border: 0; border-radius: 999px; padding: 14px 16px; margin-top: 12px; cursor: pointer; }
  .btn.ghost { background: var(--primary-soft); color: var(--primary-ink); }
  .btn.quiet { background: transparent; color: var(--soft); font-weight: 600; font-size: 1rem; }
  .btn.pay { background: #5a2d82; }
  .small { color: var(--soft); font-size: 0.9rem; margin: 12px 0 0; }
  .amount { font-size: 2.2rem; font-weight: 800; margin: 8px 0; }
  .code { font-size: 1.5rem; font-weight: 700; letter-spacing: 0.2em; margin: 4px 0 0; }
  .peek { background: var(--wash); border-radius: 18px; padding: 4px 14px 12px; margin: 12px 0; }
  .peek p { margin: 8px 0 0; line-height: 2; }
  .chip { display: inline-block; background: var(--wash); border-radius: 999px; padding: 2px 12px; font-weight: 600; }
  footer { color: var(--soft); font-size: 0.8rem; margin-top: 20px; }
${meta.css ?? ""}
</style>
</head>
<body>
<main>
<div class="brand">${MARK}<span>${lang === "ar" ? "زكي" : "Zaki"}</span></div>
<div class="card">
${body}
</div>
<footer>${esc(meta.footer)}</footer>
</main>
</body>
</html>`;
}
