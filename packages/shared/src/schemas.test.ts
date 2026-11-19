import { describe, expect, it } from "vitest";
import { FriendResponse, HealthResponse, PostMessageRequest, TimeOfDay } from "./index";

describe("FriendResponse", () => {
  // The example from PRD §6, verbatim.
  const prdExample = {
    reply: ["Ahmed and his 500s 😂 Noted.", "Dentist Sunday at 6, I'll ping you at 5. Same clinic in Dokki?"],
    create_items: [
      {
        type: "reminder",
        title: "Dentist",
        due_at_local: "2026-11-22T18:00",
        remind_at_local: "2026-11-22T17:00",
        follow_up_at_local: "2026-11-22T20:00",
      },
      {
        type: "debt",
        title: "Ahmed borrowed 500",
        debt: { person: "Ahmed", amount: 500, direction: "owed_to_me" },
      },
    ],
    update_items: [],
    save_memories: [{ kind: "person", subject: "Ahmed", content: "Often borrows money from the user" }],
    crisis: false,
  };

  it("accepts the PRD example", () => {
    const parsed = FriendResponse.parse(prdExample);
    expect(parsed.create_items).toHaveLength(2);
    expect(parsed.save_memories[0]?.subject).toBe("Ahmed");
  });

  it("fills defaults when only a reply is given", () => {
    const parsed = FriendResponse.parse({ reply: ["Sabah el kheir! What's the plan today?"] });
    expect(parsed).toMatchObject({ create_items: [], update_items: [], save_memories: [], crisis: false });
  });

  it("rejects more than 3 reply messages (persona: 1–3 short messages)", () => {
    expect(FriendResponse.safeParse({ reply: ["a", "b", "c", "d"] }).success).toBe(false);
  });

  it("rejects an empty reply", () => {
    expect(FriendResponse.safeParse({ reply: [] }).success).toBe(false);
  });

  it("rejects unknown item types and bad dates", () => {
    expect(FriendResponse.safeParse({ reply: ["x"], create_items: [{ type: "project", title: "t" }] }).success).toBe(false);
    expect(
      FriendResponse.safeParse({ reply: ["x"], create_items: [{ type: "task", title: "t", due_at_local: "Sunday at 6" }] })
        .success,
    ).toBe(false);
  });
});

describe("TimeOfDay", () => {
  it.each(["07:00", "23:59", "00:00"])("accepts %s", (t) => expect(TimeOfDay.safeParse(t).success).toBe(true));
  it.each(["7:00", "24:00", "12:60", "noon"])("rejects %s", (t) => expect(TimeOfDay.safeParse(t).success).toBe(false));
});

describe("API contracts", () => {
  it("validates a health response", () => {
    expect(
      HealthResponse.safeParse({ status: "ok", service: "fakkarni-api", version: "0.1.0", time: new Date().toISOString() })
        .success,
    ).toBe(true);
  });

  it("validates a message from the sync queue", () => {
    expect(
      PostMessageRequest.safeParse({ client_id: "c-1", text: "ya3ni Ahmed borrowed 500 again", created_at: new Date().toISOString() })
        .success,
    ).toBe(true);
    expect(PostMessageRequest.safeParse({ client_id: "c-1", text: "", created_at: new Date().toISOString() }).success).toBe(
      false,
    );
  });
});
