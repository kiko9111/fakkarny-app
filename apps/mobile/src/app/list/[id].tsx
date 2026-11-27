import { useCallback, useMemo, useState } from "react";
import { randomUUID } from "expo-crypto";
import { Pressable, StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { HouseList } from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { t } from "@/i18n";
import { track } from "@/lib/analytics";
import { useLive } from "@/lib/live";
import { useGuess } from "@/lib/optimistic";
import {
  addListItems,
  clearListDone,
  deleteList,
  listLists,
  peekLists,
  peekMe,
  removeListItem,
  savedList,
  setListItemDone,
  setListTrip,
  shareListLink,
  stopListLink,
} from "@/lib/api";
import { sendOnWhatsApp } from "@/tasks/LinkTaskCard";
import { QueuedOffline } from "@/sync/writes";
import {
  alreadyOn,
  guessAdd,
  guessClear,
  guessDone,
  guessRemove,
  quickPicks,
  sortListItems,
  splitThings,
} from "@/lists/logic";
import {
  Button,
  Card,
  Chip,
  confirm,
  EmptyState,
  Icon,
  IconButton,
  LoadingCards,
  Note,
  notify,
  palette,
  plain,
  Screen,
  SectionHeader,
  space,
  Text,
  TextField,
} from "@/ui";

const find = (id: string) => peekLists()?.find((l) => l.id === id) ?? null;
const offline = (err: unknown) => err instanceof QueuedOffline;

/**
 * One household list. Adding, ticking off, removing and clearing show at once (the screen's own
 * guess) and go out in tap order; offline they wait on the phone and stay drawn. "I'm going
 * shopping" tells the circle, so it shows only once the server has done it. Refreshes every 30 s
 * while open, so what the others add or tick shows up (useLive).
 */
export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [fromServer, setFromServer] = useState<HouseList | null>(() =>
    find(id),
  );
  const [loaded, setLoaded] = useState(() => find(id) !== null);
  const [missing, setMissing] = useState(false);
  const [text, setText] = useState("");
  const [tripBusy, setTripBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const me = peekMe()?.name ?? null;

  const load = useCallback(async () => {
    try {
      const all = await listLists();
      const l = all.find((x) => x.id === id) ?? null;
      setFromServer(l);
      setMissing(!l);
    } catch {
      if (!find(id)) notify(t.saved.offline, "error");
    } finally {
      setLoaded(true);
    }
  }, [id]);
  useLive(load);

  // An empty stand-in keeps the hooks in order before the first answer.
  const blank = useMemo<HouseList>(
    () => ({
      id,
      name: "",
      place: "other",
      circle_id: null,
      circle_name: null,
      is_owner: false,
      open_count: 0,
      trip: null,
      items: [],
      has_link: false,
      updated_at: new Date(0).toISOString(),
    }),
    [id],
  );
  const { shown, run } = useGuess<HouseList>(fromServer ?? blank);
  const list = shown;

  const send = (
    next: (l: HouseList) => HouseList,
    work: () => Promise<HouseList>,
  ) =>
    run(work, { next, adopt: (answer) => answer, keep: offline })
      .then((answer) => setFromServer(answer))
      .catch((err) => {
        if (offline(err)) {
          // Kept on the phone: the saved copy shows it too until it goes out.
          savedList(next(list));
          return;
        }
        notify(t.tasks.failed, "error");
      });

  const add = (raw: string) => {
    const things = splitThings(raw);
    if (!things.length) return;
    const already = alreadyOn(list, things);
    const fresh = things
      .filter((x) => !already.includes(x.title))
      .map((x) => ({ ...x, id: randomUUID() }));
    setText("");
    if (!fresh.length) return notify(t.lists.already, "info");
    track("list_item_added", {});
    void send(
      (l) => guessAdd(l, fresh, me, new Date()),
      () =>
        addListItems(id, {
          items: fresh.map((f) => ({ id: f.id, title: f.title, qty: f.qty })),
        }),
    );
  };

  const toggle = (itemId: string, done: boolean) => {
    if (done) track("list_item_done", {});
    void send(
      (l) => guessDone(l, itemId, done, me, new Date()),
      () => setListItemDone(id, itemId, done),
    );
  };

  const trip = async (going: boolean) => {
    if (tripBusy) return;
    setTripBusy(true);
    try {
      setFromServer(await setListTrip(id, going));
      if (going) {
        track("list_trip", {});
        if (list.circle_id) notify(t.lists.tripSent);
      }
    } catch {
      notify(t.tasks.failed, "error");
    } finally {
      setTripBusy(false);
    }
  };

  const shareLink = async () => {
    if (linkBusy) return;
    setLinkBusy(true);
    try {
      const { share_text } = await shareListLink(id);
      setFromServer((l) => (l ? { ...l, has_link: true } : l));
      track("list_link_sent");
      await sendOnWhatsApp(share_text);
    } catch {
      notify(t.tasks.failed, "error");
    } finally {
      setLinkBusy(false);
    }
  };

  const stopLink = () =>
    confirm(t.lists.stopLinkAsk, t.lists.stopLink, () => {
      void stopListLink(id)
        .then((l) => {
          setFromServer(l);
          notify(t.lists.linkStopped);
        })
        .catch(() => notify(t.tasks.failed, "error"));
    });

  const remove = () =>
    confirm(
      fill(t.lists.deleteAsk, { name: list.name }),
      t.lists.delete,
      () => {
        void deleteList(id)
          .then(() => {
            notify(t.lists.deleted);
            router.back();
          })
          .catch(() => notify(t.tasks.failed, "error"));
      },
    );

  if (!loaded)
    return (
      <Screen contentStyle={styles.content}>
        <LoadingCards />
      </Screen>
    );
  if (missing || !fromServer) {
    return (
      <Screen onRefresh={load} contentStyle={styles.content}>
        <Stack.Screen options={{ title: t.lists.title }} />
        <EmptyState
          title={plain(t.lists.emptyAll)}
          action={
            <Button
              label={plain(t.lists.title)}
              onPress={() => router.replace("/list")}
            />
          }
        />
      </Screen>
    );
  }

  const items = sortListItems(list.items);
  const open = items.filter((i) => !i.done);
  const got = items.filter((i) => i.done);
  const picks = quickPicks(list, t.lists.quick).slice(0, 6);

  return (
    <Screen onRefresh={load} keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: list.name }} />
      <Text variant="small" color={palette.inkSoft}>
        {list.circle_name ?? t.lists.private}
      </Text>

      {list.trip ? (
        <Card tone={palette.familySoft}>
          <Text variant="bodyStrong" color={palette.family}>
            {list.trip.is_me
              ? t.lists.tripMine
              : fill(t.lists.tripOther, {
                  name: list.trip.name ?? t.circles.noName,
                })}
          </Text>
          {list.trip.is_me ? (
            <Button
              label={t.lists.tripEnd}
              kind="outline"
              size="sm"
              icon="home-outline"
              busy={tripBusy}
              onPress={() => void trip(false)}
            />
          ) : null}
        </Card>
      ) : null}

      <View style={styles.addRow}>
        <View style={styles.flex}>
          <TextField
            value={text}
            onChangeText={setText}
            placeholder={t.lists.addPlaceholder}
            maxLength={300}
            returnKeyType="done"
            onSubmitEditing={() => add(text)}
            blurOnSubmit={false}
          />
        </View>
        <Button
          label={t.lists.add}
          icon="add"
          disabled={!text.trim()}
          onPress={() => add(text)}
        />
      </View>
      {picks.length ? (
        <View style={styles.chips}>
          {picks.map((p) => (
            <Chip key={p} label={p} icon="add" onPress={() => add(p)} />
          ))}
        </View>
      ) : null}

      {open.length === 0 && got.length === 0 ? (
        <Card>
          <Text variant="small" color={palette.inkSoft} align="center">
            {t.lists.empty}
          </Text>
        </Card>
      ) : null}
      {open.length === 0 && got.length > 0 ? (
        <Note icon="thumbs-up-outline">{t.lists.allDone}</Note>
      ) : null}
      {open.length ? (
        <Card style={styles.items}>
          {open.map((i, n) => (
            <View key={i.id} style={[styles.item, n > 0 && styles.line]}>
              <Pressable
                onPress={() => toggle(i.id, true)}
                style={styles.tick}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: false }}
                accessibilityLabel={i.title}
                hitSlop={8}
              >
                <Icon
                  name="ellipse-outline"
                  size={26}
                  color={palette.primaryInk}
                />
                <View style={styles.flex}>
                  <Text variant="body">
                    {i.qty ? `${i.title} × ${i.qty}` : i.title}
                  </Text>
                  {i.added_by_name && !i.is_mine ? (
                    <Text variant="caption" color={palette.inkSoft}>
                      {i.added_by_name}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              <IconButton
                name="close"
                label={t.lists.remove}
                onPress={() =>
                  void send(
                    (l) => guessRemove(l, i.id, new Date()),
                    () => removeListItem(id, i.id),
                  )
                }
              />
            </View>
          ))}
        </Card>
      ) : null}

      {got.length ? (
        <>
          <SectionHeader
            title={t.lists.gotTitle}
            action={t.lists.clearDone}
            onAction={() =>
              void send(
                (l) => guessClear(l, new Date()),
                () => clearListDone(id),
              )
            }
          />
          <Card style={styles.items}>
            {got.map((i, n) => (
              <Pressable
                key={i.id}
                onPress={() => toggle(i.id, false)}
                style={[styles.item, styles.tick, n > 0 && styles.line]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: true }}
                accessibilityLabel={i.title}
              >
                <Icon name="checkmark-circle" size={26} color={palette.ok} />
                <View style={styles.flex}>
                  <Text
                    variant="body"
                    color={palette.inkSoft}
                    style={styles.struck}
                  >
                    {i.title}
                  </Text>
                  {i.done_by_name ? (
                    <Text variant="caption" color={palette.inkSoft}>
                      {fill(t.lists.doneBy, { name: i.done_by_name })}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </Card>
        </>
      ) : null}

      <Card>
        {!list.trip ? (
          <Button
            label={t.lists.tripStart}
            kind="tonal"
            icon="cart-outline"
            busy={tripBusy}
            onPress={() => void trip(true)}
          />
        ) : null}
        {/* Someone not on Zaki opens it in a browser, ticks and adds. */}
        <Button
          label={t.lists.shareLink}
          kind="tonal"
          icon="logo-whatsapp"
          busy={linkBusy}
          onPress={() => void shareLink()}
        />
      </Card>

      {list.has_link ? (
        <Button
          label={t.lists.stopLink}
          kind="text"
          size="sm"
          icon="link-outline"
          onPress={stopLink}
        />
      ) : null}

      {list.is_owner ? (
        <Button
          label={t.lists.delete}
          kind="text"
          size="sm"
          icon="trash-outline"
          onPress={remove}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  flex: { flex: 1 },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  items: { paddingVertical: space.xs },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: space.sm,
  },
  tick: { flexDirection: "row", alignItems: "center", gap: space.sm, flex: 1 },
  line: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.glassEdge,
  },
  struck: { textDecorationLine: "line-through" },
});
