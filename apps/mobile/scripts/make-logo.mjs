// Draws the logo and Zaki's art from one source, assets/logo/zaki-mark.svg (the spark smile on a
// soft mesh tile): the app icon, the Android adaptive layers, the splash, the favicon and the
// in-app art for every theme and mood. Change the mark or a colour there or here, run this, and
// LOOK at the PNGs (also at 48 px) before committing them.
//
//   node scripts/make-logo.mjs              (from apps/mobile; needs Playwright's chromium,
//                                            `npm i -g playwright` or NODE_PATH pointing at it)
//
// Keep every file's name, size and kind: app.json and src/ui/Zaki.tsx name them, the stores
// refuse an app icon with transparency, and Android shows only the centre 66% of its layers.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const { chromium } = createRequire(import.meta.url)("playwright");
const assets = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");
const source = readFileSync(join(assets, "logo", "zaki-mark.svg"), "utf8");

/**
 * The tile is the theme's ground (assets/bg, scripts/make-meshes.mjs), a little richer so it
 * holds on a home screen and under a white mark. base-a → base-b runs top-left to bottom-right;
 * light glows in the top corner, blush sits on the spark's side, warm lifts the bottom corner;
 * ink tints the mark's shadow and mark-b the foot of the mark.
 */
const THEMES = {
  sunrise: { "base-a": "#FFC592", "base-b": "#FF9F7C", light: "#FFEDB8", blush: "#FF8BA5", warm: "#FFC48E", ink: "#C2452A", "mark-b": "#FFF3EA" },
  mint: { "base-a": "#8CE6CA", "base-b": "#4CCBAE", light: "#DDFBEA", blush: "#4FB3E8", warm: "#8FE0CF", ink: "#0F6F60", "mark-b": "#ECFBF6" },
  cloud: { "base-a": "#C3B2FB", "base-b": "#A28DF6", light: "#F1EAFF", blush: "#EC9BD0", warm: "#C7B6FB", ink: "#4B33B0", "mark-b": "#F3EFFF" },
};

/** How much of an Android layer the mark takes: the launcher's mask keeps only the centre 66%. */
const ANDROID_MARK = 0.76;

/**
 * shape: square (full bleed) | squircle (transparent corners) | none. mark: full | flat | none.
 * opaque: written without an alpha channel. scale: the mark's size about the centre.
 */
const FILES = [
  { file: "icon.png", size: 1024, shape: "square", opaque: true },
  { file: "android-icon-background.png", size: 1024, shape: "square", mark: "none", opaque: true },
  { file: "android-icon-foreground.png", size: 1024, shape: "none", scale: ANDROID_MARK },
  { file: "android-icon-monochrome.png", size: 1024, shape: "none", mark: "flat", scale: ANDROID_MARK },
  { file: "splash-icon.png", size: 1024, shape: "squircle" },
  { file: "favicon.png", size: 48, shape: "squircle" },
  ...Object.keys(THEMES).flatMap((theme) =>
    ["happy", "calm"].map((mood) => ({ file: `zaki/zaki-${theme}-${mood}.png`, size: 288, shape: "squircle", theme, mood })),
  ),
];

/** A PNG from raw RGBA, with or without the alpha channel (no dependency: zlib only). */
function png(rgba, size, alpha) {
  const n = alpha ? 4 : 3;
  const line = size * n;
  const rows = Buffer.alloc(size * line);
  for (let i = 0, o = 0; i < size * size * 4; i += 4) {
    rows[o++] = rgba[i];
    rows[o++] = rgba[i + 1];
    rows[o++] = rgba[i + 2];
    if (alpha) rows[o++] = rgba[i + 3];
  }
  // Each row is stored with whichever of PNG's five filters leaves the smallest numbers:
  // soft gradients then pack to about half the size.
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const raw = Buffer.alloc(size * (line + 1));
  const tries = [0, 1, 2, 3, 4].map(() => Buffer.alloc(line));
  for (let y = 0; y < size; y++) {
    const at = y * line;
    let best = 0;
    let least = Infinity;
    for (let filter = 0; filter < 5; filter++) {
      let sum = 0;
      for (let x = 0; x < line; x++) {
        const left = x >= n ? rows[at + x - n] : 0;
        const up = y ? rows[at + x - line] : 0;
        const corner = x >= n && y ? rows[at + x - line - n] : 0;
        const guess = [0, left, up, (left + up) >> 1, paeth(left, up, corner)][filter];
        const v = (rows[at + x] - guess) & 255;
        tries[filter][x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < least) {
        least = sum;
        best = filter;
      }
    }
    raw[y * (line + 1)] = best;
    tries[best].copy(raw, y * (line + 1) + 1);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head.set([8, alpha ? 6 : 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${source}`);

for (const f of FILES) {
  await page.evaluate(
    ({ f, colours }) => {
      const svg = document.querySelector("svg");
      svg.setAttribute("width", f.size);
      svg.setAttribute("height", f.size);
      svg.dataset.shape = f.shape;
      svg.dataset.mood = f.mood ?? "happy";
      svg.dataset.mark = f.mark ?? "full";
      for (const [name, value] of Object.entries(colours)) svg.style.setProperty(`--${name}`, value);
      const s = f.scale ?? 1;
      const c = 512 * (1 - s);
      document.getElementById("face").setAttribute("transform", `translate(${c} ${c}) scale(${s})`);
    },
    { f, colours: THEMES[f.theme ?? "sunrise"] },
  );
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: f.size, height: f.size }, omitBackground: true });
  // Read the pixels back, so the file is written here: exact size, alpha only where it is meant.
  const packed = await page.evaluate(async (b64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob(), { premultiplyAlpha: "none" });
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = canvas.getContext("2d");
    g.drawImage(bitmap, 0, 0);
    const data = g.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let text = "";
    for (let i = 0; i < data.length; i += 0x8000) text += String.fromCharCode(...data.subarray(i, i + 0x8000));
    return btoa(text);
  }, shot.toString("base64"));
  const pixels = Buffer.from(packed, "base64");
  if (f.opaque && pixels.some((v, i) => i % 4 === 3 && v !== 255)) throw new Error(`${f.file} must have no transparency`);
  writeFileSync(join(assets, f.file), png(pixels, f.size, !f.opaque));
  console.log(`${f.file} ${f.size}x${f.size} ${f.opaque ? "RGB" : "RGBA"}`);
}
await browser.close();
