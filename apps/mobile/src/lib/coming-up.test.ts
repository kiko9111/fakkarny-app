import { describe, expect, it } from "vitest";
import type { Item } from "@fakkarni/shared";
import { comingUp } from "./coming-up";

const item = (id: string, at: string | null, repeat: number | null = null) => ({ id, remind_at: at, due_at: at, repeat_every_minutes: repeat }) as Item;

describe("comingUp", () => {
  it("never lets daily reminders hide a new one-off plan", () => {
    const prayers = ["17:15", "19:35", "05:50", "12:40", "15:05"].map((h, n) => item(`p${n}`, `2026-11-25T${h}:00Z`, 1440));
    const khaled = item("khaled", "2026-11-25T16:00:00Z");
    const out = comingUp([...prayers, khaled]);
    expect(out.soon.map((i) => i.id)).toEqual(["khaled"]);
    expect(out.repeating.map((i) => i.id)).toEqual(["p2", "p3", "p4", "p0", "p1"]);
    expect(out.more).toBe(0);
  });

  it("puts untimed plans last and counts what doesn't fit", () => {
    const items = [item("none", null), ...Array.from({ length: 6 }, (_, n) => item(`t${n}`, `2026-11-2${n}T10:00:00Z`))];
    const out = comingUp(items);
    expect(out.soon.map((i) => i.id)).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(out.more).toBe(2);
  });
});
