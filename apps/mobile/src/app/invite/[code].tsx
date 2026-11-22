import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import type { InvitePreview } from "@fakkarni/shared";
import { fill, joinFailure } from "@/circles/logic";
import { t } from "@/i18n";
import { acceptInvite, previewInvite } from "@/lib/api";
import { prefs } from "@/lib/prefs";
import { colors } from "@/lib/theme";
import { HttpError } from "@/sync/queue";

const FAILURE = { gone: t.circles.inviteGone, notFound: t.circles.inviteNotFound, offline: t.circles.offline } as const;
const statusOf = (err: unknown) => (err instanceof HttpError ? err.status : null);

/** Opened from the invite link (fakkarni://invite/CODE) or after typing a code: preview, then join. */
export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<keyof typeof FAILURE | null>(null);
  const [busy, setBusy] = useState(false);
  const onboarded = prefs.get("onboarded") === "1";

  useEffect(() => {
    if (!onboarded) return;
    let active = true;
    previewInvite(code)
      .then((p) => active && setPreview(p))
      .catch((err) => active && setError(joinFailure(statusOf(err))));
    return () => {
      active = false;
    };
  }, [code, onboarded]);

  // New here: set up (language, sign-in) first, then come straight back to this invite.
  if (!onboarded) {
    prefs.set("pending_invite", code);
    return <Redirect href="/onboarding" />;
  }

  const join = async () => {
    setBusy(true);
    try {
      const circle = await acceptInvite(code);
      router.replace({ pathname: "/circle/[id]", params: { id: circle.id } });
    } catch (err) {
      setError(joinFailure(statusOf(err)));
      setBusy(false);
    }
  };

  const unusable = preview && (preview.state === "expired" || preview.state === "full");
  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: "" }} />
      {!preview && !error ? <ActivityIndicator color={colors.accent} /> : null}
      {error || unusable ? <Text style={styles.body}>{FAILURE[error ?? "gone"]}</Text> : null}
      {preview && !error && !unusable ? (
        <>
          <Text style={styles.emoji}>{preview.circle_kind === "family" ? "🏡" : "🤝"}</Text>
          <Text style={styles.title}>
            {preview.inviter_name ? fill(t.circles.invitedBy, { name: preview.inviter_name, circle: preview.circle_name }) : fill(t.circles.invitedAnon, { circle: preview.circle_name })}
          </Text>
          <Text style={styles.body}>{fill(t.circles.members, { n: preview.member_count })}</Text>
          {preview.state === "already_member" ? <Text style={styles.body}>{t.circles.alreadyMember}</Text> : null}
          <Pressable style={[styles.primary, busy && styles.dim]} disabled={busy} onPress={() => void join()} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{preview.state === "already_member" ? t.circles.open : t.circles.join}</Text>}
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 24, gap: 14, justifyContent: "center" },
  emoji: { fontSize: 56, textAlign: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.text, textAlign: "center" },
  body: { fontSize: 15, color: colors.muted, textAlign: "center" },
  primary: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  primaryText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  dim: { opacity: 0.6 },
});
