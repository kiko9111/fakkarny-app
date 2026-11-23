import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AREA_TOOLS, friendTools, readToolCalls, toolCallToAction } from "./tools";
import { toolTurnToFriendResponse } from "./model";

type Schema = { type?: unknown; anyOf?: unknown[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema };

/** Union-typed and optional parameters, as the API counts them for strict tools. */
function complexity(root: Schema) {
  let unions = 0;
  let optional = 0;
  const walk = (s: Schema | undefined) => {
    if (!s || typeof s !== "object") return;
    for (const [key, p] of Object.entries(s.properties ?? {})) {
      if (Array.isArray(p.anyOf) || Array.isArray(p.type)) unions++;
      if (!(s.required ?? []).includes(key)) optional++;
      walk(p);
      for (const a of p.anyOf ?? []) walk(a as Schema);
    }
    walk(s.items);
  };
  walk(root);
  return { unions, optional };
}

const use = (name: string, input: unknown): Anthropic.ContentBlock => ({ type: "tool_use", id: `t_${name}`, name, input, caller: { type: "direct" } }) as unknown as Anthropic.ContentBlock;
const respond = { reply: ["تمام"], create_items: [], update_items: [], save_memories: [], crisis: false };

describe("friend tools", () => {
  it("keeps the strict respond tool within the structured output limits", () => {
    const tools = friendTools() as Anthropic.Tool[];
    const r = tools.find((t) => t.name === "respond")!;
    expect(r.strict).toBe(true);
    const c = complexity(r.input_schema as Schema);
    expect(c.unions).toBeLessThanOrEqual(16);
    expect(c.optional).toBeLessThanOrEqual(24);
    // Area tools are not strict (validated with zod instead).
    expect(tools.filter((t) => t.strict)).toHaveLength(1);
    expect(tools.map((t) => t.name)).toEqual(["respond", ...AREA_TOOLS.map((t) => t.name)]);
  });

  it("maps a tool call to an app action", () => {
    expect(toolCallToAction("money", { action: "log", amount: 250, money_kind: "expense", section: "أكل", note: "" })).toEqual({ kind: "log_money", amount: 250, money_kind: "expense", section: "أكل" });
    expect(toolCallToAction("money", { action: "set_budget", section: "أكل", amount: 0 })).toEqual({ kind: "set_budget", section: "أكل", amount: null });
    expect(toolCallToAction("circle", { action: "iftar", circle: "العيلة", day_local: "2027-02-20" })).toMatchObject({ kind: "iftar", circle: "العيلة", due_at_local: "2027-02-20T19:00" });
    expect(toolCallToAction("split", { action: "create", amount: 900, people: ["سارة", "منى"], title: "عشا" })).toMatchObject({ kind: "split_bill", name: "عشا", people: ["سارة", "منى"] });
    expect(toolCallToAction("task", { action: "answer", ref: "abc", answer: "yes" })).toMatchObject({ kind: "task_answer", ref: "abc", answer: "yes" });
    expect(toolCallToAction("app", { action: "settings", setting: "address", text: "female" })).toMatchObject({ kind: "settings", setting: "address", text: "female" });
  });

  it("drops calls that don't fit, one by one", () => {
    expect(toolCallToAction("nope", { action: "log" })).toBeNull();
    expect(toolCallToAction("money", { action: "fly" })).toBeNull();
    expect(toolCallToAction("money", null)).toBeNull();
    const r = readToolCalls([use("respond", respond), use("money", { action: "fly" }), use("tracker", { action: "log", tracker: "المية", amount: 1 })]);
    expect(r.respond).toEqual(respond);
    expect(r.actions).toEqual([{ kind: "log_tracker", tracker: "المية", amount: 1 }]);
    expect(r.dropped).toBe(1);
  });

  it("turns a tool turn into a friend response", () => {
    const out = toolTurnToFriendResponse([use("respond", { ...respond, create_items: [{ type: "reminder", title: "الدوا", due_at_local: "2026-11-24T09:00", remind_at_local: null, follow_up_at_local: null, important: true, alarm: true, nudge: null, repeat_every_minutes: null, debt: null }] }), use("money", { action: "log", amount: 50, money_kind: "expense" })]);
    expect(out.reply).toEqual(["تمام"]);
    expect(out.create_items[0]).toMatchObject({ title: "الدوا", alarm: true, important: true });
    expect(out.app_actions).toEqual([{ kind: "log_money", amount: 50, money_kind: "expense" }]);
    expect(() => toolTurnToFriendResponse([use("money", { action: "log", amount: 50 })])).toThrow();
  });
});
