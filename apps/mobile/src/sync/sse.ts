/**
 * Server-sent events read from text that arrives in pieces (a reply being written, see
 * sync/stream.ts). Pure: `feed` takes each piece, cut anywhere, and reports every event that is
 * complete. An event is `event: <name>` and `data: <text>` lines ended by a blank line; lines
 * that start with ":" are keep-alive comments.
 */
export function createSseReader(onEvent: (event: string, data: string) => void) {
  let buffer = "";
  return {
    feed(piece: string): void {
      if (!piece) return;
      buffer += piece;
      for (;;) {
        const end = /\r\n\r\n|\n\n|\r\r/.exec(buffer);
        if (!end) return;
        const block = buffer.slice(0, end.index);
        buffer = buffer.slice(end.index + end[0].length);
        let event = "message";
        const data: string[] = [];
        for (const line of block.split(/\r\n|\n|\r/)) {
          if (!line || line.startsWith(":")) continue;
          const at = line.indexOf(":");
          const field = at < 0 ? line : line.slice(0, at);
          const value = at < 0 ? "" : line.slice(at + 1).replace(/^ /, "");
          if (field === "event") event = value;
          else if (field === "data") data.push(value);
        }
        if (data.length) onEvent(event, data.join("\n"));
      }
    },
    /** Text received after the last complete event (an answer cut off mid-event). */
    get rest(): string {
      return buffer;
    },
  };
}
