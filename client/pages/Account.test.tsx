/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import Account from "./Account";
import { useAuth } from "@/hooks/useAuth";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";

// Full mock of db
vi.mock("@/lib/db", () => {
  const mockClient = {
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
              data: {
                theme: "default",
                use_gradient: true,
                chatbot_default_model: "gpt-4o",
                chatbot_default_provider: "openai",
                research_agent_default_model: "google/gemma-4-31b",
                research_agent_default_provider: "horde",
                research_summarizer_default_model: "@cf/nvidia/nemotron-3-120b-a12b",
                research_summarizer_default_provider: "cloudflare",
              },
              error: null,
            });
          return Promise.resolve({ data: null, error: null });
        }),
        insert: vi.fn(() => Promise.resolve({ data: [{ id: "m-new" }], error: null })),
        upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        delete: vi.fn(() => builder),
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
  };

  return {
    getAuthenticatedClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
          })),
        })),
      })),
      rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    })),
    db: mockClient,
    supabase: mockClient,
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

// Mock Radix UI Tabs to always render children
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value }: any) => <button data-value={value}>{children}</button>,
  TabsContent: ({ children, value, ...props }: any) => (
    <div data-testid={`tab-${value}`} {...props}>
      {children}
    </div>
  ),
}));

// Mock sonner and toast
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function renderAccount() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <Account />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("Account Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "e@e.com" }, access_token: "t" },
    });
    // mock global fetch
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes("/api/ai/local-providers")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      if (String(url).includes("/api/ai/horde-status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders with correct header", async () => {
    renderAccount();
    const headers = screen.getAllByText("Your Account", { selector: "h1" });
    expect(headers.length).toBeGreaterThan(0);
  });

  it("renders the language section and display language selector", async () => {
    renderAccount();
    expect(screen.getByText("Language")).toBeDefined();
    expect(screen.getByText("Display Language")).toBeDefined();
    expect(screen.getByText("English")).toBeDefined();
  });

  it("renders additional languages section with controls", async () => {
    renderAccount();
    expect(screen.getByText("Additional Languages")).toBeDefined();
    expect(screen.getByText("Add Language")).toBeDefined();
    expect(screen.getByText("No additional languages added.")).toBeDefined();
  });

  it("renders profile picture with null crop_data without throwing error", async () => {
    const { supabase } = await import("@/lib/db");
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

    renderAccount();
    expect(await screen.findByAltText("Test User")).toBeDefined();
  });

  it("renders profile picture with valid crop_data properly", async () => {
    const { supabase } = await import("@/lib/db");
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

    const { container } = renderAccount();
    await screen.findByText("Test User");
    const croppedDiv = container.querySelector(
      'div[style*="background-image: url(\\"https://example.com/avatar.png\\")"]',
    );
    expect(croppedDiv).toBeDefined();
  });

  it("renders Models tab and feature default pickers", async () => {
    renderAccount();
    expect(screen.getByTestId("models-tab-content")).toBeDefined();
    expect(screen.getAllByText("Models").length).toBeGreaterThan(0);
    expect(screen.getByText("Feature Default Models")).toBeDefined();
    expect(screen.getByTestId("chatbot-default-card")).toBeDefined();
    expect(screen.getByTestId("research-agent-default-card")).toBeDefined();
    expect(screen.getByTestId("research-summarizer-default-card")).toBeDefined();
    expect(screen.getByText("Active & Registered Models")).toBeDefined();
  });

  it("opens Add Model dialog when clicking Add Model button", async () => {
    renderAccount();
    const addBtn = screen.getByTestId("add-model-btn");
    expect(addBtn).toBeDefined();
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(screen.getByText("Register AI Model")).toBeDefined();
      expect(screen.getByLabelText(/Model ID/i)).toBeDefined();
      expect(screen.getByTestId("submit-add-model-btn")).toBeDefined();
    });
  });
});
