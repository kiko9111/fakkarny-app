import { AppState } from "react-native";
import type { AppEventName, AppEventProps } from "@fakkarni/shared";
import { postEvents } from "./api";
import { createAnalyticsQueue } from "./analytics-queue";
import { isDemo } from "./demo";

/**
 * Product analytics (packages/shared/src/analytics.ts): counted events with short labels,
 * never message content. Sent in batches, and when the app goes to the background.
 */
const queue = createAnalyticsQueue({ send: (events) => postEvents({ events }) });

export function track(name: AppEventName, props: AppEventProps = {}) {
  if (isDemo) return;
  queue.track(name, props);
}

AppState.addEventListener("change", (s) => {
  if (s !== "active") void queue.flush();
});
setInterval(() => void queue.flush(), 60_000);
