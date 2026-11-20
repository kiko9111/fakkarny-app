import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../app";
import { LEGAL } from "../legal/content";

describe("GET /legal/*", () => {
  const app = buildApp({ logger: false }, { legal: { contactEmail: "hello@example.com", operator: "Example <Co>" } });
  afterAll(() => app.close());

  it("serves both documents in Arabic by default, right-to-left, without a database", async () => {
    for (const doc of ["terms", "privacy"] as const) {
      const res = await app.inject({ method: "GET", url: `/legal/${doc}` });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.body).toContain('dir="rtl"');
      expect(res.body).toContain(LEGAL[doc].ar.sections[0]!.heading);
    }
  });

  it("serves English with ?lang=en and shows the escaped contact", async () => {
    const res = await app.inject({ method: "GET", url: "/legal/privacy?lang=en" });
    expect(res.body).toContain('dir="ltr"');
    expect(res.body).toContain("Fakkarni — Privacy Policy");
    expect(res.body).toContain("mailto:hello@example.com");
    expect(res.body).toContain("Example &lt;Co&gt;");
  });

  it("shows the draft notice until the text is marked reviewed", async () => {
    const draft = await app.inject({ method: "GET", url: "/legal/terms?lang=en" });
    expect(draft.body).toContain(LEGAL.terms.en.draftNotice);
    const reviewed = buildApp({ logger: false }, { legal: { reviewed: true } });
    const res = await reviewed.inject({ method: "GET", url: "/legal/terms?lang=en" });
    expect(res.body).not.toContain(LEGAL.terms.en.draftNotice);
    expect(res.body).toContain(LEGAL.terms.en.contactMissing);
    await reviewed.close();
  });

  it("has the same sections in both languages", () => {
    for (const doc of ["terms", "privacy"] as const) {
      expect(LEGAL[doc].ar.sections.length).toBe(LEGAL[doc].en.sections.length);
      LEGAL[doc].ar.sections.forEach((s, i) => expect(s.body.length).toBe(LEGAL[doc].en.sections[i]!.body.length));
    }
  });
});
