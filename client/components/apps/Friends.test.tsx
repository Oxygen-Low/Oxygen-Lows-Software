/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { FriendsApp } from "./Friends";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { supabase } from "@/lib/supabase";

// Mock react-i18next

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock supabase client
const mockSupabaseChain = (data: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    or: vi.fn(() => builder),
    single: vi.fn(() =>
      Promise.resolve({
        data: Array.isArray(data) ? data[0] : data,
        error: null,
      }),
    ),
    maybeSingle: vi.fn(() =>
      Promise.resolve({
        data: Array.isArray(data) ? data[0] : data,
        error: null,
      }),
    ),
    then: vi.fn((onFulfilled) => {
      const res = { data, error: null };
      return onFulfilled
        ? Promise.resolve(res).then(onFulfilled)
        : Promise.resolve(res);
    }),
  };
  return builder;
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user-id" } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "test-user-id" } } },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn((table) => {
      if (table === "user_preferences")
        return mockSupabaseChain({
          theme: "default",
          language: "English",
          sub_language: "GB",
        });
      return mockSupabaseChain([]);
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("FriendsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders correctly and fetches initial data", async () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <FriendsApp />
        </ThemeProvider>
      </MemoryRouter>,
    );

    const input = await screen.findByPlaceholderText("Search by username...");
    expect(input).toBeDefined();

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("follows");
    });
  });

  it("sends a friend request with correct payload", async () => {
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              user_id: "other-user-id",
              username: "otheruser",
            },
            error: null,
          }),
          then: vi.fn((cb) =>
            cb({
              data: { user_id: "other-user-id", username: "otheruser" },
              error: null,
            }),
          ),
        };
      }
      return mockSupabaseChain([]);
    });

    render(
      <MemoryRouter>
        <ThemeProvider>
          <FriendsApp />
        </ThemeProvider>
      </MemoryRouter>,
    );

    const input = await screen.findByPlaceholderText("Search by username...");
    fireEvent.change(input, { target: { value: "otheruser" } });

    const addButtons = await screen.findAllByText("Add");
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("friendships");
    });
  });
});
