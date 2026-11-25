import { describe, expect, it } from "vitest";
import { base64ToBytes, cleanTranscript, joinChunks, peak, seconds } from "./pcm";

describe("voice pcm", () => {
  it("decodes base64 like Buffer does", () => {
    for (const bytes of [[], [1], [1, 2], [1, 2, 3], [255, 0, 128, 7, 9], Array.from({ length: 100 }, (_, i) => (i * 37) % 256)]) {
      const b64 = btoa(String.fromCharCode(...bytes));
      expect(Array.from(base64ToBytes(b64))).toEqual(bytes);
    }
  });
  it("joins chunks into whole samples and measures them", () => {
    const buf = joinChunks([new Uint8Array([0, 64]), new Uint8Array([0, 0, 9])]);
    expect(buf.byteLength).toBe(4);
    expect(peak(buf)).toBeCloseTo(0.5, 2);
    expect(seconds(32000)).toBe(1);
  });
  it("cleans whisper's text", () => {
    expect(cleanTranscript(" [موسيقى]  فكرني  بكرة (ضحك) ")).toBe("فكرني بكرة");
  });
});
