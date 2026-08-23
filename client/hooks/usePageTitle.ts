import { useEffect } from "react";

export interface UsePageTitleOptions {
  description?: string;
  exact?: boolean;
  canonical?: string;
}

const APP_NAME = "Oxygen Low's Software";
const DEFAULT_ORIGIN = "https://oxygenlow.com";

function setOrUpdateMeta(
  selector: string,
  attributeName: string,
  attributeValue: string,
  content: string,
) {
  if (typeof document === "undefined") return;
  let element = document.querySelector(selector) as HTMLMetaElement | null;
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attributeName, attributeValue);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function setOrUpdateLink(rel: string, href: string) {
  if (typeof document === "undefined") return;
  let link = document.querySelector(
    `link[rel="${rel}"]`,
  ) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", rel);
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
}

/**
 * Hook to manage page title and SEO meta tags dynamically on the client.
 * Formats title as: `<Title> - Oxygen Low's Software` (or exact title if exact=true).
 * Automatically maintains canonical URL, OpenGraph, and Twitter tags.
 */
export function usePageTitle(
  title?: string | null,
  options?: UsePageTitleOptions,
) {
  const description = options?.description;
  const exact = options?.exact;
  const canonical = options?.canonical;

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

    // Determine current canonical URL
    let currentCanonical = canonical;
    if (!currentCanonical && typeof window !== "undefined") {
      const origin =
        window.location.origin.includes("localhost") ||
        window.location.origin.includes("127.0.0.1")
          ? DEFAULT_ORIGIN
          : window.location.origin;
      const cleanPath = window.location.pathname.replace(/\/+$/, "") || "/";
      currentCanonical = `${origin}${cleanPath === "/" ? "" : cleanPath}`;
    }

    if (currentCanonical) {
      setOrUpdateLink("canonical", currentCanonical);
      setOrUpdateMeta(
        'meta[property="og:url"]',
        "property",
        "og:url",
        currentCanonical,
      );
      setOrUpdateMeta(
        'meta[name="twitter:url"]',
        "name",
        "twitter:url",
        currentCanonical,
      );
    }

    // Update Open Graph and Twitter title & site_name tags
    setOrUpdateMeta(
      'meta[property="og:site_name"]',
      "property",
      "og:site_name",
      APP_NAME,
    );
    setOrUpdateMeta(
      'meta[property="og:title"]',
      "property",
      "og:title",
      formattedTitle,
    );
    setOrUpdateMeta(
      'meta[name="twitter:title"]',
      "name",
      "twitter:title",
      formattedTitle,
    );

    // Update meta description if provided
    if (description && description.trim().length > 0) {
      const trimmedDesc = description.trim();
      setOrUpdateMeta(
        'meta[name="description"]',
        "name",
        "description",
        trimmedDesc,
      );
      setOrUpdateMeta(
        'meta[property="og:description"]',
        "property",
        "og:description",
        trimmedDesc,
      );
      setOrUpdateMeta(
        'meta[name="twitter:description"]',
        "name",
        "twitter:description",
        trimmedDesc,
      );
    }
  }, [title, description, exact, canonical]);
}

export default usePageTitle;
