// Draws the grounds behind every screen (assets/bg/mesh-*.jpg): near-white, with a faint glow of
// the theme's colour strongest in the top corner and a fainter one in the opposite corner.
// Colour belongs to buttons, the active tab and status; the ground only hints at the theme.
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
/** base: the page colour (themes.ts `bg`). glow: [r, g, b] of the main corner, far: the opposite one. */
const MESHES = {
  sunrise: { base: "#FBFAF8", glow: [255, 176, 128], far: [255, 206, 150] },
  mint: { base: "#F9FBFA", glow: [112, 214, 186], far: [150, 214, 226] },
  cloud: { base: "#FAFAFC", glow: [170, 150, 245], far: [240, 170, 214] },
  calm: { base: "#FAFAFD", glow: [150, 140, 235], far: [150, 190, 240] },
};
/** How much of the glow's colour shows at its centre. Barely there on purpose. */
const GLOW = 0.2;
const FAR = 0.09;

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, m] of Object.entries(MESHES)) {
  const data = await page.evaluate(
    ({ W, H, m, GLOW, FAR }) => {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const g = c.getContext("2d");
      g.fillStyle = m.base;
      g.fillRect(0, 0, W, H);
      const spot = (x, y, r, [red, green, blue], a) => {
        const grad = g.createRadialGradient(x, y, 0, x, y, r);
        // An eased fall-off, so the glow has no visible edge.
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          grad.addColorStop(t, `rgba(${red},${green},${blue},${(a * (1 - t) ** 2).toFixed(4)})`);
        }
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
      };
      spot(W * 0.92, H * 0.02, W * 1.25, m.glow, GLOW);
      spot(W * 0.05, H * 0.98, W * 1.1, m.far, FAR);
      return c.toDataURL("image/jpeg", 0.92);
    },
    { W, H, m, GLOW, FAR },
  );
  writeFileSync(join(out, `mesh-${name}.jpg`), Buffer.from(data.split(",")[1], "base64"));
  console.log(`mesh-${name}.jpg`);
}
await browser.close();
