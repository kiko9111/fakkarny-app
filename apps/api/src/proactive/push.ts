/**
 * Expo push service (free; covers FCM and APNs). https://docs.expo.dev/push-notifications/sending-notifications/
 */

export interface PushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  categoryId?: string;
  /** Android notification channel; the app creates "messages" for Zaki's messages. */
  channelId?: string;
}

/** Created by the app (apps/mobile/src/notifications); Android shows these as heads-up. */
export const ANDROID_CHANNEL = "messages";

export interface PushResult {
  /** Tokens Expo says are no longer valid; their devices should be cleared. */
  invalidTokens: string[];
  sent: number;
  /** Accepted messages: the receipt (fetched ~15 min later) may still say the token is dead. */
  tickets?: { id: string; token: string }[];
}

export type PushSender = (messages: PushMessage[]) => Promise<PushResult>;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function createExpoPushSender(fetchImpl: typeof fetch = fetch, accessToken?: string): PushSender {
  return async (messages) => {
    const invalidTokens: string[] = [];
    const tickets: { id: string; token: string }[] = [];
    let sent = 0;
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100).map((m) => ({ channelId: ANDROID_CHANNEL, ...m }));
      const send = () =>
        fetchImpl(EXPO_PUSH_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(batch),
        });
      // One retry on a server error or network blip.
      let res = await send().catch(() => null);
      if (!res || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1000));
        res = await send();
      }
      if (!res.ok) throw new Error(`Expo push failed: ${res.status}`);
      const json = (await res.json()) as { data?: { status: string; id?: string; details?: { error?: string } }[] };
      (json.data ?? []).forEach((ticket, j) => {
        if (ticket.status === "ok") {
          sent++;
          if (ticket.id) tickets.push({ id: ticket.id, token: batch[j]!.to });
        }
        else if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(batch[j]!.to);
      });
    }
    return { invalidTokens, sent, tickets };
  };
}

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** Ticket ids → the ones whose receipt says DeviceNotRegistered (the app was uninstalled). */
export type ReceiptChecker = (ids: string[]) => Promise<string[]>;

export function createExpoReceiptChecker(fetchImpl: typeof fetch = fetch, accessToken?: string): ReceiptChecker {
  return async (ids) => {
    const dead: string[] = [];
    // Expo accepts up to 1000 ids per request.
    for (let i = 0; i < ids.length; i += 1000) {
      const res = await fetchImpl(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ ids: ids.slice(i, i + 1000) }),
      });
      if (!res.ok) throw new Error(`Expo receipts failed: ${res.status}`);
      const json = (await res.json()) as { data?: Record<string, { status: string; details?: { error?: string } }> };
      for (const [id, receipt] of Object.entries(json.data ?? {})) {
        if (receipt.status === "error" && receipt.details?.error === "DeviceNotRegistered") dead.push(id);
      }
    }
    return dead;
  };
}
