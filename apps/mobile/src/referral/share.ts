import { Linking } from "react-native";
import { whatsappShareUrl, fill } from "@/circles/logic";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { API_URL, getReferral } from "@/lib/api";
import { notify } from "@/ui/feedback";

/**
 * "Invite a friend": the personal link goes out from the user's own WhatsApp (never a bot).
 * When the friend signs in and opens it, both get 7 days of Zaki Pro.
 */
export async function shareInvite(via: "upsell" | "settings" | "circle" | "chat"): Promise<void> {
  try {
    const ref = await getReferral();
    const url = ref.url ?? `${API_URL}/r/${ref.code}`;
    track("invite_shared", { via });
    await Linking.openURL(whatsappShareUrl(fill(t.referral.shareText, { url })));
  } catch {
    notify(t.referral.offline, "error");
  }
}
