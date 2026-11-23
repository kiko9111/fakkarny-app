import { describe, expect, it } from "vitest";
import { cardSvg, noEmoji } from "../cards/render";
import { splitCard, streakCard } from "./cards";

describe("share cards", () => {
  it("draws only what was shared, escaped and without emoji", () => {
    const svg = cardSvg(splitCard("<عشا> 🍕", 1850, 5, "ar", "https://zaki.test/s/ABCD"), "ar");
    expect(svg).toContain("&lt;عشا&gt;");
    expect(svg).not.toContain("🍕");
    expect(svg).toContain("1,850");
    expect(svg).toContain("zaki.test/s/ABCD");
    expect(svg).toContain('direction="rtl"');
    expect(streakCard(14, "en", "https://zaki.test/r/X").line).toBe("days in a row");
    expect(noEmoji("أيام 🔥 ورا  بعض")).toBe("أيام ورا بعض");
  });
});
