/**
 * End-to-end QA of Zaki's actions through a running API (QA thread, 2026-11-25): every chat action
 * in phone-brain mode (the rule engine decides, a stand-in phone model writes "تمام"), plus the
 * screen routes, as two or three people. Checks the state each step leaves behind and times every
 * request. Read-only for nobody: it creates fresh install-id users, never touches real accounts.
 *
 *   DISABLE_JOBS=1 REQUIRE_SUBSCRIPTION=0 PORT=3999 npx tsx --env-file=.env src/server.ts   (apps/api)
 *   npx tsx evals/qa/scenarios.ts --url http://localhost:3999 [--only daftar]
 *
 * Exit code 1 when any check fails. Prints a table of failures and per-step latency.
 */
import { randomUUID } from "node:crypto";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BASE = (arg("--url") ?? process.env.QA_API_URL ?? "http://localhost:3999").replace(/\/$/, "");
const ONLY = arg("--only");

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Timing {
  step: string;
  ms: number;
}
const timings: Timing[] = [];
const failures: { scenario: string; check: string; detail: string }[] = [];
let checks = 0;
let current = "";

class Person {
  id = randomUUID();
  constructor(public label: string) {}
  async call(method: string, path: string, body?: unknown, step?: string): Promise<{ status: number; json: Json }> {
    const t0 = performance.now();
    const res = await fetch(BASE + path, {
      method,
      headers: { "x-install-id": this.id, "x-message-kinds": "2", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const ms = performance.now() - t0;
    timings.push({ step: step ?? `${method} ${path.replace(/[0-9a-f-]{36}/g, ":id").replace(/\?.*$/, "")}`, ms });
    const text = await res.text();
    let json: Json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, json };
  }
  get = (p: string) => this.call("GET", p);
  post = (p: string, b: unknown = {}) => this.call("POST", p, b);
  patch = (p: string, b: unknown) => this.call("PATCH", p, b);
  del = (p: string) => this.call("DELETE", p);

  /** Say something in the chat, in phone-brain mode, the way the app does it (two passes when needed). */
  async say(text: string, phoneReply: string[] = ["تمام"]): Promise<{ replies: Json[]; items: Json[]; status: number; passes: number; ms: number }> {
    const client_id = randomUUID();
    const base = { client_id, text, created_at: new Date().toISOString(), timezone: "Africa/Cairo", brain: "phone" };
    const t0 = performance.now();
    let r = await this.call("POST", "/messages", base, "chat: first pass");
    let passes = 1;
    if (r.status === 202) {
      // A stand-in phone model that does what its prompt says: asks when told ASK, else says phoneReply.
      // OBEDIENT=0 makes it ignore ASK (a weak small model), to test the server's guard.
      const ctx: string = r.json?.needs_brain?.context ?? "";
      const ask = /^ASK:/m.test(ctx) && process.env.OBEDIENT !== "0";
      const reply = ask ? [/english/i.test(ctx) && !/[؀-ۿ]/.test(text) ? "Sure, can you tell me a bit more?" : "تمام، قولّي بس التفاصيل؟"] : phoneReply;
      r = await this.call("POST", "/messages", { ...base, phone_output: { reply, crisis: false }, phone_model: "qa-stub" }, "chat: second pass");
      passes = 2;
    }
    const ms = performance.now() - t0;
    timings.push({ step: passes === 1 ? "chat turn (rules answered)" : "chat turn (phone model)", ms });
    return { replies: r.json?.replies ?? [], items: r.json?.items ?? [], status: r.status, passes, ms };
  }
}

function check(name: string, ok: boolean, detail = "") {
  checks++;
  if (!ok) failures.push({ scenario: current, check: name, detail: detail.slice(0, 400) });
}
const textOf = (replies: Json[]) => replies.map((m) => m.text).join(" | ");
const said = (r: { replies: Json[] }, re: RegExp) => re.test(textOf(r.replies)) || cardsOf(r.replies).some((x: Json) => re.test(`${x.kind} ${x.label}`));
const cardsOf = (replies: Json[]) => replies.flatMap((m) => m.actions ?? []);

async function scenario(name: string, fn: () => Promise<void>) {
  if (ONLY && !name.includes(ONLY)) return;
  current = name;
  try {
    await fn();
  } catch (e) {
    failures.push({ scenario: name, check: "threw", detail: String((e as Error).stack ?? e).slice(0, 400) });
  }
}

async function setup(p: Person, name: string, lang = "ar-EG") {
  await p.patch("/me", { name, timezone: "Africa/Cairo", language: lang, gender: "male" });
}
const openItems = async (p: Person) => ((await p.get("/items")).json?.items ?? []).filter((i: Json) => i.status === "open");

async function main() {
  const health = await fetch(BASE + "/health").then((r) => r.status).catch(() => 0);
  if (health !== 200) throw new Error(`API not reachable at ${BASE}`);

  // ---------------- reminders: create / edit / snooze / done / cancel ----------------
  await scenario("reminders", async () => {
    const a = new Person("A");
    await setup(a, "Kareem");
    let r = await a.say("فكرني بكرة الساعة ٩ اكلم السباك");
    check("ar reminder saved", r.items.some((i: Json) => i.type === "reminder" && /السباك/.test(i.title) && i.remind_at), JSON.stringify(r.items));
    check("ar reply in Arabic", /[؀-ۿ]/.test(textOf(r.replies)), textOf(r.replies));
    r = await a.say("fakarny bokra 5 ela rob3 a5od el dawa");
    check("franco bare hour reminder", r.items.some((i: Json) => i.type === "reminder" && i.due_at?.includes("T14:45")), JSON.stringify(r.items));
    r = await a.say("remind me tomorrow at 6pm to call grandma");
    check("en reminder", r.items.some((i: Json) => /grandma/i.test(i.title) && i.due_at?.includes("T16:00")), JSON.stringify(r.items));
    const plumber = (await openItems(a)).find((i: Json) => /السباك/.test(i.title));
    check("item listed in GET /items", Boolean(plumber));
    // Move it in chat.
    r = await a.say("خلي ميعاد السباك الساعة ١١");
    const moved = (await openItems(a)).find((i: Json) => i.id === plumber?.id);
    check("chat move changes due time", moved?.due_at?.includes("T09:00") ?? false, JSON.stringify(moved));
    // Snooze from the notification line ("Later").
    r = await a.say(`فكرني بـ«${plumber?.title}» كمان ساعة`);
    const snoozed = (await openItems(a)).find((i: Json) => i.id === plumber?.id);
    check("notification Later snoozes", snoozed && snoozed.remind_at !== moved?.remind_at, JSON.stringify([moved?.remind_at, snoozed?.remind_at]));
    // Edit on the screen.
    const pe = await a.patch(`/items/${plumber?.id}`, { title: "أكلم السباك عن الحنفية" });
    check("PATCH /items title", pe.status === 200, JSON.stringify(pe.json));
    // Done from the notification line.
    r = await a.say(`خلصت «أكلم السباك عن الحنفية» ✅`);
    const done = ((await a.get("/items")).json?.items ?? []).find((i: Json) => i.id === plumber?.id);
    check("Done line closes item", done?.status === "done", JSON.stringify(done));
    // Cancel asks first, then yes.
    r = await a.say("الغي ميعاد الدوا");
    check("cancel asks first", /[؟?]/.test(textOf(r.replies)), textOf(r.replies));
    r = await a.say("ايوه");
    const dawa = ((await a.get("/items")).json?.items ?? []).find((i: Json) => /dawa|دوا/i.test(i.title));
    check("yes cancels", dawa?.status === "cancelled", JSON.stringify(dawa));
    // A reminder with no time asks, then the answer saves it.
    r = await a.say("فكرني اجدد الباسبور");
    check("no time: asks", r.items.length === 0 && /[؟?]/.test(textOf(r.replies)), textOf(r.replies) + JSON.stringify(r.items));
    r = await a.say("بكرة ٥ العصر");
    check("answer saves it", r.items.some((i: Json) => /باسبور|الباسبور/.test(i.title) && i.due_at?.includes("T15:00")), JSON.stringify(r.items));
    // Repeating + stop.
    r = await a.say("فكرني اشرب مية كل ساعتين");
    check("repeat every 2h", r.items.some((i: Json) => i.repeat_every_minutes === 120), JSON.stringify(r.items));
    r = await a.say("بطل تفكرني بالمية");
    const water = ((await a.get("/items")).json?.items ?? []).find((i: Json) => i.repeat_every_minutes === 120);
    check("stop repeating", water?.status === "cancelled", JSON.stringify(water));
  });

  // ---------------- alarms ----------------
  await scenario("alarms", async () => {
    const a = new Person("A");
    await setup(a, "Kareem");
    let r = await a.say("صحيني بكرة ٦ ونص");
    check("alarm item", r.items.some((i: Json) => i.alarm === true && i.due_at?.includes("T04:30")), JSON.stringify(r.items));
    r = await a.say("set an alarm for 7:15 tomorrow");
    check("en alarm", r.items.some((i: Json) => i.alarm === true), JSON.stringify(r.items));
    r = await a.say("اعملي منبه");
    check("alarm without time asks", r.items.length === 0 && /[؟?]/.test(textOf(r.replies)), textOf(r.replies));
  });

  // ---------------- follow-ups ----------------
  await scenario("follow-ups", async () => {
    const a = new Person("A");
    await setup(a, "Kareem");
    const r = await a.say("عندي دكتور سنان يوم السبت الساعة ١");
    const it = r.items[0];
    check("appointment saved", Boolean(it), JSON.stringify(r.items));
    check("follow-up set an hour after", Boolean(it?.follow_up_at), JSON.stringify(it));
  });

  // ---------------- Daftar ----------------
  await scenario("daftar", async () => {
    const a = new Person("A");
    const b = new Person("B");
    await setup(a, "Kareem");
    await setup(b, "Hassan");
    // A circle so B is a member A can name.
    const c = (await a.post("/circles", { kind: "friends", name: "الشلة" })).json;
    const inv = (await a.post(`/circles/${c.id ?? c.circle?.id}/invites`)).json;
    await b.post(`/invites/${inv.invite.code}/accept`);
    let r = await a.say("حسن عليه ٣٠٠ من العشا");
    check("debt item", r.items.some((i: Json) => i.type === "debt" && i.debt_amount === 300), JSON.stringify(r.items));
    const cards = cardsOf(r.replies);
    check("offers shared Daftar card for a member", cards.some((x: Json) => x.status === "pending"), JSON.stringify(cards));
    r = await a.say("ايوه");
    const da = (await a.get("/daftar")).json;
    const entries = da?.entries ?? da ?? [];
    check("yes adds a Daftar entry", Array.isArray(entries) && entries.length === 1, JSON.stringify(da).slice(0, 300));
    const db = (await b.get("/daftar")).json;
    const be = db?.entries ?? [];
    check("B sees it from their side", be.length === 1 && be[0]?.direction === "i_owe", JSON.stringify(db).slice(0, 300));
    // B's chat got an update line with a card.
    const bm = (await b.get("/messages")).json?.messages ?? [];
    check("B told in chat", bm.some((m: Json) => m.kind === "update"), JSON.stringify(bm.map((m: Json) => m.kind)));
    r = await b.say("ايوه صح");
    const db2 = (await b.get("/daftar")).json?.entries ?? [];
    check("B confirms by chat yes", db2[0]?.status === "confirmed", JSON.stringify(db2[0]));
    // Settle from chat.
    r = await a.say("حسن رجعلي الفلوس");
    const da2 = (await a.get("/daftar")).json?.entries ?? [];
    const items = (await a.get("/items")).json?.items ?? [];
    check("chat settle closes debt item", items.some((i: Json) => i.type === "debt" && i.status === "done"), JSON.stringify(items.map((i: Json) => [i.type, i.status])));
    check("chat settle settles Daftar entry (or offers card)", da2[0]?.status === "settled" || cardsOf(r.replies).length > 0, JSON.stringify(da2[0]) + textOf(r.replies));
    // Cancel a debt for someone with none, then "no": no loop.
    r = await a.say("olghy dein abdelkareem");
    const t1 = textOf(r.replies) + JSON.stringify(cardsOf(r.replies));
    r = await a.say("la2");
    const t2 = textOf(r.replies);
    r = await a.say("2e2flo");
    const t3 = textOf(r.replies);
    check("no-debt cancel says not found", /مفيش|مش لاقي|couldn't find|لقيت|ملقتش|مالقيت/.test(t1), t1);
    check("no confirm loop after no", !/الغي|ألغي|هلغي|cancel/i.test(t3) || !/[؟?]/.test(t3), `${t1} || ${t2} || ${t3}`);
    // Non-member debt via English.
    r = await a.say("I lent Omar 800 yesterday");
    check("en debt", r.items.some((i: Json) => i.type === "debt" && i.debt_amount === 800), JSON.stringify(r.items));
  });

  // ---------------- money ----------------
  await scenario("money", async () => {
    const a = new Person("A");
    await setup(a, "Kareem");
    await a.post("/money/sections", { name: "أكل", kind: "expense", budget: 1000 });
    await a.post("/money/sections", { name: "مواصلات", kind: "expense" });
    let r = await a.say("دفعت ٢٥٠ عالاكل");
    check("expense logged", said(r, /سجّلت|سجلت|log_money/), JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    r = await a.say("ركبت تاكسي ب ٦٠");
    check("taxi to transport", said(r, /مواصلات/), JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    r = await a.say("صرفت ٦٠٠ على الأكل");
    const money = (await a.get("/money")).json;
    const food = (money?.sections ?? []).find((s: Json) => s.name === "أكل");
    check("month total", food?.spent === 850 || food?.month_total === 850 || JSON.stringify(food).includes("850"), JSON.stringify(food));
    const msgs = (await a.get("/messages")).json?.messages ?? [];
    check("budget warning in chat", msgs.some((m: Json) => /من 1,000|ميزانية|budget/.test(m.text) && m.role !== "user"), JSON.stringify(msgs.slice(-3).map((m: Json) => m.text)));
    r = await a.say("تراجع");
    const money2 = (await a.get("/money")).json;
    const food2 = (money2?.sections ?? []).find((s: Json) => s.name === "أكل");
    check("undo removes last entry", JSON.stringify(food2).includes("250"), JSON.stringify(food2));
    r = await a.say("خلي ميزانية المواصلات ٥٠٠");
    check("set budget", cardsOf(r.replies).some((x: Json) => x.kind === "set_budget"), JSON.stringify(cardsOf(r.replies)));
    r = await a.say("قبضت المرتب ١٥ الف");
    check("income", said(r, /15,000|15000/), JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    r = await a.say("how much did I spend on food this month?", ["You spent 850 on food"]);
    check("question does not log", cardsOf(r.replies).length === 0, JSON.stringify(cardsOf(r.replies)));

    // Twins (kareem 2026-11-25: "salary" and "Salary" both showed): one section, whatever the case.
    const s1 = await a.post("/money/sections", { name: "salary", kind: "income" });
    const s2 = await a.post("/money/sections", { name: "Salary", kind: "income" });
    check("twin section refused", s1.json?.section?.id === s2.json?.section?.id && s2.status === 200, `${s1.status} ${s2.status}`);
    // A phone-made id: the create and the add show at once on the phone and count once when resent.
    const pid = randomUUID();
    const c1 = await a.post("/money/sections", { id: pid, name: "مرتب", kind: "income" });
    const c2 = await a.post("/money/sections", { id: pid, name: "مرتب", kind: "income" });
    check("phone id create is idempotent", c1.status === 201 && c2.status === 200 && c2.json?.section?.id === pid, `${c1.status} ${c2.status}`);
    const eid = randomUUID();
    await a.post(`/money/sections/${pid}/entries`, { id: eid, amount: 12000 });
    await a.post(`/money/sections/${pid}/entries`, { id: eid, amount: 12000 });
    const det = (await a.get(`/money/sections/${pid}`)).json;
    check("phone id add counted once", det?.section?.month_total === 12000 && det?.entries?.length === 1, JSON.stringify(det?.section));
    const ov = (await a.get("/money")).json;
    check("income total includes salary", (ov?.totals?.income ?? 0) >= 12000, JSON.stringify(ov?.totals));
    r = await a.say("got paid 3000 salary");
    const ov2 = (await a.get("/money")).json;
    const salaries = (ov2?.sections ?? []).filter((s: Json) => /salary/i.test(s.name));
    check("chat income goes to the one salary section", salaries.length === 1, JSON.stringify(salaries.map((s: Json) => [s.name, s.month_total])) + textOf(r.replies));
  });

  // ---------------- circles, check-ins, feed ----------------
  await scenario("circles", async () => {
    const a = new Person("A");
    const b = new Person("B");
    await setup(a, "Mona");
    await setup(b, "Omar");
    let r = await a.say("اعمل دايرة للعيلة");
    const created = cardsOf(r.replies).find((x: Json) => x.kind === "create_circle");
    check("create circle from chat", created?.status === "done", JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    const circles = (await a.get("/circles")).json?.circles ?? [];
    check("circle listed", circles.length === 1, JSON.stringify(circles));
    check("circle named from the chat", /عيل/.test(circles[0]?.name ?? ""), circles[0]?.name);
    const cid = circles[0]?.id;
    r = await a.say("ابعت دعوة للعيلة");
    check("invite from chat", cardsOf(r.replies).some((x: Json) => x.kind === "invite"), JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    const inv = (await a.post(`/circles/${cid}/invites`)).json;
    const acc = await b.post(`/invites/${inv.invite.code}/accept`);
    check("B joins", acc.status === 200 || acc.status === 201, JSON.stringify(acc.json));
    const am = (await a.get("/messages")).json?.messages ?? [];
    check("A told B joined", am.some((m: Json) => m.kind === "update"), JSON.stringify(am.slice(-2)));
    r = await b.say("قول للعيلة اني في الطريق");
    const pend = cardsOf(r.replies).find((x: Json) => x.kind === "checkin");
    check("check-in card", Boolean(pend), JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    r = await b.say("ايوه");
    const feed = (await a.get(`/circles/${cid}/feed`)).json;
    check("check-in in feed after yes", /checkin|الطريق/.test(JSON.stringify(feed)), JSON.stringify(feed).slice(0, 300));
    r = await a.say("اسأل عمر وصل ولا لا");
    check("ask check-in card", cardsOf(r.replies).some((x: Json) => x.kind === "ask_checkin"), JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    const z = await a.post(`/circles/${cid}/zaki`, { text: "@زكي فكر الكل" });
    check("@Zaki in circle", z.status < 300, JSON.stringify(z.json));
    r = await b.say("وصلت البيت");
    check("I'm home offers check-in card", cardsOf(r.replies).some((x: Json) => x.kind === "checkin"), JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
  });

  // ---------------- tasks and homework ----------------
  await scenario("tasks", async () => {
    const a = new Person("A");
    const b = new Person("B");
    await setup(a, "Mona");
    await setup(b, "Laila");
    const c = (await a.post("/circles", { kind: "family", name: "البيت",  family_type: "parents_teens" })).json;
    const cid = c.id ?? c.circle?.id;
    const inv = (await a.post(`/circles/${cid}/invites`)).json;
    await b.post(`/invites/${inv.invite.code}/accept`);
    let r = await a.say("قول لليلى تجيب عيش وهي جاية");
    const card = cardsOf(r.replies).find((x: Json) => x.kind === "assign_task");
    check("assign card pending", card?.status === "pending", JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    r = await a.say("aywa");
    const at = (await a.get("/tasks")).json;
    check("yes sends the task", JSON.stringify(at).includes("عيش"), JSON.stringify(at).slice(0, 300));
    const bm = (await b.get("/messages")).json?.messages ?? [];
    const req = bm.find((m: Json) => m.kind === "update" && (m.actions ?? []).length);
    check("B gets request with card", Boolean(req), JSON.stringify(bm.map((m: Json) => [m.kind, m.text])));
    r = await b.say("ماشي هجيبه");
    const bi = await openItems(b);
    check("B accepts by chat → item", bi.some((i: Json) => /عيش/.test(i.title)), JSON.stringify(bi) + textOf(r.replies));
    r = await b.say("جبت العيش خلاص");
    const at2 = (await a.get("/tasks")).json;
    check("done in chat finishes task", JSON.stringify(at2).includes('"done"'), JSON.stringify(at2).slice(0, 400));
    // Homework
    r = await a.say("خلي ليلى تحل واجب العربي صفحة ١٢");
    r = await a.say("ايوه");
    const tasks = (await b.get("/tasks")).json;
    const hw = (tasks?.tasks ?? tasks?.for_me ?? []).find?.((t: Json) => t.homework) ?? (JSON.stringify(tasks).includes('"homework":true') ? {} : null);
    check("homework task created", Boolean(hw), JSON.stringify(tasks).slice(0, 400));
  });

  // ---------------- trackers ----------------
  await scenario("trackers", async () => {
    const a = new Person("A");
    await setup(a, "Kareem");
    let r = await a.say("عايز اتابع المية");
    check("create tracker", (await a.get("/trackers")).json?.trackers?.length === 1, JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    r = await a.say("شربت ٢ كوباية مية");
    let tr = (await a.get("/trackers")).json?.trackers ?? [];
    check("log 2", tr[0]?.today === 2 || JSON.stringify(tr[0]).includes('"today":2'), JSON.stringify(tr[0]));
    r = await a.say("shrebt kobaya kaman");
    tr = (await a.get("/trackers")).json?.trackers ?? [];
    check("franco log +1", tr[0]?.today === 3 || JSON.stringify(tr[0]).includes('"today":3'), JSON.stringify(tr[0]) + textOf(r.replies));
    r = await a.say("غلطت متحسبهاش");
    tr = (await a.get("/trackers")).json?.trackers ?? [];
    check("undo last log", tr[0]?.today === 2 || JSON.stringify(tr[0]).includes('"today":2'), JSON.stringify(tr[0]) + textOf(r.replies));
    r = await a.say("مشربتش مية خالص امبارح");
    tr = (await a.get("/trackers")).json?.trackers ?? [];
    check("news is not an undo", tr[0]?.today === 2 || JSON.stringify(tr[0]).includes('"today":2'), JSON.stringify(tr[0]));
    r = await a.say("خلي هدف المية ١٠");
    tr = (await a.get("/trackers")).json?.trackers ?? [];
    check("goal 10", tr[0]?.goal === 10, JSON.stringify(tr[0]));
    const second = await a.post("/trackers", { kind: "quran" });
    check("second tracker allowed (REQUIRE_SUBSCRIPTION=0) or 402", second.status < 300 || second.status === 402, String(second.status));
  });

  // ---------------- split ----------------
  await scenario("split", async () => {
    const a = new Person("A");
    await setup(a, "Kareem");
    let r = await a.say("قسم ٩٠٠ عليا وعلى حسن وكريم");
    check("split card", cardsOf(r.replies).some((x: Json) => /split/.test(x.kind)), JSON.stringify(cardsOf(r.replies)) + textOf(r.replies));
    const sp = (await a.get("/splits")).json;
    check("split saved", JSON.stringify(sp).includes("900"), JSON.stringify(sp).slice(0, 300));
    r = await a.say("split dinner with Mona and Omar");
    check("split no amount asks", /[؟?]/.test(textOf(r.replies)), textOf(r.replies));
  });

  // ---------------- small talk and safety ----------------
  await scenario("small talk", async () => {
    const a = new Person("A");
    await setup(a, "Kareem");
    for (const t of ["fee eh kol dah", "msh btrod lee", "alo", "law t3ban 2oly", "zaki", "hawel tb2a asra3 shwaya please", "tyb enta odamak ad eh w trod"]) {
      const r = await a.say(t, ["أنا هنا معاك"]);
      check(`"${t}" gets a reply`, r.replies.length > 0 && !/هنجت/.test(textOf(r.replies)), textOf(r.replies));
      check(`"${t}" saves nothing`, r.items.length === 0 && cardsOf(r.replies).length === 0, JSON.stringify(r.items) + JSON.stringify(cardsOf(r.replies)));
    }
    const r = await a.say("msh 3ayez a3eesh tany");
    check("crisis gets helpline", /16328|٠٨٠٠|08008880700|خط|helpline/.test(textOf(r.replies)), textOf(r.replies));
  });

  // ---------------- the other thread's three cases ----------------
  await scenario("thread cases", async () => {
    const a = new Person("A");
    await setup(a, "Kareem");
    // (2) a retried message answered after newer messages exist: send B, then retry A's client id.
    const cidOld = randomUUID();
    const first = await a.call("POST", "/messages", { client_id: cidOld, text: "فكرني بكرة ٩ اروح البنك", created_at: new Date().toISOString(), timezone: "Africa/Cairo", brain: "phone" });
    check("first pass 202 or 201", first.status === 202 || first.status === 201, String(first.status));
    await a.say("ازيك");
    const retry = await a.call("POST", "/messages", { client_id: cidOld, text: "فكرني بكرة ٩ اروح البنك", created_at: new Date().toISOString(), timezone: "Africa/Cairo", brain: "phone", phone_output: { reply: ["تمام"], crisis: false } });
    check("late second pass answered", retry.status === 201 || retry.status === 200, `${retry.status} ${JSON.stringify(retry.json).slice(0, 200)}`);
    check("late second pass saved the reminder", (retry.json?.items ?? []).some((i: Json) => /البنك/.test(i.title)), JSON.stringify(retry.json).slice(0, 300));
    const ms = (await a.get("/messages")).json?.messages ?? [];
    const order = ms.map((m: Json) => `${m.role}:${m.text.slice(0, 12)}`);
    check("reply sorted after its message", ms.findIndex((m: Json) => m.text.includes("البنك") && m.role === "user") < ms.length - 1, JSON.stringify(order));
  });

  // ---------------- report ----------------
  const byStep = new Map<string, number[]>();
  for (const t of timings) byStep.set(t.step, [...(byStep.get(t.step) ?? []), t.ms]);
  const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))]!;
  console.log(`\nAPI ${BASE}: ${checks - failures.length}/${checks} checks passed\n`);
  for (const f of failures) console.log(`✗ [${f.scenario}] ${f.check}\n    ${f.detail}`);
  console.log("\nLatency (ms)          n   median   p90    max");
  for (const [step, xs] of [...byStep.entries()].sort()) console.log(`${step.padEnd(36)} ${String(xs.length).padStart(3)} ${pct(xs, 0.5).toFixed(0).padStart(7)} ${pct(xs, 0.9).toFixed(0).padStart(6)} ${Math.max(...xs).toFixed(0).padStart(6)}`);
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 2;
});
