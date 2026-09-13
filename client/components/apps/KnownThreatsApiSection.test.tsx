/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import { KnownThreatsApiSection } from "./KnownThreatsApiSection";

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, _vars?: any, fallback?: string) => fallback || key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

describe("KnownThreatsApiSection", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders the Known Threats API header, endpoint badges, and snippets", () => {
    render(<KnownThreatsApiSection />);
    expect(screen.getByText("Known Threats API")).toBeDefined();
    expect(screen.getAllByText(/oxygenlow\.com\/api\/webdefender\/known-threats/i).length).toBeGreaterThan(0);
    expect(screen.getByText("5,000 req/min · No Auth Required")).toBeDefined();
  });

  it("renders tabs and switches between cURL, JavaScript, and Python snippets", async () => {
    render(<KnownThreatsApiSection />);
    expect(screen.getByRole("tab", { name: /cURL/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /JavaScript/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Python/i })).toBeDefined();

    // Default tab is cURL
    expect(screen.getByText(/curl -X GET/i)).toBeDefined();

    // Switch to JavaScript tab
    const jsTab = screen.getByRole("tab", { name: /JavaScript/i });
    fireEvent.mouseDown(jsTab);
    fireEvent.click(jsTab);
    fireEvent.keyDown(jsTab, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText(/const res = await fetch/i)).toBeDefined();
    });

    // Switch to Python tab
    const pyTab = screen.getByRole("tab", { name: /Python/i });
    fireEvent.mouseDown(pyTab);
    fireEvent.click(pyTab);
    fireEvent.keyDown(pyTab, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText(/import requests/i)).toBeDefined();
    });
  });

  it("copies snippet to clipboard when clicking copy button", async () => {
    render(<KnownThreatsApiSection />);
    const copyBtns = screen.getAllByRole("button", { name: /Copy.*snippet/i });
    expect(copyBtns.length).toBeGreaterThan(0);

    fireEvent.click(copyBtns[0]);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
