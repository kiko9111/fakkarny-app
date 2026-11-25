import { Directory, File, FileMode, Paths } from "expo-file-system";
import { fractionOf, nextRange, pieceResult, RETRY_WAITS_MS, SEGMENT_BYTES } from "./segments";

/**
 * Downloaded models live in the app's own documents folder (deleted with the app, never backed up
 * to anyone else). A download goes to "<name>.part" and is renamed when complete, so a cut-off
 * download is never mistaken for a model.
 */
const dir = () => {
  const d = new Directory(Paths.document, "models");
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

export const modelFile = (id: string) => new File(dir(), `${id}.bin`);

export function hasModel(id: string, bytes: number): boolean {
  try {
    const f = modelFile(id);
    // Allow a little difference: the catalog size is a guide, the server's file is the truth.
    return f.exists && (f.size ?? 0) > bytes * 0.9;
  } catch {
    return false;
  }
}

export function removeModel(id: string) {
  try {
    const f = modelFile(id);
    if (f.exists) f.delete();
    const part = new File(dir(), `${id}.part`);
    if (part.exists) part.delete();
  } catch {
    // Already gone.
  }
}

export interface Download {
  promise: Promise<void>;
  cancel(): void;
}

/** Bytes already downloaded for a model (kept between tries, and across app restarts). */
export function partialBytes(id: string): number {
  try {
    const part = new File(dir(), `${id}.part`);
    return part.exists ? (part.size ?? 0) : 0;
  } catch {
    return 0;
  }
}

/** The exact file size, when the server tells (it follows the redirect to the file host). */
async function remoteSize(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const n = Number(res.headers.get("content-length"));
    return res.ok && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** Add one downloaded piece to the end of the .part file, a few MB at a time. */
async function append(part: File, piece: File) {
  if (!part.exists) part.create();
  const out = part.open(FileMode.Append);
  const src = piece.open(FileMode.ReadOnly);
  try {
    for (;;) {
      const bytes = await src.readBytes(4 * 1024 * 1024);
      if (!bytes.length) break;
      await out.writeBytes(bytes);
    }
  } finally {
    src.close();
    out.close();
  }
}

const wait = (ms: number, stopped: () => boolean) =>
  new Promise<void>((resolve) => {
    const started = Date.now();
    const tick = () => (stopped() || Date.now() - started >= ms ? resolve() : setTimeout(tick, 250));
    tick();
  });

/**
 * Download with progress (0–1), in pieces (see segments.ts): a dropped connection costs one piece,
 * not the whole file, and is tried again by itself. Resolves when the model file is in place;
 * rejects after the retries run out, keeping what arrived for the next try.
 */
export function downloadModel(id: string, url: string, expected: number, onProgress: (fraction: number) => void): Download {
  const part = new File(dir(), `${id}.part`);
  const piece = new File(dir(), `${id}.piece`);
  let stopped = false;
  let task: ReturnType<typeof File.createDownloadTask> | null = null;

  const promise = (async () => {
    const total = await remoteSize(url);
    let tries = 0;
    for (;;) {
      if (stopped) throw new Error("cancelled");
      const have = part.exists ? (part.size ?? 0) : 0;
      if (total && have > total) part.delete();
      onProgress(fractionOf(have, total ?? expected));
      if (total && have === total) break;
      try {
        if (piece.exists) piece.delete();
        task = File.createDownloadTask(url, piece, {
          headers: { Range: nextRange(have, SEGMENT_BYTES, total) },
          onProgress: ({ bytesWritten }) => onProgress(fractionOf(have + bytesWritten, total ?? expected)),
        });
        const out = await task.downloadAsync();
        if (!out) throw new Error("paused");
        const got = piece.size ?? 0;
        const result = pieceResult(have, got, SEGMENT_BYTES, total);
        if (result === "bad") {
          // Not what we asked for: start clean rather than build a broken model.
          if (part.exists) part.delete();
          throw new Error("bad piece");
        }
        if (result === "whole") {
          if (part.exists) part.delete();
          piece.move(part);
          break;
        }
        await append(part, piece);
        tries = 0;
        if (result === "done") break;
      } catch (err) {
        if (stopped) throw err;
        if (tries >= RETRY_WAITS_MS.length) throw err;
        await wait(RETRY_WAITS_MS[tries++]!, () => stopped);
      }
    }
    if (piece.exists) piece.delete();
    const target = modelFile(id);
    if (target.exists) target.delete();
    part.move(target);
    onProgress(1);
  })();
  return {
    promise,
    cancel: () => {
      stopped = true;
      task?.cancel();
    },
  };
}
