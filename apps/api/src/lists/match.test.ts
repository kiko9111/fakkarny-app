import { describe, expect, it } from "vitest";
import { placeOf, readGot, readListMessage } from "./match";

const titles = (t: string) => {
  const r = readListMessage(t);
  return r?.kind === "add" ? r.things.map((x) => x.title) : (r?.kind ?? null);
};

describe("household list messages by rules", () => {
  it("adds only when the list is named", () => {
    expect(titles("ضيف بيض ولبن للقايمة")).toEqual(["بيض", "لبن"]);
    expect(titles("حط رز وورق عنب على الليستة")).toEqual(["رز", "ورق عنب"]);
    expect(titles("اكتب في القايمة: عيش، جبنة")).toEqual(["عيش", "جبنة"]);
    expect(titles("add eggs, milk and bread to the shopping list")).toEqual([
      "eggs",
      "milk",
      "bread",
    ]);
    expect(titles("put rice on the list")).toEqual(["rice"]);
    expect(titles("dif beid w laban lel list")).toEqual(["beid", "laban"]);
    const pharmacy = readListMessage("ضيف بنادول في قايمة الصيدلية");
    expect(pharmacy).toMatchObject({ kind: "add", hint: "الصيدلية" });
    expect(readListMessage("ضيف 2 لبن للقايمة")).toMatchObject({
      things: [{ title: "لبن", qty: "2" }],
    });
  });

  it("leaves plain talk, plans and negations to the model", () => {
    for (const t of [
      "محتاجين عيش",
      "we need to talk",
      "مش عايز اضيف حاجة للقايمة",
      "فكرني اضيف بيض للقايمة",
      "why did you add eggs to the list",
      "انا نازل الشغل",
      "ضيف ٣٠٠ على الأكل",
    ])
      expect(titles(t)).toBeNull();
  });

  it("shows the list and hears going shopping", () => {
    expect(readListMessage("القايمة فيها ايه؟")).toEqual({
      kind: "show",
      hint: null,
    });
    expect(readListMessage("ايه اللي في القايمة")).toEqual({
      kind: "show",
      hint: null,
    });
    expect(readListMessage("what's on the shopping list?")).toMatchObject({
      kind: "show",
    });
    expect(readListMessage("نازل السوبر ماركت")).toEqual({
      kind: "trip",
      hint: null,
    });
    expect(readListMessage("انا رايحة الصيدلية دلوقتي")).toEqual({
      kind: "trip",
      hint: "صيدلية",
    });
    expect(readListMessage("I'm going to the supermarket")).toMatchObject({
      kind: "trip",
    });
    expect(readListMessage("nazel el supermarket")).toMatchObject({
      kind: "trip",
    });
  });

  it("reads what was got, never with amounts", () => {
    expect(readGot("جبت العيش واللبن")).toEqual(["العيش", "اللبن"]);
    expect(readGot("got the eggs")).toEqual(["the eggs"]);
    expect(readGot("اشتريت عيش ب 20")).toBeNull();
    expect(placeOf("الصيدلية")).toBe("pharmacy");
    expect(placeOf("السوبر ماركت")).toBe("grocery");
  });
});
