import { useEffect, useRef, useState } from "react";
import { Linking, Share, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { randomUUID } from "expo-crypto";
import { MAX_GAMEYA_MEMBERS, MAX_PAY_DAY, shuffled, type Circle } from "@fakkarni/shared";
import { fill, whatsappShareUrl } from "@/circles/logic";
import { formatMoney } from "@/daftar/logic";
import { dateLocale, t } from "@/i18n";
import { track } from "@/lib/analytics";
import { createGameya, getCircle, listCircles, peekCircles, peekMe } from "@/lib/api";
import { contactsAvailable, pickContactName } from "@/lib/contacts";
import { draftRequest, localDay, monthLabel, moveTurn, newDraft, startChoices, wholePounds, withCircle, type GameyaDraft } from "@/gameya/logic";
import { Button, Card, Chip, IconButton, notify, palette, Screen, space, Text, TextField } from "@/ui";

const PAY_DAYS = [1, 5, 10, 15, 20, 25] as const;

/**
 * A new gam'eya: the name, the monthly amount, pay day, the month it starts and the turns. Picking
 * a circle brings its people in (each of them sees the book in their Zaki); anyone else is a name.
 * Made, it goes to the group's WhatsApp from the user's own number.
 */
export default function NewGameyaScreen() {
  const w = t.lay.gameya;
  const params = useLocalSearchParams<{ circle?: string }>();
  const today = localDay();
  const me = useRef({ name: peekMe()?.name?.trim() || w.me, userId: peekMe()?.id ?? null }).current;
  const [d, setD] = useState<GameyaDraft>(() => newDraft(today, me));
  const [busy, setBusy] = useState(false);
  const [circles, setCircles] = useState<Circle[]>(() => peekCircles() ?? []);
  const idRef = useRef(randomUUID());
  useEffect(() => {
    listCircles().then(setCircles).catch(() => undefined);
  }, []);
  const set = (patch: Partial<GameyaDraft>) => setD((x) => ({ ...x, ...patch }));
  const unnamed = (n: number) => fill(w.personN, { n });
  const pickCircle = async (id: string) => {
    if (d.circleId === id) return setD((x) => withCircle(x, null, me, unnamed));
    try {
      const circle = await getCircle(id);
      setD((x) => withCircle(x, circle, me, unnamed));
    } catch {
      notify(w.offline, "error");
    }
  };
  // Opened from a circle: its people are already in.
  const fromCircle = useRef(params.circle);
  useEffect(() => {
    const id = fromCircle.current;
    fromCircle.current = undefined;
    if (id) void pickCircle(id);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPerson = async (fromContacts: boolean) => {
    if (d.people.length >= MAX_GAMEYA_MEMBERS) return;
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
    set({ people: [...d.people, { name, userId: null }] });
  };

  const body = draftRequest(d, idRef.current);
  const amount = wholePounds(d.amount);
  const named = d.people.filter((p) => p.name.trim()).length;
  const make = async () => {
    if (!body || busy) return;
    setBusy(true);
    try {
      const { gameya, share_text } = await createGameya(body);
      track("gameya_created", { members: body.members.length, circle: Boolean(body.circle_id) });
      await Linking.openURL(whatsappShareUrl(share_text)).catch(() => Share.share({ message: share_text }));
      router.replace({ pathname: "/gameya/[id]", params: { id: gameya.id } });
    } catch {
      notify(w.failed, "error");
      setBusy(false);
    }
  };

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: w.newTitle }} />
      <TextField label={w.what} value={d.name} onChangeText={(v) => set({ name: v })} maxLength={60} placeholder={w.whatHint} />
      <TextField label={w.amount} value={d.amount} onChangeText={(v) => set({ amount: v })} keyboardType="number-pad" maxLength={9} big placeholder="0" />

      <Text variant="headline">{w.payDay}</Text>
      <View style={styles.wrap}>
        {PAY_DAYS.map((n) => (
          <Chip key={n} label={String(n)} selected={d.payDay === n} onPress={() => set({ payDay: n })} />
        ))}
        <View style={styles.day}>
          <TextField
            value={PAY_DAYS.includes(d.payDay as (typeof PAY_DAYS)[number]) ? "" : String(d.payDay)}
            onChangeText={(v) => {
              const n = Number(v);
              if (Number.isInteger(n) && n >= 1 && n <= MAX_PAY_DAY) set({ payDay: n });
            }}
            keyboardType="number-pad"
            maxLength={2}
            placeholder="…"
          />
        </View>
      </View>

      <Text variant="headline">{w.start}</Text>
      <View style={styles.wrap}>
        {startChoices(today).map((m) => (
          <Chip key={m} label={monthLabel(m, dateLocale)} selected={d.start === m} onPress={() => set({ start: m })} />
        ))}
      </View>

      {circles.length ? (
        <>
          <Text variant="headline">{w.withCircle}</Text>
          <View style={styles.wrap}>
            {circles.map((c) => (
              <Chip key={c.id} label={c.name} selected={d.circleId === c.id} onPress={() => void pickCircle(c.id)} />
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.row}>
        <Text variant="headline" style={styles.flex}>
          {w.people}
        </Text>
        {named >= 3 ? <Button label={w.draw} icon="shuffle-outline" kind="text" size="sm" onPress={() => set({ people: shuffled(d.people) })} /> : null}
      </View>
      {d.people.map((p, i) => (
        <View key={i} style={styles.row}>
          <Text variant="bodyStrong" color={palette.inkSoft} style={styles.turn}>
            {i + 1}
          </Text>
          <View style={styles.flex}>
            <TextField
              value={p.name}
              onChangeText={(v) => set({ people: d.people.map((x, k) => (k === i ? { ...x, name: v } : x)) })}
              maxLength={40}
              placeholder={fill(w.personN, { n: i + 1 })}
            />
          </View>
          <IconButton name="chevron-up" label={w.people} size={32} disabled={i === 0} onPress={() => set({ people: moveTurn(d.people, i, -1) })} />
          {d.people.length > 2 ? <IconButton name="close" label={t.ui.cancel} size={32} onPress={() => set({ people: d.people.filter((_, k) => k !== i) })} /> : null}
        </View>
      ))}
      <View style={styles.wrap}>
        <Button label={w.addPerson} icon="person-add-outline" kind="tonal" size="sm" onPress={() => void addPerson(false)} />
        {contactsAvailable ? <Button label={t.ui.pickContact} icon="people-outline" kind="text" size="sm" onPress={() => void addPerson(true)} /> : null}
      </View>

      {amount !== null && named >= 2 ? (
        <Card style={styles.total}>
          <Text variant="headline">{fill(w.potLine, { amount: formatMoney(amount * named), n: named })}</Text>
        </Card>
      ) : null}
      <Button label={w.make} kind="whatsapp" icon="logo-whatsapp" size="lg" block busy={busy} disabled={!body} onPress={() => void make()} />
      <Text variant="caption" color={palette.inkSoft} align="center">
        {w.recordOnly}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.md },
  flex: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  turn: { width: 22, textAlign: "center" },
  day: { width: 64 },
  wrap: { flexDirection: "row", gap: space.xs, flexWrap: "wrap", alignItems: "center" },
  total: { alignItems: "center", gap: space.xs },
});
