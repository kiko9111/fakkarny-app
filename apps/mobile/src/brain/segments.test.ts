import { describe, expect, it } from "vitest";
import { fractionOf, MAX_TRIES, nextRange, pieceResult, retryWait, SEGMENT_BYTES } from "./segments";

describe("model download pieces", () => {
  it("asks for the next piece from what is on disk", () => {
    expect(nextRange(0, 100)).toBe("bytes=0-99");
    expect(nextRange(300, 100)).toBe("bytes=300-399");
  });
  it("knows when the file is complete", () => {
    expect(pieceResult(0, 100, 100)).toBe("more");
    expect(pieceResult(300, 42, 100)).toBe("done");
    // A file that ends exactly on a piece boundary: the next Range gets nothing (416 or empty).
    expect(pieceResult(400, 0, 100)).toBe("done");
  });
  it("accepts a server that ignores Range only from the start", () => {
    expect(pieceResult(0, 500, 100)).toBe("whole");
    expect(pieceResult(100, 500, 100)).toBe("bad");
    expect(pieceResult(0, 0, 100)).toBe("bad");
  });
  it("uses the exact size when the server gave it", () => {
    expect(nextRange(200, 100, 250)).toBe("bytes=200-249");
    expect(pieceResult(200, 50, 100, 250)).toBe("done");
    expect(pieceResult(100, 100, 100, 250)).toBe("more");
    expect(pieceResult(200, 80, 100, 250)).toBe("bad");
    expect(pieceResult(0, 250, 100, 250)).toBe("whole");
    expect(pieceResult(0, 300, 100, 250)).toBe("bad");
  });
  it("never shows 100% before the end", () => {
    expect(fractionOf(SEGMENT_BYTES, 2 * SEGMENT_BYTES)).toBe(0.5);
    expect(fractionOf(3 * SEGMENT_BYTES, 2 * SEGMENT_BYTES)).toBe(0.99);
    expect(fractionOf(5, 0)).toBe(0);
  });
});

describe("retryWait", () => {
  it("backs off, then tries once a minute for about half an hour, then pauses", () => {
    expect(retryWait(0)).toBe(2_000);
    expect(retryWait(5)).toBe(45_000);
    expect(retryWait(6)).toBe(60_000);
    expect(retryWait(MAX_TRIES - 1)).toBe(60_000);
    expect(retryWait(MAX_TRIES)).toBeNull();
  });
});
