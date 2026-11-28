import { describe, expect, it } from "vitest";
import { dueAt, dueChoices, firstLink, guessTask, iftarDate, linkTaskView, remindAt, remindChoices, sortLinkTasks, sortTasks, taskActions } from "./logic";

describe("task logic", () => {
  const t = (status: "pending" | "accepted" | "declined" | "done" | "cancelled", role: "assigner" | "assignee" | "watcher", can_nudge = false) => ({ status, role, can_nudge });
  it("offers the right actions to each side", () => {
    expect(taskActions(t("pending", "assignee"))).toEqual(["accept", "decline"]);
    expect(taskActions(t("accepted", "assignee"))).toEqual(["done"]);
    expect(taskActions(t("pending", "assigner"))).toEqual(["cancel"]);
    expect(taskActions(t("accepted", "assigner", true))).toEqual(["nudge", "cancel"]);
    expect(taskActions(t("declined", "assigner"))).toEqual([]);
    expect(taskActions(t("done", "assignee"))).toEqual([]);
    expect(taskActions(t("accepted", "watcher", true))).toEqual([]);
  });
  it("shows a tap's result at once, with the actions that follow from it", () => {
    const now = new Date("2026-11-26T09:00:00.000Z");
    const asked = { ...t("pending", "assignee"), responded_at: null, done_at: null };
    const yes = guessTask(asked, "accept", now)!;
    expect(yes).toMatchObject({ status: "accepted", responded_at: "2026-11-26T09:00:00.000Z" });
    expect(taskActions(yes)).toEqual(["done"]);
    expect(guessTask(asked, "decline", now)).toMatchObject({ status: "declined" });
    const done = guessTask(yes, "done", now)!;
    expect(done).toMatchObject({ status: "done", done_at: "2026-11-26T09:00:00.000Z" });
    expect(taskActions(done)).toEqual([]);
    const mine = { ...t("accepted", "assigner", true), responded_at: null, done_at: null };
    expect(taskActions(guessTask(mine, "cancel", now)!)).toEqual([]);
    // A nudge is Zaki writing to someone: nothing is shown before the server did it.
    expect(guessTask(mine, "nudge", now)).toBeNull();
    // The task handed in is left as it was.
    expect(asked.status).toBe("pending");
  });
  it("puts what needs my answer first and finished work last", () => {
    const rows = [
      { id: "done", ...t("done", "assigner"), created_at: "2026-11-22T12:00:00Z" },
      { id: "open-old", ...t("accepted", "assigner"), created_at: "2026-11-20T12:00:00Z" },
      { id: "answer", ...t("pending", "assignee"), created_at: "2026-11-19T12:00:00Z" },
      { id: "open-new", ...t("pending", "assigner"), created_at: "2026-11-21T12:00:00Z" },
    ];
    expect(sortTasks(rows).map((r) => r.id)).toEqual(["answer", "open-new", "open-old", "done"]);
  });
  it("turns a quick pick into a local time", () => {
    const morning = new Date(2026, 10, 22, 9, 30);
    expect(dueChoices(morning)).toEqual(["none", "today", "tomorrow", "week"]);
    expect(dueChoices(new Date(2026, 10, 22, 19, 0))).toEqual(["none", "tomorrow", "week"]);
    expect(dueAt("none", morning)).toBeNull();
    expect(new Date(dueAt("today", morning)!)).toEqual(new Date(2026, 10, 22, 18, 0));
    expect(new Date(dueAt("tomorrow", morning)!)).toEqual(new Date(2026, 10, 23, 10, 0));
    expect(new Date(dueAt("week", morning)!)).toEqual(new Date(2026, 10, 29, 10, 0));
  });
  it("picks the calendar day for an iftar", () => {
    const sunday = new Date(2027, 1, 7, 15, 0); // Sunday 7 Feb 2027
    expect(iftarDate("today", sunday)).toBe("2027-02-07");
    expect(iftarDate("tomorrow", sunday)).toBe("2027-02-08");
    expect(iftarDate("friday", sunday)).toBe("2027-02-12");
    // On a Friday, "next Friday" is a week later, and month ends roll over.
    expect(iftarDate("friday", new Date(2027, 1, 12, 9, 0))).toBe("2027-02-19");
    expect(iftarDate("tomorrow", new Date(2027, 1, 28, 23, 30))).toBe("2027-03-01");
  });
});

describe("reminder picks and homework links", () => {
  const morning = new Date(2026, 10, 22, 10, 0);
  it("offers 'an hour before' only with a deadline far enough away", () => {
    expect(remindChoices(morning, null)).toEqual(["due", "hour", "evening", "morning"]);
    expect(remindChoices(morning, new Date(2026, 10, 22, 18, 0).toISOString())).toContain("beforeDue");
    expect(remindChoices(new Date(2026, 10, 22, 20, 0), null)).toEqual(["due", "hour", "morning"]);
  });
  it("turns a pick into a time", () => {
    expect(remindAt("due", morning, null)).toBeNull();
    expect(new Date(remindAt("evening", morning, null)!).getHours()).toBe(19);
    const tomorrow = new Date(remindAt("morning", morning, null)!);
    expect([tomorrow.getDate(), tomorrow.getHours()]).toEqual([23, 9]);
    expect(new Date(remindAt("beforeDue", morning, new Date(2026, 10, 22, 18, 0).toISOString())!).getHours()).toBe(17);
  });
  it("finds the link in a homework note", () => {
    expect(firstLink("صفحة 40 https://school.test/hw/12.")).toBe("https://school.test/hw/12");
    expect(firstLink("حل التمارين")).toBeNull();
  });
});

describe("tasks sent by link", () => {
  const at = (d: string) => `2026-11-${d}T10:00:00.000Z`;
  it("says whether the page was opened and offers only what the server allows", () => {
    expect(linkTaskView({ status: "pending", seen: false })).toEqual({ state: "pending", again: true, cancel: true });
    expect(linkTaskView({ status: "pending", seen: true }).state).toBe("seen");
    expect(linkTaskView({ status: "accepted", seen: true })).toEqual({ state: "accepted", again: true, cancel: true });
    expect(linkTaskView({ status: "declined", seen: true })).toEqual({ state: "declined", again: false, cancel: true });
    expect(linkTaskView({ status: "done", seen: true })).toEqual({ state: "done", again: false, cancel: false });
  });
  it("puts open ones first and lets old finished ones go", () => {
    const tasks = [
      { id: "a", status: "done" as const, created_at: at("26"), done_at: at("26") },
      { id: "b", status: "accepted" as const, created_at: at("25"), done_at: null },
      { id: "c", status: "pending" as const, created_at: at("24"), done_at: null },
      { id: "d", status: "done" as const, created_at: at("10"), done_at: at("11") },
      { id: "e", status: "cancelled" as const, created_at: at("27"), done_at: null },
    ];
    expect(sortLinkTasks(tasks, new Date(at("27"))).map((t) => t.id)).toEqual(["c", "b", "a"]);
  });
});
