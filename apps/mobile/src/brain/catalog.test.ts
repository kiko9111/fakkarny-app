import { describe, expect, it } from "vitest";
import { chatModel, defaultChatModel, defaultVoiceModel, sizeLabel, threadsFor } from "./catalog";

const GB = 1024 ** 3;

describe("phone model catalog", () => {
  it("offers the smartest model the phone has room for", () => {
    expect(defaultChatModel(8 * GB).id).toBe("qwen3.5-2b-q4");
    expect(defaultChatModel(4 * GB).id).toBe("qwen3.5-0.8b-q4");
    expect(defaultChatModel(2 * GB).id).toBe("qwen3.5-0.8b-q4");
    expect(defaultChatModel(null).id).toBe("qwen3.5-0.8b-q4");
  });
  it("keeps a saved choice, else the default", () => {
    expect(chatModel("qwen3.5-2b-q4", 2 * GB).id).toBe("qwen3.5-2b-q4");
    expect(chatModel("gone", 8 * GB).id).toBe("qwen3.5-2b-q4");
  });
  it("picks the voice model and labels sizes", () => {
    expect(defaultVoiceModel(6 * GB).id).toBe("whisper-small-q5");
    expect(defaultVoiceModel(2 * GB).id).toBe("whisper-base-q5");
    expect(sizeLabel(1_280_835_840)).toBe("1.3 GB");
    expect(sizeLabel(190_085_487)).toBe("190 MB");
    expect(threadsFor(8)).toBe(4);
    expect(threadsFor(2)).toBe(2);
  });
});
