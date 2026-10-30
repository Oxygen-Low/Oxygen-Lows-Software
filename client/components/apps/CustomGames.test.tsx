// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CustomGamesApp } from "./CustomGames";
import * as authHook from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth");

describe("CustomGamesApp", () => {
  beforeEach(() => {
    vi.spyOn(authHook, "useAuth").mockReturnValue({
      session: {
        access_token: "test-token",
        token_type: "bearer",
        user: { id: "1", username: "oxygenlow", role: "admin" },
      } as any,
      loading: false,
      signOut: vi.fn(),
    } as any);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      if (String(url).includes("/api/custom-games")) {
        return new Response(JSON.stringify({ games: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const renderApp = () =>
    render(
      <LanguageProvider>
        <BrowserRouter>
          <CustomGamesApp />
        </BrowserRouter>
      </LanguageProvider>,
    );

  it("renders minimalist game grid and filters games via search", () => {
    renderApp();
    expect(screen.getByText("Custom Games")).toBeTruthy();
    expect(screen.getByText("Ember Ring")).toBeTruthy();
    expect(screen.getByText("Neon Asteroid Blaster")).toBeTruthy();
    expect(screen.getByText("Cyber Runner 3D")).toBeTruthy();

    const searchInput = screen.getByPlaceholderText(
      /Search games, genres, or creators/i,
    );
    fireEvent.change(searchInput, { target: { value: "Cyber Runner" } });

    expect(screen.getByText("Cyber Runner 3D")).toBeTruthy();
    expect(screen.queryByText("Ember Ring")).toBeNull();
  });

  it("opens the instant popup play modal when clicking a game card", async () => {
    renderApp();
    const gameTitle = screen.getByText("Ember Ring");
    fireEvent.click(gameTitle);

    await waitFor(() => {
      expect(screen.getByTitle("Ember Ring")).toBeTruthy();
      expect(screen.getByText(/Spark of Warmth/i)).toBeTruthy();
    });
  });
});
