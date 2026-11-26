import type { CheckinKind, Circle, CircleDetail, CirclePost, ReactionKey } from "@fakkarni/shared";

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

// What the feed and the circle look like right after a tap, drawn at once while the server
// confirms. Its answer replaces the guess; a failure puts the old one back.

/** One reaction each: tapping another moves it, tapping the same one (key null) takes it back. */
export function guessReaction(post: CirclePost, key: ReactionKey | null): CirclePost {
  const counts = new Map(post.reactions.map((r) => [r.key, r.count]));
  if (post.my_reaction) counts.set(post.my_reaction, (counts.get(post.my_reaction) ?? 1) - 1);
  if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  return { ...post, my_reaction: key, reactions: [...counts].filter(([, count]) => count > 0).map(([k, count]) => ({ key: k, count })) };
}

/** The comment the user just sent, last in the list, under an id only the phone knows. */
export function guessComment(post: CirclePost, text: string, authorName: string | null, now: Date, id: string): CirclePost {
  return { ...post, comments: [...post.comments, { id, author_name: authorName, is_mine: true, is_zaki: false, text, created_at: now.toISOString() }], comment_count: post.comment_count + 1 };
}

export function guessCommentRemoved(post: CirclePost, commentId: string): CirclePost {
  const comments = post.comments.filter((c) => c.id !== commentId);
  return comments.length === post.comments.length ? post : { ...post, comments, comment_count: Math.max(0, post.comment_count - 1) };
}

/** The user's own check-in, shown on their row at once. */
export function guessCheckin(circle: CircleDetail, kind: CheckinKind, now: Date): CircleDetail {
  return { ...circle, members: circle.members.map((m) => (m.is_me ? { ...m, last_checkin: { kind, note: null, at: now.toISOString() } } : m)) };
}
