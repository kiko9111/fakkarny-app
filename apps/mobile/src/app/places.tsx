import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { Stack, useFocusEffect } from "expo-router";
import { randomUUID } from "expo-crypto";
import { kindOfPlace, PlaceKind, type Circle, type Item } from "@fakkarni/shared";
import { listPlaceItems } from "@/db/items";
import { t } from "@/i18n";
import { listCircles, peekCircles } from "@/lib/api";
import { itemsChanged } from "@/lib/signals";
import { DEFAULT_RADIUS, MAX_PLACES, nameTaken, RADII, waitingPlaces, type SavedPlace } from "@/places/logic";
import { askLocation, currentPoint, geofenceAvailable, locationAccess, locationAvailable, openPhoneSettings, type LocationAccess } from "@/places/native";
import { refreshPlaces } from "@/places/fire";
import { placeStore, usePlaces } from "@/places/store";
import { Button, Card, Chip, Icon, IconTile, Note, ask, confirm, notify, palette, radius, Screen, space, Text, TextField, type IconName } from "@/ui";

const KIND_ICON: Record<PlaceKind, IconName> = {
  grocery: "cart-outline",
  pharmacy: "medkit-outline",
  bakery: "restaurant-outline",
  butcher: "restaurant-outline",
  home: "home-outline",
  school: "school-outline",
  work: "briefcase-outline",
  other: "location-outline",
};

const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/**
 * My places: where place reminders fire. A place is saved where the phone is now (no map, no
 * address search), and it stays on this phone. Before the system's location question the app
 * explains why, as Google Play asks for background location ("prominent disclosure").
 */
export default function PlacesScreen() {
  const places = usePlaces();
  const [items, setItems] = useState<Item[]>([]);
  const [access, setAccess] = useState<LocationAccess | null>(null);
  const [circles, setCircles] = useState<Circle[]>(() => peekCircles() ?? []);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlaceKind>("other");
  const [radiusM, setRadiusM] = useState<number>(DEFAULT_RADIUS);
  const [arrivalCircle, setArrivalCircle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void listPlaceItems().then(setItems).catch(() => {});
    void locationAccess().then(setAccess);
    void listCircles().then(setCircles).catch(() => {});
  }, []);
  useFocusEffect(load);
  useEffect(() => itemsChanged.subscribe(load), [load]);

  const waiting = waitingPlaces(items, places);

  const startAdding = (words = "") => {
    setName(words);
    setKind(kindOfPlace(words) ?? "other");
    setRadiusM(DEFAULT_RADIUS);
    setArrivalCircle(null);
    setAdding(true);
  };

  /** The app's own explanation first, then the system's questions. */
  const ensureAccess = (): Promise<LocationAccess | null> =>
    new Promise((resolve) => {
      void locationAccess().then((now) => {
        if (now.foreground && (now.background || !geofenceAvailable)) return resolve(now);
        if (now.blocked) {
          ask(t.places.discloseTitle, t.places.backgroundOff, [
            { label: t.ui.cancel, style: "cancel", onPress: () => resolve(null) },
            { label: t.places.openSettings, onPress: () => (openPhoneSettings(), resolve(null)) },
          ]);
          return;
        }
        const body = geofenceAvailable ? `${t.places.discloseBody}\n\n${t.places.backgroundAsk}` : t.places.discloseBody;
        ask(t.places.discloseTitle, body, [
          { label: t.places.discloseNo, style: "cancel", onPress: () => resolve(now.foreground ? now : null) },
          {
            label: t.places.discloseYes,
            onPress: () => void askLocation(true).then((got) => resolve(got.foreground ? got : null)),
          },
        ]);
      });
    });

  const save = async () => {
    const clean = name.trim();
    if (!clean || busy) return;
    if (nameTaken(clean, places)) return notify(t.places.nameTaken, "error");
    if (places.length >= MAX_PLACES) return notify(t.places.full, "error");
    setBusy(true);
    try {
      const got = await ensureAccess();
      setAccess(got ?? (await locationAccess()));
      if (!got) return;
      if (geofenceAvailable && !got.background) notify(t.places.backgroundOff);
      const point = await currentPoint();
      if (!point) return notify(t.places.noFix, "error");
      if (point.accuracy != null && point.accuracy > 200) return notify(fill(t.places.roughFix, { m: Math.round(point.accuracy) }), "error");
      const circle = circles.find((c) => c.id === arrivalCircle);
      const place: SavedPlace = {
        id: randomUUID(),
        name: clean.slice(0, 60),
        kind,
        latitude: point.latitude,
        longitude: point.longitude,
        radius: radiusM,
        arrival: circle ? { circle_id: circle.id, circle_name: circle.name } : null,
        created_at: new Date().toISOString(),
      };
      placeStore.save([...placeStore.list(), place]);
      setAdding(false);
      notify(fill(t.places.saved, { place: place.name }), "ok");
      void refreshPlaces();
    } finally {
      setBusy(false);
    }
  };

  const remove = (p: SavedPlace) =>
    confirm(fill(t.places.removeAsk, { place: p.name }), t.places.remove, () => {
      placeStore.save(placeStore.list().filter((x) => x.id !== p.id));
      void refreshPlaces();
    });

  if (!locationAvailable) {
    return (
      <Screen contentStyle={styles.content}>
        <Stack.Screen options={{ title: t.places.title }} />
        <Note icon="location-outline">{t.places.off}</Note>
      </Screen>
    );
  }

  return (
    <Screen keyboard contentStyle={styles.content}>
      <Stack.Screen options={{ title: t.places.title }} />
      <View style={styles.hero}>
        <IconTile name="location" size={64} color={palette.primaryInk} bg={palette.primarySoft} />
      </View>
      <Text variant="body" color={palette.inkSoft}>
        {t.places.intro}
      </Text>

      {places.length && access ? (
        <Pressable onPress={access.background ? undefined : openPhoneSettings} accessibilityRole={access.background ? undefined : "button"} style={styles.status}>
          <Icon name={access.background ? "checkmark-circle" : "time-outline"} size={18} color={access.background ? palette.ok : palette.inkSoft} />
          <Text variant="small" color={palette.inkSoft} style={styles.flex}>
            {access.background || !geofenceAvailable ? (access.background ? t.places.alwaysOn : t.places.foregroundOnly) : t.places.backgroundOff}
          </Text>
        </Pressable>
      ) : null}

      {waiting.length ? (
        <Card style={styles.card}>
          <Text variant="bodyStrong">{t.places.waitingTitle}</Text>
          {waiting.map((w) => (
            <View key={w} style={styles.row}>
              <Icon name="help-circle-outline" size={20} color={palette.primaryInk} />
              <Text variant="body" style={styles.flex}>
                {w}
              </Text>
              <Button label={fill(t.places.saveHereNamed, { place: w })} size="sm" kind="tonal" onPress={() => startAdding(w)} />
            </View>
          ))}
          <Text variant="small" color={palette.inkSoft}>
            {t.places.waitingHint}
          </Text>
        </Card>
      ) : null}

      {places.length ? (
        <Card style={styles.card}>
          {places.map((p, n) => (
            <View key={p.id} style={[styles.row, n > 0 && styles.line]}>
              <Icon name={KIND_ICON[p.kind]} size={22} color={palette.primaryInk} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">{p.name}</Text>
                <Text variant="small" color={palette.inkSoft}>
                  {[t.places.kinds[p.kind], fill(t.places.radius, { m: p.radius }), p.arrival ? `${t.places.arrivalCircle} ${p.arrival.circle_name}` : ""].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Button label={t.places.remove} size="sm" kind="text" onPress={() => remove(p)} />
            </View>
          ))}
        </Card>
      ) : !adding ? (
        <Text variant="body" color={palette.inkSoft}>
          {t.places.empty}
        </Text>
      ) : null}

      {adding ? (
        <Card style={styles.card}>
          <Text variant="smallStrong" color={palette.inkSoft}>
            {t.places.nameLabel}
          </Text>
          <TextField
            value={name}
            onChangeText={(v) => {
              setName(v);
              const k = kindOfPlace(v);
              if (k) setKind(k);
            }}
            placeholder={t.places.namePlaceholder}
            maxLength={60}
            autoFocus={!name}
          />
          <Text variant="smallStrong" color={palette.inkSoft}>
            {t.places.kindLabel}
          </Text>
          <View style={styles.chips}>
            {PlaceKind.options.map((k) => (
              <Chip key={k} label={t.places.kinds[k]} icon={KIND_ICON[k]} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
          <Text variant="smallStrong" color={palette.inkSoft}>
            {t.places.radiusLabel}
          </Text>
          <View style={styles.chips}>
            {RADII.map((m) => (
              <Chip key={m} label={fill(t.places.radius, { m })} selected={radiusM === m} onPress={() => setRadiusM(m)} />
            ))}
          </View>
          <View style={styles.row}>
            <Text variant="body" style={styles.flex}>
              {t.places.arrivalLabel}
            </Text>
            <Switch
              value={arrivalCircle !== null}
              onValueChange={(on) => setArrivalCircle(on ? (circles.find((c) => c.kind === "family") ?? circles[0])?.id ?? null : null)}
              disabled={!circles.length}
            />
          </View>
          {!circles.length ? (
            <Text variant="small" color={palette.inkSoft}>
              {t.places.noCircles}
            </Text>
          ) : arrivalCircle !== null ? (
            <>
              <Text variant="small" color={palette.inkSoft}>
                {t.places.arrivalHint}
              </Text>
              <View style={styles.chips}>
                {circles.map((c) => (
                  <Chip key={c.id} label={c.name} tone="family" selected={arrivalCircle === c.id} onPress={() => setArrivalCircle(c.id)} />
                ))}
              </View>
            </>
          ) : null}
          <Button label={busy ? t.places.saving : t.places.save} size="lg" block busy={busy} disabled={!name.trim()} onPress={() => void save()} />
          <Button label={t.ui.cancel} kind="text" block onPress={() => setAdding(false)} />
        </Card>
      ) : (
        <Button label={t.places.saveHere} icon="location-outline" size="lg" block onPress={() => startAdding()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.xl, gap: space.lg },
  hero: { alignItems: "center", marginTop: space.sm },
  card: { gap: space.md, padding: space.lg, borderRadius: radius.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  line: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.line, paddingTop: space.md },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  status: { flexDirection: "row", alignItems: "center", gap: space.sm },
  flex: { flex: 1 },
});
