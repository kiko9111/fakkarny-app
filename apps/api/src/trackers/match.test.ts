import { describe, expect, it } from "vitest";
import { ALL_KINDS, matchTrackCommand, matchTrackerLog, titleMatchesKind } from "./match";

const log = (text: string) => matchTrackerLog(text, ALL_KINDS);

describe("tracker chat rules", () => {
  it("reads plain 'I did it' messages in Arabic and English", () => {
    expect(log("شربت مية")).toEqual({ kind: "water", amount: 1 });
    expect(log("شربت كوبايتين مية")).toEqual({ kind: "water", amount: 2 });
    expect(log("شربت ٣ كوبايات ميه")).toEqual({ kind: "water", amount: 3 });
    expect(log("drank 2 glasses of water")).toEqual({ kind: "water", amount: 2 });
    expect(log("صليت الفجر")).toEqual({ kind: "prayer", amount: 1 });
    expect(log("صليت المغرب والعشا")).toEqual({ kind: "prayer", amount: 2 });
    expect(log("روحت الجيم")).toEqual({ kind: "gym", amount: 1 });
    expect(log("I worked out")).toEqual({ kind: "gym", amount: 1 });
    expect(log("قريت 5 صفحات قرآن")).toEqual({ kind: "quran", amount: 5 });
    expect(log("خدت الدوا")).toEqual({ kind: "medicine", amount: 1 });
    expect(log("ذاكرت ساعتين")).toEqual({ kind: "study", amount: 2 });
    expect(log("صرفت 300 على البقالة")).toEqual({ kind: "spending", amount: 300 });
    expect(log("paid 1,200 for groceries")).toEqual({ kind: "spending", amount: 1200 });
    expect(log("حوشت 500")).toEqual({ kind: "savings", amount: 500 });
    expect(log("صمت النهارده")).toEqual({ kind: "fasting", amount: 1 });
    expect(log("اتصدقت بـ 50 جنيه")).toEqual({ kind: "charity", amount: 50 });
    expect(log("donated 100 today")).toEqual({ kind: "charity", amount: 100 });
  });

  it("needs the tracked thing itself named, and only matches kinds the user follows", () => {
    for (const text of ["شربت كوباية شاي", "had a cup of coffee with Sara", "read 30 pages of my novel", "قريت 20 صفحة من الرواية"]) expect(log(text)).toBeNull();
    expect(matchTrackerLog("قريت وردي", ["quran"])).toEqual({ kind: "quran", amount: 1 });
    expect(matchTrackerLog("شربت مية", ["medicine"])).toBeNull();
    expect(matchTrackerLog("خدت الدوا", ["water", "medicine"])).toEqual({ kind: "medicine", amount: 1 });
    expect(titleMatchesKind("الدوا بتاع الضغط", "medicine")).toBe(true);
    expect(titleMatchesKind("اتصل بماما", "medicine")).toBe(false);
  });

  it("leaves plans, reminders, questions, negations and debts to the model", () => {
    for (const text of [
      "فكرني أشرب مية الساعة 5",
      "هشرب مية بعد شوية",
      "لسه ما شربتش مية",
      "مش صليت العصر",
      "شربت مية؟",
      "remind me to drink water",
      "I didn't drink water today",
      "عايز اروح الجيم بكرة",
      "دفعت 200 لأحمد سلف",
      "دفعت اللي عليا 300",
      "paid Ahmed back 300",
      "صرفت كتير النهارده", // no amount
      "مية",
      "النهارده كان يوم طويل جدا وشربت مية كتير وانا في الشغل مع الناس",
    ])
      expect(log(text), text).toBeNull();
  });

  it("only matches kinds the user follows", () => {
    expect(matchTrackerLog("شربت مية", ["gym"])).toBeNull();
    expect(matchTrackerLog("روحت الجيم", ["water", "gym"])).toEqual({ kind: "gym", amount: 1 });
  });

  it("reads 'track my…' commands", () => {
    expect(matchTrackCommand("track my water")).toBe("water");
    expect(matchTrackCommand("تابع معايا المية")).toBe("water");
    expect(matchTrackCommand("عايز اتابع مصاريفي")).toBe("spending");
    expect(matchTrackCommand("track my workouts please")).toBe("gym");
    expect(matchTrackCommand("track my mood")).toBeNull();
    expect(matchTrackCommand("can you track my water?")).toBeNull();
    expect(matchTrackCommand("شربت مية")).toBeNull();
  });
});
