import { describe, expect, it } from "vitest";
import { newsLine, toggleTopic } from "./news";

const names = { egypt: "Egypt", world: "World", football: "Football", sports: "Sports", ai: "AI", tech: "Tech", cars: "Cars", business: "Business", science: "Science", health: "Health", entertainment: "Movies", gaming: "Gaming" };

describe("toggleTopic", () => {
  it("adds in the fixed order and removes", () => {
    expect(toggleTopic(["ai"], "football")).toEqual({ topics: ["football", "ai"] });
    expect(toggleTopic(["football", "ai"], "ai")).toEqual({ topics: ["football"] });
  });
  it("stops at five and drops names it does not know", () => {
    expect(toggleTopic(["egypt", "world", "ai", "tech", "cars"], "gaming")).toEqual({ error: "max" });
    expect(toggleTopic(["old-topic", "ai"], "cars")).toEqual({ topics: ["ai", "cars"] });
  });
});

describe("newsLine", () => {
  it("says off without topics or a time", () => {
    expect(newsLine([], "08:00", names, "Off", ", ")).toBe("Off");
    expect(newsLine(["ai"], null, names, "Off", ", ")).toBe("Off");
  });
  it("names two topics and counts the rest", () => {
    expect(newsLine(["ai", "football"], "08:00", names, "Off", ", ")).toBe("Football, AI · 08:00");
    expect(newsLine(["ai", "football", "cars", "gaming"], "20:00", names, "Off", ", ")).toBe("Football, AI +2 · 20:00");
  });
});
