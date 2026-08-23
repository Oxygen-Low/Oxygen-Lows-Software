// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePageTitle } from "./usePageTitle";

describe("usePageTitle hook", () => {
  let originalTitle = "";

  beforeEach(() => {
    originalTitle = document.title;
    document.title = "Oxygen Low's Software";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.remove();
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it("sets document title with default suffix when title is provided", () => {
    renderHook(() => usePageTitle("Storage"));
    expect(document.title).toBe("Storage - Oxygen Low's Software");
  });

  it("sets document title to app name when title is null or empty", () => {
    renderHook(() => usePageTitle(""));
    expect(document.title).toBe("Oxygen Low's Software");

    renderHook(() => usePageTitle(null));
    expect(document.title).toBe("Oxygen Low's Software");
  });

  it("does not duplicate suffix if title already ends with app name", () => {
    renderHook(() => usePageTitle("Custom Page - Oxygen Low's Software"));
    expect(document.title).toBe("Custom Page - Oxygen Low's Software");
  });

  it("supports exact mode", () => {
    renderHook(() => usePageTitle("Custom Raw Title", { exact: true }));
    expect(document.title).toBe("Custom Raw Title");
  });

  it("updates meta description and og/twitter tags when description is provided", () => {
    renderHook(() =>
      usePageTitle("Apps", { description: "Explore the app store." })
    );
    expect(document.title).toBe("Apps - Oxygen Low's Software");

    const descMeta = document.querySelector('meta[name="description"]');
    expect(descMeta?.getAttribute("content")).toBe("Explore the app store.");

    const ogTitle = document.querySelector('meta[property="og:title"]');
    expect(ogTitle?.getAttribute("content")).toBe("Apps - Oxygen Low's Software");

    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    expect(twitterDesc?.getAttribute("content")).toBe("Explore the app store.");
  });
});
