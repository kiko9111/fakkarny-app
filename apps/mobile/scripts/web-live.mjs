// The real app in a browser against a local API (not the sample-data preview):
//
//   EXPO_PUBLIC_API_URL=http://127.0.0.1:4200 npx expo export -p web --output-dir <dir>
//       (EXPO_PUBLIC_DEMO unset; with no Supabase variables the app starts without sign-in)
//   node scripts/web-live.mjs <dir> [port=4200] [api-port=3999]
//
// One local address for the exported app and the API behind it, so the browser talks to the
// API on the page's own origin (no CORS; http://127.0.0.1 counts as a secure page, so
// crypto.randomUUID works). A file that exists is served, a page navigation gets index.html,
// everything else goes to the API as it is and the answer comes back piece by piece (a reply
// that is streamed stays a stream).
//
// CUT=<n> cuts the first n streamed answers shortly after their first words, the way a proxy
// that does not pass streams on would: the app must answer each message the plain way at once,
// and stop asking for a stream after two in a row.
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 4200);
const api = { host: "127.0.0.1", port: Number(process.argv[4] ?? 3999) };
let cuts = Number(process.env.CUT ?? 0);
const types = { ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".json": "application/json", ".ico": "image/x-icon", ".png": "image/png", ".jpg": "image/jpeg", ".ttf": "font/ttf", ".otf": "font/otf", ".wasm": "application/wasm", ".css": "text/css" };

http
  .createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    const file = join(dir, path);
    if (req.method === "GET" && file.startsWith(dir) && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      return void createReadStream(file).pipe(res);
    }
    if (req.method === "GET" && String(req.headers.accept ?? "").includes("text/html")) {
      res.writeHead(200, { "content-type": types[".html"] });
      return void createReadStream(join(dir, "index.html")).pipe(res);
    }
    const out = http.request({ ...api, path: req.url, method: req.method, headers: { ...req.headers, host: `${api.host}:${api.port}` } }, (back) => {
      const streamed = String(back.headers["content-type"] ?? "").startsWith("text/event-stream");
      // Paths and kinds only: never a body.
      console.log(`${req.method} ${(req.url ?? "").split("?")[0]} accept=${req.headers.accept ?? ""} -> ${back.statusCode} ${back.headers["content-type"] ?? ""}`);
      res.writeHead(back.statusCode ?? 502, back.headers);
      if (!streamed || cuts <= 0) return void back.pipe(res);
      cuts--;
      let cut = false;
      back.on("data", (piece) => {
        if (!res.destroyed) res.write(piece);
        if (!cut && String(piece).includes("event: draft")) {
          cut = true;
          console.log("cut this stream after its first words");
          setTimeout(() => res.destroy(), 120);
        }
      });
      back.on("end", () => res.end());
    });
    out.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.pipe(out);
  })
  .listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port} (app from ${dir}, API on ${api.port}${cuts ? `, cutting the first ${cuts} streamed answers` : ""})`));
