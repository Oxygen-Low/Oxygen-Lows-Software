// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SoftwareAwardsApp } from "./SoftwareAwards";
import { BrowserRouter } from "react-router-dom";
import React from "react";
import { LanguageProvider } from "@/contexts/LanguageContext";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "test-token" },
  }),
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
});
