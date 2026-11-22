import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, Stack } from "expo-router";
import { Mood, SessionMode, type Session, type SessionMessage, type SessionState } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { acceptSessionStep, consentToSession, deleteSessionData, endSession, getSessionState, sendSessionMessage, startSession } from "@/lib/api";
import { colors } from "@/lib/theme";
import { HttpError } from "@/sync/queue";

const FACES = ["😞", "😕", "😐", "🙂", "😄"];

/**
 * Session: a private space to reflect with Zaki. Not therapy. Adults only, its own consent,
 * and the helpline is always on screen. Nothing here is stored on the phone.
 */
export default function SessionScreen() {
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
      else Alert.alert(t.session.failed);
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
      if (session) setSession({ ...session, messages: session.messages.map((x) => (x.id === m.id && x.step ? { ...x, step: { ...x.step, accepted: true } } : x)) });
    });

  const removeAll = () =>
    Alert.alert(t.session.deleteConfirm, undefined, [
      { text: t.session.no, style: "cancel" },
      { text: t.session.yes, style: "destructive", onPress: () => void run(async () => (await deleteSessionData(), setSession(null), await load())) },
    ]);

  const helpline = state ? <Text style={styles.helpline}>{fill(t.session.helpline, { line: state.helpline })}</Text> : null;

  if (!state) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t.session.title }} />
        {failed ? (
          <Pressable onPress={() => void load()}>
            <Text style={styles.link}>{t.session.offline}</Text>
          </Pressable>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  if (!state.available || !state.allowed) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t.session.title }} />
        <Text style={styles.big}>🌙</Text>
        <Text style={styles.body}>{state.available ? t.session.adultsOnly : t.session.comingSoon}</Text>
        {helpline}
      </View>
    );
  }

  if (!state.consented) {
    const tick = (on: boolean, set: (v: boolean) => void, label: string) => (
      <Pressable style={styles.tickRow} onPress={() => set(!on)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
        <Text style={styles.tick}>{on ? "☑" : "☐"}</Text>
        <Text style={styles.tickText}>{label}</Text>
      </Pressable>
    );
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: t.session.title }} />
        <Text style={styles.heading}>{t.session.consentTitle}</Text>
        <Text style={styles.body}>{t.session.what}</Text>
        <Text style={styles.body}>{t.session.notDoctor}</Text>
        <Text style={styles.body}>{t.session.privacy}</Text>
        {tick(adult, setAdult, t.session.tickAdult)}
        {tick(agree, setAgree, t.session.tickAgree)}
        <Pressable style={[styles.primary, (!adult || !agree || busy) && styles.dim]} disabled={!adult || !agree || busy} onPress={() => void run(async () => (await consentToSession(), await load()))} accessibilityRole="button">
          <Text style={styles.primaryText}>{t.session.agree}</Text>
        </Pressable>
        {helpline}
      </ScrollView>
    );
  }

  if (!session) {
    const blocked = state.free_left === 0;
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: t.session.title }} />
        <Text style={styles.heading}>{t.session.howAreYou}</Text>
        <View style={styles.faces}>
          {FACES.map((face, i) => (
            <Pressable key={face} style={[styles.face, mood === i + 1 && styles.faceOn]} onPress={() => setMood(i + 1)} accessibilityRole="button" accessibilityLabel={t.session.moods[Mood.parse(i + 1) as 1 | 2 | 3 | 4 | 5]}>
              <Text style={styles.faceText}>{face}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          {SessionMode.options.map((m) => (
            <Pressable key={m} style={[styles.chip, mode === m && styles.chipOn]} onPress={() => setMode(m)} accessibilityRole="button">
              <Text style={[styles.chipText, mode === m && styles.chipTextOn]}>{t.session.modes[m]}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.muted}>{t.session.modeHints[mode]}</Text>
        {blocked ? (
          <>
            <Text style={styles.body}>{fill(t.session.nextFree, { day: state.next_free_at ? new Date(state.next_free_at).toLocaleDateString([], { weekday: "long" }) : "" })}</Text>
            <Pressable style={styles.primary} onPress={() => router.push("/paywall")} accessibilityRole="button">
              <Text style={styles.primaryText}>{t.session.goPro}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.primary, (mood === null || busy) && styles.dim]} disabled={mood === null || busy} onPress={() => void run(async () => setSession(await startSession({ mode, mood: mood ?? 3 })))} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t.session.start}</Text>}
          </Pressable>
        )}
        {state.free_left !== null && !blocked ? <Text style={styles.muted}>{t.session.freeNote}</Text> : null}
        {state.moods.length ? (
          <>
            <Text style={styles.muted}>{t.session.moodHistory}</Text>
            <Text style={styles.strip}>{state.moods.slice(-14).map((m) => FACES[m.mood - 1]).join(" ")}</Text>
          </>
        ) : null}
        <Text style={styles.muted}>{t.session.notDoctor}</Text>
        {helpline}
        <Pressable onPress={removeAll} accessibilityRole="button">
          <Text style={styles.danger}>{t.session.deleteAll}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const ended = Boolean(session.ended_at);
  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: t.session.title }} />
      <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {session.messages.map((m) => (
          <View key={m.id} style={[styles.bubble, m.role === "user" ? styles.mine : styles.zaki]}>
            <Text style={[styles.bubbleText, m.role === "user" && styles.mineText]}>{m.text}</Text>
            {m.step ? (
              <Pressable style={[styles.step, m.step.accepted && styles.dim]} disabled={m.step.accepted || busy} onPress={() => void remind(m)} accessibilityRole="button">
                <Text style={styles.stepText}>{m.step.accepted ? t.session.stepSaved : fill(t.session.stepRemind, { title: m.step.title })}</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {busy ? <ActivityIndicator color={colors.accent} /> : null}
        {helpline}
      </ScrollView>
      {ended ? (
        <Pressable style={[styles.primary, styles.bar]} onPress={() => void (setSession(null), load())} accessibilityRole="button">
          <Text style={styles.primaryText}>{t.session.done}</Text>
        </Pressable>
      ) : (
        <View style={styles.inputRow}>
          <TextInput style={styles.input} value={text} onChangeText={setText} placeholder={t.session.placeholder} multiline maxLength={2000} />
          <Pressable style={[styles.sendBtn, (!text.trim() || busy) && styles.dim]} disabled={!text.trim() || busy} onPress={() => void send()} accessibilityRole="button">
            <Text style={styles.primaryText}>{t.session.send}</Text>
          </Pressable>
          <Pressable style={styles.endBtn} disabled={busy} onPress={() => void run(async () => setSession(await endSession(session.id)))} accessibilityRole="button">
            <Text style={styles.endText}>{t.session.end}</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12 },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  big: { fontSize: 48 },
  heading: { fontSize: 20, fontWeight: "700", color: colors.text, textAlign: "center" },
  body: { fontSize: 15, lineHeight: 23, color: colors.text, textAlign: "left" },
  muted: { fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: "center" },
  helpline: { fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: "center", marginTop: 8 },
  link: { color: colors.accent, fontWeight: "600", fontSize: 15 },
  tickRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  tick: { fontSize: 22, color: colors.accent },
  tickText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.text, textAlign: "left" },
  primary: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  dim: { opacity: 0.5 },
  faces: { flexDirection: "row", justifyContent: "center", gap: 8 },
  face: { borderRadius: 14, padding: 8, borderWidth: 2, borderColor: "transparent" },
  faceOn: { borderColor: colors.accent, backgroundColor: "#fff" },
  faceText: { fontSize: 30 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: { borderWidth: 1, borderColor: colors.accent, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { backgroundColor: colors.accent },
  chipText: { color: colors.accent, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  strip: { fontSize: 18, textAlign: "center" },
  danger: { color: colors.error, fontSize: 13, textAlign: "center", paddingVertical: 8 },
  bubble: { maxWidth: "86%", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  zaki: { alignSelf: "flex-start", backgroundColor: "#fff" },
  mine: { alignSelf: "flex-end", backgroundColor: colors.accent },
  bubbleText: { fontSize: 16, lineHeight: 23, color: colors.text, textAlign: "left" },
  mineText: { color: "#fff" },
  step: { borderWidth: 1, borderColor: colors.accent, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  stepText: { color: colors.accent, fontWeight: "600", fontSize: 14 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12 },
  input: { flex: 1, maxHeight: 120, backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: colors.text, writingDirection: "auto" },
  sendBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
  endBtn: { paddingHorizontal: 6, paddingVertical: 12 },
  endText: { color: colors.muted, fontSize: 14 },
  bar: { margin: 12 },
});
