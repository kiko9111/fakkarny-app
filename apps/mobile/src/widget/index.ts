import { requireOptionalNativeModule } from "expo";
import { AppState, Platform } from "react-native";
import type { Item } from "@fakkarni/shared";
import { itemsByIds, listUpcoming } from "@/db/items";
import { upsertItem } from "@/db/messages";
import { fill } from "@/circles/logic";
import { isRTL, language, t } from "@/i18n";
import { completeItem } from "@/lib/api";
import { cacheRefreshed, dataChanged, itemsChanged } from "@/lib/signals";
import { scheduleItem } from "@/notifications";
import { saveItem } from "@/sync/save-item";
import { QueuedOffline } from "@/sync/writes";
import { needsChanged, savedNeeds } from "@/today/useNeeds";
import { palette } from "@/ui/tokens";
import { parseTaps, widgetData, type WidgetTap } from "./data";

/**
 * The home-screen widget (Android, modules/zaki-widget). The app writes what it shows after every
 * change to plans or to "Needs you", and answers the Done taps made on it. Builds without the
 * module (older builds, iPhone, Expo Go) skip all of it.
 */
interface NativeWidget {
  set(json: string): boolean;
  clear(): boolean;
  takeDone(): string;
  placed(): number;
  pin(): boolean;
  addListener(event: "onDone", listener: () => void): { remove(): void };
}

const native: NativeWidget | null = Platform.OS === "android" ? requireOptionalNativeModule<NativeWidget>("ZakiWidget") : null;

export const widgetAvailable = native !== null;

/** Write the widget's data now, from SQLite and the saved copies (no request). */
export async function refreshWidget(): Promise<void> {
  if (!native) return;
  const items = await listUpcoming();
  const data = widgetData({
    items,
    needs: savedNeeds(),
    now: new Date(),
    words: t.lay.widget,
    rtl: isRTL,
    locale: language === "ar-EG" ? "ar-EG-u-nu-latn" : "en",
    accent: palette.primaryInk,
  });
  native.set(JSON.stringify(data));
}

/** How many Zaki widgets are on the home screen (0 without the module). */
export function widgetsPlaced(): number {
  try {
    return native?.placed() ?? 0;
  } catch {
    return 0;
  }
}

/** Ask the launcher to add the widget; false when the user has to add it by hand. */
export function pinWidget(): boolean {
  try {
    void refreshWidget().catch(() => {});
    return native?.pin() ?? false;
  } catch {
    return false;
  }
}

/** Sign-out / account deleted: the widget forgets that person. */
export function clearWidget(): void {
  try {
    native?.clear();
  } catch {
    // nothing on the home screen to clear
  }
}

/** A plan ticked on the widget: closed here first, then on the server (also later, offline). */
async function closePlan(item: Item): Promise<void> {
  const done: Item = { ...item, status: "done", done_at: new Date().toISOString() };
  await upsertItem(done);
  scheduleItem(done);
  itemsChanged.emit();
  try {
    await saveItem(await completeItem(item.id));
  } catch (err) {
    if (err instanceof QueuedOffline) return;
    // Refused (gone on the server, someone else's): put it back as it was.
    await upsertItem(item);
    scheduleItem(item);
    itemsChanged.emit();
  }
}

let answering = false;

/**
 * The Done taps made on the widget since the last look. A plan closes like a tick in Today; a
 * repeating reminder ("next dose") stays open and says it in the chat, as Done on its
 * notification does, so Zaki hears it.
 */
async function answerTaps(say: (text: string) => void): Promise<void> {
  if (!native || answering) return;
  answering = true;
  try {
    const taps: WidgetTap[] = parseTaps(native.takeDone());
    if (!taps.length) return;
    const plans = taps.filter((x) => x.kind === "plan");
    const found = plans.length ? await itemsByIds(plans.map((x) => x.id)) : [];
    for (const item of found) if (item.status === "open") await closePlan(item).catch(() => {});
    for (const dose of taps.filter((x) => x.kind === "dose")) if (dose.title) say(fill(t.notifications.doneSay, { title: dose.title }));
  } finally {
    answering = false;
    void refreshWidget().catch(() => {});
  }
}

let started = false;

/** Keep the widget current and answer its taps. Called once from startSync. */
export function startWidget(say: (text: string) => void): void {
  if (!native || started) return;
  started = true;
  let soon: ReturnType<typeof setTimeout> | null = null;
  const later = () => {
    if (soon) clearTimeout(soon);
    soon = setTimeout(() => void refreshWidget().catch(() => {}), 800);
  };
  for (const signal of [itemsChanged, cacheRefreshed, dataChanged, needsChanged]) signal.subscribe(later);
  try {
    native.addListener("onDone", () => void answerTaps(say).catch(() => {}));
  } catch {
    // an older module: taps are taken on the next start or return
  }
  AppState.addEventListener("change", (state) => {
    if (state === "active") void answerTaps(say).catch(() => {});
    // Leaving the app: the widget shows what is true at that moment.
    else void refreshWidget().catch(() => {});
  });
  void answerTaps(say).catch(() => {});
}
