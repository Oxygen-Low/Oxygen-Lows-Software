export const formatModelLabel = (provider: string, modelId: string) => {
  if (provider === "horde") {
    const labels: Record<string, string> = {
      Fast: "Fast - Fast speed, decent quality",
      Balanced: "Balanced - Balanced speed and quality",
      Smart: "Smart - Slow but high quality",
      Write: "Write - Good at writing and roleplaying",
      Code: "Code - Good at coding",
    };
    return labels[modelId] || "AI Horde - " + modelId;
  }
  if (provider === "ollama") return "Ollama/" + modelId;
  if (provider === "lmstudio") return "LMStudio/" + modelId;
  if (provider === "koboldcpp" || provider === "kobold")
    return "Koboldcpp/" + modelId;

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
