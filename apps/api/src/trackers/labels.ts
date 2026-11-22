import type { TrackerKind } from "@fakkarni/shared";
import type { ReplyLang } from "../pipeline/rules";

/** What Zaki calls each tracker kind. Custom trackers use the user's own name. */
export const TRACKER_LABEL: Record<TrackerKind, Record<ReplyLang, string>> = {
  water: { arabic: "المية 💧", english: "water 💧" },
  prayer: { arabic: "الصلاة 🤲", english: "prayers 🤲" },
  gym: { arabic: "التمرين 💪", english: "workouts 💪" },
  quran: { arabic: "القرآن 📖", english: "Quran 📖" },
  medicine: { arabic: "الدوا 💊", english: "medicine 💊" },
  study: { arabic: "المذاكرة 📚", english: "studying 📚" },
  spending: { arabic: "المصاريف 🧾", english: "spending 🧾" },
  savings: { arabic: "التحويش 🐷", english: "savings 🐷" },
  fasting: { arabic: "الصيام 🌙", english: "fasting 🌙" },
  charity: { arabic: "الصدقة 🤍", english: "charity 🤍" },
  custom: { arabic: "", english: "" },
};

export const trackerLabel = (kind: TrackerKind, name: string | null | undefined, lang: ReplyLang) => (kind === "custom" ? (name ? `«${name}»` : lang === "arabic" ? "المتابعة" : "the tracker") : TRACKER_LABEL[kind][lang]);
