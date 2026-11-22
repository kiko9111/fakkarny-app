import { describe, expect, it } from "vitest";
import { canCancel, canFinish, canNudge, canRespond, MAX_NUDGES, postLine, taskLine } from "./rules";

const at = (h: number) => new Date(Date.UTC(2026, 10, 22, 10) + h * 3600_000);

describe("assigned task rules", () => {
  it("lets only the person asked answer, and only while it is pending", () => {
    expect(canRespond("pending", "assignee")).toBe(true);
    expect(canRespond("pending", "assigner")).toBe(false);
    expect(canRespond("accepted", "assignee")).toBe(false);
    expect(canFinish("accepted", "assignee")).toBe(true);
    expect(canFinish("pending", "assignee")).toBe(false);
    expect(canFinish("accepted", "assigner")).toBe(false);
    expect(canCancel("accepted", "assigner")).toBe(true);
    expect(canCancel("done", "assigner")).toBe(false);
    expect(canCancel("pending", "assignee")).toBe(false);
  });

  it("spaces nudges 12 hours apart and stops after three", () => {
    const t = { status: "pending" as const, nudges: 0, lastNudgeAt: null, createdAt: at(0) };
    expect(canNudge(t, "assigner", at(11))).toBe(false);
    expect(canNudge(t, "assigner", at(12))).toBe(true);
    expect(canNudge(t, "assignee", at(12))).toBe(false);
    expect(canNudge({ ...t, nudges: 1, lastNudgeAt: at(12) }, "assigner", at(20))).toBe(false);
    expect(canNudge({ ...t, nudges: 1, lastNudgeAt: at(12) }, "assigner", at(24))).toBe(true);
    expect(canNudge({ ...t, nudges: MAX_NUDGES, lastNudgeAt: at(12) }, "assigner", at(100))).toBe(false);
    expect(canNudge({ ...t, status: "done" }, "assigner", at(100))).toBe(false);
  });

  it("writes kind lines in both languages and falls back when a name is missing", () => {
    expect(taskLine("ar", "asked", "منى", "هات العيش", "البيت")).toContain("طلب من منى في «البيت»: هات العيش");
    expect(taskLine("en", "asked", null, "Get bread", "Home")).toMatch(/^Someone in your circle is asking you/);
    expect(taskLine("en", "nudge_pending", "Mona", "Get bread", "Home")).toContain("A yes or a no are both fine");
    expect(postLine("en", "task_done", "Ahmed", "Mona", "Get bread")).toBe("Ahmed finished: Get bread ✅ Thank you, Ahmed!");
    expect(postLine("ar", "task_accepted", "أحمد", "منى", "هات العيش")).toContain("هات العيش: في إيد أحمد دلوقتي");
    expect(postLine("en", "something_new", "A", "B", "x")).toBeNull();
  });
});
