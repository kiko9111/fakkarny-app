import { t } from "@/i18n";
import { HttpError } from "@/sync/queue";

/**
 * What to tell the user when a server call fails. Every failure used to read "no connection",
 * even a busy server (429) or a server error while the phone was online, which hid the cause.
 */
export function failText(err: unknown, offline: string): string {
  if (!(err instanceof HttpError)) return offline;
  if (err.status === 429) return t.errors.busy;
  if (err.status === 401) return t.errors.signIn;
  if (err.status >= 500) return t.errors.server;
  return offline;
}
