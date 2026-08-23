import { useEffect } from "react";

export interface UsePageTitleOptions {
  description?: string;
  exact?: boolean;
}

const APP_NAME = "Oxygen Low's Software";

function setOrUpdateMeta(selector: string, attributeName: string, attributeValue: string, content: string) {
  if (typeof document === "undefined") return;
  let element = document.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

/**
 * Hook to manage page title and SEO meta tags dynamically.
 * Formats title as: `<Title> - Oxygen Low's Software` (or exact title if exact=true).
 */
export function usePageTitle(title?: string | null, options?: UsePageTitleOptions) {
  const description = options?.description;
  const exact = options?.exact;

  useEffect(() => {
    if (typeof document === "undefined") return;

    let formattedTitle = APP_NAME;
    if (title && title.trim().length > 0) {
      const trimmed = title.trim();
      if (exact || trimmed.endsWith(APP_NAME)) {
        formattedTitle = trimmed;
      } else {
        formattedTitle = `${trimmed} - ${APP_NAME}`;
      }
    }

    document.title = formattedTitle;

    // Update Open Graph and Twitter title tags
    setOrUpdateMeta('meta[property="og:title"]', "property", "og:title", formattedTitle);
    setOrUpdateMeta('meta[name="twitter:title"]', "name", "twitter:title", formattedTitle);

    // Update meta description if provided
    if (description && description.trim().length > 0) {
      const trimmedDesc = description.trim();
      setOrUpdateMeta('meta[name="description"]', "name", "description", trimmedDesc);
      setOrUpdateMeta('meta[property="og:description"]', "property", "og:description", trimmedDesc);
      setOrUpdateMeta('meta[name="twitter:description"]', "name", "twitter:description", trimmedDesc);
    }
  }, [title, description, exact]);
}

export default usePageTitle;
