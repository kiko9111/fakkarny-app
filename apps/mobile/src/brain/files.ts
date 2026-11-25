import { Directory, File, Paths } from "expo-file-system";

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
  } catch {
    // Already gone.
  }
}

export interface Download {
  promise: Promise<void>;
  cancel(): void;
}

/** Download with progress (0–1). Resolves when the model file is in place. */
export function downloadModel(id: string, url: string, onProgress: (fraction: number) => void): Download {
  const part = new File(dir(), `${id}.part`);
  if (part.exists) part.delete();
  const task = File.createDownloadTask(url, part, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) onProgress(bytesWritten / totalBytes);
    },
  });
  const promise = (async () => {
    const out = await task.downloadAsync();
    if (!out) throw new Error("paused");
    const target = modelFile(id);
    if (target.exists) target.delete();
    out.move(target);
  })();
  return { promise, cancel: () => task.cancel() };
}
