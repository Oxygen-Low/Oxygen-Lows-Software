export const formatModelLabel = (provider: string, modelId: string) => {
  if (provider === "horde") {
    const labels: Record<string, string> = {
      Fast: "Fast - google/gemma-4-31b",
      Smart: "Smart - koboldcpp/Behemoth-128B-v3b-Q4_K_M",
    };
    return labels[modelId] || "AI Horde - " + modelId;
  }
  if (provider === "ollama") return "Ollama/" + modelId;
  if (provider === "lmstudio") return "LMStudio/" + modelId;
  if (provider === "koboldcpp" || provider === "kobold")
    return "Koboldcpp/" + modelId;
  if (provider === "cloudflare") {
    const labels: Record<string, string> = {
      "@cf/nvidia/nemotron-3-120b-a12b": "Code - nvidia/nemotron-3-120b-a12b",
      "@cf/openai/gpt-oss-120b": "Smart - openai/gpt-oss-120b",
      "@cf/google/gemma-4-26b-a4b-it": "Balanced - google/gemma-4-26b-a4b-it",
      "@cf/zai-org/glm-4.7-flash": "Fast - zai-org/glm-4.7-flash",
      "@cf/ibm-granite/granite-4.0-h-micro":
        "Cheap - ibm-granite/granite-4.0-h-micro",
      "@cf/meta/llama-3.1-8b-instruct-fast":
        "Write/Roleplay - meta/llama-3.1-8b-instruct-fast",
    };
    if (labels[modelId]) return labels[modelId];
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
