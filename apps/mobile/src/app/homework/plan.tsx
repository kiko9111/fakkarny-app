import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { MAX_BATCH, parseHomeworkMessage, REWARD_CHOICES, type CircleMember, type HomeworkDraft } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { dateLocale, t } from "@/i18n";
import { track } from "@/lib/analytics";
import { getCircle, peekCircle, sendHomeworkBatch } from "@/lib/api";
import { HttpError } from "@/sync/queue";
import { batchItems, localDay } from "@/homework/logic";
import { Button, Card, Chip, IconButton, Note, notify, palette, plain, Screen, space, Text, TextField } from "@/ui";

const dayName = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(dateLocale, { weekday: "long", day: "numeric", month: "short" });

/**
 * A week's homework from one message (2026-11-26): the parent pastes the school's WhatsApp text
 * (or types it), the phone splits it into homework in pure code (shared parseHomeworkMessage),
 * the parent removes what they don't want, picks a reward, and sends them all to one child.
 * The child gets one chat line, not one per homework.
 */
export default function HomeworkPlanScreen() {
  const { circle } = useLocalSearchParams<{ circle: string }>();
  const [members, setMembers] = useState<CircleMember[] | null>(() => peekCircle(circle)?.members.filter((m) => !m.is_me) ?? null);
  const [who, setWho] = useState<string | null>(() => {
    const others = peekCircle(circle)?.members.filter((m) => !m.is_me) ?? [];
    return others.length === 1 ? others[0]!.user_id : null;
  });
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<HomeworkDraft[] | null>(null);
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [reward, setReward] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCircle(circle)
      .then((c) => {
        const others = c.members.filter((m) => !m.is_me);
        setMembers(others);
        if (others.length === 1) setWho(others[0]!.user_id);
      })
      .catch(() => setMembers((m) => m ?? []));
  }, [circle]);

  const read = () => {
    setDrafts(parseHomeworkMessage(text, localDay(new Date())));
    setRemoved(new Set());
  };
  const kept = drafts ? drafts.length - removed.size : 0;

  const send = async () => {
    if (!drafts || !who || kept === 0 || busy) return;
    setBusy(true);
    try {
      const items = batchItems(drafts, removed, reward).slice(0, MAX_BATCH);
      await sendHomeworkBatch(circle, { assignee_id: who, items });
      track("homework_plan_sent", { count: items.length, rewards: reward ? items.length : 0 });
      notify(t.homework.planSent);
      router.back();
    } catch (err) {
      notify(err instanceof HttpError && err.status === 422 ? t.homework.planTooMany : t.tasks.failed, "error");
      setBusy(false);
    }
  };

  const label = (s: string) => (
    <Text variant="smallStrong" color={palette.inkSoft}>
      {s}
    </Text>
  );

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.homework.planTitle }} />
      {members?.length ? (
        <>
          {label(t.tasks.who)}
          <View style={styles.row}>
            {members.map((m) => (
              <Chip key={m.user_id} icon="person-outline" label={m.name ?? t.circles.noName} selected={who === m.user_id} onPress={() => setWho(m.user_id)} />
            ))}
          </View>
        </>
      ) : null}
      {members?.length === 0 ? <Note icon="people-outline">{plain(t.tasks.noMembers)}</Note> : null}
      {label(t.homework.planPaste)}
      <TextField value={text} onChangeText={(v) => (setText(v), setDrafts(null))} placeholder={t.homework.planPlaceholder} maxLength={4000} multiline />
      {!drafts ? <Button label={t.homework.planRead} icon="reader-outline" block disabled={!text.trim()} onPress={read} /> : null}
      {drafts?.length === 0 ? (
        <Card>
          <Text variant="small">{t.homework.planNone}</Text>
        </Card>
      ) : null}
      {drafts?.length ? (
        <>
          {label(fill(t.homework.planFound, { n: drafts.length }))}
          {drafts.map((d, i) =>
            removed.has(i) ? null : (
              <Card key={i} style={styles.draft}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">{d.title}</Text>
                  {d.subject || d.due_day ? (
                    <Text variant="small" color={palette.inkSoft}>
                      {[d.subject, d.due_day ? fill(t.homework.planDue, { day: dayName(d.due_day) }) : null].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                </View>
                <IconButton name="close" label={t.homework.planRemove} color={palette.inkSoft} onPress={() => setRemoved((r) => new Set([...r, i]))} />
              </Card>
            ),
          )}
          {label(t.homework.planRewardEach)}
          <View style={styles.row}>
            <Chip label={t.homework.rewardNone} selected={reward === null} onPress={() => setReward(null)} />
            {REWARD_CHOICES.map((n) => (
              <Chip key={n} icon="wallet-outline" label={fill(t.homework.rewardBadge, { n })} selected={reward === n} onPress={() => setReward(n)} />
            ))}
          </View>
          <Button label={fill(t.homework.planSend, { n: kept })} icon="send" size="lg" block busy={busy} disabled={!who || kept === 0} onPress={() => void send()} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  draft: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
});
