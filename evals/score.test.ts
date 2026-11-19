import { describe, expect, it } from "vitest";
import { EvalCase, scoreCase } from "./score";

const base = (expect: object, extra: object = {}) =>
  EvalCase.parse({ id: "t", message: "m", expect: { script: "english", items: [], ...expect }, ...extra });
const out = (o: object) => ({ reply: ["Got it, I'll remind you."], create_items: [], update_items: [], save_memories: [], crisis: false, ...o });

describe("scoreCase", () => {
  it("passes a matching reminder", () => {
    const c = base({ items: [{ type: "reminder", title_any: ["dentist"], due: "2026-11-22T18:00" }] });
    const s = scoreCase(c, out({ create_items: [{ type: "reminder", title: "Dentist", due_at_local: "2026-11-22T18:00" }] }));
    expect(s).toMatchObject({ extraction: true, style: true });
  });

  it("fails wrong time, missing and extra items", () => {
    const c = base({ items: [{ type: "reminder", due: "2026-11-22T18:00" }] });
    expect(scoreCase(c, out({ create_items: [{ type: "reminder", title: "x", due_at_local: "2026-11-22T17:00" }] })).extraction).toBe(false);
    expect(scoreCase(c, out({})).extraction).toBe(false);
    const extra = scoreCase(base({}), out({ create_items: [{ type: "task", title: "invented" }] }));
    expect(extra.extraction).toBe(false);
  });

  it("checks debts by person, amount and direction", () => {
    const c = base({ items: [{ type: "debt", debt: { person_any: ["ahmed"], amount: 500, direction: "owed_to_me" } }] });
    const good = out({ create_items: [{ type: "debt", title: "Loan", debt: { person: "Ahmed", amount: 500, direction: "owed_to_me" } }] });
    const bad = out({ create_items: [{ type: "debt", title: "Loan", debt: { person: "Ahmed", amount: 500, direction: "i_owe" } }] });
    expect(scoreCase(c, good).extraction).toBe(true);
    expect(scoreCase(c, bad).extraction).toBe(false);
  });

  it("requires no updates when the friend must ask first", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const c = base({ updates: [] });
    expect(scoreCase(c, out({ update_items: [{ id, status: "cancelled" }] })).extraction).toBe(false);
  });

  it("flags checklists, wrong script and missing crisis", () => {
    expect(scoreCase(base({}), out({ reply: ["Here you go:\n- dentist\n- bank"] })).style).toBe(false);
    expect(scoreCase(base({ script: "arabic" }), out({})).style).toBe(false);
    expect(scoreCase(base({ crisis: true }), out({})).extraction).toBe(false);
    expect(scoreCase(base({ list_ok: true }), out({ reply: ["- dentist Sunday"] })).style).toBe(true);
  });
});
