import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, router, Stack, useLocalSearchParams } from "expo-router";
import type { InvitePreview } from "@fakkarni/shared";
import { fill, joinFailure } from "@/circles/logic";
import { t } from "@/i18n";
import { acceptInvite, previewInvite } from "@/lib/api";
import { prefs } from "@/lib/prefs";
import { unlock } from "@/lib/unlock-store";
import { HttpError } from "@/sync/queue";
import { Button, EmptyState, IconTile, palette, plain, space, Text } from "@/ui";

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
      .catch((err) => {
        if (!active) return;
        // Not a circle invite: a typed code may be a friend's personal code (both get Pro days).
        if (statusOf(err) === 404) return router.replace({ pathname: "/ref/[code]", params: { code } });
        setError(joinFailure(statusOf(err)));
      });
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
      unlock.open("people");
      router.replace({ pathname: "/circle/[id]", params: { id: circle.id } });
    } catch (err) {
      setError(joinFailure(statusOf(err)));
      setBusy(false);
    }
  };

  const unusable = preview && (preview.state === "expired" || preview.state === "full");
  const family = preview?.circle_kind === "family";
  return (
    <View style={styles.page}>
      <Stack.Screen options={{ title: "" }} />
      {!preview && !error ? <ActivityIndicator color={palette.primary} /> : null}
      {error || unusable ? <EmptyState title={plain(FAILURE[error ?? "gone"])} /> : null}
      {preview && !error && !unusable ? (
        <>
          <View style={styles.hero}>
            <IconTile name={family ? "home" : "people"} size={80} color={family ? palette.family : palette.friends} bg={family ? palette.familySoft : palette.friendsSoft} />
          </View>
          <Text variant="title" align="center">
            {plain(preview.inviter_name ? fill(t.circles.invitedBy, { name: preview.inviter_name, circle: preview.circle_name }) : fill(t.circles.invitedAnon, { circle: preview.circle_name }))}
          </Text>
          <Text variant="body" color={palette.inkSoft} align="center">
            {fill(t.circles.members, { n: preview.member_count })}
          </Text>
          {preview.state === "already_member" ? (
            <Text variant="body" color={palette.inkSoft} align="center">
              {plain(t.circles.alreadyMember)}
            </Text>
          ) : null}
          <Button label={preview.state === "already_member" ? t.circles.open : t.circles.join} size="lg" block busy={busy} onPress={() => void join()} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.bg, padding: space.xl, gap: space.md, justifyContent: "center" },
  hero: { alignItems: "center", marginBottom: space.sm },
});
