import { useState } from "react";
import { StyleSheet } from "react-native";
import { router, Stack } from "expo-router";
import { DEFAULT_BRIEF_TIME } from "@fakkarni/shared";
import { t } from "@/i18n";
import { ALL_TOPICS, NEWS_TIMES, toggleTopic } from "@/me/news";
import { Choice, Field, FieldGroup, MeInput, Picks } from "@/me/parts";
import { useMe } from "@/me/useMe";
import { HttpError } from "@/sync/queue";
import { notify, Screen } from "@/ui";

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Daily news: the topics Zaki sends a short brief about, and when. A picked topic turns it on; none turns it off. */
export default function NewsScreen() {
  const m = t.lay.me;
  const { user, save } = useMe((u) => setTyped(u.brief_time ?? ""));
  const [typed, setTyped] = useState(user?.brief_time ?? "");
  const topics = user?.brief_topics ?? [];
  const on = topics.length > 0 && !!user?.brief_time;
  const time = user?.brief_time ?? DEFAULT_BRIEF_TIME;

  // 402: free keeps one topic; the paywall says what Pro adds.
  const paywall = (err: unknown) => {
    if (err instanceof HttpError && err.status === 402) {
      router.push("/paywall");
      return true;
    }
    return false;
  };

  const toggle = (topic: (typeof ALL_TOPICS)[number]) => {
    const next = toggleTopic(topics, topic);
    if ("error" in next) return notify(m.newsMax, "info");
    void save({ brief_topics: next.topics, ...(next.topics.length && !user?.brief_time ? { brief_time: DEFAULT_BRIEF_TIME } : {}) }, paywall);
  };

  const saveTyped = () => {
    if (!typed || typed === user?.brief_time) return;
    if (!TIME_RE.test(typed)) return notify(t.settings.invalidTime, "error");
    void save({ brief_time: typed });
  };

  const options = ALL_TOPICS.map((k) => ({ key: k, label: m.topics[k] }));
  const times = (NEWS_TIMES as readonly string[]).includes(time) ? NEWS_TIMES : [...NEWS_TIMES, time];

  return (
    <Screen keyboard>
      <Stack.Screen options={{ title: m.news }} />
      <FieldGroup>
        <Field label={m.newsTopics} first>
          <Picks options={options} values={topics} onToggle={toggle} />
        </Field>
        {on ? (
          <Field label={m.newsTime}>
            <Choice value={time} onChange={(v) => (setTyped(v), void save({ brief_time: v }))} options={times.map((v) => ({ key: v, label: v }))} />
            <MeInput value={typed} onChangeText={setTyped} onEnd={saveTyped} keyboardType="numbers-and-punctuation" maxLength={5} style={styles.time} placeholder="08:30" />
          </Field>
        ) : null}
      </FieldGroup>
    </Screen>
  );
}

const styles = StyleSheet.create({
  time: { width: 110, textAlign: "center" },
});
