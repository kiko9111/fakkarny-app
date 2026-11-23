import { describe, expect, it } from "vitest";
import type { Circle } from "@fakkarni/shared";
import { groupCircles, joinFailure, whatsappShareUrl } from "./logic";

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
