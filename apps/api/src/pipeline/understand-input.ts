import type { UnderstandInput, UnderstandItem } from "@fakkarni/shared";
import { toLocalIso } from "../lib/time";
import type { ConversationContext } from "./context";

/**
 * What the rule engine (understand) needs, from the same context the model would get: the
 * conversation before this message, open items with local times, and names in the app.
 */
export function understandInput(ctx: ConversationContext, text: string): UnderstandInput {
  const tz = ctx.user.timezone;
  const recent = ctx.recent.slice(0, -1);
  const openItems: UnderstandItem[] = ctx.openItems.map((i) => {
    const at = i.dueAt ?? i.remindAt;
    return {
      id: i.id,
      type: i.type as UnderstandItem["type"],
      title: i.title,
      ...(at ? { due_local: toLocalIso(at, tz).slice(0, 16) } : {}),
      repeat: i.repeatEveryMinutes ?? null,
      debt_person: i.debtPerson ?? null,
      debt_amount: i.debtAmount === null || i.debtAmount === undefined ? null : Number(i.debtAmount),
      debt_direction: (i.debtDirection as UnderstandItem["debt_direction"]) ?? null,
    };
  });
  const app = ctx.app
    ? {
        circles: ctx.app.circles.map((c) => ({ name: c.name, kind: c.kind, members: c.members.filter((m) => m.userId !== ctx.user.id && m.name).map((m) => m.name!) })),
        sections: ctx.app.sections.map((s) => ({ name: s.name, kind: s.kind })),
        trackers: ctx.app.trackers.map((t) => ({ kind: t.kind, name: t.name })),
      }
    : undefined;
  return {
    text,
    nowLocal: toLocalIso(ctx.now, tz).slice(0, 16),
    history: recent.map((m) => ({ role: m.role === "user" ? ("user" as const) : ("assistant" as const), text: m.text })),
    openItems,
    ...(app ? { app } : {}),
  };
}
