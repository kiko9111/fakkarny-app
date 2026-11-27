import { useCallback, useEffect, useState } from "react";
import { randomUUID } from "expo-crypto";
import { StyleSheet, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import {
  LIST_PLACES,
  type Circle,
  type HouseList,
  type ListPlace,
} from "@fakkarni/shared";
import { fill } from "@/circles/logic";
import { listComma, t } from "@/i18n";
import { useLive } from "@/lib/live";
import {
  createList,
  listCircles,
  listLists,
  peekCircles,
  peekLists,
} from "@/lib/api";
import { HttpError } from "@/sync/queue";
import { PLACE_ICON, preview, sortLists } from "@/lists/logic";
import {
  HeaderPlus,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  IconTile,
  LoadingCards,
  notify,
  palette,
  plain,
  Screen,
  SectionHeader,
  space,
  Text,
  TextField,
} from "@/ui";

/**
 * Every household list the user sees: their circles' and their own. A new list is made right
 * here from the header "+" (name, which shop, who with): the form opens above the lists, where
 * the "+" is, so it is never below the fold. `?circle=<id>` (from a circle's screen)
 * shows that circle's lists, and the form starts set to that circle.
 */
export default function ListsScreen() {
  const params = useLocalSearchParams<{ circle?: string; new?: string }>();
  const [lists, setLists] = useState<HouseList[]>(() => peekLists() ?? []);
  const [loaded, setLoaded] = useState(() => peekLists() !== null);
  const [circles, setCircles] = useState<Circle[]>(() => peekCircles() ?? []);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [place, setPlace] = useState<ListPlace>("grocery");
  const [circleId, setCircleId] = useState<string | null>(
    params.circle ?? null,
  );
  const [busy, setBusy] = useState(false);
  // "+ > A list" elsewhere arrives with ?new=1: the form is open on arrival, once.
  useEffect(() => {
    if (params.new !== "1") return;
    setMaking(true);
    router.setParams({ new: undefined });
  }, [params.new]);

  const load = useCallback(async () => {
    const cached = peekLists() !== null;
    void listCircles()
      .then((c) => {
        setCircles(c);
        // New users: the family circle is the natural home for a household list.
        setCircleId(
          (now) =>
            now ??
            params.circle ??
            c.find((x) => x.kind === "family")?.id ??
            null,
        );
      })
      .catch(() => {});
    try {
      setLists(await listLists());
    } catch {
      if (!cached) notify(t.saved.offline, "error");
    } finally {
      setLoaded(true);
    }
  }, [params.circle]);
  useLive(load);

  const make = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const list = await createList({
        id: randomUUID(),
        name: name.trim() || t.lists.places[place],
        place,
        circle_id: circleId,
      });
      setMaking(false);
      setName("");
      router.push({ pathname: "/list/[id]", params: { id: list.id } });
    } catch (err) {
      notify(
        err instanceof HttpError && err.status === 422
          ? t.lists.tooMany
          : t.tasks.failed,
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  const shown = sortLists(params.circle ? lists.filter((l) => l.circle_id === params.circle) : lists);
  return (
    <Screen onRefresh={load} keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.lists.title, headerRight: () => <HeaderPlus label={plain(t.lists.new)} onPress={() => setMaking(true)} /> }} />
      {!loaded ? <LoadingCards /> : null}
      {loaded && shown.length === 0 && !making ? (
        <EmptyState
          title={plain(t.lists.emptyAll)}
          action={
            <Button
              label={plain(t.lists.new)}
              icon="add"
              onPress={() => setMaking(true)}
            />
          }
        />
      ) : null}
      {making ? (
        <Card>
          <SectionHeader title={plain(t.lists.new)} />
          <TextField
            label={t.lists.nameLabel}
            value={name}
            onChangeText={setName}
            placeholder={t.lists.places[place]}
            maxLength={40}
            autoFocus
            returnKeyType="done"
          />
          <Text variant="smallStrong" color={palette.inkSoft}>
            {t.lists.placeLabel}
          </Text>
          <View style={styles.chips}>
            {LIST_PLACES.map((p) => (
              <Chip
                key={p}
                label={t.lists.places[p]}
                icon={PLACE_ICON[p]}
                selected={place === p}
                onPress={() => setPlace(p)}
              />
            ))}
          </View>
          <Text variant="smallStrong" color={palette.inkSoft}>
            {t.lists.shareLabel}
          </Text>
          <View style={styles.chips}>
            {circles.map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                tone="family"
                icon={c.kind === "family" ? "home-outline" : "people-outline"}
                selected={circleId === c.id}
                onPress={() => setCircleId(c.id)}
              />
            ))}
            <Chip
              label={t.lists.justMe}
              icon="person-outline"
              selected={circleId === null}
              onPress={() => setCircleId(null)}
            />
          </View>
          <View style={styles.chips}>
            <Button
              label={t.lists.create}
              icon="checkmark"
              busy={busy}
              onPress={() => void make()}
            />
            <Button
              label={t.ui.cancel}
              kind="text"
              onPress={() => setMaking(false)}
            />
          </View>
        </Card>
      ) : null}
      {shown.map((l) => (
        <Card
          key={l.id}
          onPress={() =>
            router.push({ pathname: "/list/[id]", params: { id: l.id } })
          }
          accessibilityLabel={l.name}
        >
          <View style={styles.row}>
            <IconTile
              name={PLACE_ICON[l.place]}
              color={l.circle_id ? palette.family : palette.primaryInk}
              bg={l.circle_id ? palette.familySoft : palette.primarySoft}
            />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{l.name}</Text>
              <Text variant="small" color={palette.inkSoft} numberOfLines={1}>
                {l.circle_name ?? t.lists.private}
                {l.open_count ? ` · ${preview(l, listComma)}` : ""}
              </Text>
            </View>
            {l.open_count ? (
              <Badge
                label={fill(t.lists.count, { n: l.open_count })}
                tone="primary"
              />
            ) : (
              <Badge label={plain(t.lists.allDone)} tone="ok" />
            )}
          </View>
          {l.trip ? (
            <Text variant="small" color={palette.family}>
              {l.trip.is_me
                ? t.lists.tripMine
                : fill(t.lists.tripOther, {
                    name: l.trip.name ?? t.circles.noName,
                  })}
            </Text>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
