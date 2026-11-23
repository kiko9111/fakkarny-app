import { describe, expect, it } from "vitest";
import { afterMessage, askedFor, asksOverview, featureOfRoute, featuresFromText, localDayOf, open, parseUnlock } from "./unlock";

const empty = { features: [], offered: [], days: [] };

describe("chat-first unlocking", () => {
  it("treats a missing value as an existing user (everything open)", () => {
    expect(parseUnlock(null)).toBeNull();
    expect(parseUnlock("not json")).toEqual(empty);
    expect(parseUnlock(JSON.stringify({ features: ["daftar", "nope"], days: ["2026-11-22"] }))).toEqual({ features: ["daftar"], offered: [], days: ["2026-11-22"] });
  });

  it("opens the Daftar on money talk and People on family or friends", () => {
    expect(featuresFromText("سلّفت عمر ٢٥٠ جنيه")).toEqual(["daftar"]);
    expect(featuresFromText("Omar owes me 200")).toEqual(["daftar"]);
    expect(featuresFromText("دفعت 300 بنزين")).toEqual(["daftar"]);
    expect(featuresFromText("spent 300 on fuel")).toEqual(["daftar"]);
    expect(featuresFromText("فكرني أكلم ماما بكرة")).toEqual(["people"]);
    expect(featuresFromText("dinner with my sister")).toEqual(["people"]);
    expect(featuresFromText("فكرني أشرب مية")).toEqual([]);
  });

  it("has Zaki introduce a place once instead of opening it silently", () => {
    const first = afterMessage(empty, "lent Omar 100", "2026-11-22");
    expect(first.opened).toEqual([]);
    expect(first.introduce).toEqual(["daftar"]);
    expect(first.state.offered).toEqual(["daftar"]);
    expect(first.state.features).toEqual([]);
    const again = afterMessage(first.state, "Omar paid me back", "2026-11-22");
    expect(again.introduce).toEqual([]);
    expect(again.state.days).toEqual(["2026-11-22"]);
  });

  it("introduces Today on the third active day", () => {
    let s = afterMessage(empty, "hi", "2026-11-20").state;
    s = afterMessage(s, "hi", "2026-11-21").state;
    const third = afterMessage(s, "hi", "2026-11-22");
    expect(third.introduce).toEqual(["today"]);
    expect(third.opened).toEqual([]);
  });

  it("opens a place at once when the user asks for it, even after an introduction", () => {
    const offered = afterMessage(empty, "Omar owes me 50", "2026-11-22").state;
    const asked = afterMessage(offered, "افتح الدفتر", "2026-11-22");
    expect(asked.opened).toEqual(["daftar"]);
    expect(asked.introduce).toEqual(["daftar"]);
    expect(asked.state.features).toEqual(["daftar"]);
    expect(asked.state.offered).toEqual([]);
    expect(askedFor("show me my circles")).toEqual(["people"]);
    expect(askedFor("وريني يومي")).toEqual(["today"]);
    expect(askedFor("يومي كان عامل إزاي؟")).toEqual([]);
  });

  it("answers 'what can you do?' with the overview, opening nothing", () => {
    expect(asksOverview("بتعمل ايه؟")).toBe(true);
    expect(asksOverview("What can you do")).toBe(true);
    expect(asksOverview("فكرني بكرة")).toBe(false);
    const step = afterMessage(empty, "تقدر تعمل إيه؟", "2026-11-22");
    expect(step.overview).toBe(true);
    expect(step.introduce).toEqual([]);
    expect(step.opened).toEqual([]);
  });

  it("opens a feature from outside the chat once, clearing its offer", () => {
    const a = open({ ...empty, offered: ["people"] }, "people");
    expect(a.opened).toEqual(["people"]);
    expect(a.state.offered).toEqual([]);
    expect(open(a.state, "people").opened).toEqual([]);
  });

  it("maps routes to places", () => {
    expect(featureOfRoute("/money/abc")).toBe("daftar");
    expect(featureOfRoute("/daftar/K7Q2")).toBe("daftar");
    expect(featureOfRoute("/split/abc")).toBe("daftar");
    expect(featureOfRoute("/circles")).toBe("people");
    expect(featureOfRoute("/trackers")).toBe("today");
    expect(featureOfRoute("/paywall")).toBeNull();
  });

  it("formats the local day", () => {
    expect(localDayOf(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
