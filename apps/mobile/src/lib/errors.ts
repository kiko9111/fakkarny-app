import { t } from "@/i18n";
import { HttpError } from "@/sync/queue";

/** A short code shown after the message, so a screenshot tells us what failed. */
export function failCode(err: unknown): string {
  if (err instanceof HttpError) return err.status === 0 ? "timeout" : String(err.status);
  if (err && typeof err === "object" && "issues" in err) return "data";
  if (err instanceof TypeError) return "net";
  return "other";
}

/**
 * What to tell the user when a server call fails. Every failure used to read "no connection",
 * even a busy server (429), a server error, or a reply the app couldn't read while the phone
 * was online, which hid the cause.
 */
export function failText(err: unknown, offline: string): string {
  const code = failCode(err);
  const msg =
    code === "429" ? t.errors.busy
    : code === "401" ? t.errors.signIn
    : code === "timeout" ? t.errors.slow
    : code === "data" ? t.errors.data
    : err instanceof HttpError && err.status >= 500 ? t.errors.server
    : offline;
  return code === "net" ? msg : `${msg} (${code})`;
}
