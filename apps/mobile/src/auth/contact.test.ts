import { describe, expect, it } from "vitest";
import { parseContact } from "./contact";

describe("parseContact", () => {
  it("recognises emails and lowercases them", () => {
    expect(parseContact("  Sara@Example.com ")).toEqual({ kind: "email", value: "sara@example.com" });
  });

  it("recognises phone numbers, including Arabic digits and spacing", () => {
    expect(parseContact("+20 100 123 4567")).toEqual({ kind: "phone", value: "+201001234567" });
    expect(parseContact("٠١٠٠١٢٣٤٥٦٧")).toEqual({ kind: "phone", value: "01001234567" });
  });

  it("returns null for anything unfinished or invalid", () => {
    expect(parseContact("")).toBeNull();
    expect(parseContact("sara@")).toBeNull();
    expect(parseContact("sara@example")).toBeNull();
    expect(parseContact("12345")).toBeNull();
    expect(parseContact("hello")).toBeNull();
  });
});
