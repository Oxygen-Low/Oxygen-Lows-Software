import { describe, it, expect } from "vitest";
import { formatModelLabel } from "./aiUtils";

describe("formatModelLabel", () => {
  it("should handle horde provider", () => {
    expect(formatModelLabel("horde", "Fast")).toBe(
      "Fast - koboldcpp/Meta-Llama-3.1-8B-Instruct-Q3_K_M",
    );
    expect(formatModelLabel("horde", "Smart")).toBe(
      "Smart - aphrodite/TheDrummer/Behemoth-X-123B-v2.1",
    );
    expect(formatModelLabel("horde", "UnknownModel")).toBe(
      "AI Horde - UnknownModel",
    );
  });

  it("should handle ollama provider", () => {
    expect(formatModelLabel("ollama", "llama3")).toBe("Ollama/llama3");
    expect(formatModelLabel("local-ollama", "llama3")).toBe("Ollama/llama3");
  });

  it("should handle lmstudio provider", () => {
    expect(formatModelLabel("lmstudio", "phi3")).toBe("LMStudio/phi3");
    expect(formatModelLabel("local-lmstudio", "phi3")).toBe("LMStudio/phi3");
  });

  it("should handle koboldcpp and kobold providers", () => {
    expect(formatModelLabel("koboldcpp", "model-a")).toBe("Koboldcpp/model-a");
    expect(formatModelLabel("kobold", "model-b")).toBe("Koboldcpp/model-b");
    expect(formatModelLabel("local-kobold", "model-c")).toBe(
      "Koboldcpp/model-c",
    );
  });

  it("should handle cloudflare provider", () => {
    expect(
      formatModelLabel("cloudflare", "@cf/nvidia/nemotron-3-120b-a12b"),
    ).toBe("Smart - nvidia/nemotron-3-120b-a12b");
    expect(
      formatModelLabel("cloudflare", "@cf/google/gemma-4-26b-a4b-it"),
    ).toBe("Balanced - google/gemma-4-26b-a4b-it");
    expect(formatModelLabel("cloudflare", "@cf/zai-org/glm-4.7-flash")).toBe(
      "Fast - zai-org/glm-4.7-flash",
    );
    expect(
      formatModelLabel("cloudflare", "@cf/ibm-granite/granite-4.0-h-micro"),
    ).toBe("Cheap - ibm-granite/granite-4.0-h-micro");
    expect(
      formatModelLabel("cloudflare", "@cf/meta/llama-3.1-8b-instruct-fast"),
    ).toBe("Write/Roleplay - meta/llama-3.1-8b-instruct-fast");
    expect(formatModelLabel("cloudflare", "unknown-model")).toBe(
      "Cloudflare - unknown-model",
    );
  });

  it("should handle openrouter free model", () => {
    expect(formatModelLabel("openrouter", "openrouter/free")).toBe(
      "Auto Select - Free Model",
    );
  });

  it("should handle known providers with custom casing logic", () => {
    expect(formatModelLabel("openai", "gpt-4o")).toBe("OpenAI - gpt-4o");
    expect(formatModelLabel("anthropic", "claude-3-sonnet")).toBe(
      "Anthropic - claude-3-sonnet",
    );
    expect(formatModelLabel("google", "gemini-1.5-pro")).toBe(
      "Google - gemini-1.5-pro",
    );
    expect(
      formatModelLabel("openrouter", "meta-llama/llama-3-70b-instruct"),
    ).toBe("OpenRouter - meta-llama/llama-3-70b-instruct");
    expect(formatModelLabel("grok", "grok-2")).toBe("Grok - grok-2");
  });

  it("should handle arbitrary unknown providers by capitalizing the first letter", () => {
    expect(formatModelLabel("customprovider", "model-x")).toBe(
      "Customprovider - model-x",
    );
    expect(formatModelLabel("together", "model-y")).toBe("Together - model-y");
  });
});
