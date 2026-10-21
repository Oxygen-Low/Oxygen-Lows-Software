import { handleSafetyModeration } from "@/lib/safetyModeration";

export const formatModelLabel = (provider: string, modelId: string) => {
  if (provider === "pollinations") {
    const labels: Record<string, string> = {
      "deepseek/deepseek-v4.1-flash": "Best",
      "amazon/nova-micro-v1": "Cheap",
      "openai/gpt-6-luna": "Fast",
      "openai/gpt-5.6-terra": "Balanced",
      "openai/gpt-6.1-sol": "Smart",
      "openai/gpt-6-astra": "Smartest",
      "openai/gpt-oss-20b": "Cheap",
      "xiaomi/mimo-v2.5": "Cheap",
      "anthropic/claude-haiku-5.5": "Fast",
      "google/gemini-3.8-flash": "Balanced",
      "google/gemini-4-argon": "Smart",
      "anthropic/claude-fable-5.1": "Smartest",
    };
    return labels[modelId] || modelId;
  }
  if (provider === "horde") {
    const labels: Record<string, string> = {
      Fast: "Fast - koboldcpp/NVIDIA-Nemotron-3-Nano-4B-Q4_K_M",
      Smart: "Smart - aphrodite/TheDrummer/Behemoth-X-123B-v2.1",
      Writing: "Writing - aphrodite/TheDrummer/Behemoth-X-123B-v2.1",
    };
    return labels[modelId] || "AI Horde - " + modelId;
  }
  if (provider === "local-ollama" || provider === "ollama")
    return "Ollama/" + modelId;
  if (provider === "local-lmstudio" || provider === "lmstudio")
    return "LMStudio/" + modelId;
  if (
    provider === "local-kobold" ||
    provider === "koboldcpp" ||
    provider === "kobold"
  )
    return "Koboldcpp/" + modelId;

  if (provider === "openrouter" && modelId === "openrouter/free") {
    return "Auto Select - Free Model";
  }

  const displayProvider =
    provider === "openai"
      ? "OpenAI"
      : provider === "anthropic"
        ? "Anthropic"
        : provider === "google"
          ? "Google"
          : provider === "openrouter"
            ? "OpenRouter"
            : provider === "grok"
              ? "Grok"
              : provider.charAt(0).toUpperCase() + provider.slice(1);

  return displayProvider + " - " + modelId;
};

export const parseAiProxyError = async (response: Response) => {
  let errorMessage = "Upstream service error";
  try {
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      const errorData = await response.json();
      handleSafetyModeration(errorData);
      errorMessage =
        errorData?.error?.message ||
        errorData?.error ||
        errorData?.message ||
        errorMessage;
    } else if (response.status === 413) {
      errorMessage =
        "Request entity too large. Try a shorter message or smaller image.";
    } else {
      const text = await response.text();
      if (text.includes("<html>")) {
        errorMessage = "Received HTML error response from upstream service.";
      } else {
        errorMessage = text || errorMessage;
      }
    }
  } catch (e) {
    errorMessage = "Error parsing error response";
  }
  return typeof errorMessage === "string"
    ? errorMessage
    : JSON.stringify(errorMessage);
};
