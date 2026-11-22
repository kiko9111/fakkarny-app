import {
  checkinOrder,
  type CheckinKind,
  type Circle,
  type CircleDetail,
  type CircleMember,
  type CirclePost,
  type CircleTask,
  type DaftarEntry,
  type Item,
  type Memory,
  type Message,
  type Session,
  type SessionMessage,
  type Tracker,
  type TrackerKind,
  TRACKER_TEMPLATES,
  type User,
} from "@fakkarni/shared";
import { clearWebDb } from "@/db/database.web";
import { language } from "@/i18n";
import { prefs } from "@/lib/prefs";
import { isPlainYes, zakiReply } from "./zaki";

/**
 * The browser preview's pretend server: answers every API call from sample data kept in
 * memory (and in localStorage, so a reload keeps what you did). Shapes match the real API.
 */

const ar = language === "ar-EG";
const L = (arText: string, enText: string) => (ar ? arText : enText);
const id = () => crypto.randomUUID();
const now = () => new Date();
const iso = (d: Date) => d.toISOString();
const inHours = (h: number) => iso(new Date(Date.now() + h * 3_600_000));
const atLocal = (daysAhead: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return iso(d);
};

const ME = "me-0000-0000";
const MAMA = "u-mama";
const BABA = "u-baba";
const SARA = "u-sara";
const OMAR = "u-omar";
const MARIAM = "u-mariam";
const YOUSSEF = "u-youssef";

interface CircleRow {
  id: string;
  kind: "family" | "friends";
  name: string;
  family_type: CircleDetail["family_type"];
  created_at: string;
  members: CircleMember[];
  invites: CircleDetail["open_invites"];
  posts: CirclePost[];
}
interface TrackerRow {
  id: string;
  kind: TrackerKind;
  name: string | null;
  goal: number | null;
  pack: "ramadan" | null;
  /** Last 7 local days, oldest first; index 6 is today. */
  week: number[];
  total: number;
  created_at: string;
}
interface SessionData {
  consented: boolean;
  open: Session | null;
  moods: { at: string; mood: number }[];
}
interface State {
  user: User;
  items: Item[];
  memories: Memory[];
  circles: CircleRow[];
  daftar: DaftarEntry[];
  tasks: CircleTask[];
  trackers: TrackerRow[];
  session: SessionData;
  messages: Message[];
  served_morning: boolean;
  /** Item id of the status check Zaki just asked about (shows the "did Youssef pay you back?" flow). */
  pending_status?: string | null;
  status_asked?: boolean;
  language: string;
}

const member = (user_id: string, name: string | null, extra: Partial<CircleMember> = {}): CircleMember => ({
  user_id,
  name,
  role: "member",
  joined_at: inHours(-24 * 20),
  is_me: user_id === ME,
  family_role: null,
  last_checkin: null,
  ...extra,
});

const item = (over: Partial<Item> & Pick<Item, "title">): Item => ({
  id: id(),
  user_id: ME,
  type: "reminder",
  due_at: null,
  remind_at: null,
  important: false,
  nudge: null,
  status: "open",
  debt_person: null,
  debt_amount: null,
  debt_direction: null,
  follow_up_at: null,
  repeat_every_minutes: null,
  source_message_id: null,
  updated_at: iso(now()),
  created_at: iso(now()),
  done_at: null,
  ...over,
});

function seed(): State {
  const family: CircleRow = {
    id: "c-family",
    kind: "family",
    name: L("بيت العيلة", "Our home"),
    family_type: "adults_elders",
    created_at: inHours(-24 * 30),
    members: [
      member(ME, null, { role: "owner", family_role: "adult", last_checkin: { kind: "home", note: null, at: inHours(-14) } }),
      member(MAMA, L("ماما", "Mum"), { family_role: "parent", last_checkin: { kind: "medicine", note: null, at: inHours(-2) } }),
      member(BABA, L("بابا", "Dad"), { family_role: "elder", last_checkin: { kind: "ok", note: null, at: inHours(-5) } }),
      member(SARA, L("سارة", "Sara"), { family_role: "adult", last_checkin: { kind: "arrived", note: null, at: inHours(-1) } }),
    ],
    invites: [],
    posts: [
      { id: id(), text: L("ماما طلبت من سارة تحجز ميعاد الدكتور، وسارة وافقت 👍", "Mum asked Sara to book the doctor, and Sara said yes 👍"), created_at: inHours(-3), kind: null, my_rsvp: null },
      { id: id(), text: L("بابا قال إنه تمام ✅", "Dad says he's fine ✅"), created_at: inHours(-5), kind: null, my_rsvp: null },
    ],
  };
  const friends: CircleRow = {
    id: "c-friends",
    kind: "friends",
    name: L("شلة الجامعة", "Uni crew"),
    family_type: null,
    created_at: inHours(-24 * 12),
    members: [member(OMAR, L("عمر", "Omar"), { role: "owner" }), member(ME, null), member(MARIAM, L("مريم", "Mariam")), member(YOUSSEF, L("يوسف", "Youssef"))],
    invites: [],
    posts: [{ id: id(), text: L("يوسف خلّص «يحجز الملعب يوم الجمعة» 🎉", "Youssef finished “book the pitch for Friday” 🎉"), created_at: inHours(-20), kind: null, my_rsvp: null }],
  };

  const task = (over: Partial<CircleTask> & Pick<CircleTask, "title" | "role">): CircleTask => ({
    id: id(),
    circle_id: family.id,
    circle_name: family.name,
    due_at: null,
    remind_at: null,
    homework: false,
    note: null,
    status: "pending",
    assigner_name: null,
    assignee_name: null,
    can_nudge: false,
    created_at: inHours(-2),
    responded_at: null,
    done_at: null,
    ...over,
  });

  const week = (vals: number[]) => vals;
  return {
    user: {
      id: ME,
      name: L("كريم", "Kareem"),
      language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Cairo",
      wake_time: "07:30",
      sleep_time: "23:30",
      tone: "balanced",
      checkin_interval_h: "4",
      ignored_checkins: 0,
      plan: "none",
      plan_expires_at: null,
      plan_tier: "pro",
      bonus_pro_until: null,
      pro: false,
      always_direct: false,
      instapay_link: null,
      created_at: inHours(-24 * 3),
      last_active_at: iso(now()),
    },
    items: [
      item({ title: L("كلّم تيتة", "Call grandma"), due_at: atLocal(0, 20), remind_at: atLocal(0, 19, 45), important: true }),
      item({ title: L("ميعاد الدكتور", "Doctor's appointment"), due_at: atLocal(1, 18), remind_at: atLocal(1, 17) }),
      item({ title: L("ادفع فاتورة النت", "Pay the internet bill"), type: "task", due_at: atLocal(3, 12) }),
      item({ title: L("هدية عيد ميلاد مريم", "Mariam's birthday present"), type: "task" }),
      item({ title: L("يوسف · ٢٠٠", "Youssef · 200"), type: "debt", debt_person: L("يوسف", "Youssef"), debt_amount: 200, debt_direction: "owed_to_me" }),
    ],
    memories: [
      { id: id(), user_id: ME, kind: "person", subject: L("سارة", "Sara"), content: L("أختك، بتشتغل دكتورة أسنان", "Your sister, a dentist"), last_used_at: null, created_at: inHours(-48) },
      { id: id(), user_id: ME, kind: "preference", subject: L("القهوة", "Coffee"), content: L("بتحب القهوة من غير سكر", "You take your coffee without sugar"), last_used_at: null, created_at: inHours(-40) },
      { id: id(), user_id: ME, kind: "fact", subject: L("الجيم", "Gym"), content: L("بتروح الجيم الصبح ٣ مرات في الأسبوع", "You go to the gym three mornings a week"), last_used_at: null, created_at: inHours(-30) },
    ],
    circles: [family, friends],
    daftar: [
      {
        id: id(), other_name: L("عمر", "Omar"), direction: "owed_to_me", amount: 250, currency: "EGP", note: L("تذكرة السينما", "Cinema tickets"), status: "confirmed", mine: true,
        url: "https://zaki.app/d/DEMO1", pay_link: null, circle_id: friends.id, created_at: inHours(-50), responded_at: inHours(-48), settled_at: null,
      },
      {
        id: id(), other_name: L("مريم", "Mariam"), direction: "i_owe", amount: 120, currency: "EGP", note: L("الغدا", "Lunch"), status: "confirmed", mine: false,
        url: null, pay_link: "https://ipn.eg/S/mariam/instapay/demo", circle_id: friends.id, created_at: inHours(-30), responded_at: inHours(-29), settled_at: null,
      },
      {
        id: id(), other_name: L("خالد", "Khaled"), direction: "owed_to_me", amount: 500, currency: "EGP", note: null, status: "pending", mine: true,
        url: "https://zaki.app/d/DEMO2", pay_link: null, circle_id: null, created_at: inHours(-4), responded_at: null, settled_at: null,
      },
    ],
    tasks: [
      task({ title: L("هات عيش وانت راجع", "Grab bread on your way home"), role: "assignee", assigner_name: L("ماما", "Mum"), assignee_name: null, due_at: atLocal(0, 21) }),
      task({ title: L("واجب العربي: تعبير عن الشتا", "Arabic homework: a short essay on winter"), role: "assigner", assigner_name: null, assignee_name: L("عمر", "Omar"), status: "accepted", responded_at: inHours(-1), homework: true, note: L("صفحة 40 في الكتاب https://example.com/hw", "Page 40 in the book https://example.com/hw"), remind_at: atLocal(0, 18), due_at: atLocal(0, 21) }),
      task({ title: L("تحجز ميعاد الدكتور لبابا", "Book Dad's doctor appointment"), role: "assigner", assigner_name: null, assignee_name: L("سارة", "Sara"), status: "accepted", responded_at: inHours(-3), can_nudge: true }),
      task({
        title: L("يحجز الملعب يوم الجمعة", "Book the pitch for Friday"), role: "watcher", circle_id: friends.id, circle_name: friends.name,
        assigner_name: L("عمر", "Omar"), assignee_name: L("يوسف", "Youssef"), status: "done", done_at: inHours(-20),
      }),
    ],
    trackers: [
      { id: id(), kind: "water", name: null, goal: 8, pack: null, week: week([6, 8, 7, 8, 5, 8, 5]), total: 47, created_at: inHours(-24 * 6) },
    ],
    session: { consented: false, open: null, moods: [{ at: inHours(-24 * 5), mood: 3 }, { at: inHours(-24 * 2), mood: 4 }] },
    messages: [],
    served_morning: false,
    language,
  };
}

const KEY = "zaki-web-demo-state";
function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as State) : null;
    // Sample data is written in one language: start over when the user switches.
    if (saved && saved.language === language) return saved;
    // The phone's copy holds the old language's sample items too.
    if (saved) clearWebDb();
  } catch {
    // fall through to a fresh seed
  }
  return seed();
}
let state = load();
function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // memory only
  }
}
export function resetDemo() {
  state = seed();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

class DemoHttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

// ---------- shapes ----------
const toCircle = (c: CircleRow): Circle => ({
  id: c.id,
  kind: c.kind,
  name: c.name,
  role: c.members.find((m) => m.is_me)?.role ?? "member",
  member_count: c.members.length,
  family_type: c.family_type,
  created_at: c.created_at,
  trial_until: new Date(new Date(c.created_at).getTime() + 14 * 86400000).toISOString(),
  extras: true,
});
const toDetail = (c: CircleRow): CircleDetail => ({ ...toCircle(c), members: c.members, open_invites: c.invites });
const findCircle = (cid: string) => {
  const c = state.circles.find((x) => x.id === cid);
  if (!c) throw new DemoHttpError(404);
  return c;
};

function toTracker(r: TrackerRow): Tracker {
  const tpl = TRACKER_TEMPLATES[r.kind];
  let streak = 0;
  if (tpl.unit === "count" && r.goal) {
    for (let i = 6; i >= 0; i--) {
      if (r.week[i]! >= r.goal) streak++;
      else if (i === 6) continue;
      else break;
    }
  }
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    unit: tpl.unit,
    goal: r.goal,
    cumulative: tpl.cumulative,
    today: r.week[6]!,
    week: r.week,
    total: r.total,
    streak,
    pack: r.pack,
    created_at: r.created_at,
  };
}

function trackersResponse() {
  return { trackers: state.trackers.map(toTracker), limit: state.user.pro ? null : 1, ramadan_pack: "off" as const };
}

const msg = (role: "user" | "friend", text: string, client_id: string, kind: Message["kind"] = "chat"): Message => ({
  id: id(),
  user_id: ME,
  role,
  text,
  client_id,
  kind,
  created_at: iso(now()),
});

// ---------- the router ----------
type Handler = (m: RegExpMatchArray, body: Record<string, unknown>, query: URLSearchParams) => unknown;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, fn: Handler) => routes.push([method, new RegExp(`^${pattern}$`), fn]);

on("GET", "/health", () => ({ status: "ok", service: "fakkarni-api", version: "demo", time: iso(now()) }));

// Chat
on("GET", "/messages", (_m, _b, q) => {
  const after = q.get("after");
  if (!state.served_morning && !after && prefs.get("onboarded") === "1") {
    state.served_morning = true;
    const hour = now().getHours();
    const text =
      hour < 12
        ? L("صباح الفل يا كريم ☀️ النهارده عندك تكلّم تيتة الساعة ٨. ومتنساش تشرب مية، إنت لسه في البداية 💧", "Good morning, Kareem ☀️ Today you're calling grandma at 8. And don't forget your water 💧")
        : hour < 18
          ? L("أهلاً يا كريم 👋 عامل إيه النهارده؟ لو عندك حاجة عايز تفتكرها، قولّي وأنا أشيلها عنك.", "Hey Kareem 👋 How's your day going? Tell me anything you want to remember and I'll hold on to it.")
          : L("مساء الخير يا كريم 🌙 يومك كان عامل إزاي؟ لسه فاضل مكالمة تيتة الساعة ٨.", "Good evening, Kareem 🌙 How was your day? There's still grandma's call at 8.");
    const m = msg("friend", text, `demo:welcome:${Date.now()}`, hour < 12 ? "morning" : hour < 18 ? "chat" : "night");
    state.messages.push(m);
    // A status check, the way the server asks one: Zaki follows up on its own.
    const debt = state.items.find((i) => i.type === "debt" && i.status === "open");
    if (!debt) return { messages: [m] };
    const check = { ...msg("friend", L(`${debt.debt_person} رجّعلك الـ${debt.debt_amount}؟`, `Did ${debt.debt_person} pay you back the ${debt.debt_amount}?`), `status:item:${debt.id}:${Date.now()}`, "followup"), created_at: iso(new Date(now().getTime() + 1)) };
    state.messages.push(check);
    state.pending_status = debt.id;
    state.status_asked = true;
    return { messages: [m, check] };
  }
  return { messages: [] };
});

on("POST", "/messages", (_m, b) => {
  const text = String(b.text ?? "");
  const clientId = String(b.client_id ?? id());
  const userMsg = { ...msg("user", text, clientId), created_at: String(b.created_at ?? iso(now())) };
  const pending = state.pending_status ? state.items.find((i) => i.id === state.pending_status && i.status === "open") : undefined;
  state.pending_status = null;
  if (pending && isPlainYes(text)) {
    pending.status = "done";
    pending.updated_at = iso(now());
    const done = msg("friend", pending.type === "debt" ? L("حلو أوي! علّمتها إنها اتسدّت ✅", "Love that! Marked it as settled ✅") : L(`برافو عليك! علّمت «${pending.title}» إنها خلصت ✅`, `Nice one! Marked “${pending.title}” as done ✅`), `${clientId}:reply:0`);
    state.messages.push(userMsg, done);
    return { message: userMsg, replies: [done], items: [pending], memories: [], duplicate: false, ai_allowance: { limit: null, used: 0 } };
  }
  const reply = zakiReply(text, {
    name: state.user.name,
    upcoming: state.items.filter((i) => i.status === "open" && i.type !== "debt"),
    water: state.trackers.find((t) => t.kind === "water"),
  });
  const items: Item[] = [];
  for (const it of reply.items) {
    const created = item({ ...it, source_message_id: userMsg.id });
    state.items.push(created);
    items.push(created);
  }
  if (reply.logWater) {
    const w = state.trackers.find((t) => t.kind === "water");
    if (w) {
      w.week[6] = w.week[6]! + 1;
      w.total += 1;
    }
  }
  const replies = reply.texts.map((t, n) => msg("friend", t, `${clientId}:reply:${n}`));
  // In the preview, show one status check early: Zaki asking on its own how things stand.
  const debt = state.items.find((i) => i.type === "debt" && i.status === "open");
  if (!state.status_asked && debt && !reply.items.length) {
    state.status_asked = true;
    state.pending_status = debt.id;
    replies.push({ ...msg("friend", L(`على فكرة، ${debt.debt_person} رجّعلك الـ${debt.debt_amount}؟`, `By the way, did ${debt.debt_person} pay you back the ${debt.debt_amount}?`), `status:item:${debt.id}:${Date.now()}`, "followup"), created_at: iso(new Date(now().getTime() + replies.length)) });
  }
  state.messages.push(userMsg, ...replies);
  return { message: userMsg, replies, items, memories: [], duplicate: false, ai_allowance: { limit: null, used: 0 } };
});

// Items
on("GET", "/items", (_m, _b, q) => ({ items: state.items.filter((i) => !q.get("status") || i.status === q.get("status")) }));
on("PATCH", "/items/([^/]+)", (m, b) => {
  const it = state.items.find((i) => i.id === m[1]);
  if (!it) throw new DemoHttpError(404);
  Object.assign(it, b, { updated_at: iso(now()) });
  if (b.status === "done") it.done_at = iso(now());
  for (const task of state.tasks) if (b.status === "done" && task.title === it.title && task.role === "assignee") task.status = "done";
  return { item: it };
});

// Me
on("GET", "/me", () => ({ user: state.user }));
on("PATCH", "/me", (_m, b) => {
  Object.assign(state.user, b);
  return { user: state.user };
});
on("POST", "/auth/link", () => ({ user: state.user }));
on("POST", "/me/plan/refresh", () => ({ user: state.user }));
on("DELETE", "/me", () => {
  resetDemo();
  return null;
});
on("GET", "/me/export", () => ({
  exported_at: iso(now()),
  user: state.user,
  messages: state.messages,
  items: state.items,
  memories: state.memories,
  summaries: [],
  circles: [],
  daftar: [],
  sessions: [],
  checkins: [],
}));
on("GET", "/billing/offers", () => ({ founders_left: 734 }));
on("POST", "/devices", () => null);

// Memories
on("GET", "/memories", () => ({ memories: state.memories }));
on("DELETE", "/memories/([^/]+)", (m) => {
  state.memories = state.memories.filter((x) => x.id !== m[1]);
  return null;
});

// Circles
on("GET", "/circles", () => ({ circles: state.circles.map(toCircle) }));
on("POST", "/circles", (_m, b) => {
  const c: CircleRow = {
    id: id(),
    kind: b.kind === "friends" ? "friends" : "family",
    name: String(b.name ?? ""),
    family_type: (b.family_type as CircleDetail["family_type"]) ?? null,
    created_at: iso(now()),
    members: [member(ME, null, { role: "owner", joined_at: iso(now()) })],
    invites: [],
    posts: [],
  };
  state.circles.push(c);
  return { circle: toDetail(c) };
});
on("GET", "/circles/([^/]+)", (m) => ({ circle: toDetail(findCircle(m[1]!)) }));
on("DELETE", "/circles/([^/]+)", (m) => {
  state.circles = state.circles.filter((c) => c.id !== m[1]);
  return null;
});
on("GET", "/circles/([^/]+)/summary", (m) => {
  const c = findCircle(m[1]!);
  const done = state.tasks.filter((t) => t.circle_id === c.id && t.status === "done").length;
  return {
    since: inHours(-24 * 7),
    lines: [
      L(`نجم الأسبوع: ${c.members[0]?.name ?? "حد من الدايرة"} 🌟`, `Star of the week: ${c.members[0]?.name ?? "someone in the circle"} 🌟`),
      L(`${done} مهام خلصت الأسبوع ده`, `${done} tasks done this week`),
    ],
  };
});
on("GET", "/circles/([^/]+)/feed", (m) => {
  const c = findCircle(m[1]!);
  return { posts: c.posts, tasks: state.tasks.filter((t) => t.circle_id === c.id) };
});
on("PATCH", "/circles/([^/]+)/members/([^/]+)", (m, b) => {
  const c = findCircle(m[1]!);
  const who = c.members.find((x) => x.user_id === m[2]);
  if (who) who.family_role = (b.family_role as CircleMember["family_role"]) ?? null;
  return { circle: toDetail(c) };
});
on("DELETE", "/circles/([^/]+)/members/([^/]+)", (m) => {
  const c = findCircle(m[1]!);
  c.members = c.members.filter((x) => x.user_id !== m[2]);
  if (m[2] === ME) state.circles = state.circles.filter((x) => x.id !== c.id);
  return null;
});
on("POST", "/circles/([^/]+)/checkins", (m, b) => {
  const c = findCircle(m[1]!);
  const me = c.members.find((x) => x.is_me);
  const kind = (b.kind as CheckinKind) ?? checkinOrder(c.family_type)[0]!;
  if (me) me.last_checkin = { kind, note: null, at: iso(now()) };
  return { circle: toDetail(c) };
});
on("POST", "/circles/([^/]+)/members/([^/]+)/ask-checkin", () => null);
on("POST", "/circles/([^/]+)/invites", (m) => {
  const c = findCircle(m[1]!);
  const invite = { code: "ZAKI42", url: "https://zaki.app/i/ZAKI42", joins: 0, created_at: iso(now()), expires_at: inHours(24 * 30) };
  c.invites = [invite];
  return {
    invite,
    share_text: L(`تعالى معايا في «${c.name}» على زكي 💛 ${invite.url}`, `Join me in “${c.name}” on Zaki 💛 ${invite.url}`),
  };
});
on("GET", "/invites/([^/]+)", (m) => ({ code: m[1], circle_name: L("عيلة خالتو", "Auntie's family"), circle_kind: "family", inviter_name: L("خالتو منى", "Auntie Mona"), member_count: 5, state: "open" }));
on("POST", "/invites/([^/]+)/accept", () => {
  const c: CircleRow = {
    id: id(),
    kind: "family",
    name: L("عيلة خالتو", "Auntie's family"),
    family_type: "mixed",
    created_at: iso(now()),
    members: [member("u-mona", L("خالتو منى", "Auntie Mona"), { role: "owner" }), member(ME, null, { joined_at: iso(now()) })],
    invites: [],
    posts: [],
  };
  state.circles.push(c);
  return { circle: toDetail(c) };
});
on("POST", "/circles/([^/]+)/tasks", (m, b) => {
  const c = findCircle(m[1]!);
  const who = c.members.find((x) => x.user_id === b.assignee_id);
  const task: CircleTask = {
    id: id(),
    circle_id: c.id,
    circle_name: c.name,
    title: String(b.title ?? ""),
    due_at: (b.due_at as string | null) ?? null,
    remind_at: (b.remind_at as string | null) ?? null,
    homework: Boolean(b.homework),
    note: (b.note as string | null) ?? null,
    status: "pending",
    role: "assigner",
    assigner_name: null,
    assignee_name: who?.name ?? null,
    can_nudge: false,
    created_at: iso(now()),
    responded_at: null,
    done_at: null,
  };
  state.tasks.unshift(task);
  return { task };
});
on("POST", "/tasks/([^/]+)/remind", (m, b) => {
  const task = state.tasks.find((x) => x.id === m[1]);
  if (!task) throw new DemoHttpError(404);
  task.remind_at = (b.remind_at as string | null) ?? null;
  return { task };
});
on("POST", "/circles/([^/]+)/iftar", (m) => {
  const c = findCircle(m[1]!);
  c.posts.unshift({ id: id(), text: L("كريم عازمكم على الفطار 🌙", "Kareem invites you all to iftar 🌙"), created_at: iso(now()), kind: "iftar", my_rsvp: true });
  return null;
});
on("POST", "/circles/([^/]+)/posts/([^/]+)/rsvp", (m, b) => {
  const post = findCircle(m[1]!).posts.find((p) => p.id === m[2]);
  if (post) post.my_rsvp = Boolean(b.going);
  return null;
});

// Daftar
const findEntry = (eid: string) => {
  const e = state.daftar.find((x) => x.id === eid);
  if (!e) throw new DemoHttpError(404);
  return e;
};
on("GET", "/daftar", () => ({ entries: state.daftar.filter((e) => e.status !== "cancelled") }));
on("POST", "/daftar", (_m, b) => {
  const entry: DaftarEntry = {
    id: id(),
    other_name: String(b.other_name ?? ""),
    direction: b.direction === "i_owe" ? "i_owe" : "owed_to_me",
    amount: Number(b.amount ?? 0),
    currency: "EGP",
    note: (b.note as string) ?? null,
    status: "pending",
    mine: true,
    url: "https://zaki.app/d/DEMO3",
    pay_link: null,
    circle_id: null,
    created_at: iso(now()),
    responded_at: null,
    settled_at: null,
  };
  state.daftar.unshift(entry);
  return { entry, share_text: L(`سجّلت على زكي إن ${entry.direction === "owed_to_me" ? "ليا عندك" : "عليا ليك"} ${entry.amount} جنيه. أكّد هنا: ${entry.url}`, `I noted on Zaki that ${entry.direction === "owed_to_me" ? "you owe me" : "I owe you"} EGP ${entry.amount}. Confirm here: ${entry.url}`) };
});
on("POST", "/daftar/([^/]+)/share", (m) => {
  const e = findEntry(m[1]!);
  return { entry: e, share_text: e.status === "pending" ? L(`أكّد هنا: ${e.url}`, `Confirm here: ${e.url}`) : L(`فكرة صغيرة من زكي: ${e.amount} جنيه 💛`, `A gentle note from Zaki: EGP ${e.amount} 💛`) };
});
on("POST", "/daftar/open/([^/]+)", () => ({ entry: state.daftar[0], share_text: null }));
on("POST", "/daftar/([^/]+)/respond", (m, b) => {
  const e = findEntry(m[1]!);
  e.status = b.answer === "dispute" ? "disputed" : "confirmed";
  e.responded_at = iso(now());
  return { entry: e, share_text: null };
});
on("POST", "/daftar/([^/]+)/settle", (m) => {
  const e = findEntry(m[1]!);
  e.status = "settled";
  e.settled_at = iso(now());
  return { entry: e, share_text: null };
});
on("POST", "/daftar/([^/]+)/cancel", (m) => {
  findEntry(m[1]!).status = "cancelled";
  return null;
});

// Tasks
const findTask = (tid: string) => {
  const t = state.tasks.find((x) => x.id === tid);
  if (!t) throw new DemoHttpError(404);
  return t;
};
on("GET", "/tasks", () => ({ tasks: state.tasks }));
on("POST", "/tasks/([^/]+)/respond", (m, b) => {
  const t = findTask(m[1]!);
  t.status = b.answer === "accept" ? "accepted" : "declined";
  t.responded_at = iso(now());
  if (t.status === "accepted") state.items.push(item({ title: t.title, type: "task", due_at: t.due_at }));
  return { task: t };
});
on("POST", "/tasks/([^/]+)/done", (m) => {
  const t = findTask(m[1]!);
  t.status = "done";
  t.done_at = iso(now());
  return { task: t };
});
on("POST", "/tasks/([^/]+)/cancel", (m) => {
  const t = findTask(m[1]!);
  t.status = "cancelled";
  return { task: t };
});
on("POST", "/tasks/([^/]+)/nudge", (m) => {
  const t = findTask(m[1]!);
  t.can_nudge = false;
  return { task: t };
});

// Trackers
const findTracker = (tid: string) => {
  const t = state.trackers.find((x) => x.id === tid);
  if (!t) throw new DemoHttpError(404);
  return t;
};
on("GET", "/trackers", () => trackersResponse());
on("POST", "/trackers", (_m, b) => {
  const own = state.trackers.filter((t) => !t.pack).length;
  if (!state.user.pro && own >= 1) throw new DemoHttpError(402);
  const kind = b.kind as TrackerKind;
  const tpl = TRACKER_TEMPLATES[kind];
  const row: TrackerRow = { id: id(), kind, name: (b.name as string) ?? null, goal: (b.goal as number) ?? tpl.goal, pack: null, week: [0, 0, 0, 0, 0, 0, 0], total: 0, created_at: iso(now()) };
  state.trackers.push(row);
  return { tracker: toTracker(row) };
});
on("POST", "/trackers/([^/]+)/entries", (m, b) => {
  const r = findTracker(m[1]!);
  const step = typeof b.amount === "number" ? b.amount : TRACKER_TEMPLATES[r.kind].step || 1;
  r.week[6] = r.week[6]! + step;
  r.total += step;
  return { tracker: toTracker(r) };
});
on("POST", "/trackers/([^/]+)/undo", (m) => {
  const r = findTracker(m[1]!);
  const step = TRACKER_TEMPLATES[r.kind].step || r.week[6]!;
  r.week[6] = Math.max(0, r.week[6]! - step);
  r.total = Math.max(0, r.total - step);
  return { tracker: toTracker(r) };
});
on("DELETE", "/trackers/([^/]+)", (m) => {
  state.trackers = state.trackers.filter((t) => t.id !== m[1]);
  return null;
});
on("POST", "/trackers/ramadan-pack", () => {
  throw new DemoHttpError(409);
});

// Session
const HELPLINE = L("لو حاسس إنك مش بخير خالص، كلّم الخط الساخن للصحة النفسية ١٦٣٢٨ (مجاني).", "If you feel really unwell, call the mental health line 16328 (free, Egypt).");
const sessionMsg = (role: "user" | "zaki", text: string, step: SessionMessage["step"] = null): SessionMessage => ({ id: id(), role, text, created_at: iso(now()), step });
on("GET", "/session", () => ({
  available: true,
  allowed: true,
  consented: state.session.consented,
  free_left: state.user.pro ? null : 1,
  next_free_at: null,
  open: state.session.open,
  moods: state.session.moods,
  helpline: "16328",
}));
on("POST", "/session/consent", () => {
  state.session.consented = true;
  return null;
});
on("POST", "/session/start", (_m, b) => {
  const mood = Number(b.mood ?? 3);
  state.session.moods.push({ at: iso(now()), mood });
  const open = mood <= 2 ? L("شكراً إنك جيت. باين إن اليوم تقيل عليك شوية 💛", "Thank you for coming. It sounds like today feels heavy 💛") : L("حلو إنك خدت الوقت ده لنفسك 🌿", "I'm glad you took this time for yourself 🌿");
  state.session.open = {
    id: id(),
    mode: (b.mode as Session["mode"]) ?? "talk",
    mood,
    started_at: iso(now()),
    ended_at: null,
    messages: [
      sessionMsg("zaki", L("قبل ما نبدأ: أنا زكي، صاحب بيسمعك، مش دكتور ولا معالج. لو احتجت مساعدة متخصصة هقولك.", "Before we start: I'm Zaki, a friend who listens, not a doctor or a therapist. If you need professional help, I'll tell you.")),
      sessionMsg("zaki", `${open} ${L("إيه أكتر حاجة شاغلة بالك دلوقتي؟", "What's on your mind the most right now?")}`),
    ],
  };
  return { session: state.session.open };
});
on("POST", "/session/([^/]+)/messages", (_m, b) => {
  const s = state.session.open;
  if (!s) throw new DemoHttpError(404);
  const user = sessionMsg("user", String(b.text ?? ""));
  const turns = s.messages.filter((x) => x.role === "user").length;
  const crisis = /انتحر|اموت نفسي|أموت نفسي|kill myself|suicide|end my life/i.test(user.text);
  const reply = crisis
    ? sessionMsg("zaki", `${L("أنا سامعك، واللي بتحس بيه مهم جداً. إنت مش لوحدك.", "I hear you, and what you feel really matters. You're not alone.")} ${HELPLINE}`)
    : turns === 0
      ? sessionMsg("zaki", L("مفهوم جداً إنك تحس كده. لو تقدر، احكيلي أكتر: إمتى بدأت تحس بالإحساس ده؟", "That makes a lot of sense. If you can, tell me more: when did this feeling start?"))
      : sessionMsg("zaki", L("شكراً إنك شاركتني ده. إيه رأيك في خطوة صغيرة: تمشي ١٠ دقايق النهارده بعد المغرب؟", "Thanks for sharing that with me. How about one small step: a 10-minute walk this evening?"), {
          title: L("تمشية ١٠ دقايق", "10-minute walk"),
          remind_at: atLocal(0, 18, 30),
          accepted: false,
        });
  s.messages.push(user, reply);
  return { messages: [user, reply], ended: false };
});
on("POST", "/session/([^/]+)/end", () => {
  const s = state.session.open;
  if (!s) throw new DemoHttpError(404);
  s.messages.push(sessionMsg("zaki", L("شكراً إنك اتكلمت معايا النهارده. خلي بالك من نفسك، وأنا هنا وقت ما تحب 💛", "Thank you for talking with me today. Take care of yourself; I'm here whenever you like 💛")));
  s.ended_at = iso(now());
  const done = s;
  state.session.open = null;
  return { session: done };
});
on("POST", "/session/steps/([^/]+)/remind", (m) => {
  const s = state.session.open;
  const step = s?.messages.find((x) => x.id === m[1])?.step;
  if (step) {
    step.accepted = true;
    state.items.push(item({ title: step.title, due_at: step.remind_at, remind_at: step.remind_at }));
  }
  return null;
});
on("DELETE", "/session", () => {
  state.session = { consented: false, open: null, moods: [] };
  return null;
});

/** Answers one API call the way the server would. Throws `{ status }` like the real client. */
export async function demoRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const method = (init.method ?? "GET").toUpperCase();
  const url = new URL(path, "https://demo.local");
  const body = typeof init.body === "string" && init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  // A short pause so loading states and Zaki's typing dots are visible, as on a phone.
  await new Promise((r) => setTimeout(r, path === "/messages" && method === "POST" ? 900 : 120));
  for (const [m, re, fn] of routes) {
    if (m !== method) continue;
    const match = url.pathname.match(re);
    if (!match) continue;
    const out = fn(match, body, url.searchParams);
    persist();
    // Round-trip through JSON so screens never share objects with this store.
    return out === null || out === undefined ? null : JSON.parse(JSON.stringify(out));
  }
  throw new DemoHttpError(404);
}

export { DemoHttpError };
