import { describe, expect, it } from "vitest";
import { foldName, isCancel, isConfirm, matchByName, wireActions } from "./cards";

describe("names", () => {
  it("folds Arabic and English names so small differences still match", () => {
    expect(foldName("الجيم")).toBe(foldName("جيم"));
    expect(foldName("القراءة")).toBe(foldName("قراءه"));
    expect(foldName("El Beit")).toBe(foldName("beit"));
    expect(foldName("«Gym»!")).toBe("gym");
  });
  it("matches one thing by exact or partial name, and refuses to guess between two", () => {
    const list = [{ n: "البيت" }, { n: "الشغل" }, { n: "Gym buddies" }];
    expect(matchByName(list, "بيت", (x) => [x.n])?.n).toBe("البيت");
    expect(matchByName(list, "gym", (x) => [x.n])?.n).toBe("Gym buddies");
    expect(matchByName([{ n: "منى" }, { n: "منى علي" }], "منى", (x) => [x.n])?.n).toBe("منى");
    expect(matchByName([{ n: "Mona A" }, { n: "Mona B" }], "mona", (x) => [x.n])).toBeNull();
    expect(matchByName(list, "النادي", (x) => [x.n])).toBeNull();
    expect(matchByName(list, undefined, (x) => [x.n])).toBeNull();
  });
});

describe("yes / no to a waiting card", () => {
  it("reads a short plain yes in Arabic, Franco and English", () => {
    for (const t of ["اه", "اه ابعتها", "أيوه يا زكي", "تمام", "yes send it", "ok", "yalla", "aywa", "يلا"]) expect(isConfirm(t)).toBe(true);
  });
  it("does not take a real message for a yes", () => {
    for (const t of ["اه بس بكرة", "لا", "yes but tomorrow", "ابعتها لعمر بدل منى", "تمام عملت إيه في الشغل"]) expect(isConfirm(t)).toBe(false);
  });
  it("reads a plain no", () => {
    for (const t of ["لا", "لأ بلاش", "cancel", "no", "la2"]) expect(isCancel(t)).toBe(true);
    for (const t of ["لا خليها لعمر", "no wait, send it to Omar"]) expect(isCancel(t)).toBe(false);
  });
});

describe("wire cards", () => {
  it("drops server-only fields and anything malformed", () => {
    const out = wireActions([{ id: "1", kind: "assign_task", status: "pending", label: "x", route: "/circle/a", lang: "arabic", payload: { secret: true } }, { nope: 1 }, null]);
    expect(out).toEqual([{ id: "1", kind: "assign_task", status: "pending", label: "x", route: "/circle/a" }]);
    expect(wireActions(null)).toEqual([]);
  });
});
