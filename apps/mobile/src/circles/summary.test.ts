import { describe, expect, it } from "vitest";
import { checkinOrder } from "@fakkarni/shared";
import { bookSummary, latestCheckin, listSummary, moreCheckins, pocketOwed, taskCounts, trialDaysLeft } from "./summary";

describe("circle summary", () => {
  it("counts open requests, the ones waiting for me, and homework apart", () => {
    const t = (status: "pending" | "accepted" | "done" | "declined" | "cancelled", role: "assigner" | "assignee" | "watcher", homework = false) => ({ status, role, homework });
    expect(taskCounts([t("pending", "assignee"), t("pending", "assigner"), t("accepted", "assignee"), t("done", "assignee"), t("declined", "assigner"), t("cancelled", "assigner"), t("pending", "assignee", true), t("accepted", "watcher", true), t("done", "assignee", true)])).toEqual({ open: 3, waiting: 1, homework: 2 });
    expect(taskCounts([])).toEqual({ open: 0, waiting: 0, homework: 0 });
  });

  it("adds up pocket money owed in this circle only", () => {
    const a = (circle_id: string, balance: number) => ({ circle_id, balance });
    expect(pocketOwed([a("c1", 40), a("c1", 15), a("c2", 100), a("c1", 0)], "c1")).toBe(55);
    expect(pocketOwed([a("c2", 100)], "c1")).toBeNull();
    expect(pocketOwed([a("c1", 0)], "c1")).toBeNull();
    expect(pocketOwed(null, "c1")).toBeNull();
  });

  it("sums the circle's open list items and names the fullest grocery list", () => {
    const l = (id: string, circle_id: string | null, place: "grocery" | "other", open_count: number) => ({ id, circle_id, place, open_count });
    const got = listSummary([l("a", "c1", "other", 9), l("b", "c1", "grocery", 2), l("c", "c1", "grocery", 5), l("d", "c2", "grocery", 50), l("e", null, "grocery", 7)], "c1");
    expect(got.open).toBe(16);
    expect(got.top?.id).toBe("c");
    expect(listSummary(null, "c1")).toEqual({ open: 0, top: null });
  });

  it("gives my share of the circle's shared books", () => {
    const s = (circle_id: string | null, my_share: number) => ({ circle_id, my_share });
    expect(bookSummary([s("c1", 120), s("c1", 30.5), s(null, 900), s("c2", 10)], "c1")).toEqual({ books: 2, share: 150.5 });
    expect(bookSummary(null, "c1")).toEqual({ books: 0, share: 0 });
  });

  it("finds the newest check-in", () => {
    const m = (name: string, at: string | null) => ({ name, last_checkin: at ? { kind: "ok" as const, note: null, at } : null });
    expect(latestCheckin([m("a", "2026-11-26T10:00:00.000Z"), m("b", null), m("c", "2026-11-26T12:00:00.000Z")])?.name).toBe("c");
    expect(latestCheckin([m("b", null)])).toBeNull();
  });

  it("keeps the circle's order behind More, without the main button's own", () => {
    for (const type of [null, "adults_elders", "spouses"] as const) {
      const order = checkinOrder(type);
      expect(order).toContain("ok");
      expect(moreCheckins(order)).toEqual(order.filter((k) => k !== "ok"));
      expect(moreCheckins(order)).toHaveLength(order.length - 1);
    }
  });

  it("counts whole trial days left", () => {
    const now = new Date("2026-11-26T12:00:00.000Z");
    expect(trialDaysLeft("2026-11-28T11:00:00.000Z", now)).toBe(2);
    expect(trialDaysLeft("2026-11-20T11:00:00.000Z", now)).toBe(0);
    expect(trialDaysLeft(null, now)).toBe(0);
  });
});
