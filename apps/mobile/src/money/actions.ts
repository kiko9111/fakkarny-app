import { randomUUID } from "expo-crypto";
import type { MoneyKind, MoneySection, SectionDetail } from "@fakkarni/shared";
import { addMoney, createSection, deleteMoneyEntry, queueAddMoney, peekMoney, peekMoneySaved, peekSectionSaved, saveMoney, saveSection } from "@/lib/api";
import { dataChanged } from "@/lib/live";
import { QueuedOffline } from "@/sync/writes";
import { detailFromSection, sameSection, withEntry, withSection } from "./logic";

/**
 * Daftar money changes, local-first (2026-11-25). Each write gets its id on the phone and is
 * shown at once: while it is on its way (or waits for a connection) api.ts lays it over the saved
 * copy of the screen; when the server answers, its answer goes into the saved copy. A refusal
 * takes nothing back by hand (the write simply stops being laid over) and `onFailed` tells the
 * person. A server hiccup or no connection keeps the write in the outbox: `onQueued`.
 */

export type Made = { section: MoneySection; existed: boolean };

/** Sections made on this phone whose create is still on its way: an add waits for it. */
const creating = new Map<string, Promise<unknown>>();
/** A server from before 2026-11-25 ignores the phone's id and picks its own: phone id → server id. */
const aliases = new Map<string, string>();
export const realSectionId = (id: string) => aliases.get(id) ?? id;

/** A new section, or the one the user already has with that name and kind ("Salary" = "salary"). */
export function makeSection(input: { name: string; kind: MoneyKind; budget: number | null; circle_id: string | null }, cb: { onFailed: () => void; onQueued?: () => void }): Made {
  const had = sameSection(peekMoney()?.sections ?? [], input.name, input.kind, input.circle_id);
  if (had) return { section: had, existed: true };
  const id = randomUUID();
  const write = createSection({ id, name: input.name.trim(), kind: input.kind, budget: input.kind === "expense" ? input.budget : null, circle_id: input.circle_id });
  creating.set(id, write);
  void write.finally(() => creating.delete(id)).catch(() => {});
  void write
    .then((saved) => {
      if (saved.id !== id) aliases.set(id, saved.id);
      const o = peekMoneySaved();
      if (o) saveMoney(withSection(o, saved));
      saveSection({ ...(peekSectionSaved(saved.id) ?? detailFromSection(saved)), section: saved });
      dataChanged.emit();
    })
    .catch((err) => {
      dataChanged.emit();
      if (err instanceof QueuedOffline) cb.onQueued?.();
      else cb.onFailed();
    });
  // The write is registered synchronously, so the overlay already shows the new section.
  const section = peekMoney()?.sections.find((s) => s.id === id);
  return { section: section ?? { id, name: input.name.trim(), kind: input.kind, budget: input.kind === "expense" ? input.budget : null, circle_id: input.circle_id, circle_name: null, is_owner: true, month_total: 0, my_share: 0, created_at: new Date().toISOString() }, existed: false };
}

/** Log an amount. `split` only matters in a shared book (null = every member). */
export function logAmount(sectionId: string, input: { amount: number; note: string | null; split: string[] | null }, cb: { onFailed: () => void; onQueued?: () => void }): void {
  const body = { id: randomUUID(), amount: input.amount, note: input.note, ...(input.split?.length ? { split: input.split } : {}) };
  const pending = creating.get(sectionId);
  // Straight after making the section (a receipt into a new section): the add goes after the create.
  const send = pending
    ? pending.then(
        () => addMoney(realSectionId(sectionId), body),
        (err: unknown) => {
          if (!(err instanceof QueuedOffline)) throw err;
          queueAddMoney(sectionId, body);
          throw err;
        },
      )
    : addMoney(realSectionId(sectionId), body);
  void send
    .then((res) => {
      const d = peekSectionSaved(res.section.id);
      if (d && res.entry) saveSection({ ...withEntry(d, res.entry), section: res.section });
      const o = peekMoneySaved();
      if (o) saveMoney(withSection(o, res.section));
      dataChanged.emit();
    })
    .catch((err) => {
      dataChanged.emit();
      if (err instanceof QueuedOffline) cb.onQueued?.();
      else cb.onFailed();
    });
}

/** Take one of the user's own amounts out. */
export function removeAmount(detail: SectionDetail, entryId: string, cb: { onFailed: () => void }): void {
  const entry = detail.entries.find((e) => e.id === entryId);
  if (!entry) return;
  void deleteMoneyEntry(entryId)
    .then(() => {
      const d = peekSectionSaved(detail.section.id);
      if (d) {
        const next = withEntry(d, entry, -1);
        saveSection(next);
        const o = peekMoneySaved();
        if (o) saveMoney(withSection(o, next.section));
      }
      dataChanged.emit();
    })
    .catch((err) => {
      dataChanged.emit();
      if (!(err instanceof QueuedOffline)) cb.onFailed();
    });
}
