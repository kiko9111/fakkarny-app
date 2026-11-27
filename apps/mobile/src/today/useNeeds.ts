import { useEffect, useState } from "react";
import { fill } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { t } from "@/i18n";
import { doseClock } from "@/care/clock";
import { peekCare, peekDaftar, peekGameyas, peekSplits, peekTasks } from "@/lib/api";
import { localDay } from "@/gameya/logic";
import { createEmitter } from "@/lib/emitter";
import { cacheRefreshed, dataChanged } from "@/lib/signals";
import { needsYou, type NeedRow, type NeedWords } from "./needs";

/** The inbox's words in the phone's language. */
export const needWords = (): NeedWords => ({
  taskFrom: t.lay.today.taskFrom,
  handedIn: t.lay.today.handedIn,
  youOwe: t.lay.today.youOwe,
  owedToYou: t.lay.today.owedToYou,
  yourShare: t.lay.today.yourShare,
  noName: t.circles.noName,
  splitTitle: t.split.title,
  gameyaPay: t.lay.gameya.needPay,
  gameyaToday: t.lay.gameya.needToday,
  gameyaLate: t.lay.gameya.needLate,
  gameyaHand: t.lay.gameya.needHand,
  money: (n) => fill(t.ui.pounds, { n: formatMoney(n) }),
  doseNotMarked: t.lay.care.notMarked,
  yesterday: t.lay.care.yesterday,
  clock: doseClock,
});

/** "Needs you" from the copies the phone holds right now. No request. */
export const savedNeeds = (): NeedRow[] => needsYou({ tasks: peekTasks(), daftar: peekDaftar(), splits: peekSplits(), gameyas: peekGameyas(), care: peekCare(), today: localDay() }, needWords());

/** Fired by Today when one of its rows was answered: the saved copies already hold the answer. */
export const needsChanged = createEmitter<void>();

/**
 * How many things wait for this person, for the Today tab's badge. Read from the saved copies,
 * again whenever they were refreshed, something changed, or a row was answered. No request.
 */
export function useNeedsYouCount(): number {
  const [count, setCount] = useState(() => savedNeeds().length);
  useEffect(() => {
    const read = () => setCount(savedNeeds().length);
    read();
    const offs = [cacheRefreshed.subscribe(read), dataChanged.subscribe(read), needsChanged.subscribe(read)];
    return () => offs.forEach((off) => off());
  }, []);
  return count;
}
