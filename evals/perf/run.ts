/**
 * Speed harness (speed thread, 2026-11-25): how long each screen, action and chat turn takes on
 * the server, and how many database round trips it makes. Runs the real app in this process
 * against a local Postgres through a delay proxy, so the database is as far away as in
 * production (one round trip there is about 0.1 s; after the server moves next to the database,
 * about 0.016 s). The model is a stand-in that answers at once: the numbers are everything
 * except the model's own thinking.
 *
 *   createdb fakkarni_perf && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fakkarni_perf npx prisma migrate deploy   (apps/api)
 *   npm run perf -w @fakkarni/evals -- [--rtt 100] [--label before] [--only tasks] [--runs 3]
 *
 * Prints a table and writes evals/perf/out/<label>.json. `--compare a,b` prints two saved runs
 * side by side. Never point it at a real database: it empties every table first.
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startDelayProxy } from "./proxy";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const RTT = Number(arg("--rtt") ?? 100);
const RUNS = Number(arg("--runs") ?? 3);
const LABEL = arg("--label") ?? "run";
const ONLY = arg("--only");
const PERF_DB = process.env["PERF_DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/fakkarni_perf";

interface Row {
  group: string;
  name: string;
  ms: number;
  trips: number;
  status: number;
  kb: number;
}

if (arg("--compare")) {
  const [a, b] = arg("--compare")!.split(",");
  const load = (l: string) => JSON.parse(readFileSync(join(OUT, `${l}.json`), "utf8")) as { rtt: number; rows: Row[] };
  const A = load(a!);
  const B = load(b!);
  console.log(`\n${a} (round trip ${A.rtt} ms)  →  ${b} (round trip ${B.rtt} ms)\n`);
  console.log(["what".padEnd(44), "before".padStart(9), "after".padStart(9), "faster".padStart(8), "trips".padStart(9)].join(" "));
  for (const r of A.rows) {
    const s = B.rows.find((x) => x.name === r.name);
    if (!s) continue;
    console.log([r.name.padEnd(44), `${Math.round(r.ms)} ms`.padStart(9), `${Math.round(s.ms)} ms`.padStart(9), `${(r.ms / Math.max(s.ms, 1)).toFixed(1)}×`.padStart(8), `${r.trips}→${s.trips}`.padStart(9)].join(" "));
  }
  for (const s of B.rows) if (!A.rows.some((r) => r.name === s.name)) console.log([s.name.padEnd(44), "".padStart(9), `${Math.round(s.ms)} ms`.padStart(9), "new".padStart(8), `${s.trips}`.padStart(9)].join(" "));
  process.exit(0);
}

if (!/perf/.test(new URL(PERF_DB).pathname)) throw new Error("PERF_DATABASE_URL must name a database with 'perf' in it: this harness empties every table.");
const target = new URL(PERF_DB);
const proxy = await startDelayProxy({ host: target.hostname, port: Number(target.port || 5432) });
const proxied = new URL(PERF_DB);
proxied.hostname = "127.0.0.1";
proxied.port = String(proxy.port);
process.env["DATABASE_URL"] = proxied.toString();
process.env["DISABLE_JOBS"] = "1";

const { buildApp } = await import("../../apps/api/src/app");
const { PrismaClient } = await import("../../apps/api/src/generated/prisma/client");
const { pgAdapter } = await import("../../apps/api/src/db-pool");
const { createConversationPipeline } = await import("../../apps/api/src/pipeline/conversation");
type FriendModel = import("../../apps/api/src/ai/model").FriendModel;
type FriendModelResult = import("../../apps/api/src/ai/model").FriendModelResult;

const usage = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 3000, cache_creation_input_tokens: 0 };
const reply = (output: Record<string, unknown>): FriendModelResult => ({ ok: true, usage, output: { create_items: [], update_items: [], save_memories: [], crisis: false, reply: ["تمام يا مني 💛"], ...output } }) as FriendModelResult;
let script: FriendModelResult[] = [];
const model: FriendModel = {
  async respond() {
    return script.shift() ?? reply({});
  },
  async complete() {
    return { text: "ملخص", usage };
  },
};

// The app's own pool (apps/api/src/db-pool.ts), plus a query log for --trace.
const TRACE = arg("--trace");
const queries: { at: number; sql: string }[] = [];
const prisma = new PrismaClient({ adapter: pgAdapter(process.env["DATABASE_URL"]!), log: [{ emit: "event", level: "query" }] });
prisma.$on("query", (e) => void queries.push({ at: performance.now(), sql: e.query.replace(/\s+/g, " ").slice(0, 150) }));
const app = buildApp({ logger: false }, { prisma, model, rateLimitPerMinute: false, userCacheMs: 15_000, pipelineFactory: (log) => createConversationPipeline({ model, log }), auth: { allowInstallId: true }, billing: { requireSubscription: false } });
await app.ready();
await prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "circles" CASCADE');

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
class Person {
  id = randomUUID();
  userId = "";
  constructor(public name: string) {}
  async call(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await app.inject({ method, url, headers: { "x-install-id": this.id, "x-message-kinds": "2", ...headers }, ...(body === undefined ? {} : { payload: body as object }) });
    let json: Json = null;
    try {
      json = res.body ? JSON.parse(res.body) : null;
    } catch {
      json = res.body;
    }
    return { status: res.statusCode, json, bytes: Buffer.byteLength(res.body) };
  }
  async must(method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, body?: unknown) {
    const r = await this.call(method, url, body);
    if (r.status >= 300) throw new Error(`${this.name} ${method} ${url} → ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    return r.json;
  }
  say(text: string, out?: Record<string, unknown>) {
    if (out) script.push(reply(out));
    return this.call("POST", "/messages", { client_id: randomUUID(), text, created_at: new Date().toISOString(), timezone: "Africa/Cairo" });
  }
}

// ---- A household the size of a real one: the mom, 5 other people, 3 circles ----
const mona = new Person("Mona");
const others = ["Omar", "Sara", "Youssef", "Nour", "Hany"].map((n) => new Person(n));
const [omar, sara, youssef, nour, hany] = others as [Person, Person, Person, Person, Person];
const everyone = [mona, ...others];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const inDays = (d: number, h = 18) => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + d);
  t.setUTCHours(h, 0, 0, 0);
  return t.toISOString();
};

interface World {
  circles: { id: string; members: Person[] }[];
  home: string;
  trackers: string[];
  sections: string[];
  splitId: string;
}

async function seed(): Promise<World> {
  for (const p of everyone) {
    p.userId = (await p.must("GET", "/me")).user.id;
    await p.must("PATCH", "/me", { name: p.name, timezone: "Africa/Cairo", language: "ar-EG" });
  }
  // The heaviest real user: Pro, so nothing is capped.
  await prisma.user.update({ where: { id: mona.userId }, data: { bonusProUntil: new Date(Date.now() + 365 * 86_400_000) } });
  const circles: World["circles"] = [];
  const plan: [string, "family" | "friends", Person[]][] = [
    ["البيت", "family", [omar, sara, youssef]],
    ["صحاب الجامعة", "friends", [nour, hany, sara]],
    ["جروب الشغل", "friends", [hany, nour, omar, youssef]],
  ];
  for (const [name, kind, members] of plan) {
    const c = (await mona.must("POST", "/circles", { kind, name, ...(kind === "family" ? { family_type: "parents_teens" } : {}) })).circle;
    const code = (await mona.must("POST", `/circles/${c.id}/invites`)).invite.code;
    for (const m of members) await m.must("POST", `/invites/${code}/accept`);
    circles.push({ id: c.id, members });
    const kinds = ["home", "arrived", "on_way", "ok"];
    for (const [i, m] of members.entries()) await m.must("POST", `/circles/${c.id}/checkins`, { kind: kinds[i % kinds.length] });
    // Tasks both ways, in every state.
    for (const [i, m] of members.entries()) {
      const mine = (await mona.must("POST", `/circles/${c.id}/tasks`, { assignee_id: m.userId, title: `مهمة ${i + 1} من مني`, due_at: inDays(i + 1), ...(i === 0 ? { homework: true, note: "صفحة 12" } : {}) })).task;
      if (i !== 2) await m.must("POST", `/tasks/${mine.id}/respond`, { answer: "accept" });
      if (i === 1) await m.must("POST", `/tasks/${mine.id}/done`);
      const theirs = (await m.must("POST", `/circles/${c.id}/tasks`, { assignee_id: mona.userId, title: `طلب ${i + 1} من ${m.name}`, due_at: inDays(i + 2) })).task;
      if (i !== 0) await mona.must("POST", `/tasks/${theirs.id}/respond`, { answer: "accept" });
    }
    const feed = await mona.must("GET", `/circles/${c.id}/feed`);
    for (const [i, post] of (feed.posts as Json[]).slice(0, 6).entries()) {
      await members[i % members.length]!.must("POST", `/circles/${c.id}/posts/${post.id}/react`, { key: "heart" });
      if (i < 4) await members[(i + 1) % members.length]!.must("POST", `/circles/${c.id}/posts/${post.id}/comments`, { text: "برافو 👏" });
      if (i < 2) await mona.must("POST", `/circles/${c.id}/posts/${post.id}/comments`, { text: "شكرا يا جماعة" });
    }
  }
  const home = circles[0]!.id;

  const trackers: string[] = [];
  for (const body of [{ kind: "water" }, { kind: "prayer" }, { kind: "study", circle_id: home }, { kind: "custom", name: "مشي", goal: 30, unit_label: "دقيقة" }, { kind: "medicine" }]) {
    const t = (await mona.must("POST", "/trackers", body)).tracker;
    trackers.push(t.id);
    for (let d = 0; d < 3; d++) for (let n = 0; n < 3; n++) await mona.must("POST", `/trackers/${t.id}/entries`, { at: new Date(Date.now() - d * 86_400_000 - n * 3_600_000).toISOString() });
  }
  await omar.must("POST", "/trackers", { kind: "study", circle_id: home });

  // Daftar with circle members (straight to their app) and by name.
  const debts: Json[] = [];
  for (const [i, m] of [omar, sara, youssef, nour, hany, omar, sara].entries()) {
    const circle = circles.find((c) => c.members.includes(m))!;
    debts.push((await mona.must("POST", "/daftar", { other_name: m.name, direction: i % 2 ? "i_owe" : "owed_to_me", amount: 100 + i * 50, circle_id: circle.id, other_user_id: m.userId, note: "عشا" })).entry);
  }
  await omar.must("POST", `/daftar/${debts[0].id}/respond`, { answer: "confirm" });
  await sara.must("POST", `/daftar/${debts[1].id}/respond`, { answer: "confirm" });
  await mona.must("POST", `/daftar/${debts[0].id}/settle`);
  for (const name of ["أم أحمد", "البقال", "عم حسن"]) await mona.must("POST", "/daftar", { other_name: name, direction: "owed_to_me", amount: 75 });

  const sections: string[] = [];
  for (const [name, kind, budget] of [["أكل", "expense", 4000], ["مواصلات", "expense", 1500], ["فواتير", "expense", 2500], ["مدرسة", "expense", 3000], ["مرتب", "income", null]] as const) {
    const s = (await mona.must("POST", "/money/sections", { id: randomUUID(), name, kind, ...(budget ? { budget } : {}) })).section;
    sections.push(s.id);
    for (let n = 0; n < 10; n++) await mona.must("POST", `/money/sections/${s.id}/entries`, { id: randomUUID(), amount: 40 + n * 15, note: `بند ${n + 1}` });
  }
  const book = (await mona.must("POST", "/money/sections", { id: randomUUID(), name: "مصاريف البيت", kind: "expense", circle_id: home })).section;
  sections.push(book.id);
  for (let n = 0; n < 6; n++) await (n % 2 ? omar : mona).must("POST", `/money/sections/${book.id}/entries`, { id: randomUUID(), amount: 120 + n * 30, note: `مشترك ${n + 1}` });

  let splitId = "";
  for (const title of ["عشا الخميس", "رحلة الساحل"]) {
    const sp = await mona.must("POST", "/splits", { title, people: [{ name: "Mona" }, { name: "Omar" }, { name: "Sara" }], items: [{ name: "بيتزا", price: 300, eaters: [] }, { name: "عصير", price: 90, eaters: [1] }], subtotal: 390 });
    splitId = sp.split.id;
  }

  // A chat with history: reminders, memories, plain talk.
  for (let n = 0; n < 12; n++) {
    await mona.say(`فكريني بحاجة رقم ${n + 1}`, { reply: ["حاضر، هفكرك 💛"], create_items: [{ type: "reminder", title: `حاجة رقم ${n + 1}`, due_at_local: null, remind_at_local: `2026-12-${String(n + 1).padStart(2, "0")}T18:00`, follow_up_at_local: null }] });
    await mona.say(`على فكرة معلومة ${n + 1}`, { reply: ["حلو، عرفت 😊"], save_memories: [{ kind: "preference", subject: `معلومة ${n + 1}`, content: `مني بتحب الحاجة رقم ${n + 1}` }] });
    await mona.say("ايه الاخبار", { reply: ["كله تمام يا مني، إنتي عاملة إيه؟"] });
  }
  return { circles, home, trackers, sections, splitId };
}

const rows: Row[] = [];
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
/** Background work after an answer (pushes, counters) must not land in the next measurement. */
const settle = () => sleep(RTT * 2 + 120);

async function measure(group: string, name: string, run: (ctx: Json) => Promise<{ status: number; bytes: number }>, prepare?: () => Promise<Json>) {
  if (ONLY && !`${group} ${name}`.includes(ONLY)) return;
  const ms: number[] = [];
  const trips: number[] = [];
  let status = 0;
  let bytes = 0;
  for (let i = 0; i < RUNS; i++) {
    await settle();
    proxy.setDelay(0);
    const ctx = prepare ? await prepare() : undefined;
    await settle();
    proxy.setDelay(RTT / 2);
    proxy.reset();
    queries.length = 0;
    const t0 = performance.now();
    const res = await run(ctx);
    ms.push(performance.now() - t0);
    trips.push(proxy.roundTrips());
    status = res.status;
    bytes = res.bytes;
    if (TRACE && i === 0 && `${group} ${name}`.includes(TRACE)) {
      await settle();
      console.log(`\n# ${name}: ${Math.round(ms[0]!)} ms, ${trips[0]} trips at the answer; queries (ms after the start, when each finished):`);
      for (const q of queries) console.log(`  ${String(Math.round(q.at - t0)).padStart(5)}  ${q.sql}`);
    }
  }
  await settle();
  proxy.setDelay(0);
  rows.push({ group, name, ms: median(ms), trips: Math.min(...trips), status, kb: bytes / 1024 });
}

console.log(`Seeding (round trip ${RTT} ms when measuring)…`);
const t0 = performance.now();
const w = await seed();
console.log(`Seeded in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
const home = w.home;
const get = (url: string) => () => mona.call("GET", url);

// The phone's background refresh of every tab: what prefetchAll asks for.
const PREFETCH = ["/me", "/circles", "/tasks", "/trackers", "/daftar", "/money", "/splits", "/memories", ...w.circles.flatMap((c) => [`/circles/${c.id}`, `/circles/${c.id}/feed`, `/circles/${c.id}/trackers`])];

// ---- Screens ----
await measure("screen", "GET /me", get("/me"));
await measure("screen", "GET /messages (first load, 200)", get("/messages?limit=200"));
await measure("screen", "GET /messages?after (30 s poll)", get(`/messages?after=${encodeURIComponent(new Date().toISOString())}`));
await measure("screen", "GET /items", get("/items"));
await measure("screen", "GET /memories", get("/memories"));
await measure("screen", "GET /circles", get("/circles"));
await measure("screen", "GET /circles/:id", get(`/circles/${home}`));
await measure("screen", "GET /circles/:id/feed", get(`/circles/${home}/feed`));
await measure("screen", "GET /circles/:id/trackers", get(`/circles/${home}/trackers`));
await measure("screen", "GET /circles/:id/summary", get(`/circles/${home}/summary`));
await measure("screen", "GET /tasks", get("/tasks"));
await measure("screen", "GET /trackers", get("/trackers"));
await measure("screen", "GET /daftar", get("/daftar"));
await measure("screen", "GET /money", get("/money"));
await measure("screen", "GET /money/sections/:id", get(`/money/sections/${w.sections[0]}`));
await measure("screen", "GET /splits", get("/splits"));
await measure("screen", "GET /me/referral", get("/me/referral"));

// ---- The whole app refreshed, the way the phone does it ----
await measure("refresh", `all tabs: ${PREFETCH.length} requests, 2 at a time`, async () => {
  let bytes = 0;
  const queue = [...PREFETCH];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) bytes += (await mona.call("GET", url)).bytes;
  };
  await Promise.all([worker(), worker()]);
  return { status: 200, bytes };
});
await measure("refresh", "all tabs: one request (GET /bootstrap)", get("/bootstrap"));

// ---- Actions ----
await measure("action", "tracker: log a step", () => mona.call("POST", `/trackers/${w.trackers[0]}/entries`, { at: new Date().toISOString() }));
await measure("action", "circle: check in", () => mona.call("POST", `/circles/${home}/checkins`, { kind: "home" }));
await measure(
  "action",
  "task: say yes",
  (id) => mona.call("POST", `/tasks/${id}/respond`, { answer: "accept" }),
  async () => (await omar.must("POST", `/circles/${home}/tasks`, { assignee_id: mona.userId, title: "هاتي عيش" })).task.id,
);
await measure(
  "action",
  "task: mark done",
  (id) => mona.call("POST", `/tasks/${id}/done`),
  async () => {
    const id = (await omar.must("POST", `/circles/${home}/tasks`, { assignee_id: mona.userId, title: "هاتي لبن" })).task.id;
    await mona.must("POST", `/tasks/${id}/respond`, { answer: "accept" });
    return id;
  },
);
await measure(
  "action",
  "task: ask someone",
  () => mona.call("POST", `/circles/${home}/tasks`, { assignee_id: sara.userId, title: `رتبي الأوضة ${randomUUID().slice(0, 4)}` }),
);
await measure(
  "action",
  "daftar: add with a circle member",
  () => mona.call("POST", "/daftar", { other_name: "Omar", direction: "owed_to_me", amount: 60, circle_id: home, other_user_id: omar.userId }),
);
await measure(
  "action",
  "daftar: confirm",
  (id) => mona.call("POST", `/daftar/${id}/respond`, { answer: "confirm" }),
  async () => (await omar.must("POST", "/daftar", { other_name: "Mona", direction: "owed_to_me", amount: 45, circle_id: home, other_user_id: mona.userId })).entry.id,
);
await measure(
  "action",
  "daftar: settle",
  (id) => mona.call("POST", `/daftar/${id}/settle`),
  async () => {
    const id = (await omar.must("POST", "/daftar", { other_name: "Mona", direction: "owed_to_me", amount: 45, circle_id: home, other_user_id: mona.userId })).entry.id;
    await mona.must("POST", `/daftar/${id}/respond`, { answer: "confirm" });
    return id;
  },
);
const firstPost = (await mona.must("GET", `/circles/${home}/feed`)).posts[0].id as string;
let flip = false;
await measure("action", "feed: react", () => mona.call("POST", `/circles/${home}/posts/${firstPost}/react`, { key: (flip = !flip) ? "heart" : "clap" }));
await measure("action", "feed: comment", () => mona.call("POST", `/circles/${home}/posts/${firstPost}/comments`, { text: "تمام 👍" }));
await measure("action", "money: add an amount", () => mona.call("POST", `/money/sections/${w.sections[0]}/entries`, { id: randomUUID(), amount: 35, note: "عيش" }));
await measure(
  "action",
  "item: mark done",
  (id) => mona.call("PATCH", `/items/${id}`, { status: "done" }),
  async () => ((await mona.say("فكريني اشتري لبن", { reply: ["حاضر"], create_items: [{ type: "task", title: "اشتري لبن", due_at_local: null, remind_at_local: null, follow_up_at_local: null }] })).json.items as Json[]).at(-1).id,
);

// ---- Chat (the stand-in model answers at once: add the real model's ~1.5–2.5 s to AI turns) ----
await measure("chat", "chat: thanks (rules answer)", () => mona.say("شكرا"));
await measure("chat", "chat: tracker by rules (شربت مية)", () => mona.say("شربت مية"));
await measure("chat", "chat: money by rules", () => mona.say("صرفت 50 جنيه أكل"));
await measure("chat", "chat: AI turn, talk only", () => mona.say("انا زهقانة شوية النهاردة", { reply: ["سلامتك يا مني 💛 إيه اللي مزهقك؟"] }));
await measure("chat", "chat: AI turn, sets a reminder", () =>
  mona.say("فكريني اكلم ماما بكرة الساعة ٦", { reply: ["حاضر، هفكرك بكرة ٦ 💛"], create_items: [{ type: "reminder", title: "اكلم ماما", due_at_local: null, remind_at_local: "2026-12-20T18:00", follow_up_at_local: null }] }),
);
await measure("chat", "chat: AI turn, saves a memory", () => mona.say("انا بحب القهوة سادة", { reply: ["عرفت 😊"], save_memories: [{ kind: "preference", subject: "قهوة", content: "بتحب القهوة سادة" }] }));

// ---- Report ----
const pad = (s: string, n: number) => s.padEnd(n);
console.log(`\nDatabase round trip: ${RTT} ms. Times are medians of ${RUNS}; trips = database round trips.\n`);
console.log([pad("what", 46), "time".padStart(9), "trips".padStart(6), "size".padStart(9), "status".padStart(7)].join(" "));
let group = "";
for (const r of rows) {
  if (r.group !== group) console.log(`— ${(group = r.group)} —`);
  console.log([pad(r.name, 46), `${Math.round(r.ms)} ms`.padStart(9), String(r.trips).padStart(6), `${r.kb.toFixed(1)} KB`.padStart(9), String(r.status).padStart(7)].join(" "));
}
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `${LABEL}.json`), JSON.stringify({ label: LABEL, rtt: RTT, runs: RUNS, at: new Date().toISOString(), rows }, null, 2));
console.log(`\nSaved evals/perf/out/${LABEL}.json`);

await app.close();
await prisma.$disconnect();
await proxy.close();
process.exit(0);
