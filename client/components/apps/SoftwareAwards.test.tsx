// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SoftwareAwardsApp } from "./SoftwareAwards";
import { BrowserRouter } from "react-router-dom";
import React from "react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    session: { access_token: "test-token" },
  })),
}));

const mockAwards = [
  {
    id: "award-1",
    title: "Best Browser",
    description: "Which is the best browser?",
    rewardName: "Best Browser Award",
    options: [
      { value: "Firefox", defaultLabel: "Firefox" },
      { value: "Chrome", defaultLabel: "Chrome" },
    ],
    isActive: true,
    hasVoted: false,
    currentMonthKey: "2026-05",
  },
];

global.fetch = vi.fn((url: string) => {
  if (url === "/api/software-awards") {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ awards: mockAwards }),
    });
  }
  if (url.includes("/vote")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
  }
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve({ error: "Not found" }),
  });
}) as any;

describe("SoftwareAwardsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders awards and allows voting", async () => {
    render(
      <LanguageProvider>
        <BrowserRouter>
          <SoftwareAwardsApp />
        </BrowserRouter>
      </LanguageProvider>,
    );

    const awardTitle = await screen.findByText("Best Browser");
    expect(awardTitle).toBeDefined();

    // Click vote now
    fireEvent.click(screen.getByText("Vote Now"));

    // Check if options are rendered
    const optionFirefox = await screen.findByText("Firefox");
    expect(optionFirefox).toBeDefined();

    // Select option
    fireEvent.click(screen.getByText("Firefox"));

    // Submit
    fireEvent.click(screen.getByText("Submit Vote"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/software-awards/award-1/vote",
        expect.any(Object),
      );
    });
  });

  it("resolves overlapping requests in reverse order while preserving only the latest result", async () => {
    let resolve1: any;
    const fetchDeferred1 = new Promise((r) => { resolve1 = r; });

    let resolve2: any;
    const fetchDeferred2 = new Promise((r) => { resolve2 = r; });

    let fetchCount = 0;
    (global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/software-awards") {
        fetchCount++;
        const currentCount = fetchCount;
        if (currentCount === 1) {
          return fetchDeferred1.then(() => {
            if (init?.signal?.aborted) {
              return Promise.reject(new DOMException("Aborted", "AbortError"));
            }
            return {
              ok: true,
              json: () => Promise.resolve({ awards: [{ ...mockAwards[0], title: "First Request Award" }] }),
            };
          });
        }
        if (currentCount === 2) {
          return fetchDeferred2.then(() => {
            if (init?.signal?.aborted) {
              return Promise.reject(new DOMException("Aborted", "AbortError"));
            }
            return {
              ok: true,
              json: () => Promise.resolve({ awards: [{ ...mockAwards[0], title: "Second Request Award" }] }),
            };
          });
        }
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: "Not found" }),
      });
    });

    const { rerender } = render(
      <LanguageProvider>
        <BrowserRouter>
          <SoftwareAwardsApp />
        </BrowserRouter>
      </LanguageProvider>
    );

    // Initial effect fired fetch 1.
    expect(fetchCount).toBe(1);

    // Change mock token to trigger a re-render and fetch 2.
    (useAuth as any).mockReturnValue({
      session: { access_token: "test-token-2" },
    });

    rerender(
      <LanguageProvider>
        <BrowserRouter>
          <SoftwareAwardsApp />
        </BrowserRouter>
      </LanguageProvider>
    );

    expect(fetchCount).toBe(2);

    // Resolve in reverse order: request 2, then request 1
    resolve2(undefined);
    await waitFor(() => {
      expect(screen.queryByText("Second Request Award")).not.toBeNull();
    });

    resolve1(undefined);

    // Wait to ensure request 1 didn't overwrite request 2
    await new Promise((r) => setTimeout(r, 100));

    expect(screen.queryByText("First Request Award")).toBeNull();
    expect(screen.queryByText("Second Request Award")).not.toBeNull();
  });
});
