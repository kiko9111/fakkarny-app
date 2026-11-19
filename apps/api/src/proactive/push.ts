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
}

export interface PushResult {
  /** Tokens Expo says are no longer valid; their devices should be cleared. */
  invalidTokens: string[];
  sent: number;
}

export type PushSender = (messages: PushMessage[]) => Promise<PushResult>;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function createExpoPushSender(fetchImpl: typeof fetch = fetch, accessToken?: string): PushSender {
  return async (messages) => {
    const invalidTokens: string[] = [];
    let sent = 0;
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
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
      const json = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
      (json.data ?? []).forEach((ticket, j) => {
        if (ticket.status === "ok") sent++;
        else if (ticket.details?.error === "DeviceNotRegistered") invalidTokens.push(batch[j]!.to);
      });
    }
    return { invalidTokens, sent };
  };
}
