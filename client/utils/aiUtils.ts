export const formatModelLabel = (provider: string, modelId: string) => {
  if (provider === "ollama") return "ollama/" + modelId;
  if (provider === "lmstudio") return "lmstudio/" + modelId;
  if (provider === "koboldcpp" || provider === "kobold")
    return "koboldcpp/" + modelId;
  return provider + " - " + modelId;
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
  return errorMessage;
};
