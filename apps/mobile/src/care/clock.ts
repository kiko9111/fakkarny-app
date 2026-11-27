import { dateLocale } from "@/i18n";
import { askTimeLabel } from "@/trackers/logic";

/** A dose's "HH:MM" as the phone writes a time ("8:00 PM", "8:00 م"). */
export const doseClock = (time: string) => askTimeLabel(time, dateLocale);
