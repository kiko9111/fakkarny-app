import { useState } from "react";
import { Linking, Pressable, Share, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { whatsappShareUrl } from "@/circles/logic";
import { parseAmount } from "@/daftar/logic";
import { upsertItem } from "@/db/messages";
import { t } from "@/i18n";
import { createDaftar, patchItem } from "@/lib/api";
import { contactsAvailable, pickContactName } from "@/lib/contacts";
import { Button, Icon, notify, palette, radius, Screen, space, Text, TextField } from "@/ui";

/**
 * New shared entry: who, how much, which way. Saving opens WhatsApp with the confirm link,
 * sent from the user's own number. Can start from a private Money note (`itemId`), which
 * is then closed so the amount isn't counted twice.
 */
export default function NewDaftarScreen() {
  const params = useLocalSearchParams<{ name?: string; amount?: string; direction?: string; itemId?: string }>();
  const [name, setName] = useState(params.name ?? "");
  const [amountText, setAmountText] = useState(params.amount ?? "");
  const [direction, setDirection] = useState<"owed_to_me" | "i_owe">(params.direction === "i_owe" ? "i_owe" : "owed_to_me");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = parseAmount(amountText);
  const ready = name.trim().length > 0 && amount !== null;

  const submit = async () => {
    if (!ready || busy || amount === null) return;
    setBusy(true);
    try {
      const { share_text } = await createDaftar({ other_name: name.trim(), direction, amount, ...(note.trim() ? { note: note.trim() } : {}) });
      if (params.itemId) await patchItem(params.itemId, { status: "done" }).then(upsertItem).catch(() => {});
      if (share_text) await Linking.openURL(whatsappShareUrl(share_text)).catch(() => Share.share({ message: share_text }));
      router.back();
    } catch {
      notify(t.daftar.failed, "error");
      setBusy(false);
    }
  };

  const pickContact = async () => {
    try {
      const picked = await pickContactName();
      if (picked && "denied" in picked) notify(t.ui.contactsDenied);
      else if (picked) setName(picked.name.slice(0, 40));
    } catch {
      // The picker closed or failed: the field stays as it was.
    }
  };

  const choice = (value: "owed_to_me" | "i_owe", label: string) => {
    const on = direction === value;
    const color = value === "owed_to_me" ? palette.ok : palette.primaryInk;
    const soft = value === "owed_to_me" ? palette.okSoft : palette.primarySoft;
    return (
      <Pressable style={[styles.choice, on && { backgroundColor: soft, borderColor: color }]} onPress={() => setDirection(value)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
        <Icon name={value === "owed_to_me" ? "arrow-down-circle" : "arrow-up-circle"} size={22} color={on ? color : palette.inkFaint} />
        <Text variant="label" color={on ? color : palette.inkSoft} align="center">
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.daftar.newTitle }} />
      <View style={styles.row}>
        {choice("owed_to_me", t.daftar.theyOwe)}
        {choice("i_owe", t.daftar.iOwe)}
      </View>
      <TextField label={t.daftar.name} value={name} onChangeText={setName} maxLength={40} autoFocus={!params.name} />
      {contactsAvailable ? (
        <View style={styles.pick}>
          <Button kind="text" size="sm" icon="person-add-outline" label={t.ui.pickContact} onPress={() => void pickContact()} />
        </View>
      ) : null}
      <TextField label={t.daftar.amount} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" maxLength={12} big placeholder="0" />
      <TextField label={t.daftar.note} value={note} onChangeText={setNote} maxLength={120} />
      <Button label={t.daftar.send} kind="whatsapp" icon="logo-whatsapp" size="lg" block busy={busy} disabled={!ready} onPress={() => void submit()} />
      <Text variant="small" color={palette.inkSoft} align="center">
        {t.daftar.intro}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg },
  row: { flexDirection: "row", gap: space.md },
  pick: { alignItems: "flex-start", marginTop: -space.md },
  choice: { flex: 1, alignItems: "center", gap: space.xs, borderWidth: 2, borderColor: palette.line, backgroundColor: palette.surface, borderRadius: radius.lg, paddingVertical: space.md },
});
