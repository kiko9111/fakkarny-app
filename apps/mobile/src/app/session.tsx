import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { router, Stack } from "expo-router";
import { Mood, SessionMode, type Session, type SessionMessage, type SessionState } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t, dateLocale } from "@/i18n";
import { acceptSessionStep, consentToSession, deleteSessionData, endSession, getSessionState, sendSessionMessage, startSession } from "@/lib/api";
import { Backdrop, glass, Button, Card, Chip, confirm, fonts, Icon, IconButton, notify, palette, radius, shadow, space, Text, textStart, ZakiAvatar, type IconName } from "@/ui";
import { pullItems } from "@/sync/items";
import { HttpError } from "@/sync/queue";

/** The five moods, low to great, drawn as one icon family. */
const FACES: { icon: IconName; color: string }[] = [
  { icon: "rainy-outline", color: "#5B6B8C" },
  { icon: "cloudy-outline", color: "#7A7F99" },
  { icon: "partly-sunny-outline", color: "#8F7A3A" },
  { icon: "sunny-outline", color: "#B7791F" },
  { icon: "happy-outline", color: "#C2552C" },
];

/**
 * Session: a private space to reflect with Zaki. Not therapy. Adults only, its own consent,
 * and the helpline is always on screen. Nothing here is stored on the phone.
 */
/** Session keeps its own calm ground in every theme. */
export default function SessionScreen() {
  return (
    <View style={styles.ground}>
      <Backdrop calm />
      <SessionBody />
    </View>
  );
}

function SessionBody() {
  const [state, setState] = useState<SessionState | null>(null);
  const [failed, setFailed] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [adult, setAdult] = useState(false);
  const [agree, setAgree] = useState(false);
  const [mood, setMood] = useState<number | null>(null);
  const [mode, setMode] = useState<SessionMode>("talk");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);

  const load = useCallback(async () => {
    try {
      const s = await getSessionState();
      setState(s);
      setSession(s.open);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      if (err instanceof HttpError && err.status === 402) router.push("/paywall");
      else notify(t.session.failed, "error");
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      const body = text.trim();
      if (!session || !body) return;
      const turn = await sendSessionMessage(session.id, body);
      setText("");
      setSession({ ...session, messages: [...session.messages, ...turn.messages], ended_at: turn.ended ? new Date().toISOString() : null });
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    });

  const remind = (m: SessionMessage) =>
    run(async () => {
      await acceptSessionStep(m.id);
      void pullItems(); // the step is now a reminder: schedule its notification
      if (session) setSession({ ...session, messages: session.messages.map((x) => (x.id === m.id && x.step ? { ...x, step: { ...x.step, accepted: true } } : x)) });
    });

  const removeAll = () => confirm(t.session.deleteConfirm, t.session.yes, () => void run(async () => (await deleteSessionData(), setSession(null), await load())), t.session.no);

  const helpline = state ? (
    <View style={styles.helpline}>
      <Icon name="call-outline" size={16} color={palette.calm} />
      <Text variant="small" color={palette.inkSoft} style={styles.flex}>
        {fill(t.session.helpline, { line: state.helpline })}
      </Text>
    </View>
  ) : null;

  if (!state) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t.session.title }} />
        {failed ? <Button label={t.session.offline} kind="tonal" onPress={() => void load()} /> : <ActivityIndicator color={palette.calm} />}
      </View>
    );
  }

  if (!state.available || !state.allowed) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t.session.title }} />
        <ZakiAvatar size={72} mood="calm" glow />
        <Text variant="body" align="center">
          {state.available ? t.session.adultsOnly : t.session.comingSoon}
        </Text>
        {helpline}
      </View>
    );
  }

  if (!state.consented) {
    const tick = (on: boolean, set: (v: boolean) => void, label: string) => (
      <Pressable style={styles.tickRow} onPress={() => set(!on)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
        <View style={[styles.tick, on && styles.tickOn]}>{on ? <Icon name="checkmark" size={16} color="#fff" /> : null}</View>
        <Text variant="body" style={styles.flex}>
          {label}
        </Text>
      </Pressable>
    );
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: t.session.title }} />
        <View style={styles.hero}>
          <ZakiAvatar size={72} mood="calm" glow />
          <Text variant="title" align="center">
            {t.session.consentTitle}
          </Text>
        </View>
        <Card style={styles.soft}>
          <Text variant="body">{t.session.what}</Text>
          <Text variant="body">{t.session.notDoctor}</Text>
          <Text variant="body" color={palette.inkSoft}>
            {t.session.privacy}
          </Text>
        </Card>
        {tick(adult, setAdult, t.session.tickAdult)}
        {tick(agree, setAgree, t.session.tickAgree)}
        <Button label={t.session.agree} size="lg" block disabled={!adult || !agree || busy} style={styles.calmBtn} onPress={() => void run(async () => (await consentToSession(), await load()))} />
        {helpline}
      </ScrollView>
    );
  }

  if (!session) {
    const blocked = state.free_left === 0;
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: t.session.title }} />
        <View style={styles.hero}>
          <ZakiAvatar size={64} mood="calm" glow />
          <Text variant="title" align="center">
            {t.session.howAreYou}
          </Text>
          <Text variant="small" color={palette.inkSoft} align="center">
            {t.ui.sessionSafe}
          </Text>
        </View>
        <View style={styles.faces}>
          {FACES.map((face, i) => {
            const on = mood === i + 1;
            return (
              <Pressable key={face.icon} style={[styles.face, on && styles.faceOn]} onPress={() => setMood(i + 1)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={t.session.moods[Mood.parse(i + 1) as 1 | 2 | 3 | 4 | 5]}>
                <Icon name={face.icon} size={30} color={on ? "#fff" : face.color} />
              </Pressable>
            );
          })}
        </View>
        {mood !== null ? (
          <Text variant="smallStrong" color={palette.calm} align="center">
            {t.session.moods[Mood.parse(mood) as 1 | 2 | 3 | 4 | 5]}
          </Text>
        ) : null}
        <View style={styles.row}>
          {SessionMode.options.map((m) => (
            <Chip key={m} label={t.session.modes[m]} tone="calm" selected={mode === m} onPress={() => setMode(m)} />
          ))}
        </View>
        <Text variant="small" color={palette.inkSoft} align="center">
          {t.session.modeHints[mode]}
        </Text>
        {blocked ? (
          <>
            <Text variant="body" align="center">
              {fill(t.session.nextFree, { day: state.next_free_at ? new Date(state.next_free_at).toLocaleDateString(dateLocale, { weekday: "long" }) : "" })}
            </Text>
            <Button label={t.session.goPro} icon="sparkles" size="lg" block onPress={() => router.push("/paywall")} />
          </>
        ) : (
          <Button label={t.session.start} size="lg" block busy={busy} disabled={mood === null} style={styles.calmBtn} onPress={() => void run(async () => setSession(await startSession({ mode, mood: mood ?? 3 })))} />
        )}
        {state.free_left !== null && !blocked ? (
          <Text variant="caption" color={palette.inkSoft} align="center">
            {t.session.freeNote}
          </Text>
        ) : null}
        {state.moods.length ? (
          <Card style={styles.soft}>
            <Text variant="smallStrong" color={palette.inkSoft}>
              {t.session.moodHistory}
            </Text>
            <View style={styles.strip}>
              {state.moods.slice(-14).map((m, i) => (
                <Icon key={i} name={FACES[m.mood - 1]!.icon} size={20} color={FACES[m.mood - 1]!.color} />
              ))}
            </View>
          </Card>
        ) : null}
        <Text variant="caption" color={palette.inkSoft} align="center">
          {t.session.notDoctor}
        </Text>
        {helpline}
        <Button label={t.session.deleteAll} kind="danger" size="sm" icon="trash-outline" onPress={removeAll} style={styles.selfCenter} />
      </ScrollView>
    );
  }

  const ended = Boolean(session.ended_at);
  return (
    <KeyboardAvoidingView style={styles.page} behavior="padding" keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: t.session.title }} />
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {session.messages.map((m) => {
          const mine = m.role === "user";
          return (
            <View key={m.id} style={[styles.msgRow, mine ? styles.msgMine : styles.msgZaki]}>
              {!mine ? <ZakiAvatar size={26} mood="calm" /> : null}
              <View style={[styles.bubble, mine ? styles.mine : styles.zaki]}>
                <Text variant="body" color={mine ? "#fff" : palette.ink}>
                  {m.text}
                </Text>
                {m.step ? (
                  <Button
                    label={m.step.accepted ? t.session.stepSaved : fill(t.session.stepRemind, { title: m.step.title })}
                    icon={m.step.accepted ? "checkmark" : "alarm-outline"}
                    kind="tonal"
                    size="sm"
                    disabled={m.step.accepted || busy}
                    onPress={() => void remind(m)}
                  />
                ) : null}
              </View>
            </View>
          );
        })}
        {busy ? <ActivityIndicator color={palette.calm} /> : null}
        {helpline}
      </ScrollView>
      {ended ? (
        <View style={styles.bar}>
          <Button label={t.session.done} size="lg" block style={styles.calmBtn} onPress={() => void (setSession(null), load())} />
        </View>
      ) : (
        <View style={styles.bar}>
          <View style={styles.field}>
            <TextInput style={styles.input} value={text} onChangeText={setText} placeholder={t.session.placeholder} placeholderTextColor={palette.inkFaint} multiline maxLength={2000} textAlign={textStart} />
            <IconButton name="arrow-up" label={t.session.send} onPress={() => void send()} disabled={!text.trim() || busy} color="#fff" bg={text.trim() ? palette.calm : palette.lineStrong} size={40} />
          </View>
          <Button label={t.session.end} kind="text" size="sm" disabled={busy} onPress={() => void run(async () => setSession(await endSession(session.id)))} style={styles.selfCenter} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  ground: { flex: 1 },
  page: { flex: 1, backgroundColor: "transparent" },
  content: { padding: space.xl, gap: space.md, maxWidth: 560, width: "100%", alignSelf: "center" },
  center: { flex: 1, backgroundColor: palette.calmSoft, alignItems: "center", justifyContent: "center", gap: space.md, padding: space.xl },
  hero: { alignItems: "center", gap: space.sm, marginBottom: space.xs },
  soft: { boxShadow: "none" },
  helpline: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, backgroundColor: "rgba(255,255,255,0.6)", borderRadius: radius.md, padding: space.md, marginTop: space.xs },
  tickRow: { flexDirection: "row", gap: space.md, alignItems: "center", minHeight: 48 },
  tick: { width: 26, height: 26, borderRadius: 8, borderWidth: 2, borderColor: palette.calm, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  tickOn: { backgroundColor: palette.calm },
  calmBtn: { backgroundColor: palette.calm },
  faces: { flexDirection: "row", justifyContent: "center", gap: space.sm },
  face: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: palette.surface },
  faceOn: { backgroundColor: palette.calm, transform: [{ scale: 1.08 }] },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" },
  strip: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  selfCenter: { alignSelf: "center" },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm, maxWidth: "88%" },
  msgMine: { alignSelf: "flex-end" },
  msgZaki: { alignSelf: "flex-start" },
  bubble: { flexShrink: 1, borderRadius: radius.lg, paddingHorizontal: space.lg - 2, paddingVertical: space.sm + 2, gap: space.sm },
  zaki: { ...glass, borderBottomStartRadius: 6 },
  mine: { backgroundColor: palette.calm, borderBottomEndRadius: 6 },
  bar: { paddingHorizontal: space.md, paddingBottom: space.md, gap: space.xs },
  field: { ...glass, backgroundColor: palette.surfaceStrong, flexDirection: "row", alignItems: "flex-end", gap: space.sm, borderRadius: radius.xl, paddingStart: space.lg, paddingEnd: 6, paddingVertical: 6 },
  input: { flex: 1, minHeight: 40, maxHeight: 140, paddingVertical: 9, fontSize: 16, lineHeight: 22, fontFamily: fonts.body, color: palette.ink, outlineStyle: "none" } as object,
});
