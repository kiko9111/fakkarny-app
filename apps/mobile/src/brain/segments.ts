/**
 * Model downloads in pieces (pure rules; brain/files.ts does the file work). A 0.5–1.3 GB file in
 * one request dies with the first dropped connection on mobile data, and used to start again from
 * zero. Now each piece is asked for with an HTTP Range, added to "<id>.part", and a failed piece is
 * tried again with growing waits. Whatever arrived is kept, so the next try carries on from there.
 */
export const SEGMENT_BYTES = 32 * 1024 * 1024;
/** Waits before trying a failed piece again; after these, one try a minute (see retryWait). */
export const RETRY_WAITS_MS = [2_000, 5_000, 10_000, 20_000, 30_000, 45_000];
/**
 * How many failed tries in a row before the download pauses. A phone moving between cell towers
 * keeps "connected" the whole time, so no network event wakes a paused download: the old limit
 * (6 tries, about 8 minutes with the 60 s read timeout) left it stuck at 29% on LTE. Now it keeps
 * trying once a minute for about half an hour.
 */
export const MAX_TRIES = 36;

/** The wait before try number `tries` (0-based count of failures so far), or null to pause. */
export function retryWait(tries: number): number | null {
  if (tries >= MAX_TRIES) return null;
  return RETRY_WAITS_MS[tries] ?? 60_000;
}

/** The Range header for the next piece, given what is already on disk (and the file size when known). */
export function nextRange(have: number, segment = SEGMENT_BYTES, total: number | null = null): string {
  const end = have + segment - 1;
  return `bytes=${have}-${total ? Math.min(end, total - 1) : end}`;
}

/**
 * After a piece: is the file complete? A short piece means the end of the file. A piece larger than
 * asked means the server ignored the Range and sent the whole file (only valid from byte 0).
 */
export function pieceResult(have: number, got: number, segment = SEGMENT_BYTES, total: number | null = null): "more" | "done" | "whole" | "bad" {
  if (got > segment) return have === 0 && (!total || got === total) ? "whole" : "bad";
  if (total) {
    if (got <= 0 || have + got > total) return "bad";
    return have + got === total ? "done" : "more";
  }
  if (got <= 0) return have > 0 ? "done" : "bad";
  return got < segment ? "done" : "more";
}

/** Progress for the bar: bytes on disk against the catalog size, never shown as 100% before the end. */
export function fractionOf(have: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.min(0.99, have / expected);
}
