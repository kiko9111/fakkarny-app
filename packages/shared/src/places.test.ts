import { describe, expect, it } from "vitest";
import { kindOfPlace, metresBetween, parsePlaceTrigger, placeKey, placesFor, titleWithoutPlace } from "./places";

const read = (t: string) => {
  const p = parsePlaceTrigger(t);
  return p ? { place: p.place, on: p.on, title: titleWithoutPlace(t, p) } : null;
};

describe("parsePlaceTrigger", () => {
  it.each([
    ["remind me to buy bread when I'm at the supermarket", "supermarket", "arrive", "buy bread"],
    ["When I get to work remind me to call mom", "work", "arrive", "call mom"],
    ["when I leave work, remind me to call mom", "work", "leave", "call mom"],
    ["remind me to take the chicken out when I get home", "home", "arrive", "take the chicken out"],
    ["next time I'm at the pharmacy remind me about Panadol", "pharmacy", "arrive", "Panadol"],
    ["remind me when I'm next at Carrefour to get rice", "Carrefour", "arrive", "get rice"],
    ["when I'm home tonight remind me to water the plants", "home", "arrive", "water the plants"],
    ["فكرني أشتري عيش لما أوصل السوبر ماركت", "السوبر ماركت", "arrive", "أشتري عيش"],
    ["لما أوصل للسوبر ماركت فكرني بالعيش", "السوبر ماركت", "arrive", "العيش"],
    ["لما أخرج من الشغل فكرني أكلم ماما", "الشغل", "leave", "أكلم ماما"],
    ["لما أرجع البيت فكرني أطلع الفراخ", "البيت", "arrive", "أطلع الفراخ"],
    ["أول ما أوصل الصيدلية فكرني بالدوا", "الصيدلية", "arrive", "الدوا"],
    ["لما أكون جنب الفرن فكرني بالعيش", "الفرن", "arrive", "العيش"],
    ["fakarny ashtery 3eish lama awsal el super", "el super", "arrive", "ashtery 3eish"],
    ["lama a5rog men el shoghl fakarny akalem mama", "el shoghl", "leave", "akalem mama"],
  ])("%s", (text, place, on, title) => {
    expect(read(text)).toEqual({ place, on, title });
  });

  it.each([
    "remind me to call mom at 5",
    "when I'm free remind me to read",
    "لما أكون فاضي فكرني أقرا",
    "when I get a chance remind me",
    "فكرني بكرة الساعة ٥ أكلم خالد",
    "I'm at the supermarket now",
    "how was work?",
    "lama akon faady fakarny",
  ])("no place in %s", (text) => {
    expect(parsePlaceTrigger(text)).toBeNull();
  });
});

describe("matching places", () => {
  it("folds the words", () => {
    expect(placeKey("The Supermarket")).toBe(placeKey("supermarket"));
    expect(placeKey("السوبر ماركت")).toBe(placeKey("سوبر ماركت"));
    expect(placeKey("الصيدلية")).toBe(placeKey("صيدليه"));
  });
  it("knows kinds of places", () => {
    expect(kindOfPlace("the supermarket")).toBe("grocery");
    expect(kindOfPlace("السوبر ماركت")).toBe("grocery");
    expect(kindOfPlace("el super")).toBe("grocery");
    expect(kindOfPlace("الصيدلية")).toBe("pharmacy");
    expect(kindOfPlace("البيت")).toBe("home");
    expect(kindOfPlace("el shoghl")).toBe("work");
    expect(kindOfPlace("Ahmed's flat")).toBeNull();
  });
  it("finds saved places by name, then by kind", () => {
    const saved = [
      { id: "a", name: "Carrefour Maadi", kind: "grocery" as const },
      { id: "b", name: "Seoudi", kind: "grocery" as const },
      { id: "c", name: "البيت", kind: "home" as const },
      { id: "d", name: "Gym", kind: "other" as const },
    ];
    expect(placesFor("carrefour maadi", saved).map((p) => p.id)).toEqual(["a"]);
    expect(placesFor("the supermarket", saved).map((p) => p.id)).toEqual(["a", "b"]);
    expect(placesFor("home", saved).map((p) => p.id)).toEqual(["c"]);
    expect(placesFor("بيت", saved).map((p) => p.id)).toEqual(["c"]);
    expect(placesFor("the gym", saved).map((p) => p.id)).toEqual(["d"]);
    expect(placesFor("the club", saved)).toEqual([]);
  });
  it("measures distance", () => {
    const d = metresBetween({ latitude: 30.0444, longitude: 31.2357 }, { latitude: 30.0454, longitude: 31.2357 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});
