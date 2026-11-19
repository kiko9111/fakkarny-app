import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "./api-url";
import { pickLanguage } from "../i18n/pick";
import { strings } from "../i18n/strings";

describe("resolveApiUrl", () => {
  it("prefers the explicit env URL and trims trailing slashes", () => {
    expect(resolveApiUrl({ envUrl: "https://api.fakkarni.app/", hostUri: "10.0.0.2:8081" })).toBe("https://api.fakkarni.app");
  });
  it("uses the Metro host in development", () => {
    expect(resolveApiUrl({ hostUri: "192.168.1.5:8081" })).toBe("http://192.168.1.5:3000");
  });
  it("falls back to localhost", () => {
    expect(resolveApiUrl({ hostUri: null })).toBe("http://localhost:3000");
  });
});

describe("pickLanguage", () => {
  it("maps any Arabic locale to Egyptian Arabic", () => {
    expect(pickLanguage(["ar-SA"])).toBe("ar-EG");
    expect(pickLanguage(["ar"])).toBe("ar-EG");
  });
  it("picks English when it comes first", () => {
    expect(pickLanguage(["en-GB", "ar-EG"])).toBe("en");
  });
  it("skips unsupported locales and defaults to ar-EG", () => {
    expect(pickLanguage(["fr-FR", "en-US"])).toBe("en");
    expect(pickLanguage(["fr-FR"])).toBe("ar-EG");
    expect(pickLanguage([])).toBe("ar-EG");
  });
});

describe("strings", () => {
  const keys = (o: object, prefix = ""): string[] =>
    Object.entries(o).flatMap(([k, v]) =>
      typeof v === "string" || Array.isArray(v) ? [prefix + k] : keys(v, `${prefix}${k}.`),
    );

  it("has the same keys in every language", () => {
    expect(keys(strings.en).sort()).toEqual(keys(strings["ar-EG"]).sort());
  });
  it("tells the user the friend is an AI in every language (PRD §7)", () => {
    expect(strings["ar-EG"].settings.aiDisclosure).toBeTruthy();
    expect(strings.en.settings.aiDisclosure).toMatch(/AI/);
  });
});
