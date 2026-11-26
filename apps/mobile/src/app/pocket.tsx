import { useCallback, useState } from "react";
import { randomUUID } from "expo-crypto";
import { StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import type { PocketAccount } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { useLive } from "@/lib/live";
import { getPocketMoney, markPocketPaid, peekPocketMoney } from "@/lib/api";
import { HttpError } from "@/sync/queue";
import { sortAccounts } from "@/homework/logic";
import { parseAmount } from "@/daftar/logic";
import { Button, Card, Chip, EmptyState, IconTile, LoadingCards, Note, notify, palette, plain, Screen, space, Text, TextField } from "@/ui";

const keyOf = (a: PocketAccount) => `${a.circle_id}|${a.child_id}|${a.parent_id}`;

/**
 * Pocket money from homework (2026-11-26). A child sees what they earned with each parent; a
 * parent sees what each child earned and marks what they handed over. Records only: Zaki never
 * holds or moves money.
 */
export default function PocketMoneyScreen() {
  const [accounts, setAccounts] = useState<PocketAccount[]>(() => peekPocketMoney() ?? []);
  const [loaded, setLoaded] = useState(() => peekPocketMoney() !== null);
  const [paying, setPaying] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const cached = peekPocketMoney() !== null;
    try {
      setAccounts(await getPocketMoney());
    } catch {
      if (!cached) notify(t.saved.offline, "error");
    } finally {
      setLoaded(true);
    }
  }, []);
  useLive(load);

  const pay = async (a: PocketAccount, value: number) => {
    if (busy) return;
    if (value > a.balance) return notify(t.homework.tooMuch, "error");
    setBusy(true);
    try {
      // The id is made here, so a resend after a lost answer is not recorded twice.
      setAccounts(await markPocketPaid({ id: randomUUID(), circle_id: a.circle_id, child_id: a.child_id, amount: value }));
      track("pocket_paid", {});
      notify(fill(t.homework.paidSaved, { name: a.child_name ?? t.circles.noName }));
      setPaying(null);
      setAmount("");
    } catch (err) {
      notify(err instanceof HttpError && err.status === 422 ? t.homework.tooMuch : t.tasks.failed, "error");
    } finally {
      setBusy(false);
    }
  };

  const children = accounts.filter((a) => a.role === "parent");
  const mine = accounts.filter((a) => a.role === "child");
  const card = (a: PocketAccount) => {
    const asChild = a.role === "child";
    const typed = parseAmount(amount);
    return (
      <Card key={keyOf(a)}>
        <View style={styles.head}>
          <IconTile name="wallet-outline" size={40} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{fill(asChild ? t.homework.fromLine : t.homework.forLine, { name: (asChild ? a.parent_name : a.child_name) ?? t.circles.noName, circle: a.circle_name })}</Text>
            <Text variant="small" color={palette.inkSoft}>
              {fill(t.homework.week, { n: a.week_earned })}
            </Text>
          </View>
          <View style={styles.total}>
            <Text variant="number" color={a.balance > 0 ? palette.ok : palette.inkSoft}>
              {a.balance}
            </Text>
            <Text variant="caption" color={palette.inkSoft}>
              {asChild ? t.homework.balanceChild : t.homework.balanceParent}
            </Text>
          </View>
        </View>
        <Text variant="small" color={palette.inkSoft}>
          {`${t.homework.earned}: ${a.earned} · ${t.homework.paid}: ${a.paid}`}
        </Text>
        {a.entries.slice(0, 6).map((e) => (
          <Text key={e.id} variant="small" color={e.kind === "earned" ? palette.ink : palette.inkSoft}>
            {e.kind === "earned" ? fill(t.homework.entryEarned, { n: e.amount, title: e.title ?? t.tasks.homework }) : fill(t.homework.entryPaid, { n: e.amount })}
          </Text>
        ))}
        {!asChild && a.balance > 0 ? (
          paying === keyOf(a) ? (
            <View style={styles.pay}>
              <Text variant="smallStrong" color={palette.inkSoft}>
                {t.homework.paidAmount}
              </Text>
              <View style={styles.row}>
                <Chip label={fill(t.homework.paidAll, { n: a.balance })} onPress={() => void pay(a, a.balance)} />
              </View>
              <TextField value={amount} onChangeText={setAmount} keyboardType="number-pad" placeholder={String(Math.min(a.balance, 20))} maxLength={6} />
              <View style={styles.row}>
                <Button label={t.homework.markPaid} size="sm" icon="checkmark" busy={busy} disabled={!typed || !Number.isInteger(typed)} onPress={() => typed && void pay(a, typed)} />
                <Button label={t.ui.cancel} size="sm" kind="text" onPress={() => (setPaying(null), setAmount(""))} />
              </View>
            </View>
          ) : (
            <Button label={t.homework.markPaid} size="sm" kind="outline" icon="cash-outline" onPress={() => (setPaying(keyOf(a)), setAmount(""))} />
          )
        ) : null}
      </Card>
    );
  };

  return (
    <Screen onRefresh={load} contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.homework.pocketTitle }} />
      {!loaded ? <LoadingCards /> : null}
      {loaded && accounts.length === 0 ? <EmptyState title={plain(t.homework.pocketEmpty)} /> : null}
      {mine.length ? sortAccounts(mine).map(card) : null}
      {children.length ? sortAccounts(children).map(card) : null}
      {accounts.length ? <Note icon="shield-checkmark-outline">{t.homework.recordsOnly}</Note> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  total: { alignItems: "center" },
  pay: { gap: space.xs, marginTop: space.xs },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
