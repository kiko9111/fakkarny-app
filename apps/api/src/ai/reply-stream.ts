/**
 * Reads Zaki's reply out of the `respond` tool's input while the model is still writing it, so
 * the phone can show the words as they come (routes/messages.ts sends them on as they arrive).
 *
 * The input is JSON that starts `{"reply":["…","…"],"create_items":[…` and reaches us in pieces
 * cut anywhere: inside a string, inside an escape, even between the two halves of an emoji (two
 * UTF-16 units, written as itself or as `\ud83d\udc9b`). `feed` takes each piece and reports the
 * new characters of each bubble; half an emoji is held until its other half arrives.
 *
 * It only ever reads the top-level `reply` array of strings and stops for good at anything it
 * does not expect. Nothing here decides the turn: the complete input is parsed and validated as
 * before, and that answer replaces whatever was shown.
 */
export function createReplyReader(onText: (bubble: number, delta: string) => void) {
  type Phase = "outer" | "array" | "string" | "done";
  let phase: Phase = "outer";

  // Outside the reply array: just enough of a JSON reader to find the top-level key.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let readingKey = false;
  let expectKey = false;
  let key = "";
  let lastKey: string | null = null;
  let afterColon = false;

  // Inside the reply array.
  let bubble = -1;
  /** "" = no escape open; "\\" = just saw the backslash; "u…" = collecting the 4 hex digits. */
  let escape = "";
  /** A high surrogate written as an escape, waiting for its other half. */
  let high = "";

  const SIMPLE: Record<string, string> = { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", '"': '"', "\\": "\\", "/": "/" };

  return {
    /** True once the reply array has closed (or the reader gave up): nothing more will be reported. */
    get finished() {
      return phase === "done";
    },

    feed(piece: string): void {
      if (phase === "done" || !piece) return;
      let out = "";
      let outBubble = bubble;
      const flush = () => {
        if (out) onText(outBubble, out);
        out = "";
      };

      for (let i = 0; i < piece.length; i++) {
        const c = piece[i]!;

        if (phase === "outer") {
          if (inString) {
            if (escaped) escaped = false;
            else if (c === "\\") escaped = true;
            else if (c === '"') {
              inString = false;
              if (readingKey) {
                readingKey = false;
                lastKey = key;
              }
            } else if (readingKey && key.length < 40) key += c;
            continue;
          }
          if (c === '"') {
            inString = true;
            if (depth === 1 && expectKey) {
              readingKey = true;
              expectKey = false;
              key = "";
            }
          } else if (c === "{") {
            depth++;
            if (depth === 1) expectKey = true;
            afterColon = false;
          } else if (c === "[") {
            if (depth === 1 && lastKey === "reply" && afterColon) phase = "array";
            else depth++;
            afterColon = false;
          } else if (c === "}" || c === "]") {
            depth--;
            if (depth <= 0) phase = "done"; // the input closed without a reply array
          } else if (c === ",") {
            if (depth === 1) {
              expectKey = true;
              lastKey = null;
              afterColon = false;
            }
          } else if (c === ":") {
            if (depth === 1 && lastKey !== null) afterColon = true;
          } else if (c !== " " && c !== "\n" && c !== "\t" && c !== "\r") {
            // A number, true/false/null: whatever it is, it is not the array we are looking for.
            afterColon = false;
          }
          if (phase === "done") break;
          continue;
        }

        if (phase === "array") {
          if (c === '"') {
            bubble++;
            outBubble = bubble;
            phase = "string";
          } else if (c === "]") {
            phase = "done";
            break;
          } else if (c !== "," && c !== " " && c !== "\n" && c !== "\t" && c !== "\r") {
            phase = "done"; // not a string: not ours to read
            break;
          }
          continue;
        }

        // phase === "string"
        if (escape) {
          if (escape === "\\") {
            if (c === "u") escape = "u";
            else {
              if (high) {
                out += "\uFFFD";
                high = "";
              }
              out += SIMPLE[c] ?? c;
              escape = "";
            }
            continue;
          }
          escape += c;
          if (escape.length < 5) continue;
          const code = Number.parseInt(escape.slice(1), 16);
          escape = "";
          if (Number.isNaN(code)) {
            phase = "done";
            break;
          }
          const written = String.fromCharCode(code);
          if (code >= 0xd800 && code <= 0xdbff) {
            if (high) out += "\uFFFD";
            high = written; // wait for the low half before showing anything
          } else if (code >= 0xdc00 && code <= 0xdfff) {
            out += high ? high + written : "\uFFFD";
            high = "";
          } else {
            if (high) {
              out += "\uFFFD";
              high = "";
            }
            out += written;
          }
          continue;
        }
        if (c === "\\") {
          escape = "\\";
          continue;
        }
        // An emoji written as itself is two units too, and a piece may end between them.
        const unit = c.charCodeAt(0);
        if (unit >= 0xd800 && unit <= 0xdbff) {
          if (high) out += "\uFFFD";
          high = c;
          continue;
        }
        if (unit >= 0xdc00 && unit <= 0xdfff) {
          out += high ? high + c : "\uFFFD";
          high = "";
          continue;
        }
        if (high) {
          out += "\uFFFD";
          high = "";
        }
        if (c === '"') {
          flush();
          phase = "array";
          continue;
        }
        out += c;
      }
      flush();
    },
  };
}

export type ReplyReader = ReturnType<typeof createReplyReader>;
