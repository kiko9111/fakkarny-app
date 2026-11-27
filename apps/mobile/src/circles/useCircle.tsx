import { useCallback, useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { CircleDetail, CircleMember } from "@fakkarni/shared";
import { whatsappShareUrl } from "@/circles/logic";
import { dateLocale, t } from "@/i18n";
import { createInvite, getCircle, peekCircle, screenCache } from "@/lib/api";
import { failText } from "@/lib/errors";
import { useGuess } from "@/lib/optimistic";
import { HttpError } from "@/sync/queue";
import { Button, LoadingCards, Note, notify, palette, Screen, space } from "@/ui";

/** What the circle's three screens (summary, feed, info) share: the circle itself, the invite, the way in. */

export const ago = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });

export const memberName = (m: Pick<CircleMember, "is_me" | "name">) => (m.is_me ? t.ui.you : (m.name ?? t.circles.noName));

/**
 * The circle, from the phone's last copy first. `circle` carries the user's own taps at once
 * (the circle's guess, lib/optimistic.ts); `loadCircle` asks the server and is the last step of
 * a screen's `load`, after its other parts were started.
 */
export function useCircle(id: string) {
  const [saved, setCircle] = useState<CircleDetail | null>(() => peekCircle(id));
  const { shown: circle, run: guessCircle } = useGuess(saved);
  const [failed, setFailed] = useState<string | null>(null);
  /** What the phone holds (the same object when nothing changed: no redraw). */
  const showHeld = useCallback(() => {
    const held = peekCircle(id);
    if (held) setCircle(held);
  }, [id]);
  const loadCircle = useCallback(async () => {
    try {
      setCircle(await getCircle(id));
      setFailed(null);
    } catch (err) {
      // Left, removed or deleted: drop the saved copy instead of showing it.
      if (err instanceof HttpError && err.status === 404) {
        screenCache.remove(`/circles/${id}`);
        setCircle(null);
      }
      setFailed(failText(err, t.circles.offline));
    }
  }, [id]);
  return { circle, setCircle, guessCircle, failed, showHeld, loadCircle };
}

/** The invite link, sent from the user's own WhatsApp (any other app when it is not there). */
export function useInvite(id: string, after: () => void) {
  const [inviting, setInviting] = useState(false);
  const invite = async () => {
    if (inviting) return;
    setInviting(true);
    try {
      const { share_text } = await createInvite(id);
      await Linking.openURL(whatsappShareUrl(share_text)).catch(() => Share.share({ message: share_text }));
      after();
    } catch {
      notify(t.circles.failed, "error");
    } finally {
      setInviting(false);
    }
  };
  return { inviting, invite };
}

/** While there is no circle to draw: soft cards on a first load, the retry when it failed. */
export function CircleWaiting({ failed, onRetry }: { failed: string | null; onRetry: () => void }) {
  return failed ? (
    <View style={styles.center}>
      <Stack.Screen options={{ title: "" }} />
      <Note icon="cloud-offline-outline">{failed}</Note>
      <Button label={t.circles.retry} kind="tonal" onPress={onRetry} />
    </View>
  ) : (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <LoadingCards count={4} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: palette.bg, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl },
});
