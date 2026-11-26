import { createEmitter } from "./emitter";

/**
 * Fired when something may have changed on the server: a chat reply arrived (Zaki may have logged
 * money, made a tracker, sent a task), new messages were pulled, offline taps went out, a card was
 * tapped. Screens that are open reload at once instead of waiting for the next visit, and no
 * saved copy counts as fresh any more (lib/api.ts).
 */
export const dataChanged = createEmitter<void>();

/**
 * Fired when saved copies were refreshed in the background (every tab's data in one answer):
 * screens in view re-read their copy from memory. No request follows from this one.
 */
export const cacheRefreshed = createEmitter<void>();

/**
 * Fired when plans in SQLite changed (a chat reply saved them, a pull brought them down, a tap
 * closed one): every list of plans re-reads SQLite at once, also a tab not in view, so it is
 * right when it is opened. Nothing goes to the server because of it.
 */
export const itemsChanged = createEmitter<void>();
