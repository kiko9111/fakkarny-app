import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { describe, expect, it } from "vitest";
import { ModelOutput, toAppActions } from "./model";

type Schema = { type?: unknown; anyOf?: unknown[]; properties?: Record<string, Schema>; required?: string[]; items?: Schema; $defs?: Record<string, Schema> };

/** Union-typed and optional parameters across the schema, as the API counts them. */
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
    for (const d of Object.values(s.$defs ?? {})) walk(d);
  };
  walk(root);
  return { unions, optional };
}

describe("friend output schema", () => {
  // The API rejects every request ("Schema is too complex") past 16 union-typed or 24
  // optional parameters. Crossing it made every chat reply fall back (2026-11-23).
  it("stays within the structured output limits", () => {
    const { schema } = zodOutputFormat(ModelOutput) as unknown as { schema: Schema };
    const c = complexity(schema);
    expect(c.unions).toBeLessThanOrEqual(16);
    expect(c.optional).toBeLessThanOrEqual(24);
  });
});

describe("toAppActions", () => {
  const blank = { name: "", title: "", section: "", tracker: "", circle: "", person: "", amount: 0, money_kind: "", tracker_kind: "", unit: "", ask_times: [], family: false, homework: false, note: "", text: "", due_at_local: "", remind_at_local: "", ref: "", answer: "", direction: "", people: [], checkin_kind: "", setting: "", screen: "" };

  it("drops the empty fields", () => {
    expect(toAppActions([{ ...blank, kind: "log_money", amount: 250, money_kind: "expense", section: "أكل" }])).toEqual([{ kind: "log_money", amount: 250, money_kind: "expense", section: "أكل" }]);
  });

  it("reads amount 0 on set_budget as removing the budget", () => {
    expect(toAppActions([{ ...blank, kind: "set_budget", section: "أكل" }])).toEqual([{ kind: "set_budget", section: "أكل", amount: null }]);
  });

  it("drops an action that doesn't fit, keeping the others", () => {
    const out = toAppActions([
      { ...blank, kind: "create_tracker", name: "القراية", tracker_kind: "reading", ask_times: ["9pm"] },
      { ...blank, kind: "create_circle", name: "Gym" },
    ]);
    expect(out).toEqual([{ kind: "create_circle", name: "Gym" }]);
  });
});

describe("buildMessages", () => {
  it("never sends blank turns, broken emoji halves or a trailing assistant turn", async () => {
    const { buildMessages } = await import("./model");
    const msgs = buildMessages({
      context: "ctx \uD83D",
      history: [
        { role: "user", text: "alo" },
        { role: "assistant", text: "   " },
        { role: "user", text: "zaki \uDE05" },
        { role: "assistant", text: "العصر دخل" },
      ],
    });
    expect(msgs.map((m) => m.role)).toEqual(["user", "user", "user"]);
    const json = JSON.stringify(msgs);
    expect(json).not.toMatch(/\\ud8|\\ude/i);
    expect(msgs.at(-1)!.content).toBe("zaki �");
  });
});
