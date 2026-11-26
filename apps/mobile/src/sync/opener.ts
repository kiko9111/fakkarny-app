import type { Opener } from "./stream";

/**
 * How an answer that arrives in pieces is read (the transport of sync/stream.ts).
 *
 * React Native's `fetch` hands the body over only when it is complete. Its XMLHttpRequest
 * reports the text so far while it arrives, as long as a readystatechange or progress handler is
 * set before `send`, so that is what the phone uses. Where there is no XMLHttpRequest (Node: the
 * end-to-end test) the body is read from fetch's own stream.
 */

/** The parts of XMLHttpRequest this needs (so a test can stand in for it). */
export interface XhrLike {
  readyState: number;
  status: number;
  responseText: string;
  onreadystatechange: (() => void) | null;
  onprogress: (() => void) | null;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  ontimeout: (() => void) | null;
  onabort: (() => void) | null;
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  getResponseHeader(name: string): string | null;
  send(body: string): void;
  abort(): void;
}

const HEADERS_RECEIVED = 2;
const LOADING = 3;
const DONE = 4;

export function createXhrOpener(make: () => XhrLike): Opener {
  return ({ url, headers, body, timeoutMs, onStart, onText }) =>
    new Promise<void>((resolve, reject) => {
      const xhr = make();
      let started = false;
      let read = 0;
      let settled = false;
      const settle = (err?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      };
      /** Hand on whatever is new: the status and headers once, then each new piece of text. */
      const pump = () => {
        if (settled) return;
        try {
          if (!started && xhr.readyState >= HEADERS_RECEIVED && xhr.status > 0) {
            started = true;
            onStart({ status: xhr.status, contentType: xhr.getResponseHeader("content-type") ?? "" });
          }
          if (started && xhr.readyState >= LOADING) {
            const text = xhr.responseText ?? "";
            if (text.length > read) {
              const piece = text.slice(read);
              read = text.length;
              onText(piece);
            }
          }
        } catch (err) {
          settle(err);
          xhr.abort();
        }
      };
      const timer = setTimeout(() => {
        settle(new TypeError("Network request timed out"));
        xhr.abort();
      }, timeoutMs);

      // Not at the end: React Native puts the error's own words in `responseText` when a request
      // fails, and says which it was (load or error) only after this event.
      xhr.onreadystatechange = () => {
        if (xhr.readyState !== DONE) pump();
      };
      xhr.onprogress = pump;
      xhr.onload = () => {
        pump();
        // Status 0 at the end: there was no answer after all.
        settle(xhr.status === 0 ? new TypeError("Network request failed") : undefined);
      };
      xhr.onerror = () => settle(new TypeError("Network request failed"));
      xhr.ontimeout = () => settle(new TypeError("Network request timed out"));
      xhr.onabort = () => settle(new TypeError("Network request aborted"));
      try {
        xhr.open("POST", url);
        for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
        xhr.send(body);
      } catch (err) {
        settle(err);
      }
    });
}

/** fetch with a readable body (Node, browsers). */
export const fetchOpener: Opener = async ({ url, headers, body, timeoutMs, onStart, onText }) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "POST", headers, body, signal: ctrl.signal });
    onStart({ status: res.status, contentType: res.headers.get("content-type") ?? "" });
    const reader = res.body?.getReader();
    if (!reader) return onText(await res.text());
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const piece = decoder.decode(value, { stream: true });
      if (piece) onText(piece);
    }
    const rest = decoder.decode();
    if (rest) onText(rest);
  } finally {
    clearTimeout(timer);
  }
};

/** The opener for where this code runs. */
export const openReply: Opener = typeof XMLHttpRequest === "function" ? createXhrOpener(() => new XMLHttpRequest() as unknown as XhrLike) : fetchOpener;
