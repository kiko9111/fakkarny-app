import { FriendResponse, PhoneOutput, type AppAction } from "@fakkarni/shared";
import { toAppActions, type FriendModel, type FriendModelInput, type ModelOutput, type Usage } from "./model";

/**
 * Zaki's on-device brain (Android test mode): the phone's small model writes the compact
 * PhoneOutput; this turns it into the same strict FriendResponse the cloud model produces, so the
 * rest of the pipeline (safety net, reminder honesty check, apply, cards, undo) is unchanged.
 */

const zero: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" + minutes, as wall-clock arithmetic (no time zone involved). */
export function addMinutesLocal(local: string, minutes: number): string {
  const [d, t] = local.split("T");
  const [y, mo, da] = d!.split("-").map(Number);
  const [h, mi] = (t ?? "00:00").split(":").map(Number);
  const x = new Date(Date.UTC(y!, mo! - 1, da!, h!, mi! + minutes));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}T${pad(x.getUTCHours())}:${pad(x.getUTCMinutes())}`;
}

/**
 * A phone model's time → "YYYY-MM-DDTHH:mm", or undefined when it isn't one. Takes "+60" (minutes
 * from now), "2026-11-20T18:00", "2026-11-20 18:00", "2026-11-20T18:00:00" and a bare date (09:00).
 */
export function phoneTime(raw: string | undefined, nowLocal: string): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const rel = /^\+\s*(\d{1,5})\s*(m|min|minutes?)?$/i.exec(v);
  if (rel) {
    const m = Number(rel[1]);
    return m > 0 && m <= 60 * 24 * 60 ? addMinutesLocal(nowLocal, m) : undefined;
  }
  const abs = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(v);
  if (!abs) return undefined;
  const hh = abs[2] ? Number(abs[2]) : 9;
  const mm = abs[3] ? Number(abs[3]) : 0;
  if (hh > 23 || mm > 59) return undefined;
  return `${abs[1]}T${pad(hh)}:${abs[3] ? pad(mm) : "00"}`;
}

/** Loose phone JSON → strict FriendResponse. Throws when the reply itself is unusable. */
export function phoneToFriendResponse(raw: unknown, nowLocal: string): FriendResponse {
  const p = PhoneOutput.parse(raw);
  const t = (v: string | undefined) => phoneTime(v, nowLocal);
  const reply = p.reply.map((r) => r.trim()).filter(Boolean);
  const replies = reply.length <= 3 ? reply : [...reply.slice(0, 2), reply.slice(2).join(" ")];

  const create_items = p.items.flatMap((i) => {
    const title = i.title.trim();
    if (!title) return [];
    const when = t(i.when);
    const remind = t(i.remind) ?? (i.type === "reminder" ? when : undefined);
    const repeat = i.repeat_minutes && i.repeat_minutes >= 15 ? Math.min(10080, Math.round(i.repeat_minutes)) : undefined;
    const debt =
      i.type === "debt" && i.person?.trim() && i.amount && i.amount > 0
        ? { person: i.person.trim(), amount: i.amount, direction: i.direction ?? ("owed_to_me" as const) }
        : undefined;
    if (i.type === "debt" && !debt) return [];
    return [
      {
        type: i.type,
        title,
        ...(when ? { due_at_local: when } : {}),
        ...(remind && (i.type === "reminder" || i.type === "task") ? { remind_at_local: remind } : {}),
        ...(t(i.follow_up) ? { follow_up_at_local: t(i.follow_up) } : {}),
        ...(i.important ? { important: true } : {}),
        ...(i.alarm ? { alarm: true } : {}),
        ...(repeat ? { repeat_every_minutes: repeat } : {}),
        ...(debt ? { debt } : {}),
      },
    ];
  });

  const update_items = p.updates.flatMap((u) => {
    const when = t(u.when);
    const remind = t(u.remind) ?? when;
    const out = {
      id: u.id,
      ...(u.status ? { status: u.status } : {}),
      ...(when ? { due_at_local: when } : {}),
      ...(remind ? { remind_at_local: remind } : {}),
      ...(u.alarm !== undefined ? { alarm: u.alarm } : {}),
    };
    return Object.keys(out).length > 1 ? [out] : [];
  });

  const save_memories = p.memories.filter((m) => m.subject.trim() && m.content.trim());

  // Fill the cloud's flat action shape and reuse its tidy-up, so names resolve the same way.
  const blank: ModelOutput["app_actions"][number] = {
    kind: "log_money", name: "", title: "", section: "", tracker: "", circle: "", person: "", amount: 0, money_kind: "", tracker_kind: "", unit: "",
    ask_times: [], family: false, homework: false, note: "", text: "", due_at_local: "", remind_at_local: "", ref: "", answer: "", direction: "",
    people: [], checkin_kind: "", setting: "", screen: "",
  };
  const app_actions: AppAction[] = toAppActions(
    p.actions.map((a) => ({
      ...blank,
      kind: a.kind,
      name: a.name ?? "",
      title: a.title ?? "",
      section: a.section ?? "",
      tracker: a.tracker ?? "",
      circle: a.circle ?? "",
      person: a.person ?? "",
      amount: a.amount ?? 0,
      money_kind: a.money_kind ?? "",
      tracker_kind: a.tracker_kind ?? "",
      due_at_local: t(a.when) ?? "",
      direction: a.direction ?? "",
      screen: a.screen ?? "",
      checkin_kind: a.checkin_kind ?? "",
    })),
  );

  return FriendResponse.parse({ reply: replies, create_items, update_items, save_memories, app_actions, crisis: p.crisis });
}

/**
 * A FriendModel that "answers" with what the phone already wrote, so the pipeline runs exactly as
 * for the cloud. It never calls out: retries (the reminder honesty check) get the same answer back
 * and fall through to the honest reply. No summaries or proactive text from here.
 */
export function createPhoneAnswerModel(raw: unknown): FriendModel {
  return {
    async respond(input: FriendModelInput) {
      try {
        return { ok: true, output: phoneToFriendResponse(raw, input.nowLocal ?? `${input.todayLocal ?? "2026-01-01"}T12:00`), usage: zero };
      } catch {
        return { ok: false, reason: "invalid_output", usage: zero };
      }
    },
    async complete() {
      throw new Error("phone brain: no cloud completions");
    },
  };
}
