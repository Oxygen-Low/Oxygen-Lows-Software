import { describe, it, expect } from "vitest";
import {
  encodeLlamaModelId,
  decodeLlamaModelId,
} from "./useLocalLlamaModels";

describe("local llama.cpp model ids", () => {
  it("round-trips a port and model name", () => {
    const id = encodeLlamaModelId(8123, "Qwen 2.5 7B");
    expect(decodeLlamaModelId(id)).toBe(8123);
  });

  it("returns null for non-local model ids", () => {
    expect(decodeLlamaModelId("openai/gpt-6-luna")).toBeNull();
    expect(decodeLlamaModelId("llama3.2:latest")).toBeNull();
  });

  it("rejects invalid ports", () => {
    expect(decodeLlamaModelId("llamacpp:0:model")).toBeNull();
    expect(decodeLlamaModelId("llamacpp:99999:model")).toBeNull();
  });
});
