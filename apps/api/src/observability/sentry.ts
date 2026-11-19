import * as Sentry from "@sentry/node";

/**
 * Errors to Sentry (PRD §6 "errors visible"). CLAUDE.md: never log message content — request
 * bodies, query strings, cookies and identity headers are stripped before anything leaves.
 */
export function initSentry(dsn: string | undefined, environment: string) {
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment,
    // Collect nothing about users, requests or AI prompts/replies.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        const { data: _data, cookies: _cookies, query_string: _qs, ...rest } = event.request;
        const headers = { ...(rest.headers ?? {}) };
        for (const h of ["authorization", "cookie", "x-install-id"]) Reflect.deleteProperty(headers, h);
        event.request = { ...rest, headers };
      }
      return event;
    },
    beforeBreadcrumb(crumb) {
      // HTTP breadcrumbs only carry method/url/status; drop console output that might hold text.
      return crumb.category === "console" ? null : crumb;
    },
  });
  return true;
}

export { Sentry };
