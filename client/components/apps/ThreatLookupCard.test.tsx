/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import { ThreatLookupCard } from "./ThreatLookupCard";

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, _vars?: any, fallback?: string) => fallback || key,
  }),
}));

describe("ThreatLookupCard", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders input, submit button, and headers", () => {
    render(<ThreatLookupCard />);
    expect(screen.getByText("Threat Intelligence Lookup")).toBeDefined();
    expect(screen.getByPlaceholderText(/Enter IPv4 or IPv6 address/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Check Threat Status/i })).toBeDefined();
  });

  it("shows error when trying to submit an empty input", async () => {
    render(<ThreatLookupCard />);
    const submitBtn = screen.getByRole("button", { name: /Check Threat Status/i });
    // Button is disabled when input is empty
    expect((submitBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it("queries the API and displays clean IP results", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ip: "8.8.8.8",
        is_known_threat: false,
        is_tor: false,
        is_vpn: false,
        details: {
          banned: false,
          banned_reason: null,
          threat_actor: false,
          threat_category: null,
        },
      }),
    });

    render(<ThreatLookupCard />);
    const input = screen.getByPlaceholderText(/Enter IPv4 or IPv6 address/i);
    fireEvent.change(input, { target: { value: "8.8.8.8" } });

    const submitBtn = screen.getByRole("button", { name: /Check Threat Status/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/webdefender/known-threats?ip=8.8.8.8");
      expect(screen.getByText("Clean IP - No Threats Detected")).toBeDefined();
      expect(screen.getByText("Not a TOR Exit Node")).toBeDefined();
      expect(screen.getByText("Not a Known VPN")).toBeDefined();
    });
  });

  it("displays threat detected badge and details for malicious IPs", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ip: "192.0.2.100",
        is_known_threat: true,
        is_tor: true,
        is_vpn: true,
        details: {
          banned: true,
          banned_reason: "Malicious credential brute force",
          threat_actor: true,
          threat_category: "bruteforce",
        },
      }),
    });

    render(<ThreatLookupCard />);
    const input = screen.getByPlaceholderText(/Enter IPv4 or IPv6 address/i);
    fireEvent.change(input, { target: { value: "192.0.2.100" } });

    const submitBtn = screen.getByRole("button", { name: /Check Threat Status/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Known Threat Detected")).toBeDefined();
      expect(screen.getByText("Malicious credential brute force")).toBeDefined();
      expect(screen.getByText("bruteforce")).toBeDefined();
    });
  });

  it("handles API error responses gracefully", async () => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "Invalid IP address format" }),
    });

    render(<ThreatLookupCard />);
    const input = screen.getByPlaceholderText(/Enter IPv4 or IPv6 address/i);
    fireEvent.change(input, { target: { value: "invalid-ip" } });

    const submitBtn = screen.getByRole("button", { name: /Check Threat Status/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Invalid IP address format")).toBeDefined();
    });
  });
});
