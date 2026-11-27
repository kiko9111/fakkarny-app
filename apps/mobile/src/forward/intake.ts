import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";
import { router, type Href } from "expo-router";
import { routeShare, type SharedIn } from "@fakkarni/shared";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { photosAvailable } from "@/lib/photos";
import { notify } from "@/ui/feedback";
import { parkForward } from "./inbox";

type Shared = SharedIn & { other?: number | null };
interface NativeShare {
  take(): Shared | null;
  addListener(event: "onShare", listener: () => void): { remove(): void };
}

/**
 * "Share → Zaki" from WhatsApp or any app: modules/zaki-share, in Android builds from 2026-11-27 on
 * (optional: older builds take this JavaScript over the air and simply never get a share).
 */
const native: NativeShare | null = Platform.OS === "android" ? requireOptionalNativeModule<NativeShare>("ZakiShare") : null;
export const shareInAvailable = native !== null;

/** Opens a screen once the navigator is there (a share can be what started the app). */
function go(href: Href, home: boolean) {
  setTimeout(() => {
    try {
      if (home) router.dismissTo(href);
      else router.push(href);
    } catch {
      setTimeout(() => {
        try {
          router.navigate(href);
        } catch {
          // The chat sends a parked message whenever it opens.
        }
      }, 600);
    }
  }, 250);
}

function handle(s: Shared) {
  const r = routeShare(s);
  track("forward_in", { kind: r.kind, source: "share" });
  if (r.kind === "chat") {
    parkForward(r.text);
    go("/", true);
  } else if (r.kind === "receipt" && photosAvailable) {
    go({ pathname: "/receipt", params: { shared: r.uri } }, false);
  } else if (r.kind !== "none" || s.other) {
    notify(t.lay.chat.forwardOther);
  }
}

/** Reads the share that opened the app, then listens for shares while it runs. Returns the stop. */
export function startShareIntake(): () => void {
  if (!native) return () => {};
  const take = () => {
    let shared: Shared | null = null;
    try {
      shared = native.take();
    } catch {
      return;
    }
    if (shared) handle(shared);
  };
  take();
  const sub = native.addListener("onShare", take);
  return () => sub.remove();
}
