import { useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import type { DaftarEntry, DaftarStatus } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { t } from "@/i18n";
import { cancelDaftar, daftarShareText, respondDaftar, settleDaftar } from "@/lib/api";
import { ask, Badge, Button, Card, confirm, Icon, notify, palette, PersonAvatar, plain, space, Text, type IconName } from "@/ui";
import { entryActions, formatMoney, guessEntry, type DaftarAction } from "./logic";
import { useGuess } from "@/lib/optimistic";

const openWhatsApp = (text: string) => Linking.openURL(whatsappShareUrl(text)).catch(() => Share.share({ message: text }));
const STATUS_INK: Record<DaftarStatus, string> = { pending: palette.warn, confirmed: palette.inkSoft, disputed: palette.danger, settled: palette.inkFaint, cancelled: palette.inkFaint };
const TONE: Record<DaftarStatus, "neutral" | "ok" | "warn" | "danger"> = { pending: "warn", confirmed: "ok", disputed: "danger", settled: "neutral", cancelled: "neutral" };
const ICON: Partial<Record<DaftarAction, IconName>> = { confirm: "checkmark", resend: "logo-whatsapp", nudge: "logo-whatsapp", pay: "card-outline", settle: "checkmark-done" };

/**
 * One shared entry with the actions this person can take. `onChanged` reloads the list.
 * Right, Not right, Settled and Cancel show at once (the card's own guess, lib/optimistic.ts)
 * while the server confirms; the WhatsApp text has to come from the server first.
 * `flat`: a row inside a `Rows` card: one line of who, what and how much; its actions fold under
 * it and start open only when the entry waits for this person's answer.
 */
export function DaftarCard({ entry: fromList, onChanged, flat }: { entry: DaftarEntry; onChanged: () => void; flat?: boolean }) {
  const [open, setOpen] = useState(() => fromList.status === "pending" && !fromList.mine);
  const { shown: entry, busy, waiting, run: send } = useGuess(fromList);
  const amount = formatMoney(entry.amount);
  const owedToMe = entry.direction === "owed_to_me";

  const work = async (fn: () => Promise<DaftarEntry | void>, guess?: DaftarEntry | null) => {
    try {
      await send(fn, { guess, adopt: (answer) => answer ?? null });
      onChanged();
    } catch {
      notify(t.daftar.failed, "error");
    }
  };

  const run = async (action: DaftarAction) => {
    if (busy) return;
    if (action === "pay") {
      ask(fill(t.daftar.payHint, { amount }), undefined, [
        { label: t.daftar.no, style: "cancel" },
        { label: t.daftar.actions.pay, onPress: () => entry.pay_link && void Linking.openURL(entry.pay_link).catch(() => notify(t.daftar.failed, "error")) },
      ]);
      return;
    }
    const guess = guessEntry(entry, action);
    if (action === "cancel") return confirm(t.daftar.cancelConfirm, t.daftar.yes, () => void work(() => cancelDaftar(entry.id), guess), t.daftar.no);
    if (action === "resend" || action === "nudge") {
      return work(async () => {
        const text = await daftarShareText(entry.id);
        if (text) await openWhatsApp(text);
      });
    }
    if (action === "settle") return work(() => settleDaftar(entry.id), guess);
    return work(() => respondDaftar(entry.id, action), guess);
  };

  const actions = entryActions(entry);
  const settled = entry.status === "settled";
  const buttons = actions.length ? (
    <View style={styles.actions}>
      {actions.map((a, n) => (
        <Button
          key={a}
          label={t.daftar.actions[a]}
          icon={ICON[a]}
          size="sm"
          // A list of cards: no card's button is the screen's one filled button (the "+" sheet makes things).
          kind={a === "cancel" || a === "dispute" ? "danger" : n === 0 ? "tonal" : "outline"}
          disabled={busy}
          onPress={() => void run(a)}
        />
      ))}
    </View>
  ) : null;
  const money = (
    <Text variant={flat ? "bodyStrong" : "headline"} color={settled ? palette.inkFaint : owedToMe ? palette.ok : palette.primaryInk} style={settled ? styles.struck : undefined}>
      {owedToMe ? "+" : "−"}
      {fill(t.ui.pounds, { n: amount })}
    </Text>
  );
  if (flat) {
    const status = plain(t.daftar.status[entry.status]);
    return (
      <View style={[styles.flat, waiting && styles.dim]}>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          disabled={!actions.length}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${entry.other_name}, ${owedToMe ? t.ui.owedToYou : t.ui.youOwe} ${fill(t.ui.pounds, { n: amount })}, ${status}`}
          style={styles.flatHead}
        >
          <PersonAvatar name={entry.other_name} size={36} color={owedToMe ? palette.ok : palette.primaryInk} bg={owedToMe ? palette.okSoft : palette.primarySoft} />
          <View style={styles.flex}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {entry.other_name}
            </Text>
            <Text variant="small" color={STATUS_INK[entry.status]} numberOfLines={1}>
              {entry.note ? `${status} · ${entry.note}` : status}
            </Text>
          </View>
          {money}
          {actions.length ? <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={palette.inkFaint} /> : null}
        </Pressable>
        {open ? buttons : null}
      </View>
    );
  }
  return (
    <Card style={waiting ? styles.dim : undefined}>
      <View style={styles.head}>
        <PersonAvatar name={entry.other_name} color={owedToMe ? palette.ok : palette.primaryInk} bg={owedToMe ? palette.okSoft : palette.primarySoft} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">{entry.other_name}</Text>
          <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
            {entry.note ?? (owedToMe ? t.ui.owedToYou : t.ui.youOwe)}
          </Text>
        </View>
        <View style={styles.amount}>
          {money}
          <Badge label={t.daftar.status[entry.status]} tone={TONE[entry.status]} />
        </View>
      </View>
      {buttons}
    </Card>
  );
}

const styles = StyleSheet.create({
  dim: { opacity: 0.6 },
  flex: { flex: 1, minWidth: 0 },
  flat: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.xs },
  flatHead: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 48 },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  amount: { alignItems: "flex-end", gap: 4 },
  struck: { textDecorationLine: "line-through" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xs },
});
