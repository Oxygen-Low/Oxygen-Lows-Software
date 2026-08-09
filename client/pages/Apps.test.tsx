/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Apps from "./Apps";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

  it("hides the desktop-only filter in the browser catalogue", () => {
    render(
      <MemoryRouter initialEntries={["/apps"]}>
        <Apps />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: "Availability" })).toBeNull();
    expect(screen.getByText("Chatbot")).toBeDefined();
    expect(screen.getByText("File Compressor")).toBeDefined();
  });
});
