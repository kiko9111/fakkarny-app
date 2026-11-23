import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, SplitResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

describe.skipIf(!hasTestDb)("split the check", () => {
  const prisma = testPrisma();
  const app = buildApp({ logger: false }, { prisma, rateLimitPerMinute: false, auth: { allowInstallId: true } });
  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("splits a bill with service and VAT, shares a message and a public page", async () => {
    const me = { [INSTALL_ID_HEADER]: randomUUID() };
    const res = await app.inject({
      method: "POST",
      url: "/splits",
      headers: me,
      payload: { title: "Friday dinner", subtotal: 1000, people: [{ name: "Mona" }, { name: "Sara" }, { name: "Hoda" }, { name: "Nour" }], paid_by: 0 },
    });
    expect(res.statusCode).toBe(201);
    const { split, share_text } = SplitResponse.parse(res.json());
    expect(split.total).toBe(1277);
    expect(split.people.reduce((a, p) => a + p.share, 0)).toBe(1277);
    expect(split.people[0]!.paid).toBe(true);
    expect(share_text).toContain(split.url);
    expect(share_text).toContain("Mona");

    const page = await app.inject({ method: "GET", url: `/s/${split.code}?lang=en` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain("Friday dinner");
    expect(page.body).toContain("Split your next bill with Zaki");

    const paid = await app.inject({ method: "POST", url: `/splits/${split.id}/paid`, headers: me, payload: { index: 2, paid: true } });
    expect(SplitResponse.parse(paid.json()).split.people[2]!.paid).toBe(true);
    // Someone else can't see or change it.
    const other = { [INSTALL_ID_HEADER]: randomUUID() };
    expect((await app.inject({ method: "GET", url: `/splits/${split.id}`, headers: other })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/splits", headers: me })).json().splits).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/me/export", headers: me })).json().splits[0].people).toHaveLength(4);
  });

  it("charges each person their items, and lets friends add theirs on the page", async () => {
    const me = { [INSTALL_ID_HEADER]: randomUUID() };
    const res = await app.inject({
      method: "POST",
      url: "/splits",
      headers: me,
      payload: { people: [{ name: "Mona" }, { name: "Sara" }], items: [{ name: "Steak", price: 300, eaters: [0] }, { name: "Fries", price: 100, eaters: [] }], service_pct: 0, vat_pct: 0, paid_by: 0 },
    });
    const { split } = SplitResponse.parse(res.json());
    expect(split.people.map((p) => p.share)).toEqual([350, 50]);
    // A friend without Zaki adds what they ordered from the web page.
    const add = await app.inject({ method: "POST", url: `/s/${split.code}/add?lang=en`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "who=new&name=Hoda&item=Pasta&price=120" });
    expect(add.statusCode).toBe(200);
    expect(add.body).toContain("Your share is now");
    const after = SplitResponse.parse((await app.inject({ method: "GET", url: `/splits/${split.id}`, headers: me })).json()).split;
    expect(after.people.map((p) => p.name)).toEqual(["Mona", "Sara", "Hoda"]);
    expect(after.web_adds).toBe(1);
    // Fries were for everyone, now three people: 300+33.33, 33.33, 120+33.33.
    expect(after.total).toBe(520);
    expect(after.people.map((p) => Math.round(p.ordered))).toEqual([333, 33, 153]);
    const bad = await app.inject({ method: "POST", url: `/s/${split.code}/add?lang=en`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "who=9&item=x&price=abc" });
    expect(bad.body).toContain("valid price");
  });

  it("refuses a one-person split and a payer outside the list", async () => {
    const me = { [INSTALL_ID_HEADER]: randomUUID() };
    expect((await app.inject({ method: "POST", url: "/splits", headers: me, payload: { subtotal: 100, people: [{ name: "a" }] } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/splits", headers: me, payload: { subtotal: 100, people: [{ name: "a" }, { name: "b" }], paid_by: 5 } })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/s/NOPE1234" })).statusCode).toBe(404);
  });
});
