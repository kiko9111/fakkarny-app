import { useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import type { LinkTask } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { dateLocale, t } from "@/i18n";
import { cancelLinkTask, shareLinkTask } from "@/lib/api";
import { Badge, Button, Card, confirm, Icon, notify, palette, space, Text } from "@/ui";
import { linkTaskView, type LinkTaskState } from "./logic";

const TONE: Record<LinkTaskState, "neutral" | "ok" | "warn" | "primary"> = { pending: "warn", seen: "warn", accepted: "primary", declined: "neutral", done: "ok", cancelled: "neutral" };
const when = (iso: string) => new Date(iso).toLocaleString(dateLocale, { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Opens WhatsApp with the text (from the user's own number), or the share sheet without it. */
export function sendOnWhatsApp(text: string) {
  return Linking.openURL(whatsappShareUrl(text)).catch(() => Share.share({ message: text }));
}

/**
 * A task sent by link to someone not on Zaki. They answer on a web page; Zaki tells the creator in
 * the chat, and this card shows it on the next load. "Send again" is the ask while waiting and a
 * gentle reminder once accepted. Buttons are tonal / text: cards come in lists.
 */
export function LinkTaskCard({ task, onChanged }: { task: LinkTask; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const words = t.lay.circlejobs;
  const view = linkTaskView(task);
  if (gone) return null;

  const again = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { share_text } = await shareLinkTask(task.id);
      if (share_text) await sendOnWhatsApp(share_text);
    } catch {
      notify(t.tasks.failed, "error");
    } finally {
      setBusy(false);
    }
  };
  const cancel = () =>
    confirm(fill(words.linkCancelAsk, { title: task.title }), t.tasks.yes, () => {
      setGone(true);
      cancelLinkTask(task)
        .then(onChanged)
        .catch(() => {
          setGone(false);
          notify(t.tasks.failed, "error");
        });
    }, t.tasks.no);

  return (
    <Card>
      <View style={styles.head}>
        <Text variant="bodyStrong" color={task.status === "done" ? palette.inkFaint : palette.ink} style={[styles.flex, task.status === "done" && styles.struck]}>
          {task.title}
        </Text>
        <Badge label={words.linkState[view.state]} tone={TONE[view.state]} />
      </View>
      <View style={styles.meta}>
        <Icon name="link-outline" size={14} color={palette.inkSoft} />
        <Text variant="small" color={palette.inkSoft} style={styles.flex}>
          {task.other_name}
        </Text>
      </View>
      {task.due_at && task.status !== "done" ? (
        <View style={styles.meta}>
          <Icon name="time-outline" size={14} color={palette.inkSoft} />
          <Text variant="small" color={palette.inkSoft}>
            {when(task.due_at)}
          </Text>
        </View>
      ) : null}
      {view.again || view.cancel ? (
        <View style={styles.actions}>
          {view.again ? <Button label={words.linkAgain} size="sm" kind="tonal" icon="logo-whatsapp" busy={busy} onPress={() => void again()} /> : null}
          {view.cancel ? <Button label={words.linkCancel} size="sm" kind="text" onPress={cancel} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  struck: { textDecorationLine: "line-through" },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
