import { describe, expect, it } from "vitest";
import { CareMed, type CircleTask, type DaftarEntry, type Gameya, type Split } from "@fakkarni/shared";
import { gameyaNeeds, myOpenShare, needsYou, type NeedWords } from "./needs";

const words: NeedWords = {
  taskFrom: "From {name}",
  handedIn: "{name} handed it in",
  youOwe: "You owe {amount}",
  owedToYou: "Owes you {amount}",
  yourShare: "Your share {amount}",
  noName: "Someone",
  splitTitle: "Split",
  money: (n) => `EGP ${n}`,
  gameyaPay: "Pay {amount} soon",
  gameyaToday: "Pay {amount} today",
  gameyaLate: "{amount} is late",
  gameyaHand: "Hand {name} the pot",
  doseNotMarked: "{time} not marked",
  yesterday: "Yesterday",
  clock: (t) => t,
};

const task = (over: Partial<CircleTask>): CircleTask => ({
  id: "t1",
  circle_id: "c1",
  circle_name: "Home",
  title: "Buy bread",
  due_at: null,
  remind_at: null,
  homework: false,
  note: null,
  subject: null,
  reward: null,
  submission: null,
  submitted_at: null,
  photo_ids: [],
  review: null,
  review_note: null,
  status: "pending",
  role: "assignee",
  assigner_name: "Mona",
  assignee_name: "Me",
  assignee_id: null,
  can_nudge: false,
  created_at: "2026-11-20T10:00:00.000Z",
  responded_at: null,
  done_at: null,
  ...over,
});

const entry = (over: Partial<DaftarEntry>): DaftarEntry => ({
  id: "d1",
  other_name: "Hany",
  direction: "i_owe",
  amount: 200,
  currency: "EGP",
  note: null,
  status: "pending",
  mine: false,
  url: null,
  pay_link: null,
  circle_id: null,
  created_at: "2026-11-21T10:00:00.000Z",
  responded_at: null,
  settled_at: null,
  ...over,
});

const split = (over: Partial<Split>): Split => ({
  id: "s1",
  code: "abc",
  title: "Dinner",
  currency: "EGP",
  subtotal: 300,
  service_pct: 0,
  vat_pct: 0,
  vat_on_service: true,
  tip: 0,
  total: 300,
  people: [
    { name: "Sara", ordered: 150, share: 150, paid: true },
    { name: "Me", ordered: 150, share: 150, paid: false },
  ],
  items: [],
  bill: 300,
  web_adds: 0,
  paid_by: 0,
  url: "https://x/s/abc",
  created_at: "2026-11-22T10:00:00.000Z",
  mine: false,
  me: 1,
  owner_name: "Sara",
  ...over,
});

describe("needsYou", () => {
  it("is empty with nothing saved", () => {
    expect(needsYou({}, words)).toEqual([]);
    expect(needsYou({ tasks: null, daftar: null, splits: null }, words)).toEqual([]);
  });

  it("lists a request that waits for my answer, answered in place", () => {
    expect(needsYou({ tasks: [task({})] }, words)).toEqual([{ kind: "task", id: "t1", title: "Buy bread", line: "From Mona", route: "/circle/tasks?id=c1", action: { type: "accept_task" } }]);
  });

  it("leaves out requests I sent, answered ones and ones I only watch", () => {
    const tasks = [task({ role: "assigner" }), task({ status: "accepted" }), task({ status: "declined" }), task({ role: "watcher" as CircleTask["role"] })];
    expect(needsYou({ tasks }, words)).toEqual([]);
  });

  it("sends a homework request to the circle's homework screen", () => {
    expect(needsYou({ tasks: [task({ homework: true })] }, words)[0]?.route).toBe("/circle/homework?id=c1");
  });

  it("lists homework handed in that I have not reviewed", () => {
    const handed = task({ id: "h1", homework: true, role: "assigner", status: "done", submission: "p. 12 done", submitted_at: "2026-11-23T10:00:00.000Z", assignee_name: "Youssef" });
    expect(needsYou({ tasks: [handed] }, words)).toEqual([{ kind: "homework_review", id: "h1", title: "Buy bread", line: "Youssef handed it in", route: "/circle/homework?id=c1" }]);
    // Photos alone are a hand-in too.
    expect(needsYou({ tasks: [{ ...handed, submission: null, photo_ids: ["3f0c1a52-6f0e-4c58-9d55-0b1f5c1e9a10"] }] }, words)).toHaveLength(1);
    // Reviewed, ticked without a hand-in, or the child's own copy: nothing waits for me.
    expect(needsYou({ tasks: [{ ...handed, review: "approved" }, { ...handed, submission: null }, { ...handed, role: "assignee" }] }, words)).toEqual([]);
  });

  it("lists a Daftar entry the other person wrote, from my side", () => {
    expect(needsYou({ daftar: [entry({})] }, words)).toEqual([{ kind: "daftar", id: "d1", title: "Hany", line: "You owe EGP 200", route: "/money?part=people", action: { type: "confirm_daftar" } }]);
    expect(needsYou({ daftar: [entry({ direction: "owed_to_me" })] }, words)[0]?.line).toBe("Owes you EGP 200");
    expect(needsYou({ daftar: [entry({ mine: true }), entry({ status: "confirmed" }), entry({ status: "disputed" })] }, words)).toEqual([]);
  });

  it("lists my unpaid share of a bill someone else split", () => {
    expect(needsYou({ splits: [split({})] }, words)).toEqual([{ kind: "split", id: "s1", title: "Dinner", line: "Your share EGP 150", route: "/split/s1", action: { type: "pay_split", index: 1 } }]);
    expect(needsYou({ splits: [split({ title: " " })] }, words)[0]?.title).toBe("Sara");
    expect(needsYou({ splits: [split({ title: "", owner_name: null })] }, words)[0]?.title).toBe("Split");
  });

  it("has no share to pay on my own split, a paid one, when I paid the bill or nobody did", () => {
    expect(myOpenShare(split({ mine: true, me: null }))).toBeNull();
    expect(myOpenShare(split({ mine: undefined, me: undefined }))).toBeNull();
    expect(myOpenShare(split({ paid_by: null }))).toBeNull();
    expect(myOpenShare(split({ paid_by: 1 }))).toBeNull();
    expect(myOpenShare(split({ me: 5 }))).toBeNull();
    const paid = split({});
    paid.people[1]!.paid = true;
    expect(myOpenShare(paid)).toBeNull();
    expect(myOpenShare(split({}))).toBe(150);
  });

  it("orders requests, homework to review, Daftar, splits; the oldest first inside each", () => {
    const rows = needsYou(
      {
        splits: [split({ id: "s2", created_at: "2026-11-25T10:00:00.000Z" }), split({ id: "s1", created_at: "2026-11-01T10:00:00.000Z" })],
        daftar: [entry({ id: "d2", created_at: "2026-11-24T10:00:00.000Z" }), entry({ id: "d1", created_at: "2026-11-02T10:00:00.000Z" })],
        tasks: [
          task({ id: "h2", homework: true, role: "assigner", status: "done", submission: "x", submitted_at: "2026-11-23T10:00:00.000Z", created_at: "2026-11-01T10:00:00.000Z" }),
          task({ id: "t2", created_at: "2026-11-22T10:00:00.000Z" }),
          task({ id: "h1", homework: true, role: "assigner", status: "done", submission: "x", submitted_at: "2026-11-21T10:00:00.000Z", created_at: "2026-11-05T10:00:00.000Z" }),
          task({ id: "t1", created_at: "2026-11-20T10:00:00.000Z" }),
        ],
      },
      words,
    );
    expect(rows.map((r) => r.id)).toEqual(["t1", "t2", "h1", "h2", "d1", "d2", "s1", "s2"]);
  });

  it("uses the fallback name when the other person has none", () => {
    expect(needsYou({ tasks: [task({ assigner_name: null })] }, words)[0]?.line).toBe("From Someone");
  });

  describe("gam'eya", () => {
    const member = (id: string, turn: number, over: Partial<Gameya["members"][number]> = {}) => ({ id, name: id.toUpperCase(), user_id: null, turn, month: "2026-11", received: false, is_me: false, ...over });
    const book = (over: Partial<Gameya> = {}): Gameya => ({
      id: "g1", name: "Work", amount: 500, currency: "EGP", pay_day: 28, start_month: "2026-11", months: 3, pot: 1500, circle_id: null, circle_name: null,
      code: "c", url: "u", mine: false, owner_name: "Mona", instapay: null,
      members: [member("a", 1), member("me", 2, { is_me: true }), member("c", 3)], payments: [], round: 1, created_at: "2026-11-01T10:00:00.000Z", ...over,
    });
    it("asks me to pay from three days before pay day, and says late after it", () => {
      expect(gameyaNeeds([book()], "2026-11-20", words)).toEqual([]);
      expect(gameyaNeeds([book()], "2026-11-25", words)[0]).toMatchObject({ id: "g1:pay", line: "Pay EGP 500 soon", action: { type: "pay_gameya", memberId: "me", round: 1 } });
      expect(gameyaNeeds([book()], "2026-11-28", words)[0]?.line).toBe("Pay EGP 500 today");
      expect(gameyaNeeds([book({ pay_day: 2, round: 1 })], "2026-11-05", words)[0]?.line).toBe("EGP 500 is late");
      expect(gameyaNeeds([book({ payments: [{ member_id: "me", round: 1 }] })], "2026-11-28", words)).toEqual([]);
    });
    it("tells the organizer to hand the pot over once everyone paid", () => {
      const all = ["a", "me", "c"].map((m) => ({ member_id: m, round: 1 }));
      expect(gameyaNeeds([book({ mine: true, payments: all })], "2026-11-10", words)).toEqual([expect.objectContaining({ id: "g1:hand", line: "Hand A the pot" })]);
      expect(gameyaNeeds([book({ mine: true, payments: all, members: book().members.map((m) => (m.turn === 1 ? { ...m, received: true } : m)) })], "2026-11-10", words)).toEqual([]);
    });
  });

  it("puts medicine doses nobody marked first, yesterday's before today's", () => {
    const med = CareMed.parse({
      id: "00000000-0000-4000-8000-000000000001",
      circle_id: "00000000-0000-4000-8000-0000000000c1",
      person_name: "Mama",
      name: "Concor",
      times: ["08:00", "20:00"],
      time_zone: "Africa/Cairo",
      missed_after_minutes: 60,
      active: true,
      created_at: "2026-11-20T10:00:00.000Z",
      today: [
        { due_at: "2026-11-27T06:00:00.000Z", time: "08:00", state: "missed" },
        { due_at: "2026-11-27T18:00:00.000Z", time: "20:00", state: "later" },
      ],
      open_missed: [{ due_at: "2026-11-26T18:00:00.000Z", time: "20:00", state: "missed" }],
    });
    const rows = needsYou({ care: [med, { ...med, id: "00000000-0000-4000-8000-000000000002", active: false }], tasks: [task({})] }, words);
    expect(rows.map((r) => [r.kind, r.title, r.line])).toEqual([
      ["dose", "Mama: Concor", "Yesterday 20:00 not marked"],
      ["dose", "Mama: Concor", "08:00 not marked"],
      ["task", "Buy bread", "From Mona"],
    ]);
    expect(rows[0]).toMatchObject({ route: "/circle/care?id=00000000-0000-4000-8000-0000000000c1", action: { type: "dose_taken", medId: med.id, dueAt: "2026-11-26T18:00:00.000Z" } });
  });
});
