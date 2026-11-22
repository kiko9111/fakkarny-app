import { describe, expect, it } from "vitest";
import { localToUtc } from "../lib/time";
import { isPlainYes, parseStatusClientId, pendingStatus, planStatusCheck, statusClientId, type StatusInput, type StatusItem } from "./status";

const at = (local: string) => localToUtc(local, "Africa/Cairo");
const ID = "11111111-1111-4111-8111-111111111111";
const item = (over: Partial<StatusItem> = {}): StatusItem => ({
  id: ID, type: "reminder", title: "call mum", status: "open", remindAt: at("2026-11-19T12:00"), dueAt: null, repeatEveryMinutes: null,
  followUpAt: null, debtPerson: null, debtAmount: null, debtDirection: null, createdAt: at("2026-11-18T09:00"), ...over,
});
const input = (over: Partial<StatusInput> = {}): StatusInput => ({
  now: at("2026-11-19T14:00"), timezone: "Africa/Cairo", wakeTime: "07:00", sleepTime: "23:00", lastUserMessageAt: at("2026-11-19T10:00"),
  items: [item()], trackers: [], history: [], ...over,
});

describe("status checks", () => {
  it("asks about a reminder whose time passed and is still open", () => {
    const check = planStatusCheck(input());
    expect(check).toEqual({ subject: `item:${ID}`, text: { arabic: "عملت «call mum»؟ 🙂", english: "Did you get to “call mum”? 🙂" } });
  });

  it("waits a little after the reminder time, and skips done, repeating and follow-up items", () => {
    expect(planStatusCheck(input({ now: at("2026-11-19T12:30") }))).toBeNull();
    expect(planStatusCheck(input({ items: [item({ status: "done" })] }))).toBeNull();
    expect(planStatusCheck(input({ items: [item({ repeatEveryMinutes: 60 })] }))).toBeNull();
    expect(planStatusCheck(input({ items: [item({ followUpAt: at("2026-11-19T13:00") })] }))).toBeNull();
  });

  it("stays quiet at night, near wake and sleep, and while the user is talking", () => {
    expect(planStatusCheck(input({ now: at("2026-11-20T01:00") }))).toBeNull();
    expect(planStatusCheck(input({ now: at("2026-11-19T22:00") }))).toBeNull();
    expect(planStatusCheck(input({ lastUserMessageAt: at("2026-11-19T13:50") }))).toBeNull();
  });

  it("caps per day, spaces them out, and does not repeat a subject", () => {
    const other = { subject: "item:x", answered: true };
    expect(planStatusCheck(input({ history: [{ ...other, at: at("2026-11-19T12:30") }] }))).toBeNull(); // 90 min ago
    expect(planStatusCheck(input({ history: [{ ...other, at: at("2026-11-19T10:30") }, { ...other, at: at("2026-11-19T09:00") }] }))).toBeNull();
    expect(planStatusCheck(input({ history: [{ subject: `item:${ID}`, answered: true, at: at("2026-11-19T09:00") }] }))).toBeNull();
  });

  it("backs off for two days after two unanswered checks", () => {
    const history = [
      { subject: "item:a", answered: false, at: at("2026-11-18T15:00") },
      { subject: "item:b", answered: false, at: at("2026-11-18T11:00") },
    ];
    expect(planStatusCheck(input({ lastUserMessageAt: at("2026-11-18T09:00"), history }))).toBeNull();
    expect(planStatusCheck(input({ now: at("2026-11-20T16:00"), items: [item({ remindAt: at("2026-11-20T12:00") })], lastUserMessageAt: at("2026-11-18T09:00"), history }))).not.toBeNull();
  });

  it("asks whether a week-old debt was paid back, in the right direction", () => {
    const debt = item({ type: "debt", remindAt: null, title: "Ahmed 200", debtPerson: "أحمد", debtAmount: 200, debtDirection: "owed_to_me", createdAt: at("2026-11-10T10:00") });
    expect(planStatusCheck(input({ items: [debt] }))?.text.arabic).toBe("أحمد رجّعلك الـ200؟");
    expect(planStatusCheck(input({ items: [{ ...debt, debtDirection: "i_owe", debtPerson: "Mona" }] }))?.text.english).toBe("Did you settle the 200 with Mona?");
    expect(planStatusCheck(input({ items: [{ ...debt, createdAt: at("2026-11-17T10:00") }] }))).toBeNull();
  });

  it("asks about an untimed task after a few days", () => {
    const task = item({ type: "task", remindAt: null, title: "fix the bike", createdAt: at("2026-11-15T10:00") });
    expect(planStatusCheck(input({ items: [task] }))?.subject).toBe(`item:${ID}`);
    expect(planStatusCheck(input({ items: [{ ...task, createdAt: at("2026-11-18T10:00") }] }))).toBeNull();
  });

  it("asks about a tracker with nothing logged today, in the evening only", () => {
    const trackers = [{ id: ID, kind: "water", loggedToday: 0 }];
    expect(planStatusCheck(input({ items: [], trackers }))).toBeNull(); // 14:00
    expect(planStatusCheck(input({ now: at("2026-11-19T19:00"), items: [], trackers }))?.text.arabic).toBe("شربت مية النهارده؟ 💧");
    expect(planStatusCheck(input({ now: at("2026-11-19T19:00"), items: [], trackers: [{ ...trackers[0]!, loggedToday: 2 }] }))).toBeNull();
    expect(planStatusCheck(input({ now: at("2026-11-19T19:00"), items: [], trackers: [{ ...trackers[0]!, kind: "spending" }] }))).toBeNull();
  });

  it("round-trips the subject through the message client_id", () => {
    const id = statusClientId(`tracker:${ID}`, at("2026-11-19T19:00"));
    expect(parseStatusClientId(id)).toEqual({ kind: "tracker", id: ID });
    expect(parseStatusClientId("proactive:checkin:x:0")).toBeNull();
    expect(pendingStatus({ clientId: id, createdAt: at("2026-11-19T19:00") }, at("2026-11-20T06:00"))).toEqual({ kind: "tracker", id: ID });
    expect(pendingStatus({ clientId: id, createdAt: at("2026-11-19T19:00") }, at("2026-11-20T08:00"))).toBeNull();
  });

  it("reads only a plain yes as yes", () => {
    for (const yes of ["اه", "آه خلصت ✅", "ايوه الحمد لله", "خلصتها يا زكي", "yes", "Yep, done!", "I did it", "شربت"]) expect(isPlainYes(yes), yes).toBe(true);
    for (const no of ["لا", "لسه", "مش لسه", "not yet", "no", "yes but tomorrow I need to call her again", "i did not", "ok", "شكرا", "خلصت نص الشغل بس"]) expect(isPlainYes(no), no).toBe(false);
  });
});
