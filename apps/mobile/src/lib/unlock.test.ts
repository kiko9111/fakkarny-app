import { describe, expect, it } from "vitest";
import { afterMessage, featuresFromText, localDayOf, open, parseUnlock } from "./unlock";

const empty = { features: [], days: [] };

describe("chat-first unlocking", () => {
  it("treats a missing value as an existing user (everything open)", () => {
    expect(parseUnlock(null)).toBeNull();
    expect(parseUnlock("not json")).toEqual(empty);
    expect(parseUnlock(JSON.stringify({ features: ["daftar", "nope"], days: ["2026-11-22"] }))).toEqual({ features: ["daftar"], days: ["2026-11-22"] });
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

  it("reports only what is newly open", () => {
    const first = afterMessage(empty, "lent Omar 100", "2026-11-22");
    expect(first.opened).toEqual(["daftar"]);
    const again = afterMessage(first.state, "Omar paid me back", "2026-11-22");
    expect(again.opened).toEqual([]);
    expect(again.state.days).toEqual(["2026-11-22"]);
  });

  it("opens Today on the third active day", () => {
    let s = afterMessage(empty, "hi", "2026-11-20").state;
    s = afterMessage(s, "hi", "2026-11-21").state;
    const third = afterMessage(s, "hi", "2026-11-22");
    expect(third.opened).toEqual(["today"]);
  });

  it("opens a feature from outside the chat once", () => {
    const a = open(empty, "people");
    expect(a.opened).toEqual(["people"]);
    expect(open(a.state, "people").opened).toEqual([]);
  });

  it("formats the local day", () => {
    expect(localDayOf(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
  });
});
