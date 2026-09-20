import { toast } from "sonner";

export interface ModerationErrorData {
  error?: string;
  code?: string;
  category?: string;
  redirectUrl?: string;
}

/**
 * Global client-side interceptor for safety and moderation API responses.
 * Detects self-harm violations and automatically opens https://findahelpline.com/ in a new tab.
 * Also handles child safety and general policy violation toast alerts.
 * Returns true if the error was handled as a moderation event.
 */
export function handleSafetyModeration(
  data: any,
  t?: (key: string, params?: Record<string, any>) => string,
): boolean {
  if (!data || typeof data !== "object") return false;

  // 1. Self-Harm Violation -> open crisis helpline in new browser tab
  if (data.code === "SELF_HARM_DETECTED" || data.redirectUrl) {
    const url = data.redirectUrl || "https://findahelpline.com/";
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      // Fallback if popup blocked
      window.location.href = url;
    }

    const message = t
      ? t("safety.selfHarmSupportNotice")
      : "If you or someone you know is struggling, support is available. Opening Find A Helpline in a new tab.";

    toast.info(message, { duration: 8000 });
    return true;
  }

  // 2. Child safety lockdown response
  if (data.code === "CHILD_SAFETY_POLICY_VIOLATION") {
    const message = t
      ? t("safety.childSafetyBlocked")
      : data.error || "Content permanently blocked due to child safety policy violation.";

    toast.error(message, { duration: 7000 });
    return true;
  }

  // 3. General moderation policy violation (harassment, hate, graphic violence, etc.)
  if (data.code === "CONTENT_POLICY_VIOLATION") {
    const message = t
      ? t("safety.contentPolicyBlocked", { category: data.category || "policy" })
      : data.error || `Content blocked due to safety policy violation (${data.category}).`;

    toast.error(message, { duration: 5000 });
    return true;
  }

  return false;
}
