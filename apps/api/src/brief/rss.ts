/**
 * A small RSS 2.0 / Atom reader (pure): the headline, link, time and a short description of each
 * entry. Feeds are untrusted text: tags are stripped, entities decoded, lengths capped, and an
 * entry without a title or a readable time is dropped.
 */
export interface Headline {
  title: string;
  link: string | null;
  at: Date;
  summary: string;
  source: string;
}

const MAX_TITLE = 200;
const MAX_SUMMARY = 240;

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Text of a fragment: CDATA unwrapped, tags removed (entities first, since many feeds escape their HTML), spaces folded. */
export function plainText(raw: string, max: number): string {
  let s = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  s = decodeEntities(s);
  s = s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]*>/g, " ");
  s = decodeEntities(s).replace(/\s+/g, " ").trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

function tag(block: string, names: string[]): string | null {
  for (const name of names) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
    if (m) return m[1]!;
  }
  return null;
}

function atomLink(block: string): string | null {
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]!);
  const pick = links.find((a) => /rel=["']alternate["']/i.test(a)) ?? links.find((a) => !/rel=/i.test(a)) ?? links[0];
  const href = pick?.match(/href=["']([^"']+)["']/i)?.[1];
  return href ? decodeEntities(href) : null;
}

const safeLink = (s: string | null): string | null => {
  const t = s ? plainText(s, 600) : "";
  return /^https?:\/\/\S+$/i.test(t) ? t : null;
};

export function parseFeed(xml: string, source: string): Headline[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]!);
  const out: Headline[] = [];
  for (const b of blocks.slice(0, 60)) {
    const title = plainText(tag(b, ["title"]) ?? "", MAX_TITLE);
    const when = tag(b, ["pubDate", "published", "updated", "dc:date"]);
    const at = when ? new Date(plainText(when, 80)) : null;
    if (!title || !at || Number.isNaN(at.getTime())) continue;
    const link = safeLink(tag(b, ["link"])) ?? safeLink(atomLink(b)) ?? safeLink(tag(b, ["guid"]));
    const summary = plainText(tag(b, ["description", "summary", "content"]) ?? "", MAX_SUMMARY);
    out.push({ title, link, at, summary: summary === title ? "" : summary, source });
  }
  return out;
}
