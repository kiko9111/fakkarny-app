import { describe, expect, it } from "vitest";
import { composeBrief, digestLines, editionOf, headlineLines, isBriefTime, briefPrompt } from "./rules";
import { parseFeed, plainText } from "./rss";
import { gnewsUrl, parseGnews, pickHeadlines } from "./news";

const now = new Date("2026-11-27T06:30:00Z");
const h = (title: string, hoursAgo: number, source = "BBC") => ({ title, link: null, at: new Date(now.getTime() - hoursAgo * 3600_000), summary: "", source });

describe("rss", () => {
  it("reads RSS 2.0 with CDATA, escaped HTML and entities", () => {
    const xml = `<rss><channel><title>Feed</title>
      <item><title><![CDATA[الأهلي يفوز &amp; يتصدر]]></title><link>https://ex.com/a?x=1&amp;y=2</link>
        <pubDate>Fri, 27 Nov 2026 05:00:00 GMT</pubDate><description>&lt;p&gt;Short &lt;b&gt;text&lt;/b&gt;&lt;/p&gt;</description></item>
      <item><title>No date</title></item>
      <item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>2026-11-27T04:00:00Z</pubDate></item>
    </channel></rss>`;
    const items = parseFeed(xml, "مصراوي");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "الأهلي يفوز & يتصدر", link: "https://ex.com/a?x=1&y=2", summary: "Short text", source: "مصراوي" });
    expect(items[1]!.link).toBeNull();
  });
  it("reads Atom entries and their alternate link", () => {
    const xml = `<feed><entry><title type="html">AI &lt;i&gt;news&lt;/i&gt;</title><link rel="alternate" href="https://v.com/1"/><published>2026-11-27T03:00:00Z</published><summary>Sum</summary></entry></feed>`;
    expect(parseFeed(xml, "The Verge")[0]).toMatchObject({ title: "AI news", link: "https://v.com/1", summary: "Sum" });
  });
  it("caps long text", () => {
    expect(plainText("a".repeat(500), 20)).toHaveLength(20);
  });
});

describe("picking headlines", () => {
  it("keeps the last 30 hours, drops repeats and takes from each source in turn", () => {
    const picked = pickHeadlines([h("One", 1), h("Two", 2), h("Three", 3), h("one!", 4, "Guardian"), h("Old", 40), h("G2", 5, "Guardian")], now);
    expect(picked.map((p) => p.title)).toEqual(["One", "G2", "Two", "Three"]);
  });
});

describe("gnews", () => {
  it("asks top headlines for a category and search for a query topic", () => {
    expect(gnewsUrl("tech", "english", "k")).toContain("/top-headlines?");
    expect(gnewsUrl("tech", "english", "k")).toContain("category=technology");
    expect(gnewsUrl("ai", "arabic", "k")).toContain("/search?");
    expect(gnewsUrl("ai", "arabic", "k")).toContain("lang=ar");
  });
  it("reads articles and skips broken ones", () => {
    const out = parseGnews({ articles: [{ title: "T", publishedAt: "2026-11-27T05:00:00Z", url: "https://a.b", source: { name: "Reuters" }, description: "D" }, { title: "", publishedAt: "x" }] });
    expect(out).toEqual([{ title: "T", link: "https://a.b", at: new Date("2026-11-27T05:00:00Z"), summary: "D", source: "Reuters" }]);
    expect(parseGnews({ errors: ["bad key"] })).toEqual([]);
  });
});

describe("brief rules", () => {
  it("opens a 90 minute window at the brief time, across midnight too", () => {
    expect(isBriefTime("2026-11-27T08:00:00", "08:00")).toBe(true);
    expect(isBriefTime("2026-11-27T09:29:00", "08:00")).toBe(true);
    expect(isBriefTime("2026-11-27T09:30:00", "08:00")).toBe(false);
    expect(isBriefTime("2026-11-27T07:59:00", "08:00")).toBe(false);
    expect(isBriefTime("2026-11-28T00:30:00", "23:30")).toBe(true);
  });
  it("reads news again every 6 hours", () => {
    expect(editionOf(new Date("2026-11-27T05:59:00Z"))).toBe("2026-11-27T00");
    expect(editionOf(new Date("2026-11-27T06:00:00Z"))).toBe("2026-11-27T06");
  });
  it("cleans the model's lines and refuses English lines for an Arabic brief", () => {
    expect(digestLines("1. الأهلي كسب\n- Ahly won\n• الزمالك اتعادل\n\nخبر تالت\nخبر رابع", "arabic")).toEqual(["الأهلي كسب", "الزمالك اتعادل", "خبر تالت"]);
    expect(digestLines("NONE", "english")).toEqual([]);
  });
  it("falls back to headlines in the reader's script", () => {
    expect(headlineLines([h("Ahly won", 1), h("الأهلي كسب", 2)], "arabic")).toEqual(["الأهلي كسب"]);
    expect(headlineLines([h("الأهلي كسب", 2)], "english")).toEqual([]);
  });
  it("puts the brief together: greeting, then a bubble per topic with news and its sources", () => {
    const out = composeBrief("arabic", {
      name: "Kareem Adham",
      localHour: 8,
      digests: [
        { topic: "football", lines: ["الأهلي كسب"], sources: ["مصراوي", "BBC"] },
        { topic: "ai", lines: [], sources: [] },
      ],
    });
    expect(out).toEqual(["صباح الفل يا Kareem! ☀️ دي أهم الأخبار اللي بتحبها:", "⚽ الكورة\n• الأهلي كسب\nالمصدر: مصراوي، BBC"]);
    expect(composeBrief("english", { name: null, localHour: 20, digests: [{ topic: "ai", lines: [], sources: [] }] })).toEqual([]);
    expect(composeBrief("english", { name: null, localHour: 20, digests: [{ topic: "ai", lines: ["x"], sources: [] }] })[0]).toBe("Hi! Here's your news:");
  });
  it("tells the model the topic, language and numbered headlines", () => {
    const p = briefPrompt("cars", "arabic", [h("New EV", 1, "Motor1")]);
    expect(p).toContain("Topic: Cars.");
    expect(p).toContain("Egyptian Arabic");
    expect(p).toContain("1. New EV (Motor1)");
  });
});
