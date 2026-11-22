// Builds the browser preview (sample data, no server) as ONE self-contained HTML file:
//   node scripts/build-web-preview.mjs [out.html]
// Used for the shareable test link; the phone builds are unaffected.
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "dist-preview/zaki-preview.html");
const dir = mkdtempSync(join(tmpdir(), "zaki-web-"));
execSync(`npx expo export -p web --output-dir ${dir}`, {
  stdio: "inherit",
  env: { ...process.env, EXPO_PUBLIC_DEMO: "1", CI: "1", EXPO_OFFLINE: process.env.EXPO_OFFLINE ?? "1" },
});

let html = readFileSync(join(dir, "index.html"), "utf8");
const inlineFile = (rel) => readFileSync(join(dir, rel.replace(/^\//, "")), "utf8").replace(/<\/script/gi, "<\\/script");
html = html.replace(/<script src="([^"]+)" defer><\/script>/g, (_m, src) => `<script>${inlineFile(src)}</script>`);
html = html.replace(/<link rel="icon"[^>]*>/, "");
// Font files (icons, typefaces) become data: URLs so the page needs nothing else.
const assets = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : assets.push(join(d, f))));
walk(dir);
for (const file of assets.filter((f) => /\.(ttf|otf|png)$/.test(f))) {
  const rel = file.slice(dir.length);
  const mime = file.endsWith(".png") ? "image/png" : "font/ttf";
  html = html.split(`"${rel}"`).join(`"data:${mime};base64,${readFileSync(file).toString("base64")}"`);
}
// Hosted previews live at a path the router doesn't know: start the app at "/" and remember
// the real address for reloads (switching language reloads the app).
const boot = `<script>window.__ZAKI_HREF__=location.href;try{history.replaceState(null,"","/")}catch(e){}</script>`;
html = html.replace("<head>", `<head>${boot}`);
execSync(`mkdir -p "${resolve(out, "..")}"`);
writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
