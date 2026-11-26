import { describe, expect, it } from "vitest";
import type { Circle, CircleDetail, CirclePost } from "@fakkarni/shared";
import { groupCircles, guessCheckin, guessComment, guessCommentRemoved, guessReaction, joinFailure, whatsappShareUrl } from "./logic";

const circle = (id: string, kind: Circle["kind"], created_at: string): Circle => ({ id, kind, name: id, role: "member", member_count: 2, family_type: null, created_at, extras: true });

describe("circles logic", () => {
  it("builds a WhatsApp share link with Arabic text and the invite URL encoded", () => {
    const url = whatsappShareUrl("تعالى «بيتنا»\nhttps://zaki.app/i/ABCD2345");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(url.split("text=")[1]!)).toBe("تعالى «بيتنا»\nhttps://zaki.app/i/ABCD2345");
    expect(url).not.toContain(" ");
  });
  it("groups circles by space, oldest first", () => {
    const g = groupCircles([circle("b", "friends", "2026-11-22T10:00:00Z"), circle("f2", "family", "2026-11-23T10:00:00Z"), circle("f1", "family", "2026-11-21T10:00:00Z")]);
    expect(g.family.map((c) => c.id)).toEqual(["f1", "f2"]);
    expect(g.friends.map((c) => c.id)).toEqual(["b"]);
  });
  it("maps join failures to messages", () => {
    expect(joinFailure(404)).toBe("notFound");
    expect(joinFailure(409)).toBe("gone");
    expect(joinFailure(null)).toBe("offline");
  });
});

describe("what a tap looks like at once", () => {
  const post: CirclePost = {
    id: "p1",
    text: "عمر خلص «الواجب»",
    created_at: "2026-11-25T10:00:00.000Z",
    kind: null,
    my_rsvp: null,
    reactions: [
      { key: "heart", count: 2 },
      { key: "clap", count: 1 },
    ],
    my_reaction: "clap",
    comments: [{ id: "c1", author_name: "Omar", is_mine: false, is_zaki: false, text: "تمام", created_at: "2026-11-25T10:05:00.000Z" }],
    comment_count: 4,
  };

  it("moves my reaction, and takes it back on a second tap", () => {
    const moved = guessReaction(post, "heart");
    expect(moved.my_reaction).toBe("heart");
    expect(moved.reactions).toEqual([{ key: "heart", count: 3 }]);
    const back = guessReaction(moved, null);
    expect(back.my_reaction).toBeNull();
    expect(back.reactions).toEqual([{ key: "heart", count: 2 }]);
    const first = guessReaction({ ...post, reactions: [], my_reaction: null }, "pray");
    expect(first.reactions).toEqual([{ key: "pray", count: 1 }]);
    // The post handed in is left as it was.
    expect(post.reactions).toHaveLength(2);
  });

  it("adds my comment last and counts it; removing it takes both back", () => {
    const now = new Date("2026-11-26T08:00:00.000Z");
    const added = guessComment(post, "برافو", "Mona", now, "local:1");
    expect(added.comments.at(-1)).toEqual({ id: "local:1", author_name: "Mona", is_mine: true, is_zaki: false, text: "برافو", created_at: "2026-11-26T08:00:00.000Z" });
    expect(added.comment_count).toBe(5);
    const removed = guessCommentRemoved(added, "local:1");
    expect(removed.comments.map((c) => c.id)).toEqual(["c1"]);
    expect(removed.comment_count).toBe(4);
    expect(guessCommentRemoved(post, "not-here")).toBe(post);
  });

  it("puts my check-in on my own row only", () => {
    const detail = {
      members: [
        { user_id: "me", is_me: true, last_checkin: null },
        { user_id: "omar", is_me: false, last_checkin: { kind: "home", note: null, at: "2026-11-25T18:00:00.000Z" } },
      ],
    } as unknown as CircleDetail;
    const after = guessCheckin(detail, "arrived", new Date("2026-11-26T08:00:00.000Z"));
    expect(after.members[0]!.last_checkin).toEqual({ kind: "arrived", note: null, at: "2026-11-26T08:00:00.000Z" });
    expect(after.members[1]).toBe(detail.members[1]);
    expect(detail.members[0]!.last_checkin).toBeNull();
  });
});
