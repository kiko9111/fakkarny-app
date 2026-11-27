import { useCallback, useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { isPaid, monthOfRound, myMember, phaseOf, roundState, shownRound, type Gameya } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { track } from "@/lib/analytics";
import { deleteGameya, getGameya, markGameyaPaid, markGameyaReceived, peekGameya, remindGameya } from "@/lib/api";
import { useLive } from "@/lib/live";
import { monthLabel } from "@/gameya/logic";
import { Badge, Button, Card, confirm, EmptyState, Icon, LoadingCards, notify, palette, Screen, space, Text } from "@/ui";

/**
 * One gam'eya: this month on top (who receives, how many paid), then the turns with this month's
 * ticks. The organizer ticks anyone and reminds; a member ticks their own row. Records only.
 */
export default function GameyaScreen() {
  const w = t.lay.gameya;
  const { id } = useLocalSearchParams<{ id: string }>();
  const [g, setG] = useState<Gameya | null>(() => peekGameya(id));
  const [shareText, setShareText] = useState("");
  const [failed, setFailed] = useState(false);
  const [reminding, setReminding] = useState(false);
  const load = useCallback(() => {
    getGameya(id)
      .then((r) => {
        setG(r.gameya);
        setShareText(r.share_text);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [id]);
  useLive(load);

  if (!g)
    return failed ? (
      <View style={styles.center}>
        <EmptyState title={w.offline} />
        <Button label={t.book.retry} kind="tonal" onPress={load} />
      </View>
    ) : (
      <Screen>
        <LoadingCards tile={false} />
      </Screen>
    );

  const phase = phaseOf(g);
  const round = shownRound(g);
  const s = roundState(g, round);
  const me = myMember(g);
  const month = monthLabel(monthOfRound(g.start_month, round), dateLocale);
  const iOwe = Boolean(me && phase === "running" && !isPaid(g, me.id, round));
  const receiverIsMe = Boolean(s.receiver?.is_me);
  const send = (text: string) => void Linking.openURL(whatsappShareUrl(text)).catch(() => Share.share({ message: text }));

  // Shows at once; put back if the server says no.
  const togglePaid = (memberId: string, paid: boolean) => {
    const before = g;
    setG({ ...g, payments: paid ? [...g.payments, { member_id: memberId, round }] : g.payments.filter((p) => !(p.member_id === memberId && p.round === round)) });
    void markGameyaPaid(g.id, memberId, round, paid)
      .then((r) => setG(r.gameya))
      .catch(() => {
        setG(before);
        notify(w.offline, "error");
      });
    if (paid) track("gameya_paid", { by: g.mine ? "owner" : "member" });
  };
  const handOver = () => {
    const before = g;
    setG({ ...g, members: g.members.map((m) => (m.turn === round ? { ...m, received: true } : m)) });
    void markGameyaReceived(g.id, round, true)
      .then((r) => setG(r.gameya))
      .catch(() => {
        setG(before);
        notify(w.offline, "error");
      });
  };
  // Zaki members hear it in their chat; the WhatsApp text is for everyone else.
  const remind = async () => {
    setReminding(true);
    try {
      const r = await remindGameya(g.id);
      if (r.reminded) notify(fill(w.reminded, { n: r.reminded }));
      send(r.share_text);
    } catch {
      notify(w.offline, "error");
    } finally {
      setReminding(false);
    }
  };
  const canTick = (memberIsMe: boolean) => phase === "running" && (g.mine || memberIsMe);

  return (
    <Screen onRefresh={load} contentStyle={styles.content}>
      <Stack.Screen options={{ title: g.name }} />
      <Card style={styles.top}>
        {phase === "running" ? (
          <>
            <Text variant="small" color={palette.inkSoft}>
              {month} · {fill(w.turnOf, { r: round, n: g.months })}
            </Text>
            <Text variant="number">{fill(t.ui.pounds, { n: formatMoney(g.pot) })}</Text>
            <Text variant="bodyStrong">{fill(w.potTo, { name: s.receiver?.name ?? "—" })}</Text>
            <Badge label={fill(w.paidCount, { a: s.paid.length, b: g.members.length })} tone={s.allPaid ? "ok" : "primary"} />
          </>
        ) : (
          <Text variant="headline">{phase === "before" ? fill(w.startsIn, { month: monthLabel(g.start_month, dateLocale) }) : w.over}</Text>
        )}
        {me ? (
          <Text variant="small" color={palette.inkSoft}>
            {fill(w.yourTurn, { month: monthLabel(me.month, dateLocale) })}
          </Text>
        ) : null}
        {!g.mine && g.owner_name ? (
          <Text variant="caption" color={palette.inkSoft}>
            {fill(w.kept, { name: g.owner_name })}
          </Text>
        ) : null}
      </Card>

      {iOwe && me ? <Button label={w.iPaid} icon="checkmark-circle-outline" block onPress={() => togglePaid(me.id, true)} /> : null}
      {iOwe && !g.mine && g.instapay ? <Button label={w.payInstapay} icon="card-outline" kind="tonal" block onPress={() => void Linking.openURL(g.instapay!)} /> : null}
      {phase === "running" && s.receiver && !s.receiver.received && (g.mine || receiverIsMe) ? (
        <Button label={receiverIsMe ? w.gotIt : w.handOver} icon="gift-outline" kind="tonal" block onPress={handOver} />
      ) : null}

      <Text variant="headline">{w.turns}</Text>
      <Card style={styles.list}>
        {g.members.map((m, i) => {
          const paid = isPaid(g, m.id, round);
          const tick = canTick(m.is_me);
          const row = (
            <View style={[styles.row, i > 0 && styles.line]}>
              <Text variant="bodyStrong" color={m.turn === round && phase === "running" ? palette.primaryInk : palette.inkSoft} style={styles.turn}>
                {m.turn}
              </Text>
              <View style={styles.flex}>
                <Text variant="body" numberOfLines={1}>
                  {m.is_me ? `${m.name} (${w.me})` : m.name}
                </Text>
                <Text variant="caption" color={palette.inkSoft}>
                  {monthLabel(m.month, dateLocale)}
                  {m.received ? ` · ${w.received} ✓` : ""}
                </Text>
              </View>
              {phase === "running" ? <Icon name={paid ? "checkmark-circle" : "ellipse-outline"} size={22} color={paid ? palette.ok : tick ? palette.primaryInk : palette.inkFaint} /> : null}
            </View>
          );
          return tick ? (
            <Pressable key={m.id} onPress={() => togglePaid(m.id, !paid)} accessibilityRole="checkbox" accessibilityState={{ checked: paid }} accessibilityLabel={`${m.name} · ${w.markPaid}`}>
              {row}
            </Pressable>
          ) : (
            <View key={m.id}>{row}</View>
          );
        })}
      </Card>

      {g.mine ? (
        <>
          {phase === "running" && !s.allPaid ? <Button label={w.remind} kind="whatsapp" icon="logo-whatsapp" block busy={reminding} onPress={() => void remind()} /> : null}
          {shareText ? <Button label={w.share} kind="outline" icon="share-social-outline" block onPress={() => send(shareText)} /> : null}
        </>
      ) : null}
      <Button label={w.page} kind="outline" icon="open-outline" block onPress={() => void Linking.openURL(g.url)} />
      <Text variant="caption" color={palette.inkSoft} align="center">
        {w.recordOnly}
      </Text>
      {g.mine ? (
        <Button
          label={w.delete}
          kind="danger"
          onPress={() =>
            confirm(w.deleteConfirm, w.delete, () =>
              void deleteGameya(g.id)
                .then(() => router.back())
                .catch(() => notify(w.offline, "error")),
            )
          }
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: palette.bg, padding: space.xl },
  content: { padding: space.xl, gap: space.md },
  flex: { flex: 1, minWidth: 0 },
  top: { alignItems: "center", gap: space.xs },
  list: { paddingVertical: space.xs },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.lineStrong },
  turn: { width: 24, textAlign: "center" },
});
