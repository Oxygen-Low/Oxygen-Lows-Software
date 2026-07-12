/** @vitest-environment jsdom */
import { render, screen, cleanup } from "@testing-library/react";
import { PointsDisplay } from "./PointsDisplay";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("@/hooks/useAuth");
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({
          data: { user: { id: "test-user" } },
          error: null,
        }),
      getSession: vi
        .fn()
        .mockResolvedValue({
          data: { session: { user: { id: "test-user" } } },
          error: null,
        }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
  getAuthenticatedClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      })),
    })),
  })),
}));

describe("PointsDisplay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders points when available", async () => {
    (useAuth as any).mockReturnValue({
      session: { user: { id: "test-user" } },
    });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { points: 500 }, error: null }),
    });
    (supabase.channel as any).mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    });

    render(<PointsDisplay />);

    const pointsElement = await screen.findByText("500");
    expect(pointsElement).toBeDefined();
  });

  it("does not render when points are null", () => {
    (useAuth as any).mockReturnValue({ session: null });
    render(<PointsDisplay />);
    expect(screen.queryByText("Points")).toBeNull();
  });
});
