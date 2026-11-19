import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { INSTALL_ID_HEADER, ItemResponse, ListItemsResponse, ListMemoriesResponse } from "@fakkarni/shared";
import { buildApp } from "../app";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

describe.skipIf(!hasTestDb)("item and memory routes", () => {
  const prisma = testPrisma();
  const app = buildApp({ logger: false }, { prisma });
  const me = { [INSTALL_ID_HEADER]: randomUUID() };
  const other = { [INSTALL_ID_HEADER]: randomUUID() };

  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function seed() {
    // First request creates the user.
    await app.inject({ method: "GET", url: "/items", headers: me });
    const user = await prisma.user.findFirstOrThrow();
    const item = await prisma.item.create({ data: { userId: user.id, type: "reminder", title: "Dentst", dueAt: new Date("2026-11-22T16:00:00Z") } });
    const memory = await prisma.memory.create({ data: { userId: user.id, kind: "person", subject: "Ahmed", content: "Borrows money" } });
    return { item, memory };
  }

  it("lets the user fix a saved item", async () => {
    const { item } = await seed();
    const res = await app.inject({ method: "PATCH", url: `/items/${item.id}`, headers: me, payload: { title: "Dentist", due_at: "2026-11-22T17:00:00.000Z" } });
    expect(res.statusCode).toBe(200);
    expect(ItemResponse.parse(res.json()).item).toMatchObject({ title: "Dentist", due_at: "2026-11-22T17:00:00.000Z" });
  });

  it("cancels an item and lists by status", async () => {
    const { item } = await seed();
    await app.inject({ method: "PATCH", url: `/items/${item.id}`, headers: me, payload: { status: "cancelled" } });
    const open = ListItemsResponse.parse((await app.inject({ method: "GET", url: "/items?status=open", headers: me })).json());
    expect(open.items).toEqual([]);
  });

  it("never lets another user touch the item", async () => {
    const { item, memory } = await seed();
    expect((await app.inject({ method: "PATCH", url: `/items/${item.id}`, headers: other, payload: { status: "done" } })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/memories/${memory.id}`, headers: other })).statusCode).toBe(404);
  });

  it("lists and deletes memories (FR-4)", async () => {
    const { memory } = await seed();
    const list = ListMemoriesResponse.parse((await app.inject({ method: "GET", url: "/memories", headers: me })).json());
    expect(list.memories.map((m) => m.subject)).toEqual(["Ahmed"]);
    expect((await app.inject({ method: "DELETE", url: `/memories/${memory.id}`, headers: me })).statusCode).toBe(204);
    expect(await prisma.memory.count()).toBe(0);
  });

  it("rejects empty or invalid patches", async () => {
    const { item } = await seed();
    expect((await app.inject({ method: "PATCH", url: `/items/${item.id}`, headers: me, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/items/nope`, headers: me, payload: { status: "done" } })).statusCode).toBe(400);
  });
});
