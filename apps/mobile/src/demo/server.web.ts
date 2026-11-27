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
  type MoneySection,
  type SectionDetail,
  type Message,
  type Session,
  type SessionMessage,
  type Split,
  splitBill,
  type SplitInput,
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
const ALI = "u-ali";
/** Raised when the sample data changes shape: a saved preview from before starts over. */
const SEED = 2;

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
  /** Days 1..23 before the week, oldest first (the month graph is these plus `week`). */
  earlier?: number[];
  total: number;
  ask_times?: string[];
  unit_label?: string | null;
  circle_id?: string | null;
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
  /** Spending sections (older saved demos have none: seeded on first use). */
  money?: SectionRow[];
  /** Split bills (seeded on first use, like the sections). */
  splits?: Split[];
  /** Item id of the status check Zaki just asked about (shows the "did Youssef pay you back?" flow). */
  pending_status?: string | null;
  status_asked?: boolean;
  language: string;
  seed?: number;
}

const feedPost = (text: string, created_at: string, over: Partial<CirclePost> = {}): CirclePost => ({
  id: id(),
  text,
  created_at,
  kind: null,
  my_rsvp: null,
  reactions: [],
  my_reaction: null,
  comments: [],
  comment_count: 0,
  ...over,
});

interface SectionRow {
  id: string;
  name: string;
  kind: "expense" | "income";
  budget: number | null;
  circle_id: string | null;
  entries: { id: string; amount: number; note: string | null; at: string; payer: string | null; mine: boolean; split: number }[];
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
  alarm: false,
  nudge: null,
  status: "open",
  debt_person: null,
  debt_amount: null,
  debt_direction: null,
  follow_up_at: null,
  repeat_every_minutes: null,
    place: null,
    place_on: null,
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
    family_type: "mixed",
    created_at: inHours(-24 * 30),
    members: [
      member(ME, null, { role: "owner", family_role: "adult", last_checkin: { kind: "home", note: null, at: inHours(-14) } }),
      member(MAMA, L("ماما", "Mum"), { family_role: "parent", last_checkin: { kind: "medicine", note: null, at: inHours(-2) } }),
      member(BABA, L("بابا", "Dad"), { family_role: "elder", last_checkin: { kind: "ok", note: null, at: inHours(-5) } }),
      member(SARA, L("سارة", "Sara"), { family_role: "adult", last_checkin: { kind: "arrived", note: null, at: inHours(-1) } }),
      member(ALI, L("علي", "Ali"), { family_role: "teen" }),
    ],
    invites: [],
    posts: [
      feedPost(L("ماما طلبت من سارة تحجز ميعاد الدكتور، وسارة وافقت 👍", "Mum asked Sara to book the doctor, and Sara said yes 👍"), inHours(-3), {
        reactions: [{ key: "heart", count: 2 }, { key: "clap", count: 1 }],
        comments: [{ id: id(), author_name: L("بابا", "Dad"), is_mine: false, is_zaki: false, text: L("تسلمي يا سارة 💛", "Thank you Sara 💛"), created_at: inHours(-2) }],
        comment_count: 1,
      }),
      feedPost(L("بابا: أنا تمام 💛", "Dad: I'm okay 💛"), inHours(-5), { reactions: [{ key: "pray", count: 3 }] }),
      feedPost(L("علي سلّم واجب الحساب صفحة 14 📚", "Ali handed in Math homework page 14 📚"), inHours(-6)),
      feedPost(L("سارة ضافت «لبن» لقايمة البقالة", "Sara added “milk” to the groceries list"), inHours(-9)),
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
    posts: [feedPost(L("تمّت: يحجز الملعب يوم الجمعة ✅ تسلم الإيد يا يوسف!", "Youssef finished: book the pitch for Friday ✅ Thank you, Youssef!"), inHours(-20), { reactions: [{ key: "strong", count: 2 }] })],
  };

  const task = (over: Partial<CircleTask> & Pick<CircleTask, "title" | "role">): CircleTask => ({
    id: id(),
    circle_id: family.id,
    circle_name: family.name,
    due_at: null,
    remind_at: null,
    homework: false,
    note: null,
    subject: null,
    reward: null,
    submission: null,
    submitted_at: null,
    review: null,
    review_note: null,
    photo_ids: [],
    status: "pending",
    assigner_name: null,
    assignee_name: null,
    assignee_id: null,
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
      gender: null,
      brief_topics: ["football", "ai"],
      brief_time: "08:00",
      created_at: inHours(-24 * 3),
      last_active_at: iso(now()),
    },
    items: [
      item({ title: L("كلّم تيتة", "Call grandma"), due_at: atLocal(0, 20), remind_at: atLocal(0, 19, 45), important: true }),
      item({ title: L("ميعاد الدكتور", "Doctor's appointment"), due_at: atLocal(1, 18), remind_at: atLocal(1, 17) }),
      item({ title: L("اصحى للشغل", "Wake up for work"), due_at: atLocal(1, 6, 30), remind_at: atLocal(1, 6, 30), alarm: true }),
      item({ title: L("هات عيش", "Buy bread"), type: "task", place: L("السوبر ماركت", "the supermarket"), place_on: "arrive" }),
      item({ title: L("ادفع فاتورة النت", "Pay the internet bill"), type: "task", due_at: atLocal(3, 12) }),
      item({ title: L("هدية عيد ميلاد مريم", "Mariam's birthday present"), type: "task" }),
      item({ title: L("يوسف · 200", "Youssef · 200"), type: "debt", debt_person: L("يوسف", "Youssef"), debt_amount: 200, debt_direction: "owed_to_me" }),
    ],
    memories: [
      { id: id(), user_id: ME, kind: "person", subject: L("سارة", "Sara"), content: L("أختك، بتشتغل دكتورة أسنان", "Your sister, a dentist"), last_used_at: null, created_at: inHours(-48) },
      { id: id(), user_id: ME, kind: "preference", subject: L("القهوة", "Coffee"), content: L("بتحب القهوة من غير سكر", "You take your coffee without sugar"), last_used_at: null, created_at: inHours(-40) },
      { id: id(), user_id: ME, kind: "fact", subject: L("الجيم", "Gym"), content: L("بتروح الجيم الصبح 3 مرات في الأسبوع", "You go to the gym three mornings a week"), last_used_at: null, created_at: inHours(-30) },
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
      // Sara wrote this one: it waits for "right / not right" (Today's Needs you).
      {
        id: id(), other_name: L("سارة", "Sara"), direction: "i_owe", amount: 150, currency: "EGP", note: L("هدية ماما", "Mum's present"), status: "pending", mine: false,
        url: null, pay_link: null, circle_id: family.id, created_at: inHours(-7), responded_at: null, settled_at: null,
      },
    ],
    tasks: [
      task({ title: L("هات عيش وانت راجع", "Grab bread on your way home"), role: "assignee", assigner_name: L("ماما", "Mum"), assignee_name: null, due_at: atLocal(0, 21) }),
      task({ title: L("واجب العربي: تعبير عن الشتا", "Arabic homework: a short essay on winter"), role: "assigner", assigner_name: null, assignee_name: L("علي", "Ali"), status: "accepted", responded_at: inHours(-1), homework: true, subject: L("عربي", "Arabic"), reward: 10, assignee_id: ALI, note: L("صفحة 40 في الكتاب https://example.com/hw", "Page 40 in the book https://example.com/hw"), remind_at: atLocal(0, 18), due_at: atLocal(0, 21) }),
      // Handed in, waiting for the parent's "Well done" or "Redo" (Today's Needs you, Homework's To review).
      task({ title: L("واجب الحساب صفحة 14", "Math homework page 14"), role: "assigner", assignee_name: L("علي", "Ali"), assignee_id: ALI, status: "done", responded_at: inHours(-20), done_at: inHours(-6), submitted_at: inHours(-6), submission: L("خلصت المسائل كلها، والسؤال 4 مش متأكد منه.", "I did all the sums; not sure about question 4."), homework: true, subject: L("حساب", "Math"), reward: 10, created_at: inHours(-26), due_at: atLocal(0, 8) }),
      task({ title: L("تحجز ميعاد الدكتور لبابا", "Book Dad's doctor appointment"), role: "assigner", assigner_name: null, assignee_name: L("سارة", "Sara"), status: "accepted", responded_at: inHours(-3), can_nudge: true }),
      task({
        title: L("يحجز الملعب يوم الجمعة", "Book the pitch for Friday"), role: "watcher", circle_id: friends.id, circle_name: friends.name,
        assigner_name: L("عمر", "Omar"), assignee_name: L("يوسف", "Youssef"), status: "done", done_at: inHours(-20),
      }),
    ],
    trackers: [
      { id: id(), kind: "water", name: null, goal: 8, pack: null, week: week([6, 8, 7, 8, 5, 8, 5]), earlier: [4, 6, 8, 8, 5, 7, 8, 3, 6, 8, 8, 8, 7, 6, 5, 8, 8, 4, 6, 7, 8, 8, 6], total: 47, ask_times: ["13:00", "18:00"], created_at: inHours(-24 * 6) },
    ],
    session: { consented: false, open: null, moods: [{ at: inHours(-24 * 5), mood: 3 }, { at: inHours(-24 * 2), mood: 4 }] },
    messages: [],
    served_morning: false,
    language,
    seed: SEED,
  };
}

const KEY = "zaki-web-demo-state";
function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as State) : null;
    // Sample data is written in one language: start over when the user switches.
    if (saved && saved.language === language && saved.seed === SEED) return saved;
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
    month: [...(r.earlier ?? Array<number>(23).fill(0)), ...r.week],
    ask_times: r.ask_times ?? [],
    unit_label: r.unit_label ?? null,
    circle_id: r.circle_id ?? null,
    circle_name: state.circles.find((c) => c.id === r.circle_id)?.name ?? null,
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
  actions: [],
});

// ---------- Zaki's action cards (what he does in the app from the chat) ----------
type DemoCard = Message["actions"][number];
/** Pending cards by id: what happens on Send. */
const cardJobs = new Map<string, { messageId: string; run: () => { label: string; route: string | null } }>();
const card = (kind: string, status: DemoCard["status"], label: string, route: string | null = null): DemoCard => ({ id: id(), kind, status, label, route });

function answerCard(m: Message, cardId: string, confirm: boolean): DemoCard | null {
  const i = m.actions.findIndex((c) => c.id === cardId);
  const c = m.actions[i];
  if (!c) return null;
  if (c.status !== "pending") return c;
  const job = cardJobs.get(cardId);
  cardJobs.delete(cardId);
  const next: DemoCard = confirm && job ? { ...c, status: "done", ...job.run() } : { ...c, status: "cancelled", label: L("اتلغت", "Cancelled") };
  m.actions = m.actions.map((x) => (x.id === cardId ? next : x));
  return next;
}

/** A few phrases the preview acts on, the way the real Zaki does with the model. */
function demoActions(text: string): { reply: string; cards: DemoCard[]; jobs: [string, () => { label: string; route: string | null }][] } | null {
  const t = text.trim();
  // "قول لمنى تجيب عيش" / "ask Omar to bring the cake": a task for a circle member, after a Send.
  const ask = /^(?:قول|قولي|اطلب من|ask|tell)\s+(?:لـ\s*|ل)?(\S+)\s+(?:to\s+|ي|ت)?(.+)$/i.exec(t);
  if (ask) {
    const name = ask[1]!.replace(/^ل/, "");
    for (const c of state.circles) {
      const who = c.members.find((x) => x.name && (x.name === name || x.name.includes(name) || name.includes(x.name)));
      if (!who || who.user_id === ME) continue;
      const title = ask[2]!.trim();
      const pending = card("assign_task", "pending", L(`أطلب من ${who.name} (${c.name}): «${title}»؟`, `Ask ${who.name} (${c.name}): “${title}”?`), `/circle/${c.id}`);
      return {
        reply: L(`أبعتها لـ${who.name}؟`, `Shall I send it to ${who.name}?`),
        cards: [pending],
        jobs: [[pending.id, () => ({ label: L(`اتبعتت لـ ${who.name}: «${title}». هتتسجل أول ما الموافقة توصل.`, `Sent to ${who.name}: “${title}”. It's theirs once they say yes.`), route: `/circle/${c.id}` })]],
      };
    }
  }
  // "اعملي قسم للجيم ميزانيته 500" / "make a section for the gym, budget 500"
  const section = /(?:اعمل|اعملي|عملي|make|create)\s+(?:لي\s+|me\s+)?(?:a\s+|new\s+)?(?:قسم|section)\s+(?:جديد\s+)?(?:لل|ل|for\s+(?:my\s+|the\s+)?)?([^\d\s]+)(?:\D*(\d+))?/i.exec(t);
  if (section) {
    const name = section[1]!.trim();
    const budget = section[2] ? Number(section[2]) : null;
    const row: SectionRow = { id: id(), name, kind: "expense", budget, circle_id: null, entries: [] };
    money().push(row);
    const label = L(`قسم جديد «${name}»${budget ? ` · ميزانية ${budget} جنيه في الشهر` : ""}`, `New section “${name}”${budget ? ` · budget EGP ${budget} a month` : ""}`);
    return { reply: L(`تمام، عملتلك قسم «${name}» 👌`, `Done, “${name}” is ready 👌`), cards: [card("create_section", "done", label, `/money/${row.id}`)], jobs: [] };
  }
  // "دفعت 300 في مصاريف البيت": a shared book, so ask first.
  const spent = /(?:دفعت|صرفت|spent|paid)\s+(\d+)\s*(?:جنيه\s*)?(?:على|علي|في|on|for|in)\s*(.+)$/i.exec(t);
  if (spent) {
    const book = money().find((x) => x.circle_id && (spent[2]!.includes(x.name) || x.name.includes(spent[2]!.trim())));
    if (book) {
      const amount = Number(spent[1]);
      const pending = card("log_money", "pending", L(`أضيف ${amount} جنيه في الدفتر المشترك «${book.name}»؟ كل اللي فيه هيشوفوها.`, `Add EGP ${amount} to the shared book “${book.name}”? Everyone in it will see it.`), `/money/${book.id}`);
      return {
        reply: L("ده دفتر مشترك، أضيفها؟", "That's a shared book, shall I add it?"),
        cards: [pending],
        jobs: [[pending.id, () => {
          book.entries.push({ id: id(), amount, note: null, at: iso(now()), payer: null, mine: true, split: 3 });
          return { label: L(`مصروف ${amount} جنيه في «${book.name}»`, `Spent EGP ${amount} in “${book.name}”`), route: `/money/${book.id}` };
        }]],
      };
    }
  }
  return null;
}

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
        ? L("صباح الفل يا كريم ☀️ النهارده عندك تكلّم تيتة الساعة 8. ومتنساش تشرب مية، إنت لسه في البداية 💧", "Good morning, Kareem ☀️ Today you're calling grandma at 8. And don't forget your water 💧")
        : hour < 18
          ? L("أهلاً يا كريم 👋 عامل إيه النهارده؟ لو عندك حاجة عايز تفتكرها، قولّي وأنا أشيلها عنك.", "Hey Kareem 👋 How's your day going? Tell me anything you want to remember and I'll hold on to it.")
          : L("مساء الخير يا كريم 🌙 يومك كان عامل إزاي؟ لسه فاضل مكالمة تيتة الساعة 8.", "Good evening, Kareem 🌙 How was your day? There's still grandma's call at 8.");
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
  // A plain yes or no to Zaki's waiting cards.
  const lastFriend = [...state.messages].reverse().find((x) => x.role === "friend");
  const waiting = lastFriend?.actions.filter((c) => c.status === "pending") ?? [];
  const no = /^(?:لا|لأ|بلاش|no|cancel|la2)(?:\s|$)/i.test(text.trim());
  const yes = isPlainYes(text) || /^(?:اه\s+)?(?:ابعت|ابعتها|ضيف|ضيفها|ماشي|send|add|ok)(?:\s|$)/i.test(text.trim());
  if (lastFriend && waiting.length && (yes || no)) {
    const answered = waiting.map((c) => answerCard(lastFriend, c.id, !no)).filter((c): c is DemoCard => !!c);
    const done = { ...msg("friend", no ? L("تمام، لغيتها.", "Okay, cancelled.") : L("تمام، عملتها ✅", "Done ✅"), `${clientId}:reply:0`), actions: answered };
    state.messages.push(userMsg, done);
    return { message: userMsg, replies: [done], items: [], memories: [], duplicate: false, ai_allowance: { limit: null, used: 0 } };
  }
  const acted = demoActions(text);
  if (acted) {
    const done = { ...msg("friend", acted.reply, `${clientId}:reply:0`), actions: acted.cards };
    for (const [cardId, run] of acted.jobs) cardJobs.set(cardId, { messageId: done.id, run });
    state.messages.push(userMsg, done);
    return { message: userMsg, replies: [done], items: [], memories: [], duplicate: false, ai_allowance: { limit: null, used: 0 } };
  }
  // "دفعت 300 بنزين": logged to a spending section by rules, as on the server.
  const spent = /(?:^|\s)(?:دفعت|صرفت|اشتريت|spent|paid)\s+(\d+)\s*(?:جنيه\s*)?(?:على|علي|في|on|for)?\s*(.*)$/i.exec(text.trim());
  if (spent && !/سلف|عليا|ليا|owe|lent|[?؟]/.test(text)) {
    const amount = Number(spent[1]);
    const note = spent[2]?.trim() || null;
    const sections = money().filter((x) => x.kind === "expense" && !x.circle_id);
    const target = sections.find((x) => note && (note.includes(x.name) || x.entries.some((e) => e.note === note))) ?? sections[0];
    if (target) {
      target.entries.push({ id: id(), amount, note, at: iso(now()), payer: null, mine: true, split: 1 });
      const total = target.entries.reduce((n, e) => n + e.amount, 0);
      const done = msg("friend", L(`سجّلت ${amount} جنيه في «${target.name}». الشهر ده لحد دلوقتي: ${total.toLocaleString("en-US")}.`, `Logged EGP ${amount} in “${target.name}”. This month so far: ${total.toLocaleString("en-US")}.`), `${clientId}:reply:0`);
      state.messages.push(userMsg, done);
      return { message: userMsg, replies: [done], items: [], memories: [], duplicate: false, ai_allowance: { limit: null, used: 0 } };
    }
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

on("POST", "/messages/([^/]+)/actions/([^/]+)", (m, b) => {
  const found = state.messages.find((x) => x.id === m[1]);
  if (!found || !answerCard(found, m[2]!, b.confirm === true)) throw new DemoHttpError(404);
  return { message: found };
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
  const star = c.members.find((x) => x.name)?.name;
  return {
    since: inHours(-24 * 7),
    lines: [
      L(`نجم الأسبوع: ${star ?? "حد من الدايرة"} 🌟`, `Star of the week: ${star ?? "someone in the circle"} 🌟`),
      L(`${done} مهام خلصت الأسبوع ده`, `${done} tasks done this week`),
    ],
  };
});
on("GET", "/circles/([^/]+)/feed", (m) => {
  const c = findCircle(m[1]!);
  return { posts: c.posts, tasks: state.tasks.filter((t) => t.circle_id === c.id) };
});
const findPost = (cid: string, pid: string) => {
  const p = findCircle(cid).posts.find((x) => x.id === pid);
  if (!p) throw new DemoHttpError(404);
  // Posts saved by an older preview lack the feed fields.
  p.reactions ??= [];
  p.comments ??= [];
  p.comment_count ??= p.comments.length;
  return p;
};
on("POST", "/circles/([^/]+)/posts/([^/]+)/react", (m, b) => {
  const p = findPost(m[1]!, m[2]!);
  const key = (b.key as string | null) ?? null;
  const bump = (k: string, by: number) => {
    const r = p.reactions.find((x) => x.key === k);
    if (r) r.count += by;
    else if (by > 0) p.reactions.push({ key: k, count: by });
    p.reactions = p.reactions.filter((x) => x.count > 0);
  };
  if (p.my_reaction) bump(p.my_reaction, -1);
  if (key) bump(key, 1);
  p.my_reaction = key;
  return { post: p };
});
const ZAKI_HELP = L(
  "أقدر هنا أفكّر الكل بحاجة («زكي فكّر الكل بغدا الجمعة»)، أو أعمل ملخّص الأسبوع، أو أطلب من الكل يطمّنوا 💛",
  "Here I can remind everyone of something (“Zaki, remind everyone about Friday lunch”), give the week's summary, or ask everyone to check in 💛",
);
const zakiDemoAnswer = (c: CircleRow, text: string) => {
  const others = c.members.filter((x) => !x.is_me).length;
  if (/فكر|فكّر|ذكّر|remind/i.test(text)) return L(`تمام، فكّرت ${others} في الدايرة في الشات بتاعهم 💛`, `Done, I reminded ${others} people in their chats 💛`);
  if (/ملخص|ملخّص|الأسبوع|summary|week/i.test(text)) return L("خلّصتوا 3 مهام الأسبوع ده 🎉\n4 طمّنوا بعض الأسبوع ده 🤍", "You finished 3 tasks together this week 🎉\n4 check-ins to put each other's minds at ease 🤍");
  if (/طمن|طمّن|check/i.test(text)) return L(`سألت ${others} في الدايرة يطمّنوكم بدوسة 💛`, `I asked ${others} people to check in with one tap 💛`);
  return ZAKI_HELP;
};
const zakiComment = (text: string) => ({ id: id(), author_name: null, is_mine: false, is_zaki: true, text, created_at: iso(new Date(now().getTime() + 1)) });
on("POST", "/circles/([^/]+)/posts/([^/]+)/comments", (m, b) => {
  const c = findCircle(m[1]!);
  const p = findPost(m[1]!, m[2]!);
  const text = String(b.text ?? "");
  p.comments.push({ id: id(), author_name: state.user.name, is_mine: true, is_zaki: false, text, created_at: iso(now()) });
  if (/^\s*@?\s*(زكي|zaki)/i.test(text)) p.comments.push(zakiComment(zakiDemoAnswer(c, text)));
  p.comment_count = p.comments.length;
  return { post: p };
});
on("DELETE", "/circles/([^/]+)/comments/([^/]+)", (m) => {
  for (const p of findCircle(m[1]!).posts) {
    p.comments = (p.comments ?? []).filter((x) => x.id !== m[2]);
    p.comment_count = p.comments.length;
  }
  return null;
});
on("POST", "/circles/([^/]+)/zaki", (m, b) => {
  const c = findCircle(m[1]!);
  const text = String(b.text ?? "").replace(/^\s*@?\s*(زكي|zaki)\s*[،,:]?\s*/i, "");
  const p = feedPost(L(`${state.user.name ?? "إنت"} لزكي: «${text}»`, `${state.user.name ?? "You"} to Zaki: “${text}”`), iso(now()), { comments: [zakiComment(zakiDemoAnswer(c, text))], comment_count: 1 });
  c.posts.unshift(p);
  return { post: p };
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
    subject: b.homework ? ((b.subject as string | null) ?? null) : null,
    reward: b.homework ? ((b.reward as number | null) ?? null) : null,
    assignee_id: (b.assignee_id as string | null) ?? null,
    submission: null,
    submitted_at: null,
    review: null,
    review_note: null,
    photo_ids: [],
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
  c.posts.unshift(feedPost(L("كريم عازمكم على الفطار 🌙", "Kareem invites you all to iftar 🌙"), iso(now()), { kind: "iftar", my_rsvp: true }));
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
// Homework extras (2026-11-26): sample pocket money, a week at once, and Zaki's help (canned words).
let pocketPaid = 0;
const pocket = () => {
  const earned = 30;
  return {
    accounts: [
      {
        circle_id: "c-family",
        circle_name: L("بيت العيلة", "Our home"),
        child_id: ALI,
        child_name: L("علي", "Ali"),
        parent_id: ME,
        parent_name: L("كريم", "Kareem"),
        role: "parent",
        earned,
        paid: pocketPaid,
        balance: earned - pocketPaid,
        week_earned: 20,
        entries: [
          ...(pocketPaid ? [{ id: "pm-paid", kind: "paid", amount: pocketPaid, title: null, created_at: iso(now()) }] : []),
          { id: "pm-1", kind: "earned", amount: 10, title: L("واجب الحساب صفحة 12", "Math homework page 12"), created_at: inHours(-20) },
          { id: "pm-2", kind: "earned", amount: 10, title: L("حفظ النشيد", "Learn the poem"), created_at: inHours(-44) },
          { id: "pm-3", kind: "earned", amount: 10, title: L("تعبير عن المدرسة", "Essay about school"), created_at: inHours(-24 * 9) },
        ],
      },
    ],
  };
};

// Household lists (2026-11-26): one family grocery list with a few things, one ticked off.
type DemoItem = { id: string; title: string; qty: string | null; added_by_name: string | null; is_mine: boolean; done: boolean; done_by_name: string | null; done_at: string | null; created_at: string };
type DemoList = { id: string; name: string; place: string; circle_id: string | null; circle_name: string | null; is_owner: boolean; trip: { user_id: string; name: string | null; is_me: boolean; at: string } | null; items: DemoItem[]; updated_at: string };
const demoItem = (title: string, by: string | null, mine: boolean, hoursAgo: number, done = false): DemoItem => ({ id: id(), title, qty: null, added_by_name: by, is_mine: mine, done, done_by_name: done ? by : null, done_at: done ? inHours(-1) : null, created_at: inHours(-hoursAgo) });
const demoLists: DemoList[] = [
  {
    id: id(),
    name: L("البقالة", "Groceries"),
    place: "grocery",
    circle_id: "c-family",
    circle_name: L("بيت العيلة", "Our home"),
    is_owner: true,
    trip: null,
    items: [demoItem(L("بيض", "Eggs"), L("منى", "Mona"), false, 5), demoItem(L("لبن", "Milk"), null, true, 4), demoItem(L("عيش", "Bread"), L("يوسف", "Youssef"), false, 3), demoItem(L("رز", "Rice"), L("منى", "Mona"), false, 6, true)],
    updated_at: inHours(-1),
  },
];
const wireList = (l: DemoList) => ({ ...l, open_count: l.items.filter((i) => !i.done).length });
const findList = (lid: string) => demoLists.find((l) => l.id === lid) ?? demoLists[0]!;
const touched = (l: DemoList) => ({ list: wireList(Object.assign(l, { updated_at: iso(now()) })) });
on("GET", "/lists", () => ({ lists: demoLists.map(wireList) }));
on("POST", "/lists", (_m, b) => {
  const l: DemoList = { id: String(b.id ?? id()), name: String(b.name ?? ""), place: String(b.place ?? "grocery"), circle_id: (b.circle_id as string | null) ?? null, circle_name: b.circle_id ? L("البيت", "Home") : null, is_owner: true, trip: null, items: [], updated_at: iso(now()) };
  demoLists.unshift(l);
  return { list: wireList(l) };
});
on("POST", "/lists/([^/]+)/items", (m, b) => {
  const l = findList(m[1]!);
  for (const x of (b.items as { id?: string; title: string; qty?: string | null }[]) ?? []) l.items.push({ ...demoItem(x.title, null, true, 0), id: x.id ?? id(), qty: x.qty ?? null });
  return touched(l);
});
on("PATCH", "/lists/([^/]+)/items/([^/]+)", (m, b) => {
  const l = findList(m[1]!);
  l.items = l.items.map((i) => (i.id === m[2] ? { ...i, done: Boolean(b.done), done_by_name: b.done ? L("إنت", "You") : null, done_at: b.done ? iso(now()) : null } : i));
  return touched(l);
});
on("DELETE", "/lists/([^/]+)/items/([^/]+)", (m) => {
  const l = findList(m[1]!);
  l.items = l.items.filter((i) => i.id !== m[2]);
  return touched(l);
});
on("POST", "/lists/([^/]+)/clear", (m) => {
  const l = findList(m[1]!);
  l.items = l.items.filter((i) => !i.done);
  return touched(l);
});
on("POST", "/lists/([^/]+)/trip", (m, b) => {
  const l = findList(m[1]!);
  l.trip = b.going ? { user_id: "me", name: null, is_me: true, at: iso(now()) } : null;
  return touched(l);
});
on("DELETE", "/lists/([^/]+)", (m) => {
  const i = demoLists.findIndex((l) => l.id === m[1]);
  if (i >= 0) demoLists.splice(i, 1);
  return null;
});
// A gam'eya that started last month: my turn is next month, two of five paid this month.
const gMonth = (n: number) => {
  const d = new Date(now());
  d.setDate(15);
  d.setMonth(d.getMonth() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const demoGameya = {
  id: "g-demo",
  name: L("جمعية الشغل", "Work gam'eya"),
  amount: 1000,
  currency: "EGP",
  pay_day: 5,
  start_month: gMonth(-1),
  months: 5,
  pot: 5000,
  circle_id: null,
  circle_name: null,
  code: "demo",
  url: "https://zaki.preview/g/demo",
  mine: true,
  owner_name: null,
  instapay: null,
  members: [L("سارة", "Sara"), L("أنا", "Me"), L("منى", "Mona"), L("يوسف", "Youssef"), L("هبة", "Heba")].map((name, i) => ({ id: `gm${i + 1}`, name, user_id: null, turn: i + 1, month: gMonth(i - 1), received: i === 0, is_me: i === 1 })),
  payments: [1, 2, 3, 4, 5].map((n) => ({ member_id: `gm${n}`, round: 1 })).concat([{ member_id: "gm1", round: 2 }, { member_id: "gm3", round: 2 }]),
  round: 2,
  created_at: iso(now()),
};
const gameyaAnswer = () => ({ gameya: demoGameya, share_text: demoGameya.name });
on("GET", "/gameyas", () => ({ gameyas: [demoGameya] }));
on("GET", "/gameyas/([^/]+)", () => gameyaAnswer());
on("POST", "/gameyas", (_m, b) => ({ gameya: { ...demoGameya, name: String(b.name ?? demoGameya.name) }, share_text: String(b.name ?? "") }));
on("POST", "/gameyas/([^/]+)/paid", (_m, b) => {
  demoGameya.payments = demoGameya.payments.filter((p) => !(p.member_id === b.member_id && p.round === b.round));
  if (b.paid) demoGameya.payments.push({ member_id: String(b.member_id), round: Number(b.round) });
  return gameyaAnswer();
});
on("POST", "/gameyas/([^/]+)/received", (_m, b) => {
  demoGameya.members = demoGameya.members.map((m) => (m.turn === b.round ? { ...m, received: Boolean(b.received) } : m));
  return gameyaAnswer();
});
on("POST", "/gameyas/([^/]+)/remind", () => ({ reminded: 0, share_text: demoGameya.name }));
on("GET", "/pocket-money", () => pocket());
on("POST", "/pocket-money/paid", (_m, b) => {
  pocketPaid = Math.min(30, pocketPaid + Number(b.amount ?? 0));
  return pocket();
});
on("POST", "/circles/([^/]+)/homework", (m, b) => {
  const c = findCircle(m[1]!);
  const who = c.members.find((x) => x.user_id === b.assignee_id);
  const items = (b.items as { title: string; subject?: string | null; due_at?: string | null; reward?: number | null }[]) ?? [];
  const tasks = items.map((i) => ({
    ...state.tasks[0]!,
    id: id(),
    circle_id: c.id,
    circle_name: c.name,
    title: i.title,
    due_at: i.due_at ?? null,
    remind_at: null,
    homework: true,
    note: null,
    subject: i.subject ?? null,
    reward: i.reward ?? null,
    submission: null,
    submitted_at: null,
    review: null,
    review_note: null,
    photo_ids: [],
    status: "pending" as const,
    role: "assigner" as const,
    assigner_name: null,
    assignee_name: who?.name ?? null,
    assignee_id: (b.assignee_id as string) ?? null,
    can_nudge: false,
    created_at: iso(now()),
    responded_at: null,
    done_at: null,
  }));
  state.tasks.unshift(...tasks);
  return { tasks };
});
const allowance = { limit: null, used: 1 };
on("POST", "/homework/help", () => ({
  help: {
    explain: L("الكسر يعني جزء من حاجة كاملة. لما نجمع كسرين لازم المقامات (اللي تحت) تبقى زي بعض الأول، وبعدين نجمع اللي فوق بس.", "A fraction is part of a whole. To add two fractions, the bottom numbers must match first; then add only the top numbers."),
    teach: L("هاتي رغيف عيش وقسّميه نصين، وبعدين كل نص لنصين: النص بقى ربعين. كده الطفل يشوف ليه بنوحّد المقامات.", "Cut a loaf in half, then each half in two: a half is now two quarters. Your child sees why the bottoms must match."),
    practice: ["1/2 + 1/4 = ?", "1/3 + 1/6 = ?", "3/4 − 1/2 = ?"],
    answers: ["3/4", "1/2", "1/4"],
  },
  error: null,
  helpline: null,
  ai_allowance: allowance,
}));
on("POST", "/tasks/([^/]+)/check", () => ({
  check: { praise: L("خطك واضح وخطواتك مرتبة 👏", "Your steps are neat and clear 👏"), hints: [L("في سؤال 2: قبل ما تجمع، المقامات بقت زي بعض؟", "Question 2: before adding, are the bottom numbers the same?")] },
  error: null,
  helpline: null,
  ai_allowance: allowance,
}));
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
on("POST", "/tasks/([^/]+)/review", (m, b) => {
  const t = findTask(m[1]!);
  const redo = b.verdict === "redo";
  t.review = redo ? "redo" : "approved";
  t.review_note = (b.note as string) ?? null;
  if (redo) Object.assign(t, { status: "accepted", done_at: null, submission: null, submitted_at: null });
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
  const row: TrackerRow = {
    id: id(),
    kind,
    name: (b.name as string) ?? null,
    goal: (b.goal as number) ?? tpl.goal,
    pack: null,
    week: [0, 0, 0, 0, 0, 0, 0],
    total: 0,
    ask_times: (b.ask_times as string[]) ?? [],
    unit_label: (b.unit_label as string) ?? null,
    circle_id: (b.circle_id as string) ?? null,
    created_at: iso(now()),
  };
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
on("PATCH", "/trackers/([^/]+)", (m, b) => {
  const r = findTracker(m[1]!);
  if (Array.isArray(b.ask_times)) r.ask_times = b.ask_times as string[];
  if (b.circle_id !== undefined) r.circle_id = (b.circle_id as string | null) ?? null;
  return { tracker: toTracker(r) };
});
on("GET", "/circles/([^/]+)/trackers", (m) => {
  const c = findCircle(m[1]!);
  const mine = state.trackers.filter((r) => r.circle_id === c.id).map((r) => {
    const tr = toTracker(r);
    return { id: tr.id, owner_name: null, is_mine: true, kind: tr.kind, name: tr.name, unit_label: tr.unit_label, goal: tr.goal, today: tr.today, streak: tr.streak, week: tr.week };
  });
  const theirs = c.kind === "friends" && c.members.length > 2
    ? [{ id: "demo-shared-1", owner_name: c.members.find((x) => !x.is_me)?.name ?? null, is_mine: false, kind: "gym" as const, name: null, unit_label: null, goal: 1, today: 1, streak: 4, week: [1, 0, 1, 1, 1, 1, 1] }]
    : [];
  return { trackers: [...theirs, ...mine] };
});
on("DELETE", "/trackers/([^/]+)", (m) => {
  state.trackers = state.trackers.filter((t) => t.id !== m[1]);
  return null;
});
on("POST", "/trackers/ramadan-pack", () => {
  throw new DemoHttpError(409);
});

// Wider Daftar
const money = (): SectionRow[] => {
  if (!state.money) {
    const family = state.circles.find((c) => c.kind === "family");
    const e = (amount: number, note: string | null, hoursAgo: number, payer: string | null = null, split = 1) => ({ id: id(), amount, note, at: inHours(-hoursAgo), payer, mine: payer === null, split });
    state.money = [
      { id: id(), name: L("العربية", "Car"), kind: "expense", budget: 1500, circle_id: null, entries: [e(500, L("بنزين", "fuel"), 30), e(350, L("صيانة", "service"), 120), e(420, L("بنزين", "fuel"), 200)] },
      { id: id(), name: L("الأكل", "Food"), kind: "expense", budget: 3000, circle_id: null, entries: [e(1200, L("سوبر ماركت", "groceries"), 50), e(600, L("أكل بره", "eating out"), 10)] },
      { id: id(), name: L("المرتب", "Salary"), kind: "income", budget: null, circle_id: null, entries: [e(9000, null, 400)] },
      ...(family
        ? [{ id: id(), name: L("مصاريف البيت", "House expenses"), kind: "expense" as const, budget: null, circle_id: family.id, entries: [e(300, L("خضار", "vegetables"), 20, L("ماما", "Mum"), 3), e(120, L("عيش", "bread"), 5, null, 3)] }]
        : []),
    ];
  }
  return state.money;
};
const toSection = (r: SectionRow): MoneySection => {
  const total = r.entries.reduce((n, x) => n + x.amount, 0);
  const share = r.circle_id ? r.entries.reduce((n, x) => n + x.amount / x.split, 0) : total;
  return { id: r.id, name: r.name, kind: r.kind, budget: r.budget, circle_id: r.circle_id, circle_name: state.circles.find((c) => c.id === r.circle_id)?.name ?? null, is_owner: true, month_total: total, my_share: Math.round(share * 100) / 100, created_at: inHours(-24 * 30) };
};
const findSection = (sid: string) => {
  const r = money().find((x) => x.id === sid);
  if (!r) throw new DemoHttpError(404);
  return r;
};
on("GET", "/money", () => {
  const sections = money().map(toSection);
  const sum = (k: string) => sections.filter((x) => x.kind === k).reduce((n, x) => n + x.my_share, 0);
  return { month: iso(now()).slice(0, 7), sections, totals: { expense: sum("expense"), income: sum("income") } };
});
on("POST", "/money/sections", (_m, b) => {
  const key = (n: string) => n.trim().toLowerCase();
  const had = money().find((x) => x.id === b.id || (key(x.name) === key(String(b.name ?? "")) && x.kind === (b.kind === "income" ? "income" : "expense") && x.circle_id === ((b.circle_id as string | null) ?? null)));
  if (had) return { section: toSection(had) };
  const r: SectionRow = { id: typeof b.id === "string" ? b.id : id(), name: String(b.name ?? ""), kind: b.kind === "income" ? "income" : "expense", budget: (b.budget as number | null) ?? null, circle_id: (b.circle_id as string | null) ?? null, entries: [] };
  money().push(r);
  return { section: toSection(r) };
});
on("GET", "/money/sections/([^/]+)", (m): SectionDetail => {
  const r = findSection(m[1]!);
  const c = state.circles.find((x) => x.id === r.circle_id);
  const share = toSection(r).my_share;
  const paid = r.entries.filter((x) => x.mine).reduce((n, x) => n + x.amount, 0);
  const owe = Math.round((share - paid) * 100) / 100;
  const other = r.entries.find((x) => !x.mine)?.payer ?? null;
  return {
    section: toSection(r),
    entries: [...r.entries].sort((a, b2) => b2.at.localeCompare(a.at)).map((x) => ({ id: x.id, section_id: r.id, amount: x.amount, note: x.note, at: x.at, payer_name: x.payer, is_mine: x.mine, split_count: x.split })),
    settle: c && owe > 0 ? [{ from_name: null, to_name: other, amount: owe, from_me: true, to_me: false }] : [],
    members: c ? c.members.map((x) => ({ user_id: x.user_id, name: x.name, is_me: x.is_me })) : [],
  };
});
on("DELETE", "/money/sections/([^/]+)", (m) => {
  state.money = money().filter((x) => x.id !== m[1]);
  return null;
});
on("POST", "/money/sections/([^/]+)/entries", (m, b) => {
  const r = findSection(m[1]!);
  const split = r.circle_id ? (Array.isArray(b.split) ? b.split.length : state.circles.find((c) => c.id === r.circle_id)?.members.length ?? 1) : 1;
  const e = { id: typeof b.id === "string" ? b.id : id(), amount: Number(b.amount), note: (b.note as string | null) ?? null, at: iso(now()), payer: null, mine: true, split };
  if (!r.entries.some((x) => x.id === e.id)) r.entries.push(e);
  return { section: toSection(r), entry: { id: e.id, section_id: r.id, amount: e.amount, note: e.note, at: e.at, payer_name: null, is_mine: true, split_count: split } };
});
on("DELETE", "/money/entries/([^/]+)", (m) => {
  for (const r of money()) r.entries = r.entries.filter((x) => x.id !== m[1]);
  return null;
});
on("GET", "/money/gift", () => ({
  month: "2026-10",
  expense: 6200,
  income: 9000,
  lines: L(
    "🎁 هدية آخر الشهر من زكي: ملخّص أكتوبر|صرفت 6,200 جنيه في الشهر.|ودخلك 9,000 جنيه.|يعني فضل معاك 2,800 🌟 برافو عليك!|أكبر قسم: «الأكل» بـ2,900.|كل الأقسام فضلت جوه الميزانية 👏|شهر جديد، بداية جديدة. أنا معاك 💛",
    "🎁 Zaki's end-of-month gift: your October in a nutshell|You spent EGP 6,200 this month.|Your income was EGP 9,000.|That leaves EGP 2,800 🌟 Well done!|Biggest section: “Food” at 2,900.|Every section stayed within budget 👏|New month, fresh start. I'm with you 💛",
  ).split("|"),
}));

// Split the bill: the same math as the server (packages/shared/src/split.ts), kept in memory.
const SPLIT_DEFAULTS = { title: "", items: [], subtotal: null, service_pct: 12, vat_pct: 14, vat_on_service: true, tip: 0, paid_by: null } as const;
function toSplit(body: Record<string, unknown>, old?: Split): Split {
  const input = { ...SPLIT_DEFAULTS, ...(old ? { title: old.title } : null), ...body } as unknown as SplitInput;
  const people = input.people.map((p) => ({ name: String(p.name).trim() }));
  const items = (input.items ?? []).map((it) => ({ name: it.name, price: Number(it.price), eaters: [...new Set((it.eaters ?? []).filter((e) => e < people.length))] }));
  const r = splitBill({ ...input, people, items });
  // Who already paid back stays ticked, by name, when the bill is worked out again.
  const paidBefore = new Set((old?.people ?? []).filter((x, i) => x.paid && i !== old?.paid_by).map((x) => x.name));
  const code = old?.code ?? `ZK${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  return {
    id: old?.id ?? id(),
    code,
    title: input.title,
    currency: "EGP",
    subtotal: Math.round(r.subtotal * 100) / 100,
    service_pct: input.service_pct,
    vat_pct: input.vat_pct,
    vat_on_service: input.vat_on_service,
    tip: input.tip,
    total: r.total,
    people: people.map((x, i) => ({ name: x.name, ordered: Math.round(r.ordered[i]! * 100) / 100, share: r.shares[i]!, paid: i === input.paid_by || paidBefore.has(x.name) })),
    items,
    bill: input.subtotal,
    web_adds: old?.web_adds ?? 0,
    paid_by: input.paid_by,
    url: `https://zaki.preview/s/${code}`,
    created_at: old?.created_at ?? iso(now()),
  };
}
const splits = (): Split[] => {
  if (!state.splits) {
    const dinner = toSplit({
      title: L("عشا الخميس", "Thursday dinner"),
      people: [{ name: L("أنا", "Me") }, { name: L("عمر", "Omar") }, { name: L("مريم", "Mariam") }, { name: L("يوسف", "Youssef") }],
      items: [
        { name: L("بيتزا", "Pizza"), price: 320, eaters: [0, 1] },
        { name: L("مكرونة", "Pasta"), price: 210, eaters: [2] },
        { name: L("برجر", "Burger"), price: 240, eaters: [3] },
        { name: L("مشروبات", "Drinks"), price: 160, eaters: [] },
      ],
      paid_by: 0,
    });
    dinner.created_at = inHours(-26);
    dinner.people[1]!.paid = true;
    dinner.web_adds = 1;
    // A group split Omar made in the friends circle: my share is still open (Today's Needs you).
    const lunch = toSplit({
      title: L("غدا الجمعة", "Friday lunch"),
      people: [{ name: L("عمر", "Omar") }, { name: L("أنا", "Me") }, { name: L("مريم", "Mariam") }],
      subtotal: 420,
      paid_by: 0,
    });
    lunch.created_at = inHours(-8);
    Object.assign(lunch, { circle_id: "c-friends", mine: false, me: 1, owner_name: L("عمر", "Omar"), instapay: null });
    state.splits = [lunch, dinner];
  }
  return state.splits;
};
const splitText = (x: Split) => {
  const payer = x.paid_by !== null ? x.people[x.paid_by]?.name : null;
  const lines = x.people.map((person, i) => `• ${person.name}: ${L(`${person.share} جنيه`, `EGP ${person.share}`)}${i === x.paid_by ? L(" (دفع)", " (paid)") : ""}`);
  const head = L(`🧾 ${x.title ? `حساب «${x.title}»` : "الحساب"}: ${x.total} جنيه بالخدمة والضريبة`, `🧾 ${x.title ? `“${x.title}”` : "The bill"}: EGP ${x.total} with service and VAT`);
  const ask = payer ? L(`ابعتوا لـ${payer} نصيبكم 🙏`, `Send ${payer} your share 🙏`) : "";
  return [head, ...lines, ask, L(`شوف نصيبك: ${x.url}`, `See your share: ${x.url}`)].filter(Boolean).join("\n");
};
const findSplit = (sid: string) => {
  const x = splits().find((one) => one.id === sid);
  if (!x) throw new DemoHttpError(404);
  return x;
};
const splitAnswer = (x: Split) => ({ split: x, share_text: splitText(x) });
on("GET", "/splits", () => ({ splits: splits() }));
on("POST", "/splits", (_m, b) => {
  const x = toSplit(b);
  splits().unshift(x);
  return splitAnswer(x);
});
on("GET", "/splits/([^/]+)", (m) => splitAnswer(findSplit(m[1]!)));
on("PUT", "/splits/([^/]+)", (m, b) => {
  const next = toSplit(b, findSplit(m[1]!));
  state.splits = splits().map((one) => (one.id === next.id ? next : one));
  return splitAnswer(next);
});
on("POST", "/splits/([^/]+)/paid", (m, b) => {
  const x = findSplit(m[1]!);
  const person = x.people[Number(b.index)];
  if (!person) throw new DemoHttpError(400);
  person.paid = b.paid === true;
  return splitAnswer(x);
});
on("DELETE", "/splits/([^/]+)", (m) => {
  state.splits = splits().filter((one) => one.id !== m[1]);
  return null;
});

// Session
const HELPLINE = L("لو حاسس إنك مش بخير خالص، كلّم الخط الساخن للصحة النفسية 16328 (مجاني).", "If you feel really unwell, call the mental health line 16328 (free, Egypt).");
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
      : sessionMsg("zaki", L("شكراً إنك شاركتني ده. إيه رأيك في خطوة صغيرة: تمشي 10 دقايق النهارده بعد المغرب؟", "Thanks for sharing that with me. How about one small step: a 10-minute walk this evening?"), {
          title: L("تمشية 10 دقايق", "10-minute walk"),
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
