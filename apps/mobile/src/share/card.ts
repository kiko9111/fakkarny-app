import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { language } from "@/i18n";
import { API_URL, getReferral } from "@/lib/api";

/**
 * Share cards: a picture made by the server (1080x1920, for WhatsApp Status and Stories),
 * downloaded to the cache and handed to the share sheet. Returns false when it couldn't, so the
 * caller can fall back to sharing text.
 */
const lang = () => (language === "en" ? "en" : "ar");

async function shareImage(url: string, name: string): Promise<boolean> {
  try {
    if (!(await Sharing.isAvailableAsync())) return false;
    const file = await File.downloadFileAsync(url, new File(Paths.cache, name), { idempotent: true });
    await Sharing.shareAsync(file.uri, { mimeType: "image/png" });
    return true;
  } catch {
    return false;
  }
}

/** The streak card, with the user's own invite link drawn on it. */
export async function shareStreakCard(days: number): Promise<boolean> {
  const code = await getReferral()
    .then((r) => r.code)
    .catch(() => "");
  return shareImage(`${API_URL}/cards/streak/${days}.png?lang=${lang()}${code ? `&code=${encodeURIComponent(code)}` : ""}`, `zaki-streak-${days}.png`);
}

/** A split's card: its title and total, with the split's link. */
export function shareSplitCard(splitUrl: string): Promise<boolean> {
  return shareImage(`${splitUrl}/card.png?lang=${lang()}`, `zaki-split-${splitUrl.split("/").pop()}.png`);
}
