import { describe, expect, it } from "vitest";
import { dueAt, dueChoices, iftarDate, sortTasks, taskActions } from "./logic";

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
