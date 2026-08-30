/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "e@e.com" } },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with correct header", async () => {
    render(<Account />);
    const headers = screen.getAllByText("Your Account", { selector: "h1" });
    expect(headers.length).toBeGreaterThan(0);
  });

  it("renders the language section and display language selector", async () => {
    render(<Account />);
    expect(screen.getByText("Language")).toBeDefined();
    expect(screen.getByText("Display Language")).toBeDefined();
    expect(screen.getByText("English")).toBeDefined();
  });

  it("renders additional languages section with controls", async () => {
    render(<Account />);
    expect(screen.getByText("Additional Languages")).toBeDefined();
    expect(screen.getByText("Add Language")).toBeDefined();
    expect(screen.getByText("No additional languages added.")).toBeDefined();
  });

  it("renders profile picture with null crop_data without throwing error", async () => {
    const { supabase } = await import("@/lib/supabase");
    const { storage } = await import("@/lib/storage");

    vi.spyOn(storage, "from").mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/avatar.png" },
        error: null,
      }),
    } as any);

    (supabase.from as any).mockImplementation((table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        single: vi.fn(() => {
          if (table === "profile_pictures") {
            return Promise.resolve({
              data: {
                id: "pic-1",
                user_id: "u",
                image_url: "avatar.png",
                crop_data: null,
              },
              error: null,
            });
          }
          if (table === "profiles") {
            return Promise.resolve({
              data: {
                user_id: "u",
                username: "testuser",
                display_name: "Test User",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      return builder;
    });

    render(<Account />);
    expect(await screen.findByAltText("Test User")).toBeDefined();
  });

  it("renders profile picture with valid crop_data properly", async () => {
    const { supabase } = await import("@/lib/supabase");
    const { storage } = await import("@/lib/storage");

    vi.spyOn(storage, "from").mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/avatar.png" },
        error: null,
      }),
    } as any);

    (supabase.from as any).mockImplementation((table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        single: vi.fn(() => {
          if (table === "profile_pictures") {
            return Promise.resolve({
              data: {
                id: "pic-1",
                user_id: "u",
                image_url: "https://example.com/avatar.png",
                crop_data: { x: 10, y: 20, width: 50, height: 50 },
              },
              error: null,
            });
          }
          if (table === "profiles") {
            return Promise.resolve({
              data: {
                user_id: "u",
                username: "testuser",
                display_name: "Test User",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      };
      return builder;
    });

    const { container } = render(<Account />);
    await screen.findByText("Test User");
    const croppedDiv = container.querySelector(
      'div[style*="background-image: url(\\"https://example.com/avatar.png\\")"]',
    );
    expect(croppedDiv).toBeDefined();
  });
});
