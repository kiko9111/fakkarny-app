import { describe, expect, it } from "vitest";
import { createSseReader } from "./sse";

function read(pieces: string[]) {
  const events: [string, string][] = [];
  const reader = createSseReader((event, data) => events.push([event, data]));
  for (const p of pieces) reader.feed(p);
  return { events, rest: reader.rest };
}

describe("createSseReader", () => {
  const text = ': hello\n\nevent: draft\ndata: {"i":0,"d":"مر"}\n\nevent: draft\ndata: {"i":0,"d":"حبا 💛"}\n\n: ping\n\nevent: done\ndata: {"status":201}\n\n';
  const want = [
    ["draft", '{"i":0,"d":"مر"}'],
    ["draft", '{"i":0,"d":"حبا 💛"}'],
    ["done", '{"status":201}'],
  ];

  it("reads events and skips keep-alive comments", () => {
    expect(read([text]).events).toEqual(want);
  });

  it("gives the same events however the text is cut", () => {
    for (let cut = 0; cut <= text.length; cut++) expect(read([text.slice(0, cut), text.slice(cut)]).events, `cut at ${cut}`).toEqual(want);
    expect(read(text.split("")).events).toEqual(want);
  });

  it("waits for the blank line before reporting an event", () => {
    const out = read(['event: done\ndata: {"status":201}\n']);
    expect(out.events).toEqual([]);
    expect(out.rest).toBe('event: done\ndata: {"status":201}\n');
  });

  it("reads CRLF line ends, data without a name, and data over several lines", () => {
    expect(read(["event: a\r\ndata: 1\r\n\r\ndata: plain\r\n\r\n"]).events).toEqual([
      ["a", "1"],
      ["message", "plain"],
    ]);
    expect(read(["data: one\ndata: two\n\n"]).events).toEqual([["message", "one\ntwo"]]);
    expect(read(["data:tight\n\n"]).events).toEqual([["message", "tight"]]);
  });

  it("drops an event with no data", () => {
    expect(read(["event: empty\n\n"]).events).toEqual([]);
  });
});
