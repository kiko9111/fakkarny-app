// Draws the grounds behind every screen (assets/bg/mesh-*.jpg): a light, clearly visible mesh of
// the theme (owner, 2026-11-27: the playful first look merged with the calm one): a glow in the
// top-end corner, a blush at mid-start, a paler glow at the bottom-end, on a warm near-white.
// Session's ground (calm) stays quiet.
//
//   node scripts/make-meshes.mjs            (from apps/mobile; needs Playwright's chromium,
//                                            `npm i -g playwright` or NODE_PATH pointing at it)
//
// Keep the file names and the 540x1170 size: src/ui/glass.tsx requires them, and the web preview
// inlines them. Change a tint here, run it, and look at a screen before committing the JPGs.
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("playwright");
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "bg");

const W = 540;
const H = 1170;
/** base: the page colour (themes.ts `bg`). Spots: [r, g, b, strength at the centre]. */
const MESHES = {
  sunrise: { base: "#FFFAF5", glow: [255, 172, 122, 0.46], blush: [255, 168, 190, 0.26], far: [255, 214, 130, 0.34] },
  mint: { base: "#F7FCFA", glow: [104, 212, 182, 0.42], blush: [150, 204, 242, 0.24], far: [204, 232, 150, 0.28] },
  cloud: { base: "#FAF8FF", glow: [170, 150, 245, 0.4], blush: [246, 170, 214, 0.24], far: [160, 200, 250, 0.28] },
  calm: { base: "#FAFAFD", glow: [150, 140, 235, 0.2], blush: [150, 140, 235, 0], far: [150, 190, 240, 0.09] },
};

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, m] of Object.entries(MESHES)) {
  const data = await page.evaluate(
    ({ W, H, m }) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d");
      g.fillStyle = m.base;
      g.fillRect(0, 0, W, H);
      const spot = (x, y, r, [red, green, blue, a]) => {
        if (!a) return;
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        // An eased fall-off, so the glow has no visible edge.
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          grad.addColorStop(t, `rgba(${red},${green},${blue},${(a * (1 - t) ** 2).toFixed(4)})`);
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
      };
      spot(W * 0.95, H * 0.0, W * 1.2, m.glow);
      spot(W * 0.0, H * 0.45, W * 0.95, m.blush);
      spot(W * 1.0, H * 0.95, W * 1.1, m.far);
      return c.toDataURL("image/jpeg", 0.92);
    },
    { W, H, m },
  );
  writeFileSync(join(out, `mesh-${name}.jpg`), Buffer.from(data.split(",")[1], "base64"));
  console.log(`mesh-${name}.jpg`);
}
await browser.close();
