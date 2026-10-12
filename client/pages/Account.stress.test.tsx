/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import React from "react";
import Account from "./Account";
import { useAuth } from "@/hooks/useAuth";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";

let mockInsertCalls: any[] = [];
let mockDeleteCalls: any[] = [];

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
                chatbot_default_model: "openai",
                chatbot_default_provider: "pollinations",
                research_agent_default_model: "deepseek",
                research_agent_default_provider: "pollinations",
                research_summarizer_default_model: "mistral",
                research_summarizer_default_provider: "pollinations",
              },
              error: null,
            });
          if (table === "profiles") {
            return Promise.resolve({
              data: {
                user_id: "u",
                username: "stress_tester",
                display_name: "Stress Tester",
              },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        }),
        insert: vi.fn((item) => {
          mockInsertCalls.push(item);
          return Promise.resolve({ data: [{ id: "m-new" }], error: null });
        }),
        upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        delete: vi.fn(() => builder),
      };
      return builder;
    }),
    rpc: vi.fn((name) => {
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
  TabsTrigger: ({ children, value }: any) => (
    <button data-value={value}>{children}</button>
  ),
  TabsContent: ({ children, value, ...props }: any) => (
    <div data-testid={`tab-${value}`} {...props}>
      {children}
    </div>
  ),
}));

// Mock toast
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

describe("Account Models Tab — Adversarial Stress Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockInsertCalls = [];
    mockDeleteCalls = [];
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "e@e.com" }, access_token: "t" },
    });

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("enter.pollinations.ai/pollen")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ balance: 250, pollen: 250 }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  describe("1. Rendering, Tab Layout & Free Models Banner", () => {
    it("renders Models tab triggers, Pollinations card, and all 3 feature default pickers", async () => {
      renderAccount();

      expect(screen.getByTestId("models-tab-content")).toBeDefined();
      expect(screen.getAllByText("Models").length).toBeGreaterThan(0);
      expect(screen.getByText("Feature Default Models")).toBeDefined();

      expect(screen.getByTestId("chatbot-default-card")).toBeDefined();
      expect(screen.getByTestId("research-agent-default-card")).toBeDefined();
      expect(
        screen.getByTestId("research-summarizer-default-card"),
      ).toBeDefined();

      expect(screen.getByText(/Pollinations Account & API Key/i)).toBeDefined();
      expect(screen.getByText(/Free Tier & Official Model/i)).toBeDefined();
    });
  });

  describe("2. Add Model Modal Validation & Adversarial Scenarios", () => {
    it("opens Add Model dialog and exposes form controls", async () => {
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

    it("disables submit button when Model ID input is empty or whitespace only", async () => {
      renderAccount();

      fireEvent.click(screen.getByTestId("add-model-btn"));

      await waitFor(() => {
        expect(screen.getByText("Register AI Model")).toBeDefined();
      });

      const idInput = screen.getByLabelText(/Model ID/i) as HTMLInputElement;
      expect(idInput).toBeDefined();

      // Empty input
      fireEvent.change(idInput, { target: { value: "" } });
      const submitBtn = screen.getByTestId(
        "submit-add-model-btn",
      ) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);

      // Whitespace only input
      fireEvent.change(idInput, { target: { value: "   " } });
      expect(submitBtn.disabled).toBe(true);
    });
  });

  describe("3. Custom Model Addition, UI Reactivity & Deletion", () => {
    it("successfully submits new custom model and persists to storage", async () => {
      renderAccount();

      fireEvent.click(screen.getByTestId("add-model-btn"));

      await waitFor(() => {
        expect(screen.getByText("Register AI Model")).toBeDefined();
      });

      const idInput = screen.getByLabelText(/Model ID/i) as HTMLInputElement;
      const nameInput = screen.getByPlaceholderText("e.g. My Custom Model") as HTMLInputElement;

      fireEvent.change(idInput, { target: { value: "my-private-model" } });
      fireEvent.change(nameInput, { target: { value: "My Private LLM" } });

      const submitBtn = screen.getByTestId("submit-add-model-btn");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        const stored = localStorage.getItem("pollinations_custom_models");
        expect(stored).toContain("my-private-model");
      });
    });

    it("renders delete confirmation dialog when removing custom models", async () => {
      localStorage.setItem(
        "pollinations_custom_models",
        JSON.stringify([
          {
            id: "custom-deprecated",
            provider: "pollinations",
            model_id: "custom-deprecated",
            name: "Deprecated Custom Model",
          },
        ]),
      );

      renderAccount();

      await waitFor(() => {
        expect(screen.getByText("Deprecated Custom Model")).toBeDefined();
      });

      const deleteButtons = screen.getAllByTitle("Delete");
      expect(deleteButtons.length).toBeGreaterThan(0);
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByText("Remove Custom Model")).toBeDefined();
        expect(
          screen.getByText(
            /Are you sure you want to remove this custom model/i,
          ),
        ).toBeDefined();
      });

      const confirmDeleteBtn = screen.getByTestId("confirm-delete-model-btn");
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        const stored = localStorage.getItem("pollinations_custom_models");
        expect(stored || "[]").not.toContain("custom-deprecated");
      });
    });
  });

  describe("4. Feature Default Model Pickers Selection", () => {
    it("renders three feature default model select triggers with current defaults", async () => {
      renderAccount();

      await waitFor(() => {
        expect(screen.getByTestId("chatbot-default-select")).toBeDefined();
        expect(
          screen.getByTestId("research-agent-default-select"),
        ).toBeDefined();
        expect(
          screen.getByTestId("research-summarizer-default-select"),
        ).toBeDefined();
      });
    });
  });
});
