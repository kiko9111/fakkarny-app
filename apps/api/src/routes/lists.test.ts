import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  CircleResponse,
  CreateInviteResponse,
  ExportResponse,
  HouseList,
  HouseListResponse,
  ListMessagesResponse,
  MeResponse,
  PostMessageResponse,
  type FriendResponse,
} from "@fakkarni/shared";
import { buildApp } from "../app";
import type { FriendModel, FriendModelResult } from "../ai/model";
import { createConversationPipeline } from "../pipeline/conversation";
import type { PushMessage } from "../proactive/push";
import { hasTestDb, resetDb, testPrisma } from "../../test/db";

const SECRET = "test-secret-at-least-32-characters-long!!";
const token = (sub: string) =>
  new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("authenticated")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
const usage = {
  input_tokens: 100,
  output_tokens: 20,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};
const ok = (
  output: Partial<FriendResponse> & { reply: string[] },
): FriendModelResult => ({
  ok: true,
  usage,
  output: {
    create_items: [],
    update_items: [],
    save_memories: [],
    app_actions: [],
    crisis: false,
    ...output,
  },
});
const listItem = (title: string) => ({
  type: "list_item" as const,
  title,
  due_at_local: null,
  remind_at_local: null,
  follow_up_at_local: null,
  important: false,
  nudge: null,
});

describe.skipIf(!hasTestDb)("shared household lists", () => {
  const prisma = testPrisma();
  let clock = new Date("2026-11-22T10:00:00Z");
  const pushed: PushMessage[] = [];
  const queue: FriendModelResult[] = [];
  const model: FriendModel = {
    async respond() {
      const next = queue.shift();
      if (!next) throw new Error("no scripted response");
      return next;
    },
    async complete() {
      return { text: "", usage };
    },
  };
  const app = buildApp(
    { logger: false },
    {
      prisma,
      now: () => clock,
      rateLimitPerMinute: false,
      auth: { supabaseJwtSecret: SECRET, allowInstallId: true },
      invites: { publicUrl: "https://zaki.test" },
      pipeline: createConversationPipeline({ model }),
      push: async (m) => {
        pushed.push(...m);
        return { invalidTokens: [], sent: m.length };
      },
    },
  );
  beforeEach(async () => {
    await resetDb(prisma);
    clock = new Date("2026-11-22T10:00:00Z");
    pushed.length = 0;
    queue.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type H = Record<string, string> & { id: string };
  const signedIn = async (name: string): Promise<H> => {
    const h = {
      authorization: `Bearer ${await token(randomUUID())}`,
      "x-message-kinds": "2",
    };
    const res = await app.inject({
      method: "PATCH",
      url: "/me",
      headers: h,
      payload: { name },
    });
    const id = MeResponse.parse(res.json()).user.id;
    await prisma.device.create({
      data: {
        userId: id,
        platform: "android",
        pushToken: `ExponentPushToken[${id}]`,
      },
    });
    return Object.defineProperty({ ...h }, "id", {
      value: id,
      enumerable: false,
    }) as H;
  };
  const req = (
    h: H,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    payload?: object,
  ) => app.inject({ method, url, headers: h, ...(payload ? { payload } : {}) });
  const flush = () => new Promise((r) => setTimeout(r, 50));
  const home = async () => {
    const kareem = await signedIn("كريم");
    const mona = await signedIn("منى");
    const circle = CircleResponse.parse(
      (
        await req(kareem, "POST", "/circles", { kind: "family", name: "البيت" })
      ).json(),
    ).circle;
    const { invite } = CreateInviteResponse.parse(
      (await req(kareem, "POST", `/circles/${circle.id}/invites`)).json(),
    );
    await req(mona, "POST", `/invites/${invite.code}/accept`);
    await flush();
    pushed.length = 0;
    return { kareem, mona, circleId: circle.id };
  };
  const lists = async (h: H) =>
    ((await req(h, "GET", "/lists")).json() as { lists: unknown[] }).lists.map(
      (l) => HouseList.parse(l),
    );
  const say = async (h: H, text: string) => {
    const res = await req(h, "POST", "/messages", {
      client_id: randomUUID(),
      text,
      created_at: clock.toISOString(),
      timezone: "Africa/Cairo",
    });
    expect(res.statusCode).toBe(201);
    return PostMessageResponse.parse(res.json());
  };
  const chatOf = async (h: H) =>
    ListMessagesResponse.parse((await req(h, "GET", "/messages")).json())
      .messages;

  it("a circle list: both see it, add, tick off and clear; outsiders get 404", async () => {
    const { kareem, mona, circleId } = await home();
    const stranger = await signedIn("غريب");
    const listId = randomUUID();
    const made = await req(kareem, "POST", "/lists", {
      id: listId,
      name: "البقالة",
      circle_id: circleId,
    });
    expect(made.statusCode).toBe(201);
    // A resend with the same id gives back the same list.
    expect(
      (
        await req(kareem, "POST", "/lists", {
          id: listId,
          name: "البقالة",
          circle_id: circleId,
        })
      ).statusCode,
    ).toBe(200);

    const added = HouseListResponse.parse(
      (
        await req(mona, "POST", `/lists/${listId}/items`, {
          items: [
            { title: "بيض" },
            { title: "لبن", qty: "2" },
            { title: "البيض" },
          ],
        })
      ).json(),
    ).list;
    expect(added.items.map((i) => i.title)).toEqual(["بيض", "لبن"]);
    expect(added.open_count).toBe(2);

    const seen = (await lists(kareem))[0]!;
    expect(seen.circle_name).toBe("البيت");
    expect(seen.items.find((i) => i.title === "لبن")).toMatchObject({
      qty: "2",
      added_by_name: "منى",
      is_mine: false,
    });

    const egg = seen.items.find((i) => i.title === "بيض")!;
    const ticked = HouseListResponse.parse(
      (
        await req(kareem, "PATCH", `/lists/${listId}/items/${egg.id}`, {
          done: true,
        })
      ).json(),
    ).list;
    expect(ticked.items.find((i) => i.id === egg.id)).toMatchObject({
      done: true,
      done_by_name: "كريم",
    });
    expect(ticked.open_count).toBe(1);

    const cleared = HouseListResponse.parse(
      (await req(mona, "POST", `/lists/${listId}/clear`)).json(),
    ).list;
    expect(cleared.items.map((i) => i.title)).toEqual(["لبن"]);

    expect((await req(stranger, "GET", `/lists/${listId}`)).statusCode).toBe(
      404,
    );
    expect(
      (
        await req(stranger, "POST", `/lists/${listId}/items`, {
          items: [{ title: "x" }],
        })
      ).statusCode,
    ).toBe(404);
    expect(await lists(stranger)).toEqual([]);
    // Only the creator (or the circle's owner) deletes it.
    expect((await req(mona, "DELETE", `/lists/${listId}`)).statusCode).toBe(
      403,
    );
    expect((await req(kareem, "DELETE", `/lists/${listId}`)).statusCode).toBe(
      204,
    );
  });

  it("ticked things leave the list a day later", async () => {
    const { kareem, circleId } = await home();
    const list = HouseListResponse.parse(
      (
        await req(kareem, "POST", "/lists", {
          name: "البقالة",
          circle_id: circleId,
        })
      ).json(),
    ).list;
    const withItem = HouseListResponse.parse(
      (
        await req(kareem, "POST", `/lists/${list.id}/items`, {
          items: [{ title: "رز" }],
        })
      ).json(),
    ).list;
    await req(
      kareem,
      "PATCH",
      `/lists/${list.id}/items/${withItem.items[0]!.id}`,
      { done: true },
    );
    clock = new Date(clock.getTime() + 25 * 3600_000);
    expect((await lists(kareem))[0]!.items).toEqual([]);
  });

  it("going shopping tells the circle; what they add meanwhile reaches the shopper", async () => {
    const { kareem, mona, circleId } = await home();
    const list = HouseListResponse.parse(
      (
        await req(kareem, "POST", "/lists", {
          name: "البقالة",
          circle_id: circleId,
        })
      ).json(),
    ).list;
    const going = HouseListResponse.parse(
      (
        await req(kareem, "POST", `/lists/${list.id}/trip`, { going: true })
      ).json(),
    ).list;
    expect(going.trip).toMatchObject({ is_me: true, name: "كريم" });
    await flush();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.to).toBe(`ExponentPushToken[${mona.id}]`);
    const monaChat = await chatOf(mona);
    expect(monaChat.at(-1)!.text).toContain("في الطريق");
    expect(monaChat.at(-1)!.actions[0]!.route).toBe(`/list/${list.id}`);
    expect((await lists(mona))[0]!.trip).toMatchObject({
      is_me: false,
      name: "كريم",
    });

    pushed.length = 0;
    const added = HouseListResponse.parse(
      (
        await req(mona, "POST", `/lists/${list.id}/items`, {
          items: [{ title: "طماطم" }],
        })
      ).json(),
    ).list;
    await flush();
    expect(pushed.map((p) => p.to)).toEqual([
      `ExponentPushToken[${kareem.id}]`,
    ]);
    expect((await chatOf(kareem)).at(-1)!.text).toContain("طماطم");

    // Back home: the others hear how many things came, in the chat only.
    await req(
      kareem,
      "PATCH",
      `/lists/${list.id}/items/${added.items[0]!.id}`,
      { done: true },
    );
    pushed.length = 0;
    const back = HouseListResponse.parse(
      (
        await req(kareem, "POST", `/lists/${list.id}/trip`, { going: false })
      ).json(),
    ).list;
    expect(back.trip).toBeNull();
    await flush();
    expect(pushed).toHaveLength(0);
    expect((await chatOf(mona)).at(-1)!.text).toContain("رجعت 1 حاجة");

    // A trip nobody ended goes away by itself.
    await req(kareem, "POST", `/lists/${list.id}/trip`, { going: true });
    clock = new Date(clock.getTime() + 4 * 3600_000);
    expect((await lists(mona))[0]!.trip).toBeNull();
  });

  it("chat: things to buy from the model land on the household list, with Undo", async () => {
    const { kareem, mona } = await home();
    queue.push(
      ok({
        reply: ["ضفتهم"],
        create_items: [listItem("بيض"), listItem("عيش")],
      }),
    );
    const r = await say(kareem, "محتاجين بيض وعيش");
    // Not personal plans any more.
    expect(r.items.filter((i) => i.type === "list_item")).toEqual([]);
    expect(
      await prisma.item.count({
        where: { userId: kareem.id, type: "list_item" },
      }),
    ).toBe(0);
    const c = r.replies.at(-1)!.actions[0]!;
    expect(c).toMatchObject({
      kind: "list_add",
      status: "done",
      undoable: true,
    });
    const monaSees = (await lists(mona))[0]!;
    expect(monaSees.name).toBe("البقالة");
    expect(monaSees.circle_name).toBe("البيت");
    expect(monaSees.items.map((i) => i.title)).toEqual(["بيض", "عيش"]);
    expect(c.route).toBe(`/list/${monaSees.id}`);

    await req(
      kareem,
      "POST",
      `/messages/${r.replies.at(-1)!.id}/actions/${c.id}`,
      { undo: true },
    );
    expect((await lists(mona))[0]!.items).toEqual([]);
  });

  it("chat rules, no AI call: add to a named list, show it, tick off by saying it, going shopping waits for OK", async () => {
    const { kareem, mona } = await home();
    // No scripted model answers: any AI call would throw.
    const added = await say(kareem, "ضيف بيض ولبن وورق عنب للقايمة");
    expect(added.replies[0]!.text).toContain("ضفت");
    const groceries = (await lists(mona))[0]!;
    expect(groceries.items.map((i) => i.title)).toEqual([
      "بيض",
      "لبن",
      "ورق عنب",
    ]);

    const pharmacy = await say(kareem, "ضيف بنادول في قايمة الصيدلية");
    expect(pharmacy.replies[0]!.text).toContain("الصيدلية");
    const all = await lists(kareem);
    expect(
      all.find((l) => l.place === "pharmacy")!.items.map((i) => i.title),
    ).toEqual(["بنادول"]);

    const shown = await say(kareem, "القايمة فيها ايه؟");
    expect(shown.replies[0]!.text).toContain("• بيض");

    const got = await say(kareem, "جبت البيض");
    expect(got.replies[0]!.text).toContain("شطبت");
    expect(
      (await lists(mona))
        .find((l) => l.id === groceries.id)!
        .items.find((i) => i.title === "بيض")!.done,
    ).toBe(true);

    pushed.length = 0;
    const trip = await say(kareem, "نازل السوبر ماركت");
    const card = trip.replies.at(-1)!.actions[0]!;
    expect(card).toMatchObject({ kind: "list_trip", status: "pending" });
    await flush();
    expect(pushed).toHaveLength(0);
    const yes = await say(kareem, "اه");
    expect(yes.replies.at(-1)!.actions[0]).toMatchObject({
      id: card.id,
      status: "done",
    });
    await flush();
    expect(pushed.map((p) => p.to)).toEqual([`ExponentPushToken[${mona.id}]`]);

    // English, and the model's own list tool.
    queue.push(
      ok({
        reply: ["Added"],
        app_actions: [
          { kind: "list_add", things: ["rice", "sugar"], list: "الصيدلية" },
        ],
      }),
    );
    await say(kareem, "pharmacy needs rice and sugar lol");
    expect(
      (await lists(kareem))
        .find((l) => l.place === "pharmacy")!
        .items.map((i) => i.title),
    ).toEqual(["بنادول", "rice", "sugar"]);
  });

  it("a user with no circle gets a private list; it goes with the account and is in the export", async () => {
    const solo = await signedIn("سارة");
    await say(solo, "add eggs and milk to the shopping list");
    const mine = await lists(solo);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ circle_id: null, is_owner: true });
    const exported = ExportResponse.parse(
      (await req(solo, "GET", "/me/export")).json(),
    );
    expect(exported.list_items.map((i) => i.title)).toEqual(["eggs", "milk"]);
    expect((await req(solo, "DELETE", "/me")).statusCode).toBe(204);
    expect(await prisma.houseList.count()).toBe(0);
  });

  it("is in /bootstrap", async () => {
    const { kareem, circleId } = await home();
    await req(kareem, "POST", "/lists", {
      name: "البقالة",
      circle_id: circleId,
    });
    const parts = (
      (await req(kareem, "GET", "/bootstrap")).json() as {
        parts: Record<string, string>;
      }
    ).parts;
    expect(JSON.parse(parts["/lists"]!).lists).toHaveLength(1);
  });
});
