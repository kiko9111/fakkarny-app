import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { esc } from "../web/shell";

/**
 * Share cards (growth plan, 2026-11-23): a branded picture for moments worth showing, made for
 * WhatsApp Status and Instagram Stories (1080x1920) with a small Zaki mark and the link. Drawn as
 * SVG and turned into PNG on the server, so the phone needs no new native module. Only what the
 * user chose to share is drawn: a number, a title they typed, never names or chat words.
 */
export const CARD_W = 1080;
export const CARD_H = 1920;

const FONT_DIR = join(__dirname, "..", "..", "assets", "fonts");
const FONT_FILES = ["IBMPlexSansArabic_400Regular.ttf", "IBMPlexSansArabic_700Bold.ttf"].map((f) => join(FONT_DIR, f));

export type CardLang = "ar" | "en";
export type CardContent = { eyebrow: string; big: string; line: string; footer: string; link: string };

/** The card font has no emoji: a run with one renders as boxes, so they are dropped. */
export const noEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();

/** Pure: the SVG for a card. Every text goes through `esc`. */
export function cardSvg(c: CardContent, lang: CardLang): string {
  const dir = lang === "ar" ? "rtl" : "ltr";
  const t = (y: number, size: number, weight: 400 | 700, fill: string, text: string) =>
    `<text x="540" y="${y}" font-family="IBM Plex Sans Arabic" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="middle" direction="${dir}">${esc(noEmoji(text))}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE3C2"/><stop offset="0.55" stop-color="#FFC9A3"/><stop offset="1" stop-color="#F9A8C0"/></linearGradient>
  <radialGradient id="glow" cx="0.5" cy="0.38" r="0.5"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${CARD_W}" height="${CARD_H}" fill="url(#bg)"/>
<rect width="${CARD_W}" height="${CARD_H}" fill="url(#glow)"/>
<rect x="90" y="430" width="900" height="900" rx="96" fill="#FFFFFF" fill-opacity="0.62" stroke="#FFFFFF" stroke-width="4"/>
${t(600, 54, 700, "#9A4A12", c.eyebrow)}
${t(880, 260, 700, "#3B2416", c.big)}
${t(1060, 58, 700, "#3B2416", c.line)}
<g transform="translate(540 1530)">
  <circle r="70" fill="#FFFFFF" fill-opacity="0.9"/>
  <path d="M-30 6 Q0 40 30 6" stroke="#E07A1F" stroke-width="10" fill="none" stroke-linecap="round"/>
  <circle cx="-22" cy="-16" r="8" fill="#E07A1F"/><circle cx="22" cy="-16" r="8" fill="#E07A1F"/>
  <path d="M44 -52 l6 -16 l6 16 l16 6 l-16 6 l-6 16 l-6 -16 l-16 -6 z" fill="#FFFFFF"/>
</g>
${t(1680, 50, 700, "#3B2416", c.footer)}
<text x="540" y="1760" font-family="IBM Plex Sans Arabic" font-size="40" font-weight="400" fill="#6B4A36" text-anchor="middle">${esc(c.link)}</text>
</svg>`;
}

export function renderPng(svg: string): Buffer {
  const r = new Resvg(svg, { font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "IBM Plex Sans Arabic" }, fitTo: { mode: "width", value: CARD_W } });
  return r.render().asPng();
}
