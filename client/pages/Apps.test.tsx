/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Apps from "./Apps";
import { GameLibraryApp } from "@/components/apps/GameLibrary";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/desktopBridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/desktopBridge")>();
  return {
    ...actual,
    isDesktopBridgeAvailable: vi.fn(() => false),
    scanInstalledGames: vi.fn(async () => []),
    launchGame: vi.fn(async () => ({ success: true })),
    pickGameExecutable: vi.fn(async () => null),
    getGameIcon: vi.fn(async () => ({ iconDataUrl: "" })),
    getRunningGames: vi.fn(async () => ({ runningGames: [] })),
    setupGameBridgeListeners: vi.fn(() => () => {}),
    addPushEventListener: vi.fn(() => () => {}),
  };
});

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Apps", () => {
  it("shows the current catalogue and category counts in desktop mode", () => {
    render(
      <MemoryRouter initialEntries={["/apps?desktop=1"]}>
        <Apps />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Availability" })).toBeDefined();
    expect(screen.getByLabelText(/All \(\d+ apps\)/)).toBeDefined();
    expect(screen.getByLabelText(/LLM\/AI \(\d+ apps\)/)).toBeDefined();
    expect(screen.getByLabelText(/Utility \(\d+ apps\)/)).toBeDefined();
    expect(screen.getByText("Chatbot")).toBeDefined();
    expect(screen.getByText("File Compressor")).toBeDefined();
    expect(screen.getByText("Game Library")).toBeDefined();
  });

  it("filters the catalogue by category and desktop availability", () => {
    render(
      <MemoryRouter initialEntries={["/apps?desktop=1"]}>
        <Apps />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText(/LLM\/AI \(\d+ apps\)/));
    expect(screen.getByText("Chatbot")).toBeDefined();
    expect(screen.queryByText("File Compressor")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Desktop only" }));
    expect(screen.getByText("LLM Agent")).toBeDefined();
    expect(screen.queryByText("Chatbot")).toBeNull();
    // Verify the badge counts updated
    expect(screen.getByLabelText(/LLM\/AI \(1 apps\)/)).toBeDefined();
  });

  it("hides desktop-only apps (like Game Library) in the browser catalogue", () => {
    render(
      <MemoryRouter initialEntries={["/apps"]}>
        <Apps />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: "Availability" })).toBeNull();
    expect(screen.getByText("Chatbot")).toBeDefined();
    expect(screen.getByText("File Compressor")).toBeDefined();
    expect(screen.queryByText("Game Library")).toBeNull();
  });

  it("renders Web Defender app when navigating to /apps/webdefender", async () => {
    render(
      <MemoryRouter initialEntries={["/apps/webdefender"]}>
        <Apps />
      </MemoryRouter>,
    );

    const elements = await screen.findAllByText(/Web Defender/i);
    expect(elements.length).toBeGreaterThan(0);
  });

  it("renders Game Library app when navigating to /apps/game-library", async () => {
    render(
      <MemoryRouter initialEntries={["/apps/game-library?desktop=1"]}>
        <Routes>
          <Route path="/apps/:appId" element={<Apps />} />
        </Routes>
      </MemoryRouter>,
    );

    const elements = await screen.findAllByText(
      /Game Library|Desktop App Required/i,
      {},
      { timeout: 10000 },
    );
    expect(elements.length).toBeGreaterThan(0);
  });

  it("renders search bar and filters apps dynamically", () => {
    render(
      <MemoryRouter initialEntries={["/apps"]}>
        <Apps />
      </MemoryRouter>,
    );

    const searchInput = screen.getByRole("searchbox");
    expect(searchInput).toBeDefined();
    expect(searchInput.getAttribute("placeholder")).toBe("Search apps...");

    // Filter by name
    fireEvent.change(searchInput, { target: { value: "base64" } });
    expect(screen.getByText("Base64 Encoder/Decoder")).toBeDefined();
    expect(screen.queryByText("Chatbot")).toBeNull();

    // Clear search with inline X button
    const clearBtn = screen.getByLabelText("Clear search");
    fireEvent.click(clearBtn);
    expect(screen.getByText("Chatbot")).toBeDefined();
    expect(screen.getByText("Base64 Encoder/Decoder")).toBeDefined();
  });

  it("displays empty state when no apps match query and allows resetting search", () => {
    render(
      <MemoryRouter initialEntries={["/apps"]}>
        <Apps />
      </MemoryRouter>,
    );

    const searchInput = screen.getByRole("searchbox");
    fireEvent.change(searchInput, {
      target: { value: "nonexistentappxyz123" },
    });

    expect(
      screen.getByText('No apps found matching "nonexistentappxyz123".'),
    ).toBeDefined();

    const resetButtons = screen.getAllByRole("button", { name: "Clear search" });
    expect(resetButtons.length).toBe(2);
    fireEvent.click(resetButtons[1]);

    expect(screen.getByText("Chatbot")).toBeDefined();
    expect(screen.getByText("File Compressor")).toBeDefined();
  });
});
