import { describe, expect, it } from "vitest";
import { cleanForwarded, FORWARD_MARK, markForwarded, MAX_FORWARD_CHARS, readForwarded, routeShare } from "./forward";

describe("cleanForwarded", () => {
  it("drops WhatsApp time stamps but keeps who said it, and keeps the newest time", () => {
    const raw = "[26/11/2026, 9:15 PM] Mona: هات عيش وبيض\n[26/11/2026, 9:16 PM] Mona: ‎<Media omitted>\n[26/11/2026, 9:20 PM] Mona: *لبن* كمان";
    expect(cleanForwarded(raw)).toBe("(sent 26/11/2026, 9:20 PM)\nMona: هات عيش وبيض\nMona: لبن كمان");
  });

  it("reads Arabic copies and exported chats", () => {
    expect(cleanForwarded("[10:31 ص، 27/11/2026] منى: اجتماع أولياء الأمور الخميس")).toBe("(sent 10:31 ص، 27/11/2026)\nمنى: اجتماع أولياء الأمور الخميس");
    expect(cleanForwarded("27/11/2026, 10:31 - Ahmed: pay the club 450 by Sunday")).toBe("(sent 27/11/2026, 10:31)\nAhmed: pay the club 450 by Sunday");
  });

  it("leaves a plain message alone apart from markers, deleted lines and blank runs", () => {
    expect(cleanForwarded("*الواجب*\n\n\n\nعربي: صفحة ١٢\nThis message was deleted\nتم حذف هذه الرسالة")).toBe("الواجب\n\nعربي: صفحة ١٢");
    expect(cleanForwarded("اقرا [صفحة 5] بكرة")).toBe("اقرا [صفحة 5] بكرة");
  });

  it("is empty when nothing is left", () => {
    expect(cleanForwarded("<Media omitted>\n‎")).toBe("");
  });
});

describe("markForwarded / readForwarded", () => {
  it("round-trips", () => {
    const text = markForwarded("[1/2/2026, 10:00] Sara: Bring the costume Thursday");
    expect(text.startsWith(FORWARD_MARK)).toBe(true);
    expect(readForwarded(text)).toEqual({ forwarded: true, body: "(sent 1/2/2026, 10:00)\nSara: Bring the costume Thursday" });
    expect(readForwarded("hello")).toEqual({ forwarded: false, body: "hello" });
    expect(readForwarded("↪\nهات عيش").forwarded).toBe(true);
  });

  it("fits a chat message", () => {
    const text = markForwarded("ا".repeat(9000));
    expect(text.length).toBeLessThanOrEqual(MAX_FORWARD_CHARS + FORWARD_MARK.length);
    expect(text.endsWith("…")).toBe(true);
    expect(markForwarded("  ")).toBe("");
  });
});

describe("routeShare", () => {
  it("sends words to the chat and a photo to the receipt reader", () => {
    expect(routeShare({ text: "school trip Sunday, 150 pounds" })).toEqual({ kind: "chat", text: `${FORWARD_MARK}school trip Sunday, 150 pounds` });
    expect(routeShare({ images: ["file:///cache/a.jpg"] })).toEqual({ kind: "receipt", uri: "file:///cache/a.jpg" });
    expect(routeShare({ images: ["file:///cache/a.jpg"], text: "https://wa.me/x" })).toEqual({ kind: "receipt", uri: "file:///cache/a.jpg" });
    expect(routeShare({ images: ["file:///a.jpg"], text: "الواجب بتاع بكرة: عربي صفحة ١٢ وحساب تمرين ٣" }).kind).toBe("chat");
    expect(routeShare({ text: "" })).toEqual({ kind: "none" });
  });

  it("does not repeat a subject that equals the text", () => {
    expect(routeShare({ subject: "hi there everyone", text: "hi there everyone" })).toEqual({ kind: "chat", text: `${FORWARD_MARK}hi there everyone` });
  });
});
