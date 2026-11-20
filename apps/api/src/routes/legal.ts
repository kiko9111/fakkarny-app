import type { FastifyPluginAsync } from "fastify";
import { LAST_UPDATED, LEGAL, type LegalDoc, type LegalLang, type LegalPage } from "../legal/content";

export interface LegalOptions {
  /** Shown as the contact on both pages (LEGAL_CONTACT_EMAIL). */
  contactEmail?: string;
  /** Who runs the service (LEGAL_OPERATOR), shown next to the contact. */
  operator?: string;
  /** False (default) shows a "draft" notice until a lawyer has reviewed the text. */
  reviewed?: boolean;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderBody(body: string[]): string {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const line of body) {
    if (line.startsWith("- ")) list.push(line.slice(2));
    else {
      flush();
      out.push(`<p>${esc(line)}</p>`);
    }
  }
  flush();
  return out.join("\n");
}

export function renderLegalPage(page: LegalPage, lang: LegalLang, opts: LegalOptions): string {
  const contact = opts.contactEmail
    ? `${opts.operator ? `${esc(opts.operator)} — ` : ""}<a href="mailto:${esc(opts.contactEmail)}">${esc(opts.contactEmail)}</a>`
    : esc(page.contactMissing);
  return `<!doctype html>
<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; line-height: 1.7; color: #1f2430; background: #faf8f5; margin: 0; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.1rem; margin-top: 1.8em; }
  .meta { color: #6b7280; font-size: 0.9rem; }
  .draft { background: #fff4d6; border: 1px solid #e6c766; border-radius: 10px; padding: 10px 14px; }
  ul { padding-inline-start: 1.2em; }
</style>
</head>
<body>
<main>
<h1>${esc(page.title)}</h1>
<p class="meta">${esc(page.updatedLabel)}: ${LAST_UPDATED}</p>
${opts.reviewed ? "" : `<p class="draft">${esc(page.draftNotice)}</p>`}
${page.sections.map((s) => `<h2>${esc(s.heading)}</h2>\n${renderBody(s.body)}`).join("\n")}
<h2>${esc(page.contactLabel)}</h2>
<p>${contact}</p>
</main>
</body>
</html>`;
}

/** Public pages for the paywall and store listings: /legal/terms and /legal/privacy (?lang=en). */
export const legalRoutes: FastifyPluginAsync<LegalOptions> = async (app, opts) => {
  for (const doc of ["terms", "privacy"] as LegalDoc[]) {
    app.get<{ Querystring: { lang?: string } }>(`/legal/${doc}`, async (req, reply) => {
      // Egyptian Arabic is the default (CLAUDE.md); anything other than "en" gets Arabic.
      const lang: LegalLang = req.query.lang === "en" ? "en" : "ar";
      return reply.type("text/html; charset=utf-8").header("cache-control", "public, max-age=3600").send(renderLegalPage(LEGAL[doc][lang], lang, opts));
    });
  }
};
