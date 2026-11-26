/**
 * Plans items' local notifications in the background, one native call at a time, and only the
 * calls that change something (reconcile.ts). Nothing the user sees waits for it: the chat reply,
 * the saved plan, Today and the PATCH to the server go ahead while it works. Pure: the native
 * calls and the stored record are injected, so it is unit-tested.
 */
import type { Item } from "@fakkarni/shared";
import { itemIdOf, type PlannedNotification } from "./plan";
import { itemChanges, launchSignature, signature, UNKNOWN } from "./reconcile";

/** A notification the phone has scheduled, and when it fires when the phone says (Android does). */
export interface Listed {
  identifier: string;
  at: number | null;
}

/**
 * When a scheduled request fires, from the trigger the phone lists it with: Android gives a date
 * trigger as {type: "date", value: <ms>}. Anything else (iOS lists a date as calendar parts) is
 * null, an unknown time.
 */
export function listedAt(trigger: unknown): number | null {
  if (!trigger || typeof trigger !== "object") return null;
  const { type, value } = trigger as { type?: unknown; value?: unknown };
  return type === "date" && typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export interface NotificationHost {
  /** Every notification the phone has scheduled now (one native call); null if it can't say. */
  list(): Promise<Listed[] | null>;
  /** Schedule one notification; scheduling an identifier that is already scheduled replaces it. */
  schedule(n: PlannedNotification, item: Item): Promise<void>;
  cancel(identifier: string): Promise<void>;
  /** What this app recorded as scheduled (identifier → signature), kept between launches. */
  load(): Record<string, string> | null;
  save(record: Record<string, string>): void;
  /** Identifiers older app versions may have left for an item (cleared when the phone's list can't be read). */
  legacy(itemId: string): string[];
}

export interface SchedulerOptions {
  host: NotificationHost;
  /** The item's planned notifications at this moment (an open reminder or task). */
  plan: (item: Item, now: Date) => PlannedNotification[];
  now?: () => number;
  /** A native call with no answer after this long counts as failed, so one stuck call can't hold every reminder after it. */
  callTimeoutMs?: number;
  /** The record is written after this many items that changed it, and when the queue is empty. */
  saveEvery?: number;
}

export interface Scheduler {
  /**
   * Re-plan these items in the background. `soon` puts them ahead of a bulk top-up (a reminder
   * just made in the chat must not wait behind every other item). Resolves when they are done;
   * callers on the user's path never wait for it.
   */
  enqueue(items: readonly Item[], soon?: boolean): Promise<void>;
  /** A notification scheduled outside the plan (the "Later" snooze), so closing its item clears it. */
  remember(identifier: string, sig: string): void;
  /**
   * The items the phone holds notifications of, as far as this app knows (the record and the
   * phone's own list are read first if they haven't been). A plan closed while the app was stopped
   * before its notifications went, or whose cancel failed, stays among them until planned again.
   */
  tracked(): Promise<string[]>;
  /**
   * Forget everything and stop (the phone is being wiped; the caller cancels every notification
   * after `idle`). Items enqueued after it belong to the person being wiped and are dropped, until
   * `reopen`.
   */
  reset(): void;
  /** Take items again after `reset` (every notification of the last person is gone). */
  reopen(): void;
  /** Resolves when nothing is being worked on. */
  idle(): Promise<void>;
}

export function createScheduler({ host, plan, now = Date.now, callTimeoutMs = 15_000, saveEvery = 1 }: SchedulerOptions): Scheduler {
  /** identifier → signature of what is scheduled, as far as this app knows; null until read. */
  let known: Map<string, string> | null = null;
  /** Whether the phone's own list was read: if not, identifiers older versions used are cleared once per item. */
  let listed = false;
  /** Items planned since this launch. The first time, everything planned is scheduled again (replaced):
   * the record can't see an alarm the system dropped (a force stop clears them), and a launch is when that shows. */
  const seen = new Set<string>();
  const queue = new Map<string, Item>();
  const waiting = new Map<string, Array<() => void>>();
  const remembered: Array<[string, string]> = [];
  let draining: Promise<void> | null = null;
  let dirty = false;
  /** Bumped by reset(): work started before it stops between native calls. */
  let generation = 0;
  /** From reset() to reopen(): what is enqueued belongs to the person being wiped. */
  let closed = false;

  const timed = <T>(p: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("notification call timed out")), callTimeoutMs);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e: unknown) => {
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String(e)));
        },
      );
    });

  function persist() {
    if (!dirty || !known) return;
    dirty = false;
    try {
      host.save(Object.fromEntries(known));
    } catch {
      // storage full or gone: the next launch reads the phone's list instead
    }
  }

  async function start(gen: number) {
    let saved: Record<string, string> = {};
    try {
      saved = host.load() ?? {};
    } catch {
      saved = {};
    }
    let present: Listed[] | null = null;
    try {
      present = await timed(host.list());
    } catch {
      present = null;
    }
    if (gen !== generation) return;
    const map = new Map<string, string>();
    if (present) {
      listed = true;
      // What the phone holds is the truth; the record only adds the details (launchSignature). One
      // listed past its time has not rung yet (Android rings late): an open plan's is left to
      // ring, a closed plan's is cancelled.
      const t = now();
      for (const { identifier, at } of present) map.set(identifier, launchSignature(saved[identifier], at, t));
      dirty = true;
    } else {
      for (const [id, sig] of Object.entries(saved)) map.set(id, sig);
    }
    for (const [id, sig] of remembered.splice(0)) map.set(id, sig);
    known = map;
  }

  async function reconcile(item: Item, gen: number) {
    const k = known;
    if (!k) return;
    const first = !seen.has(item.id);
    seen.add(item.id);
    if (first && !listed) for (const id of host.legacy(item.id)) if (!k.has(id)) k.set(id, UNKNOWN);
    const t = now();
    const open = item.status === "open";
    const wanted = open && (item.type === "reminder" || item.type === "task") ? plan(item, new Date(t)) : [];
    const changes = itemChanges(item.id, wanted, k, t, open);
    for (const id of changes.forget) k.delete(id);
    if (changes.forget.length) dirty = true;
    for (const id of changes.cancel) {
      if (gen !== generation) return;
      try {
        await timed(host.cancel(id));
        k.delete(id);
        dirty = true;
      } catch {
        // kept in the record: the next pass tries again
      }
    }
    for (const n of first ? wanted : changes.schedule) {
      if (gen !== generation) return;
      try {
        await timed(host.schedule(n, item));
        k.set(n.identifier, signature(n));
      } catch {
        // Not known to be scheduled as planned: the next pass schedules it again, and closing the item still clears it.
        k.set(n.identifier, UNKNOWN);
      }
      dirty = true;
    }
  }

  function drain(): Promise<void> {
    if (draining) return draining;
    const gen = generation;
    draining = (async () => {
      try {
        if (!known) await start(gen);
        let n = 0;
        while (queue.size && gen === generation) {
          const [id, item] = queue.entries().next().value as [string, Item];
          queue.delete(id);
          const done = waiting.get(id) ?? [];
          waiting.delete(id);
          try {
            await reconcile(item, gen);
          } catch {
            // a planning error must not stop the items after it
          }
          for (const resolve of done) resolve();
          if (++n % saveEvery === 0) persist();
        }
      } finally {
        persist();
        draining = null;
        // reset() empties the queue, so whatever is in it now was enqueued since: a run stopped by a
        // reset still hands it on.
        if (queue.size) void drain();
      }
    })();
    return draining;
  }

  return {
    enqueue(items, soon = false) {
      if (!items.length || closed) return Promise.resolve();
      const done = items.map(
        (item) =>
          new Promise<void>((resolve) => {
            const list = waiting.get(item.id) ?? [];
            list.push(resolve);
            waiting.set(item.id, list);
          }),
      );
      if (soon) {
        const ids = new Set(items.map((i) => i.id));
        const rest = [...queue].filter(([id]) => !ids.has(id));
        queue.clear();
        for (const item of items) queue.set(item.id, item);
        for (const [id, item] of rest) queue.set(id, item);
      } else {
        // An item already waiting keeps its place, with the newer copy.
        for (const item of items) queue.set(item.id, item);
      }
      void drain();
      return Promise.all(done).then(() => undefined);
    },
    remember(identifier, sig) {
      if (closed) return;
      if (!known) {
        remembered.push([identifier, sig]);
        return;
      }
      known.set(identifier, sig);
      dirty = true;
      persist();
    },
    async tracked() {
      // Reads the record and the phone's list first, if no run has yet.
      await drain();
      const ids = new Set<string>();
      for (const identifier of known?.keys() ?? []) {
        const id = itemIdOf(identifier);
        if (id) ids.add(id);
      }
      return [...ids];
    },
    reset() {
      generation++;
      queue.clear();
      for (const list of waiting.values()) for (const resolve of list) resolve();
      waiting.clear();
      remembered.length = 0;
      seen.clear();
      known = new Map();
      listed = true;
      closed = true;
      dirty = true;
      persist();
    },
    reopen() {
      closed = false;
    },
    async idle() {
      // A drain that ends with more queued starts the next one: wait for all of them.
      while (draining) await draining;
    },
  };
}
