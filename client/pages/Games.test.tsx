/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Games from "./Games";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe("Games Page", () => {
  it("renders Category Row 1 (Player Modes) and Category Row 2 (Genres) with counts", () => {
    render(
      <MemoryRouter initialEntries={["/games"]}>
        <Games />
      </MemoryRouter>,
    );

    // Page headers
    expect(screen.getByRole("heading", { name: "Games" })).toBeDefined();
    expect(
      screen.getByText("Play interactive and retro games built right into the browser!"),
    ).toBeDefined();

    // Row 1: Player Modes
    expect(screen.getByRole("region", { name: "Player Modes" })).toBeDefined();
    expect(screen.getByLabelText(/All Modes \(\d+ games\)/)).toBeDefined();
    expect(screen.getByLabelText(/Multiplayer \(\d+ games\)/)).toBeDefined();
    expect(screen.getByLabelText(/Singleplayer \(\d+ games\)/)).toBeDefined();

    // Row 2: Genres
    expect(screen.getByRole("region", { name: "Genres" })).toBeDefined();
    expect(screen.getByLabelText(/All Genres \(\d+ games\)/)).toBeDefined();
    expect(screen.getByLabelText(/Puzzle \(\d+ games\)/)).toBeDefined();
    expect(screen.getByLabelText(/Strategy \(\d+ games\)/)).toBeDefined();
    expect(screen.getByLabelText(/Card \(\d+ games\)/)).toBeDefined();
    expect(screen.getByLabelText(/Board \(\d+ games\)/)).toBeDefined();
    expect(screen.getByLabelText(/Casual \(\d+ games\)/)).toBeDefined();

    // Default games list
    expect(screen.getByText("Chess")).toBeDefined();
    expect(screen.getByText("Minesweeper")).toBeDefined();
    expect(screen.getByText("Solitaire")).toBeDefined();
    expect(screen.getByText("Texas Hold'em")).toBeDefined();
    expect(screen.getByText("Sudoku")).toBeDefined();
    expect(screen.getByText("Word Search")).toBeDefined();
  });

  it("filters games by player mode", () => {
    render(
      <MemoryRouter initialEntries={["/games"]}>
        <Games />
      </MemoryRouter>,
    );

    // Click Multiplayer (0 games)
    fireEvent.click(screen.getByLabelText(/Multiplayer \(\d+ games\)/));

    expect(screen.getByText("No games found matching the selected filters.")).toBeDefined();
    expect(screen.queryByText("Chess")).toBeNull();
    expect(screen.queryByText("Texas Hold'em")).toBeNull();

    // Click Singleplayer (all 6 games)
    fireEvent.click(screen.getByLabelText(/Singleplayer \(\d+ games\)/));

    expect(screen.getByText("Chess")).toBeDefined();
    expect(screen.getByText("Texas Hold'em")).toBeDefined();
    expect(screen.getByText("Minesweeper")).toBeDefined();
    expect(screen.getByText("Solitaire")).toBeDefined();
    expect(screen.getByText("Sudoku")).toBeDefined();
    expect(screen.getByText("Word Search")).toBeDefined();
  });

  it("filters games by genre", () => {
    render(
      <MemoryRouter initialEntries={["/games"]}>
        <Games />
      </MemoryRouter>,
    );

    // Click Card genre
    fireEvent.click(screen.getByLabelText(/Card \(\d+ games\)/));

    expect(screen.getByText("Solitaire")).toBeDefined();
    expect(screen.getByText("Texas Hold'em")).toBeDefined();
    expect(screen.queryByText("Chess")).toBeNull();
    expect(screen.queryByText("Minesweeper")).toBeNull();
  });

  it("handles combined filtering and resetting filters", () => {
    render(
      <MemoryRouter initialEntries={["/games"]}>
        <Games />
      </MemoryRouter>,
    );

    // Select Singleplayer and Strategy
    fireEvent.click(screen.getByLabelText(/Singleplayer \(\d+ games\)/));
    fireEvent.click(screen.getByLabelText(/Strategy \(\d+ games\)/));

    expect(screen.getByText("Chess")).toBeDefined();
    expect(screen.getByText("Minesweeper")).toBeDefined();
    expect(screen.getByText("Texas Hold'em")).toBeDefined();
    expect(screen.getByText("Sudoku")).toBeDefined();
    expect(screen.queryByText("Solitaire")).toBeNull();

    // Select Multiplayer while Strategy is active (0 results)
    fireEvent.click(screen.getByLabelText(/Multiplayer \(\d+ games\)/));
    expect(screen.getByText("No games found matching the selected filters.")).toBeDefined();

    // Clear filters button in empty state
    const clearBtns = screen.getAllByRole("button", { name: /Clear Filters/i });
    expect(clearBtns.length).toBeGreaterThan(0);
    fireEvent.click(clearBtns[0]);

    // All games should be back
    expect(screen.getByText("Chess")).toBeDefined();
    expect(screen.getByText("Minesweeper")).toBeDefined();
    expect(screen.getByText("Solitaire")).toBeDefined();
  });

  it("supports availability toggle in desktop mode", () => {
    render(
      <MemoryRouter initialEntries={["/games?desktop=1"]}>
        <Games />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Availability" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Web + desktop" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Desktop only" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Desktop only" }));
    expect(screen.getByText("No desktop-only games are available yet.")).toBeDefined();
  });

  it("navigates into a game when clicking a game card", () => {
    render(
      <MemoryRouter initialEntries={["/games"]}>
        <Routes>
          <Route path="/games" element={<Games />} />
          <Route path="/games/:appId" element={<Games />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText("Minesweeper"));
    expect(screen.getByRole("button", { name: "Back to games list" })).toBeDefined();
  });
});
