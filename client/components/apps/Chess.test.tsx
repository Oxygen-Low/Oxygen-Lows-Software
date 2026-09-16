/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { ChessApp } from "./Chess";
import { LanguageProvider } from "@/contexts/LanguageContext";

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

beforeEach(() => {
  window.Element.prototype.getBoundingClientRect = () => ({
    width: 50,
    height: 50,
    top: 0,
    left: 0,
    bottom: 50,
    right: 50,
    x: 0,
    y: 0,
    toJSON: () => {},
  });
});

describe("ChessApp Component", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders ChessApp header, status, control buttons, and move history", () => {
    render(
      <LanguageProvider>
        <ChessApp />
      </LanguageProvider>,
    );

    expect(screen.getByText("Play vs AI")).toBeDefined();
    expect(screen.getByText("Status")).toBeDefined();
    expect(screen.getByText("Your Turn")).toBeDefined();
    expect(screen.getByText("White to move")).toBeDefined();
    expect(screen.getByRole("button", { name: /Play White/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Play Black/i })).toBeDefined();
    expect(screen.getByText("Move History")).toBeDefined();
    expect(screen.getByText("No moves yet")).toBeDefined();
  });

  it("handles clicking on squares and making a move", async () => {
    render(
      <LanguageProvider>
        <ChessApp />
      </LanguageProvider>,
    );

    // Initial state: White to move
    expect(screen.getByText("White to move")).toBeDefined();

    // Click e2 square to select pawn
    const e2Square = document.querySelector('[data-square="e2"]');
    if (e2Square) {
      fireEvent.click(e2Square);

      // Click e4 square to make move
      const e4Square = document.querySelector('[data-square="e4"]');
      if (e4Square) {
        fireEvent.click(e4Square);
      }
    }

    // AI thinking state or AI makes response after timer
    await act(async () => {
      vi.advanceTimersByTime(600);
    });
  });

  it("allows resetting game and playing as Black, triggering AI first move", async () => {
    render(
      <LanguageProvider>
        <ChessApp />
      </LanguageProvider>,
    );

    const playBlackBtn = screen.getByRole("button", { name: /Play Black/i });
    fireEvent.click(playBlackBtn);

    // Turn is now White (which is AI)
    expect(screen.getByText("AI Thinking...")).toBeDefined();

    // Advance timer to let AI make its move
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    // After AI plays White's move, it becomes Black's turn (Your Turn)
    await waitFor(() => {
      expect(screen.getByText("Your Turn")).toBeDefined();
      expect(screen.getByText("Black to move")).toBeDefined();
    });

    // Move history should contain the AI move (e.g. 1. e4 or d4 or Nf3 etc.)
    expect(screen.queryByText("No moves yet")).toBeNull();
  });

  it("resets move history and state when clicking Play White", async () => {
    render(
      <LanguageProvider>
        <ChessApp />
      </LanguageProvider>,
    );

    // Switch to Black to get 1 move from AI
    fireEvent.click(screen.getByRole("button", { name: /Play Black/i }));
    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByText("No moves yet")).toBeNull();

    // Reset to White
    fireEvent.click(screen.getByRole("button", { name: /Play White/i }));

    expect(screen.getByText("Your Turn")).toBeDefined();
    expect(screen.getByText("White to move")).toBeDefined();
    expect(screen.getByText("No moves yet")).toBeDefined();
  });
});
