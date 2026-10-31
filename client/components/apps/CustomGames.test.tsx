// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import React from "react";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { CustomGamesApp } from "./CustomGames";
import { CustomGameRecord } from "@shared/customGames";
import * as authHook from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth");

describe("CustomGamesApp", () => {
  const mockGames: CustomGameRecord[] = [
    {
      id: "game_star_patrol",
      title: "Star Patrol",
      description: "Space defender arcade game.",
      genre: "Action",
      dimension: "2d",
      code: "<!DOCTYPE html><html><body>Canvas</body></html>",
      achievements: [
        {
          id: "first_star",
          title: "First Cadet Star",
          description: "Destroy first target.",
          points: 10,
        },
      ],
      creatorId: "1",
      creatorUsername: "oxygenlow",
      plays: 12,
      likes: 4,
      tags: ["space", "arcade"],
      createdAt: "2026-10-28T12:00:00.000Z",
      updatedAt: "2026-10-28T12:00:00.000Z",
    },
    {
      id: "game_cyber_maze",
      title: "Cyber Maze 3D",
      description: "3D synth labyrinth.",
      genre: "Puzzle",
      dimension: "3d",
      code: "<!DOCTYPE html><html><body>Canvas 3D</body></html>",
      achievements: [],
      creatorId: "1",
      creatorUsername: "oxygenlow",
      plays: 8,
      likes: 3,
      tags: ["maze", "3d"],
      createdAt: "2026-10-28T12:05:00.000Z",
      updatedAt: "2026-10-28T12:05:00.000Z",
    },
  ];

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

  it("renders empty state without preset or template games when no games exist", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      if (String(url).includes("/api/custom-games")) {
        return new Response(JSON.stringify({ games: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    renderApp();
    expect(screen.getByText("Custom Games")).toBeTruthy();
    expect(screen.queryByText("Ember Ring")).toBeNull();
    expect(screen.queryByText("Neon Asteroid Blaster")).toBeNull();
    expect(screen.queryByText("Cyber Runner 3D")).toBeNull();

    await waitFor(() => {
      expect(
        screen.getByText(/No custom games published yet/i),
      ).toBeTruthy();
    });
  });

  it("renders custom games and filters them via search query", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      if (String(url).includes("/api/custom-games")) {
        return new Response(JSON.stringify({ games: mockGames }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Star Patrol")).toBeTruthy();
      expect(screen.getByText("Cyber Maze 3D")).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(
      /Search games, genres, or creators/i,
    );
    fireEvent.change(searchInput, { target: { value: "Cyber Maze" } });

    expect(screen.getByText("Cyber Maze 3D")).toBeTruthy();
    expect(screen.queryByText("Star Patrol")).toBeNull();
  });

  it("opens the instant popup play modal when clicking a game card", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any) => {
      if (String(url).includes("/api/custom-games")) {
        return new Response(JSON.stringify({ games: mockGames }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });

    renderApp();

    await waitFor(() => {
      expect(screen.getByText("Star Patrol")).toBeTruthy();
    });

    const gameTitle = screen.getByText("Star Patrol");
    fireEvent.click(gameTitle);

    await waitFor(() => {
      expect(screen.getByTitle("Star Patrol")).toBeTruthy();
      expect(screen.getByText(/First Cadet Star/i)).toBeTruthy();
    });
  });
});
