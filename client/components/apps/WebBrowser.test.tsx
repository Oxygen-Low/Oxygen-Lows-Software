// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebBrowserApp } from "./WebBrowser";

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: string) => defaultVal || key,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("WebBrowserApp", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the browser home page with oxylow search", () => {
    render(<WebBrowserApp />);
    expect(screen.getByText("oxylow Browser")).toBeDefined();
    expect(screen.getByPlaceholderText(/Search with oxylow or enter URL/i)).toBeDefined();
    expect(screen.getByText("Oxygen Low's Software")).toBeDefined();
    expect(screen.getByText("Wikipedia")).toBeDefined();
  });

  it("allows adding and switching tabs", () => {
    render(<WebBrowserApp />);
    const addTabBtn = screen.getByTitle("New Tab");
    fireEvent.click(addTabBtn);

    const tabs = screen.getAllByText("New Tab");
    expect(tabs.length).toBeGreaterThanOrEqual(2);
  });
});
