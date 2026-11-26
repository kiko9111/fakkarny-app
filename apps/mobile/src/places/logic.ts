import { metresBetween, placeKey, placesFor, PlaceKind, type Item } from "@fakkarni/shared";

/**
 * Places saved on the phone (pure). Where a place is never leaves the phone: the server only sees
 * the words on a reminder ("the supermarket"). The phone fires the reminder itself when it gets
 * there, shows the household list at a shop, and offers a child's "I've arrived" check-in, which
 * is sent in words and only when tapped. No live tracking: nothing is recorded about where the
 * phone has been, only whether it is inside a saved place right now.
 */
export interface SavedPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  latitude: number;
  longitude: number;
  /** Metres around the point that count as "there". */
  radius: number;
  /** Offer "tell <circle> I arrived" here (a child at school or the club). */
  arrival?: { circle_id: string; circle_name: string } | null;
  created_at: string;
}

export const DEFAULT_RADIUS = 150;
export const RADII = [100, 150, 300, 500] as const;
/** Android and iOS both cap how many places one app can watch (iOS: 20). */
export const MAX_PLACES = 20;
/** Once a place fired, it does not fire again before the phone has left it, nor within this long. */
export const REFIRE_MS = 2 * 3600_000;

export function parsePlaces(raw: string | null): SavedPlace[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.flatMap((p): SavedPlace[] => {
      const o = p as Partial<SavedPlace>;
      const kind = PlaceKind.safeParse(o.kind);
      if (typeof o.id !== "string" || typeof o.name !== "string" || !o.name.trim()) return [];
      if (typeof o.latitude !== "number" || typeof o.longitude !== "number" || !Number.isFinite(o.latitude) || !Number.isFinite(o.longitude)) return [];
      const arrival = o.arrival && typeof o.arrival.circle_id === "string" ? { circle_id: o.arrival.circle_id, circle_name: String(o.arrival.circle_name ?? "") } : null;
      return [
        {
          id: o.id,
          name: o.name.trim().slice(0, 60),
          kind: kind.success ? kind.data : "other",
          latitude: o.latitude,
          longitude: o.longitude,
          radius: typeof o.radius === "number" && o.radius >= 50 && o.radius <= 1000 ? o.radius : DEFAULT_RADIUS,
          arrival,
          created_at: typeof o.created_at === "string" ? o.created_at : new Date(0).toISOString(),
        },
      ];
    });
  } catch {
    return [];
  }
}

/** A new place's name may not repeat another's (matching ignores case, "the", and Arabic spelling). */
export function nameTaken(name: string, places: readonly SavedPlace[], exceptId?: string): boolean {
  const key = placeKey(name);
  return places.some((p) => p.id !== exceptId && placeKey(p.name) === key);
}

/** The open place reminders that belong to this saved place, for arriving or leaving. */
export function itemsAt(place: SavedPlace, items: readonly Item[], places: readonly SavedPlace[], on: "arrive" | "leave"): Item[] {
  return items.filter((i) => i.status === "open" && i.place && (i.place_on ?? "arrive") === on && placesFor(i.place, places).some((p) => p.id === place.id));
}

/** Place words on open reminders that no saved place answers yet ("the supermarket" with nothing saved). */
export function waitingPlaces(items: readonly Item[], places: readonly SavedPlace[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    if (i.status !== "open" || !i.place || placesFor(i.place, places).length) continue;
    const key = placeKey(i.place);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(i.place);
  }
  return out;
}

/** The saved places a point is inside. */
export function placesHere(point: { latitude: number; longitude: number; accuracy?: number | null }, places: readonly SavedPlace[]): SavedPlace[] {
  // A rough fix (a cell tower, 1 km) is not enough to say "you're at the bakery".
  if (point.accuracy != null && point.accuracy > 500) return [];
  return places.filter((p) => metresBetween(point, p) <= p.radius + Math.min(point.accuracy ?? 0, 100));
}

/**
 * Visits, so one arrival fires once. Inside = the phone is inside now (since when); `fired` = when
 * this place last fired. Kept on the phone only, and only for saved places (never a trail).
 */
export interface VisitState {
  inside: Record<string, number>;
  fired: Record<string, number>;
}

export const emptyVisits = (): VisitState => ({ inside: {}, fired: {} });

export function parseVisits(raw: string | null): VisitState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<VisitState>) : null;
    return { inside: { ...(v?.inside ?? {}) }, fired: { ...(v?.fired ?? {}) } };
  } catch {
    return emptyVisits();
  }
}

/**
 * The phone went in or out of a place: whether to fire, and the visits after. Arriving fires
 * unless the place fired within REFIRE_MS (a geofence that flickers at the edge, or the same
 * arrival seen again when the app opens); leaving fires only after the phone was inside.
 */
export function visit(state: VisitState, placeId: string, event: "enter" | "exit", now: number): { fire: boolean; next: VisitState } {
  const next: VisitState = { inside: { ...state.inside }, fired: { ...state.fired } };
  if (event === "enter") {
    const already = next.inside[placeId] !== undefined;
    next.inside[placeId] = next.inside[placeId] ?? now;
    const last = next.fired[placeId];
    const fire = !already && (last === undefined || now - last >= REFIRE_MS);
    if (fire) next.fired[placeId] = now;
    return { fire, next };
  }
  const wasInside = next.inside[placeId] !== undefined;
  delete next.inside[placeId];
  return { fire: wasInside, next };
}

/** Forget visits of places that are gone, so the state never grows. */
export function pruneVisits(state: VisitState, places: readonly SavedPlace[]): VisitState {
  const ids = new Set(places.map((p) => p.id));
  const keep = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).filter(([k]) => ids.has(k)));
  return { inside: keep(state.inside), fired: keep(state.fired) };
}

/**
 * A check made with the app open (no background location, or Expo Go): which places the phone
 * entered and left since the last look, as enter / exit events for `visit`.
 */
export function changesSince(state: VisitState, here: readonly SavedPlace[], places: readonly SavedPlace[]): { placeId: string; event: "enter" | "exit" }[] {
  const now = new Set(here.map((p) => p.id));
  const out: { placeId: string; event: "enter" | "exit" }[] = [];
  for (const p of places) {
    const was = state.inside[p.id] !== undefined;
    if (now.has(p.id) && !was) out.push({ placeId: p.id, event: "enter" });
    if (!now.has(p.id) && was) out.push({ placeId: p.id, event: "exit" });
  }
  return out;
}

/** Lists to show at a shop of this kind (the household lists' `listsForPlace`, when they exist). */
export interface ShopList {
  id: string;
  name: string;
  open_count: number;
}

export interface PlaceAlert {
  identifier: string;
  title: string;
  body: string;
  data: Record<string, string | boolean>;
  kind: "reminder" | "list" | "arrival";
}

export interface AlertWords {
  arrivedAt: string; // "At {place}"
  leftPlace: string; // "Leaving {place}"
  listCount: string; // "{count} things on «{list}»"
  arrivalTitle: string; // "You're at {place}"
  arrivalBody: string; // "Tell {circle} you arrived?"
}

const fillIn = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");

/** What to show when the phone arrives at (or leaves) a place: one notification per reminder, the shop's lists, the arrival offer. */
export function alertsFor(place: SavedPlace, event: "enter" | "exit", items: readonly Item[], places: readonly SavedPlace[], lists: readonly ShopList[], words: AlertWords): PlaceAlert[] {
  const on = event === "enter" ? "arrive" : "leave";
  const head = fillIn(on === "arrive" ? words.arrivedAt : words.leftPlace, { place: place.name });
  const out: PlaceAlert[] = itemsAt(place, items, places, on).map((i) => ({
    identifier: `item_${i.id}_place`,
    title: head,
    body: i.title,
    data: { type: "reminder", itemId: i.id, title: i.title, repeating: false },
    kind: "reminder",
  }));
  if (on === "arrive") {
    for (const l of lists) {
      if (l.open_count <= 0) continue;
      out.push({
        identifier: `place_${place.id}_list_${l.id}`,
        title: head,
        body: fillIn(words.listCount, { count: String(l.open_count), list: l.name }),
        data: { type: "place", route: `/list/${l.id}` },
        kind: "list",
      });
    }
    if (place.arrival) {
      out.push({
        identifier: `place_${place.id}_arrival`,
        title: fillIn(words.arrivalTitle, { place: place.name }),
        body: fillIn(words.arrivalBody, { circle: place.arrival.circle_name }),
        data: { type: "arrival", circleId: place.arrival.circle_id, place: place.name },
        kind: "arrival",
      });
    }
  }
  return out;
}

/** The regions to watch: every saved place, arriving and leaving. */
export function regionsFor(places: readonly SavedPlace[]): { identifier: string; latitude: number; longitude: number; radius: number; notifyOnEnter: boolean; notifyOnExit: boolean }[] {
  return places.slice(0, MAX_PLACES).map((p) => ({ identifier: p.id, latitude: p.latitude, longitude: p.longitude, radius: p.radius, notifyOnEnter: true, notifyOnExit: true }));
}

/** Whether any saved place has something to do (a reminder, a shop list kind, an arrival offer): no reason to watch otherwise. */
export function worthWatching(places: readonly SavedPlace[], items: readonly Item[]): boolean {
  if (!places.length) return false;
  if (places.some((p) => p.arrival || ["grocery", "pharmacy", "bakery", "butcher"].includes(p.kind))) return true;
  return items.some((i) => i.status === "open" && i.place && placesFor(i.place, places).length > 0);
}
