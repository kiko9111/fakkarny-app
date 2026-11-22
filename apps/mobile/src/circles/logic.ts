import type { Circle } from "@fakkarni/shared";

/** Pure helpers for the Circles screens (unit-tested; no react-native imports). */

/** Opens WhatsApp's "send to…" picker with the invite text ready, from the user's own number. */
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Family first (the daily loop), then friends; oldest circle first inside each space. */
export function groupCircles(circles: Circle[]): { family: Circle[]; friends: Circle[] } {
  const byAge = (a: Circle, b: Circle) => a.created_at.localeCompare(b.created_at);
  return {
    family: circles.filter((c) => c.kind === "family").sort(byAge),
    friends: circles.filter((c) => c.kind === "friends").sort(byAge),
  };
}

/** HTTP status of a failed join → which message to show. */
export function joinFailure(status: number | null): "gone" | "notFound" | "offline" {
  if (status === 404) return "notFound";
  if (status === 409) return "gone";
  return "offline";
}

/** Fill "{name}"-style slots in a string from src/i18n. */
export const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
