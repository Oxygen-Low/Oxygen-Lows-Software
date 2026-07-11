/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Account from "./Account";
import { useAuth } from "@/hooks/useAuth";

// Full mock of Supabase
vi.mock("@/lib/supabase", () => ({
  getAuthenticatedClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      })),
    })),
  })),
  supabase: {
    auth: {
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "u", identities: [] } } }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "u" }, access_token: "t" } },
        error: null,
      }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn((table) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        single: vi.fn(() => {
          if (table === "user_preferences")
            return Promise.resolve({
              data: { theme: "default", use_gradient: true },
              error: null,
            });
          return Promise.resolve({ data: null, error: null });
        }),
        upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        delete: vi.fn(() => Promise.resolve({ data: null, error: null })),
      };
      return builder;
    }),
    rpc: vi.fn((name) => {
      if (name === "get_my_integrations")
        return Promise.resolve({ data: [], error: null });
      if (name === "upsert_user_preferences")
        return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: [], error: null });
    }),
    storage: {
      from: vi.fn().mockReturnThis(),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "" } }),
      upload: vi.fn().mockResolvedValue({ data: { path: "" } }),
      remove: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

// Mock Radix UI Tabs to always render children
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

describe("Account Component", () => {
  const mockLinkIdentity = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "e@e.com" } },
      linkIdentity: mockLinkIdentity,
    });
  });

  it("links identities correctly", async () => {
    render(<Account />);
    const githubBtn = await screen.findByText(/github/i);
    fireEvent.click(githubBtn);
    await waitFor(() =>
      expect(mockLinkIdentity).toHaveBeenCalledWith("github"),
    );

    const gitlabBtn = await screen.findByText(/gitlab/i);
    fireEvent.click(gitlabBtn);
    await waitFor(() =>
      expect(mockLinkIdentity).toHaveBeenCalledWith("gitlab"),
    );
  });

  it("renders with correct header", async () => {
    render(<Account />);
    const headers = screen.getAllByText("Your Account", { selector: "h1" });
    expect(headers.length).toBeGreaterThan(0);
  });
});
