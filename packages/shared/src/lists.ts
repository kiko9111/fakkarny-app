import { z } from "zod";

/**
 * Shared household lists (2026-11-26, owner ask "shared household list"): a list per circle
 * (groceries, the pharmacy, anything) or a private one. Everyone in the circle adds and ticks
 * off; "I'm going to the market" tells the others so they can add what they need while that
 * person is out. Free, like every shared feature; no AI call anywhere in the list itself.
 */

/**
 * The kind of shop a list is for. The place reminders use the same words for a saved place, so
 * a list can show itself when the phone arrives at that kind of shop (listsForPlace on the phone).
 */
export const LIST_PLACES = [
  "grocery",
  "pharmacy",
  "bakery",
  "butcher",
  "home",
  "other",
] as const;
export const ListPlace = z.enum(LIST_PLACES);
export type ListPlace = z.infer<typeof ListPlace>;

export const MAX_LISTS_PER_OWNER = 30;
export const MAX_LIST_ITEMS = 300;
export const MAX_ITEMS_PER_ADD = 30;
export const LIST_TITLE_MAX = 80;
export const LIST_NAME_MAX = 40;
/** Ticked items stay in view this long (so the others see "got it"), then only "clear" would show them. */
export const DONE_VISIBLE_HOURS = 24;
/** A trip nobody ended goes away by itself after this long. */
export const TRIP_HOURS = 3;

const Instant = z.iso.datetime({ offset: true });
const Id = z.uuid();

export const HouseListItem = z.object({
  id: Id,
  title: z.string(),
  qty: z.string().nullable().default(null),
  added_by_name: z.string().nullable().default(null),
  is_mine: z.boolean().default(false),
  done: z.boolean(),
  done_by_name: z.string().nullable().default(null),
  done_at: Instant.nullable().default(null),
  created_at: Instant,
});
export type HouseListItem = z.infer<typeof HouseListItem>;

export const ListTrip = z.object({
  user_id: z.string(),
  name: z.string().nullable(),
  is_me: z.boolean(),
  at: Instant,
});
export type ListTrip = z.infer<typeof ListTrip>;

export const HouseList = z.object({
  id: Id,
  name: z.string(),
  place: ListPlace.catch("other"),
  circle_id: z.string().nullable(),
  circle_name: z.string().nullable().default(null),
  /** Creator of the list (personal lists: the user). */
  is_owner: z.boolean().default(false),
  open_count: z.number().int(),
  trip: ListTrip.nullable().default(null),
  items: z.array(HouseListItem),
  updated_at: Instant,
});
export type HouseList = z.infer<typeof HouseList>;

export const ListListsResponse = z.object({ lists: z.array(z.unknown()) });
export const HouseListResponse = z.object({ list: HouseList });
export type HouseListResponse = z.infer<typeof HouseListResponse>;

const Title = z.string().trim().min(1).max(LIST_TITLE_MAX);

export const CreateListRequest = z.object({
  /** Made on the phone, so a resend returns the same list. */
  id: Id.optional(),
  name: z.string().trim().min(1).max(LIST_NAME_MAX),
  place: ListPlace.default("grocery"),
  circle_id: Id.nullable().default(null),
});
export type CreateListRequest = z.infer<typeof CreateListRequest>;

export const UpdateListRequest = z.object({
  name: z.string().trim().min(1).max(LIST_NAME_MAX).optional(),
  place: ListPlace.optional(),
});
export type UpdateListRequest = z.infer<typeof UpdateListRequest>;

export const AddListItemsRequest = z.object({
  items: z
    .array(
      z.object({
        id: Id.optional(),
        title: Title,
        qty: z.string().trim().min(1).max(20).nullable().optional(),
      }),
    )
    .min(1)
    .max(MAX_ITEMS_PER_ADD),
});
export type AddListItemsRequest = z.infer<typeof AddListItemsRequest>;

export const UpdateListItemRequest = z.object({
  done: z.boolean().optional(),
  title: Title.optional(),
  qty: z.string().trim().max(20).nullable().optional(),
});
export type UpdateListItemRequest = z.infer<typeof UpdateListItemRequest>;

export const ListTripRequest = z.object({ going: z.boolean() });
export type ListTripRequest = z.infer<typeof ListTripRequest>;

/** Lower case, no Arabic diacritics or tatweel, alef/ya/ta marbuta folded: "البيض" and "بيض" are one thing. */
export function foldThing(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/^ال(?=\S{2,})/u, "")
    .replace(/^(the|some|a|an)\s+/u, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * "eggs, milk and bread" / "بيض ولبن وعيش" / one per line → separate things. Keeps a number in
 * front as the quantity ("2 لبن" → title "لبن", qty "2"). At most MAX_ITEMS_PER_ADD.
 */
export function splitThings(
  text: string,
): { title: string; qty: string | null }[] {
  const parts = text
    .split(
      /\n|،|,|;|\s+and\s+|\s+&\s+|\s+و(?!رق|راك|رد|ز(?:\s|$)|ش(?:\s|$))(?=\S)|\s+w\s+/iu,
    )
    .map((p) => p.replace(/^[\s\-•*·]+|[\s.!؟?]+$/gu, "").trim())
    .filter(Boolean);
  const out: { title: string; qty: string | null }[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const m = p.match(/^(\d+(?:[.,]\d+)?|[٠-٩]+)\s*(?:x\s*)?(.+)$/iu);
    const title = (m ? m[2]! : p).trim().slice(0, LIST_TITLE_MAX);
    const qty = m
      ? m[1]!.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      : null;
    const key = foldThing(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, qty });
    if (out.length >= MAX_ITEMS_PER_ADD) break;
  }
  return out;
}

/** The lists for the kind of shop the phone just arrived at, the fullest first; empty lists are left out. */
export function listsForPlace<
  L extends Pick<HouseList, "place" | "open_count">,
>(lists: L[], place: ListPlace): L[] {
  return lists
    .filter((l) => l.place === place && l.open_count > 0)
    .sort((a, b) => b.open_count - a.open_count);
}

/** Open items first (oldest first, as they were added), then ticked ones (latest first). */
export function sortListItems<
  I extends Pick<HouseListItem, "done" | "done_at" | "created_at">,
>(items: I[]): I[] {
  const open = items
    .filter((i) => !i.done)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const done = items
    .filter((i) => i.done)
    .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  return [...open, ...done];
}

/** The default name of a new list of this kind. */
export function defaultListName(place: ListPlace, lang: "ar" | "en"): string {
  const names: Record<ListPlace, [string, string]> = {
    grocery: ["البقالة", "Groceries"],
    pharmacy: ["الصيدلية", "Pharmacy"],
    bakery: ["العيش والمخبز", "Bakery"],
    butcher: ["الجزار", "Butcher"],
    home: ["حاجات البيت", "Home"],
    other: ["قايمة", "List"],
  };
  return names[place][lang === "en" ? 1 : 0];
}
