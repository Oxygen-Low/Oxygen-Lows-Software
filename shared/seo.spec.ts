import { describe, it, expect } from "vitest";
import { getSeoMetadata, SEO_ROUTES } from "./seo.ts";

describe("getSeoMetadata", () => {
  it("returns exact match from SEO_ROUTES", () => {
    const result = getSeoMetadata("/");
    expect(result).toBeDefined();
    expect(result).toEqual(SEO_ROUTES["/"]);
    expect(result.path).toBe("/");
    expect(result.title).toContain("Oxygen Low's Software");
  });

  it("handles path sanitization with query strings", () => {
    const resultWithQuery = getSeoMetadata("/?test=123");
    const resultWithoutQuery = getSeoMetadata("/");

    expect(resultWithQuery).toEqual(resultWithoutQuery);
  });

  it("handles path sanitization with trailing slashes", () => {
    const resultWithSlash = getSeoMetadata("/apps/");
    const resultWithoutSlash = getSeoMetadata("/apps");

    expect(resultWithSlash).toEqual(resultWithoutSlash);
  });

  it("handles path sanitization with both trailing slashes and query strings", () => {
    const resultDirty = getSeoMetadata("/apps/?foo=bar");
    const resultClean = getSeoMetadata("/apps");

    expect(resultDirty).toEqual(resultClean);
  });

  it("resolves aliases correctly for webdefender", () => {
    const expected = SEO_ROUTES["/apps/webdefender"];

    expect(getSeoMetadata("/webdefender")).toEqual(expected);
    expect(getSeoMetadata("/defender")).toEqual(expected);
    expect(getSeoMetadata("/apps/defender")).toEqual(expected);
  });

  it("resolves alias correctly for public-assets", () => {
    const expected = SEO_ROUTES["/apps/public-characters"];
    expect(getSeoMetadata("/apps/public-assets")).toEqual(expected);
  });

  it("generates dynamic metadata for unrecognized app routes", () => {
    const appId = "my-custom-app";
    const result = getSeoMetadata(`/apps/${appId}`);

    expect(result.path).toBe(`/apps/${appId}`);
    expect(result.title).toBe("My Custom App - Oxygen Low's Software");
    expect(result.h1).toBe("My Custom App");
    expect(result.keywords).toContain(appId);
    expect(result.breadcrumbs).toHaveLength(3);
    expect(result.breadcrumbs[2].name).toBe("My Custom App");
    expect(result.breadcrumbs[2].url).toBe(`/apps/${appId}`);
  });

  it("generates dynamic metadata for unrecognized game routes", () => {
    const gameId = "epic-quest";
    const result = getSeoMetadata(`/games/${gameId}`);

    expect(result.path).toBe(`/games/${gameId}`);
    expect(result.title).toBe("Epic Quest - Games - Oxygen Low's Software");
    expect(result.h1).toBe("Epic Quest");
    expect(result.keywords).toContain(gameId);
    expect(result.breadcrumbs).toHaveLength(3);
    expect(result.breadcrumbs[2].name).toBe("Epic Quest");
    expect(result.breadcrumbs[2].url).toBe(`/games/${gameId}`);
  });

  it("returns fallback metadata for completely unrecognized routes", () => {
    const unknownPath = "/completely-unknown-route";
    const result = getSeoMetadata(unknownPath);

    expect(result.path).toBe(unknownPath);
    expect(result.title).toBe("Oxygen Low's Software");
    expect(result.canonicalPath).toBe(unknownPath);
    // Ensure it's not matching an exact route
    expect(SEO_ROUTES[unknownPath]).toBeUndefined();
  });
});
