import { describe, it, expect } from "vitest";
import { getCountryCode, CDN_COUNTRY_HEADERS } from "./geo.js";
import { DefenderClient } from "../webdefender.js";

describe("getCountryCode (CDN Headers)", () => {
  it("should return null for undefined, null, or empty headers", () => {
    expect(getCountryCode(undefined)).toBeNull();
    expect(getCountryCode(null)).toBeNull();
    expect(getCountryCode({})).toBeNull();
  });

  it("should extract country from Cloudflare cf-ipcountry header", () => {
    expect(getCountryCode({ "cf-ipcountry": "US" })).toBe("US");
    expect(getCountryCode({ "cf-ipcountry": "gb" })).toBe("GB");
    expect(getCountryCode({ "CF-IPCountry": "DE" })).toBe("DE");
  });

  it("should extract country from Vercel x-vercel-ip-country header", () => {
    expect(getCountryCode({ "x-vercel-ip-country": "FR" })).toBe("FR");
    expect(getCountryCode({ "X-Vercel-IP-Country": "ca" })).toBe("CA");
  });

  it("should extract country from AWS CloudFront cloudfront-viewer-country header", () => {
    expect(getCountryCode({ "cloudfront-viewer-country": "JP" })).toBe("JP");
    expect(getCountryCode({ "CloudFront-Viewer-Country": "AU" })).toBe("AU");
  });

  it("should extract country from Fastly x-country-code and fastly-client-ip-country headers", () => {
    expect(getCountryCode({ "x-country-code": "BR" })).toBe("BR");
    expect(getCountryCode({ "fastly-client-ip-country": "IT" })).toBe("IT");
  });

  it("should extract country from Netlify/GCP x-country header", () => {
    expect(getCountryCode({ "x-country": "ES" })).toBe("ES");
    expect(getCountryCode({ "X-Country": "nl" })).toBe("NL");
  });

  it("should extract country from generic GeoIP headers", () => {
    expect(getCountryCode({ "x-geoip-country-code": "SE" })).toBe("SE");
    expect(getCountryCode({ "x-geoip-country": "NO" })).toBe("NO");
    expect(getCountryCode({ "x-geo-country": "FI" })).toBe("FI");
  });

  it("should extract country from Akamai, Azure, and App Engine headers", () => {
    expect(getCountryCode({ "akamai-country-code": "IE" })).toBe("IE");
    expect(getCountryCode({ "x-azure-fd-country": "CH" })).toBe("CH");
    expect(getCountryCode({ "x-appengine-country": "NZ" })).toBe("NZ");
  });

  it("should handle array header values", () => {
    expect(getCountryCode({ "cf-ipcountry": ["US", "CA"] })).toBe("US");
    expect(getCountryCode({ "x-country-code": ["DE"] })).toBe("DE");
  });

  it("should handle comma-separated values", () => {
    expect(getCountryCode({ "cf-ipcountry": "GB, US" })).toBe("GB");
    expect(getCountryCode({ "x-vercel-ip-country": "FR, DE" })).toBe("FR");
  });

  it("should support Headers instance (Fetch API)", () => {
    const headers = new Headers();
    headers.set("cf-ipcountry", "CA");
    expect(getCountryCode(headers)).toBe("CA");
  });

  it("should support request-like wrapper objects", () => {
    expect(getCountryCode({ headers: { "cf-ipcountry": "MX" } })).toBe("MX");
  });

  it("should handle invalid or placeholder country codes", () => {
    expect(getCountryCode({ "cf-ipcountry": "UNKNOWN" })).toBeNull();
    expect(getCountryCode({ "cf-ipcountry": "" })).toBeNull();
    expect(getCountryCode({ "cf-ipcountry": "1" })).toBeNull();
    expect(getCountryCode({ "cf-ipcountry": "USA" })).toBeNull();
  });
});

describe("DefenderClient Geo Blocking via CDN Headers", () => {
  it("should block request when CDN header country matches blockCountries", async () => {
    const client = new DefenderClient({
      apiKey: "test_key",
      offlineMode: true,
    });

    (client as any).appConfig = {
      blockModeEnabled: true,
      blockCountries: ["CN", "RU"],
      blockIps: [],
      adminBannedIps: [],
      routes: [],
    };

    // Request from US (allowed)
    const resUs = await client.handleRequest({
      ip: "1.2.3.4",
      method: "GET",
      path: "/api/data",
      query: {},
      body: "",
      headers: { "cf-ipcountry": "US" },
      userAgent: "Mozilla/5.0",
    });
    expect(resUs.blocked).toBe(false);

    // Request from RU via Cloudflare (blocked)
    const resRu = await client.handleRequest({
      ip: "5.6.7.8",
      method: "GET",
      path: "/api/data",
      query: {},
      body: "",
      headers: { "cf-ipcountry": "RU" },
      userAgent: "Mozilla/5.0",
    });
    expect(resRu.blocked).toBe(true);
    expect(resRu.eventType).toBe("country_block");
    expect(resRu.reason).toBe("Country blocked: RU");

    // Request from CN via AWS CloudFront (blocked)
    const resCn = await client.handleRequest({
      ip: "9.10.11.12",
      method: "GET",
      path: "/api/data",
      query: {},
      body: "",
      headers: { "cloudfront-viewer-country": "CN" },
      userAgent: "Mozilla/5.0",
    });
    expect(resCn.blocked).toBe(true);
    expect(resCn.eventType).toBe("country_block");
    expect(resCn.reason).toBe("Country blocked: CN");

    // Request without CDN headers (allowed)
    const resNoHeader = await client.handleRequest({
      ip: "9.10.11.12",
      method: "GET",
      path: "/api/data",
      query: {},
      body: "",
      headers: {},
      userAgent: "Mozilla/5.0",
    });
    expect(resNoHeader.blocked).toBe(false);

    client.destroy();
  });
});
