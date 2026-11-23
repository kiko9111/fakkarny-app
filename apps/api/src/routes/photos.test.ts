import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, ReadReceiptResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { toReceipt, type FriendModel } from "../ai/model";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const usage = { input_tokens: 1500, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const raw = { readable: true, merchant: " كارفور ", date: "2026-11-20", currency: "egp", total: 1234.567, subtotal: 0, service: 0, vat: 0, category: "بقالة", items: [{ name: "لبن", price: 60, qty: 2 }, { name: "", price: 5, qty: 1 }, { name: "عيش", price: 0, qty: 1 }] };

describe("receipt reading rules", () => {
  it("tidies the model's reading and refuses a non-receipt", () => {
    expect(toReceipt(raw)).toEqual({ merchant: "كارفور", date: "2026-11-20", currency: "EGP", total: 1234.57, subtotal: null, service: 0, vat: 0, category: "بقالة", items: [{ name: "لبن", price: 60, qty: 2 }] });
    expect(toReceipt({ ...raw, readable: false })).toBeNull();
    expect(toReceipt({ ...raw, total: 0 })).toBeNull();
    expect(toReceipt({ ...raw, date: "20/11" })?.date).toBeNull();
  });
});

describe.skipIf(!hasTestDb)("POST /receipts/read", () => {
  const prisma = testPrisma();
  let calls = 0;
  const model: FriendModel = {
    respond: async () => ({ ok: false, reason: "invalid_output", usage }),
    complete: async () => ({ text: "", usage }),
    readReceipt: async () => (calls++, { receipt: toReceipt(raw), usage }),
  };
  const app = buildApp({ logger: false }, { prisma, model, rateLimitPerMinute: false, auth: { allowInstallId: true }, billing: { requireSubscription: true } });
  beforeEach(async () => {
    calls = 0;
    await resetDb(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });
  const photo = { mime: "image/jpeg", data: Buffer.alloc(300, 7).toString("base64") };

  it("reads a receipt, never stores it, and counts it as one AI message", async () => {
    const headers = { [INSTALL_ID_HEADER]: randomUUID() };
    const res = ReadReceiptResponse.parse((await app.inject({ method: "POST", url: "/receipts/read", headers, payload: { photo } })).json());
    expect(res.receipt?.total).toBe(1234.57);
    expect(res.ai_allowance).toEqual({ limit: 30, used: 1 });
    expect(await prisma.photo.count()).toBe(0);
    const ai = await prisma.event.findFirstOrThrow({ where: { name: "ai_call" } });
    expect(ai.propsJson).toMatchObject({ purpose: "chat", photo: "receipt" });
    expect((await app.inject({ method: "POST", url: "/receipts/read", headers, payload: { photo: { mime: "image/gif", data: photo.data } } })).statusCode).toBe(400);
  });

  it("stops at the daily allowance without calling the model", async () => {
    const headers = { [INSTALL_ID_HEADER]: randomUUID() };
    await app.inject({ method: "POST", url: "/receipts/read", headers, payload: { photo } });
    const user = await prisma.user.findFirstOrThrow();
    await prisma.event.createMany({ data: Array.from({ length: 29 }, () => ({ userId: user.id, name: "ai_call", propsJson: { purpose: "chat" } })) });
    const res = ReadReceiptResponse.parse((await app.inject({ method: "POST", url: "/receipts/read", headers, payload: { photo } })).json());
    expect(res).toMatchObject({ receipt: null, error: "limit" });
    expect(calls).toBe(1);
  });
});
