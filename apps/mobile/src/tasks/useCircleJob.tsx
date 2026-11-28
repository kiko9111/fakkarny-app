import { useCallback, useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import type { CircleDetail, CircleTask, LinkTask } from "@fakkarni/shared";
import { whatsappShareUrl } from "@/circles/logic";
import { t } from "@/i18n";
import { createInvite, getCircle, getCircleFeed, peekCircle, peekCircleFeed } from "@/lib/api";
import { failText } from "@/lib/errors";
import { useLive } from "@/lib/live";
import { Button, Note, notify, palette, plain, space, Text } from "@/ui";

/**
 * What a circle's job screens (tasks, homework) read: the circle and the tasks its feed carries.
 * The phone's saved copies draw first, the server's answer replaces them; `tasks` is null only on
 * a first load with nothing saved.
 */
export function useCircleJob(id: string): { circle: CircleDetail | null; tasks: CircleTask[] | null; linkTasks: LinkTask[] | null; failed: string | null; load: () => Promise<void> } {
  const [circle, setCircle] = useState<CircleDetail | null>(() => peekCircle(id));
  const [tasks, setTasks] = useState<CircleTask[] | null>(() => peekCircleFeed(id)?.tasks ?? null);
  const [linkTasks, setLinkTasks] = useState<LinkTask[] | null>(() => peekCircleFeed(id)?.link_tasks ?? null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    const held = { circle: peekCircle(id), feed: peekCircleFeed(id) };
    if (held.circle) setCircle(held.circle);
    if (held.feed) {
      setTasks(held.feed.tasks);
      setLinkTasks(held.feed.link_tasks);
    }
    const circleDone = getCircle(id).then(setCircle, () => {});
    try {
      const feed = await getCircleFeed(id);
      setTasks(feed.tasks);
      setLinkTasks(feed.link_tasks);
      setFailed(null);
    } catch (err) {
      setFailed(failText(err, t.circles.offline));
    }
    await circleDone;
  }, [id]);
  useLive(load);
  return { circle, tasks, linkTasks, failed, load };
}

/** The circle's WhatsApp invite, sent from the user's own number (any other app when WhatsApp is not there). */
export function useCircleInvite(id: string): { invite: () => void; inviting: boolean } {
  const [inviting, setInviting] = useState(false);
  const invite = useCallback(() => {
    if (inviting) return;
    setInviting(true);
    createInvite(id)
      .then(({ share_text }) => Linking.openURL(whatsappShareUrl(share_text)).catch(() => Share.share({ message: share_text })))
      .catch(() => notify(t.circles.failed, "error"))
      .finally(() => setInviting(false));
  }, [id, inviting]);
  return { invite, inviting };
}

/** A quiet title above a group of rows on a job screen. */
export function JobHeading({ title }: { title: string }) {
  return (
    <Text variant="smallStrong" color={palette.inkSoft} style={styles.heading} accessibilityRole="header">
      {plain(title)}
    </Text>
  );
}

/** A first load that failed with nothing saved: what went wrong and one way on. */
export function JobFailed({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={styles.failed}>
      <Note icon="cloud-offline-outline">{text}</Note>
      <Button label={t.lay.common.tryAgain} kind="tonal" onPress={onRetry} style={styles.retry} />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { paddingHorizontal: space.xs, marginTop: space.xs },
  failed: { gap: space.md },
  retry: { alignSelf: "center" },
});
