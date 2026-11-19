import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Crash and error reporting (M7). CLAUDE.md: never send message content — no PII, no
 * screenshots or view trees (they could show chat bubbles), and no UI/console breadcrumbs.
 */
export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    reportAccessibilityIdentifier: false,
    tracesSampleRate: 0,
    beforeBreadcrumb(crumb) {
      if (crumb.category === "console" || crumb.category?.startsWith("ui.") || crumb.category === "touch") return null;
      return crumb;
    },
  });
}
