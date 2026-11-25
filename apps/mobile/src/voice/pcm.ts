/**
 * 16 kHz mono 16-bit PCM from the microphone arrives as base64 chunks; whisper.rn takes the raw
 * samples as one ArrayBuffer. Pure, so it is unit-tested.
 */
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = (() => {
  const t = new Uint8Array(256);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i + 3 < clean.length + 3; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]!, b = LOOKUP[clean.charCodeAt(i + 1)]!;
    const c = i + 2 < clean.length ? LOOKUP[clean.charCodeAt(i + 2)]! : 0;
    const d = i + 3 < clean.length ? LOOKUP[clean.charCodeAt(i + 3)]! : 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (i + 2 < clean.length && o < out.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < clean.length && o < out.length) out[o++] = n & 255;
    if (i + 4 >= clean.length) break;
  }
  return out;
}

/** Join the chunks into one buffer (an even number of bytes: whole 16-bit samples). */
export function joinChunks(chunks: Uint8Array[]): ArrayBuffer {
  const total = chunks.reduce((n, c) => n + c.length, 0) & ~1;
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, total - o);
    out.set(c.subarray(0, take), o);
    o += take;
    if (o >= total) break;
  }
  return out.buffer;
}

/** Seconds of audio in a 16 kHz 16-bit mono buffer. */
export const seconds = (bytes: number) => bytes / 32000;

/** Loudest sample (0–1): near silence means nothing was said. */
export function peak(buf: ArrayBuffer): number {
  const v = new Int16Array(buf);
  let m = 0;
  for (let i = 0; i < v.length; i++) {
    const a = Math.abs(v[i]!);
    if (a > m) m = a;
  }
  return m / 32768;
}

/** Whisper's text → what goes into the composer: no "[music]"-style tags, single spaces. */
export function cleanTranscript(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
