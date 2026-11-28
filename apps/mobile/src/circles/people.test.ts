import { describe, expect, it } from "vitest";
import { CareMed, type CircleMember, type CircleTask } from "@fakkarni/shared";
import { circleStatus, memberRows, type PeopleWords } from "./people";

const C = "c1";
const words: PeopleWords = { askedYou: "Asked you: {title}", youAsked: "You asked: {title}", notMarked: "{med} not marked", nextDose: "{med} · {time}", clock: (t) => t };
const member = (id: string, name: string | null, over: Partial<CircleMember> = {}): CircleMember => ({ user_id: id, name, role: "member", joined_at: "2026-11-01T10:00:00.000Z", is_me: false, family_role: null, last_checkin: null, ...over });
const task = (id: string, over: Partial<CircleTask>): CircleTask =>
  ({ id, circle_id: C, circle_name: "Home", title: id, due_at: null, remind_at: null, homework: false, note: null, subject: null, reward: null, submission: null, submitted_at: null, photo_ids: [], review: null, review_note: null, status: "pending", role: "assignee", assigner_name: "Mona", assignee_name: "Me", assignee_id: null, can_nudge: false, created_at: "2026-11-20T10:00:00.000Z", responded_at: null, done_at: null, ...over }) as CircleTask;
const med = (over: object) =>
  CareMed.parse({ id: "00000000-0000-4000-8000-000000000001", circle_id: C, person_name: "Mama", person_user_id: "mama", name: "Concor", times: ["20:00"], time_zone: "Africa/Cairo", missed_after_minutes: 60, active: true, created_at: "2026-11-20T10:00:00.000Z", ...over });

const members = [member("me", "Kareem", { is_me: true }), member("mona", "Mona"), member("mama", "Mama"), member("ali", "Ali"), member("nour", "Nour")];

describe("memberRows", () => {
  it("shows each member's one open thing, the most pressing first, the reader after them", () => {
    const tasks = [
      task("bread", {}),
      task("math", { homework: true, role: "assigner", status: "done", submission: "done", assignee_id: "ali", assignee_name: "Ali" }),
      task("call", { role: "assigner", status: "accepted", assignee_id: "nour", assignee_name: "Nour" }),
    ];
    const care = [med({ today: [{ due_at: "2026-11-28T06:00:00.000Z", time: "08:00", state: "missed" }, { due_at: "2026-11-28T18:00:00.000Z", time: "20:00", state: "later" }] })];
    const { rows, more } = memberRows({ members, tasks, care, circleId: C }, words);
    expect(rows.map((r) => [r.member.user_id, r.thing?.type, r.thing?.text])).toEqual([
      ["mama", "dose", "Concor not marked"],
      ["mona", "request", "Asked you: bread"],
      ["ali", "review", "math"],
      ["nour", "asked", "You asked: call"],
      ["me", undefined, undefined],
    ]);
    expect(more).toBe(0);
  });

  it("says a member's next dose when nothing waits, and caps the rows", () => {
    const care = [med({ today: [{ due_at: "2026-11-28T18:00:00.000Z", time: "20:00", state: "later" }] }), med({ circle_id: "other", today: [{ due_at: "2026-11-28T06:00:00.000Z", time: "08:00", state: "missed" }] })];
    const many = [...members, member("x", "X"), member("y", "Y")];
    const { rows, more } = memberRows({ members: many, tasks: [], care, circleId: C }, words);
    expect(rows[0]?.thing).toEqual({ type: "next", text: "Concor · 20:00", medId: "00000000-0000-4000-8000-000000000001" });
    expect(rows).toHaveLength(5);
    expect(more).toBe(2);
  });

  it("gives a request to nobody when two members share the assigner's name", () => {
    const twins = [member("me", "K", { is_me: true }), member("a", "Mona"), member("b", "Mona")];
    expect(memberRows({ members: twins, tasks: [task("bread", {})], care: null, circleId: C }, words).rows.every((r) => r.thing === null)).toBe(true);
  });
});

describe("circleStatus", () => {
  it("counts what waits for the reader in one circle and names the next dose", () => {
    const tasks = [task("a", {}), task("b", { circle_id: "other" }), task("c", { status: "accepted" })];
    const care = [med({ today: [{ due_at: "2026-11-28T06:00:00.000Z", time: "08:00", state: "missed" }, { due_at: "2026-11-28T18:00:00.000Z", time: "20:00", state: "later" }] })];
    expect(circleStatus(C, tasks, care)).toEqual({ needs: 2, nextDoseTime: "20:00" });
    expect(circleStatus(C, null, null)).toEqual({ needs: 0, nextDoseTime: null });
  });
});
