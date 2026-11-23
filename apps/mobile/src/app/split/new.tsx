import { useState } from "react";
import { Linking, Pressable, Share, StyleSheet, Switch, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { DEFAULT_SERVICE_PCT, DEFAULT_VAT_PCT } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { createSplit } from "@/lib/api";
import { contactsAvailable, pickContactName } from "@/lib/contacts";
import { previewSplit, removePerson, startPeople, type Draft } from "@/split/logic";
import { Button, Card, Chip, Icon, IconButton, notify, palette, radius, Screen, space, Text, TextField } from "@/ui";

/**
 * Split the check: everyone pays for what they ordered, shared plates are split among who had
 * them, and service and VAT follow each person's part. The quick way: type the bill and the
 * names, send it; friends open the link and add what they ordered (no install). Opened from the
 * Daftar or the chat ("احسبلي 1850 على 5" fills the bill and the number of people).
 */
export default function NewSplitScreen() {
  const params = useLocalSearchParams<{ subtotal?: string; people?: string }>();
  const [d, setD] = useState<Draft>({
    title: "",
    subtotal: params.subtotal ?? "",
    people: startPeople(t.split.me, params.people ? Number(params.people) : null),
    items: [],
    service: true,
    vat: true,
    tip: "",
    paidBy: 0,
  });
  const [busy, setBusy] = useState(false);
  const preview = previewSplit(d);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setItem = (i: number, patch: Partial<Draft["items"][number]>) => set({ items: d.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });

  const addPerson = async (fromContacts: boolean) => {
    if (d.people.length >= 30) return;
    let name = "";
    if (fromContacts) {
      try {
        const picked = await pickContactName();
        if (picked && "denied" in picked) return notify(t.ui.contactsDenied);
        if (!picked) return;
        name = picked.name.slice(0, 40);
      } catch {
        return;
      }
    }
    set({ people: [...d.people, name] });
  };

  const toggleEater = (item: number, person: number) => {
    const eaters = d.items[item]!.eaters;
    setItem(item, { eaters: eaters.includes(person) ? eaters.filter((e) => e !== person) : [...eaters, person] });
  };

  const send = async () => {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const { split, share_text } = await createSplit(preview.input);
      track("split_created", { people: d.people.length, items: preview.input.items.length, quick: preview.input.items.length === 0 });
      await Linking.openURL(whatsappShareUrl(share_text)).catch(() => Share.share({ message: share_text }));
      router.replace({ pathname: "/split/[id]", params: { id: split.id } });
    } catch {
      notify(t.split.failed, "error");
      setBusy(false);
    }
  };

  const toggle = (label: string, value: boolean, onChange: (v: boolean) => void) => (
    <View style={styles.toggle}>
      <Text variant="body" style={styles.flex}>
        {label}
      </Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: palette.primary, false: palette.lineStrong }} thumbColor={palette.surfaceSolid} />
    </View>
  );

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.split.title }} />
      <Text variant="small" color={palette.inkSoft}>
        {t.split.intro}
      </Text>
      <TextField label={t.split.subtotal} hint={t.split.subtotalHint} value={d.subtotal} onChangeText={(v) => set({ subtotal: v })} keyboardType="decimal-pad" maxLength={12} big placeholder="0" />
      <TextField label={t.split.what} value={d.title} onChangeText={(v) => set({ title: v })} maxLength={60} placeholder={t.split.whatHint} />

      <Text variant="headline">{t.split.who}</Text>
      <Text variant="small" color={palette.inkSoft}>
        {t.split.paidHint}
      </Text>
      {d.people.map((name, i) => {
        const payer = d.paidBy === i;
        return (
          <View key={i} style={styles.row}>
            <Pressable
              onPress={() => set({ paidBy: payer ? null : i })}
              accessibilityRole="radio"
              accessibilityState={{ selected: payer }}
              accessibilityLabel={t.split.paidBy}
              style={[styles.payer, payer && { backgroundColor: palette.okSoft, borderColor: palette.ok }]}
            >
              <Icon name={payer ? "wallet" : "wallet-outline"} size={18} color={payer ? palette.ok : palette.inkFaint} />
            </Pressable>
            <View style={styles.flex}>
              <TextField value={name} onChangeText={(v) => set({ people: d.people.map((p, k) => (k === i ? v : p)) })} maxLength={40} placeholder={fill(t.split.personN, { n: i + 1 })} />
            </View>
            {preview ? (
              <Text variant="bodyStrong" color={payer ? palette.ok : palette.ink} style={styles.share}>
                {formatMoney(preview.shares[i] ?? 0)}
              </Text>
            ) : null}
            {d.people.length > 2 ? <IconButton name="close" label={t.ui.cancel} size={32} onPress={() => setD(removePerson(d, i))} /> : null}
          </View>
        );
      })}
      <View style={styles.wrap}>
        <Button label={t.split.addPerson} icon="person-add-outline" kind="tonal" size="sm" onPress={() => void addPerson(false)} />
        {contactsAvailable ? <Button label={t.ui.pickContact} icon="people-outline" kind="text" size="sm" onPress={() => void addPerson(true)} /> : null}
      </View>

      <Text variant="headline">{t.split.items}</Text>
      <Text variant="small" color={palette.inkSoft}>
        {t.split.itemsHint}
      </Text>
      {d.items.map((it, i) => (
        <Card key={i} style={styles.item}>
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField value={it.name} onChangeText={(v) => setItem(i, { name: v })} maxLength={60} placeholder={t.split.itemName} />
            </View>
            <View style={styles.price}>
              <TextField value={it.price} onChangeText={(v) => setItem(i, { price: v })} keyboardType="decimal-pad" maxLength={10} placeholder={t.split.itemPrice} />
            </View>
            <IconButton name="close" label={t.ui.cancel} size={32} onPress={() => set({ items: d.items.filter((_, k) => k !== i) })} />
          </View>
          <View style={styles.wrap}>
            <Chip label={t.split.everyone} selected={it.eaters.length === 0} onPress={() => setItem(i, { eaters: [] })} />
            {d.people.map((p, k) => (p.trim() ? <Chip key={k} label={p.trim()} selected={it.eaters.includes(k)} onPress={() => toggleEater(i, k)} /> : null))}
          </View>
        </Card>
      ))}
      <Button label={t.split.addItem} icon="add" kind="tonal" size="sm" onPress={() => set({ items: [...d.items, { name: "", price: "", eaters: [] }] })} />

      <Card style={styles.card}>
        {toggle(fill(t.split.service, { n: DEFAULT_SERVICE_PCT }), d.service, (v) => set({ service: v }))}
        {toggle(fill(t.split.vat, { n: DEFAULT_VAT_PCT }), d.vat, (v) => set({ vat: v }))}
        <TextField label={t.split.tip} value={d.tip} onChangeText={(v) => set({ tip: v })} keyboardType="decimal-pad" maxLength={8} placeholder="0" />
      </Card>

      {preview ? (
        <Card style={styles.total}>
          <Text variant="small" color={palette.inkSoft}>
            {t.split.total}
          </Text>
          <Text variant="number">{fill(t.ui.pounds, { n: formatMoney(preview.total) })}</Text>
        </Card>
      ) : null}
      <Button label={t.split.send} kind="whatsapp" icon="logo-whatsapp" size="lg" block busy={busy} disabled={!preview} onPress={() => void send()} />
      <Text variant="small" color={palette.inkSoft} align="center">
        {t.split.sendHint}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
  flex: { flex: 1 },
  card: { gap: space.sm },
  item: { gap: space.sm },
  toggle: { flexDirection: "row", alignItems: "center", gap: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  payer: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: palette.glassEdge, backgroundColor: palette.surface },
  share: { minWidth: 56, textAlign: "right" },
  price: { width: 96 },
  wrap: { flexDirection: "row", gap: space.xs, flexWrap: "wrap" },
  total: { alignItems: "center", gap: space.xs },
});
