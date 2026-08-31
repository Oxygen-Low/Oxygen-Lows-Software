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

let mockDbUserModels: any[] = [];
let mockDbIntegrations: any[] = [];
let mockRpcCalls: Array<{ name: string; params: any }> = [];
let mockInsertCalls: any[] = [];
let mockDeleteCalls: any[] = [];

// Full mock of db & supabase
vi.mock("@/lib/db", () => {
  const mockClient = {
    auth: {
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: "user-stress-1" } } }),
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: { user: { id: "user-stress-1" } },
          access_token: "mock-token",
        },
        error: null,
      }),
      onAuthStateChange: vi
        .fn()
        .mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn((table: string) => {
      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => {
          if (table === "user_models") {
            return Promise.resolve({
              data: [...mockDbUserModels],
              error: null,
            });
          }
          return builder;
        }),
        single: vi.fn(() => {
          if (table === "user_preferences") {
            return Promise.resolve({
              data: {
                theme: "default",
                use_gradient: true,
                chatbot_default_model: "gpt-4o",
                chatbot_default_provider: "openai",
                research_agent_default_model: "google/gemma-4-31b",
                research_agent_default_provider: "horde",
                research_summarizer_default_model:
                  "@cf/nvidia/nemotron-3-120b-a12b",
                research_summarizer_default_provider: "cloudflare",
              },
              error: null,
            });
          }
          if (table === "profiles") {
            return Promise.resolve({
              data: {
                user_id: "user-stress-1",
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
          const newItem = { id: `m-${Date.now()}`, ...item };
          mockDbUserModels.push(newItem);
          return Promise.resolve({ data: [newItem], error: null });
        }),
        upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        delete: vi.fn(() => {
          return {
            eq: vi.fn((field1: string, val1: string) => {
              return {
                eq: vi.fn((field2: string, val2: string) => {
                  mockDeleteCalls.push({ [field1]: val1, [field2]: val2 });
                  mockDbUserModels = mockDbUserModels.filter(
                    (m) => !(m[field1] === val1 && m[field2] === val2),
                  );
                  return Promise.resolve({ data: null, error: null });
                }),
              };
            }),
          };
        }),
      };

      if (table === "user_integrations") {
        return {
          select: vi
            .fn()
            .mockResolvedValue({ data: [...mockDbIntegrations], error: null }),
        };
      }

      return builder;
    }),
    rpc: vi.fn((name: string, params: any) => {
      mockRpcCalls.push({ name, params });
      return Promise.resolve({ data: null, error: null });
    }),
    storage: {
      from: vi.fn().mockReturnThis(),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "" } }),
      upload: vi.fn().mockResolvedValue({ data: { path: "" } }),
      remove: vi.fn().mockResolvedValue({}),
      createSignedUrl: vi
        .fn()
        .mockResolvedValue({ data: { signedUrl: "" }, error: null }),
    },
  };

  return {
    getAuthenticatedClient: vi.fn(() => mockClient),
    db: mockClient,
    supabase: mockClient,
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    session: { user: { id: "user-stress-1" }, access_token: "mock-token" },
    loading: false,
  })),
}));

vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

// Mock Radix UI Tabs to always render children
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children, value, ...props }: any) => (
    <button data-value={value} {...props}>
      {children}
    </button>
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
    mockDbUserModels = [];
    mockDbIntegrations = [
      { provider: "openai", is_active: true, api_key: "sk-openai-key" },
      { provider: "anthropic", is_active: true, api_key: "sk-ant-key" },
    ];
    mockRpcCalls = [];
    mockInsertCalls = [];
    mockDeleteCalls = [];

    global.fetch = vi.fn().mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes(":11434/api/tags")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ models: [{ name: "llama3.2:latest" }] }),
        });
      }
      if (urlStr.includes(":1234/v1/models")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [{ id: "lm-qwen-local" }] }),
        });
      }
      if (urlStr.includes(":5001/api/v1/model")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ result: "kobold-llama" }),
        });
      }
      if (urlStr.includes("/api/ai/local-providers")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
      }
      if (urlStr.includes("/api/ai/horde-status")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({}),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  describe("1. Rendering, Tab Layout & Provider Badges", () => {
    it("renders Models tab triggers, counts, and all 3 feature default pickers", async () => {
      renderAccount();

      // Verify trigger and content
      expect(screen.getByTestId("models-tab-trigger")).toBeDefined();
      expect(screen.getByTestId("models-tab-content")).toBeDefined();

      // Verify header section
      expect(screen.getAllByText("Models").length).toBeGreaterThan(0);
      expect(screen.getByText("Feature Default Models")).toBeDefined();

      // Verify 3 Default Model Cards
      expect(screen.getByTestId("chatbot-default-card")).toBeDefined();
      expect(screen.getByTestId("research-agent-default-card")).toBeDefined();
      expect(
        screen.getByTestId("research-summarizer-default-card"),
      ).toBeDefined();

      // Verify Group Headers
      expect(screen.getByText("Active & Registered Models")).toBeDefined();
      expect(screen.getAllByText(/Local Models/i).length).toBeGreaterThan(0);
      expect(screen.getByText("Cloud Providers")).toBeDefined();
      expect(screen.getByText(/Built-in Cloud Services/i)).toBeDefined();
    });

    it("displays 'Configured' for active integrations and 'API Key Required' for unconfigured", async () => {
      renderAccount();

      await waitFor(() => {
        const configuredBadges = screen.getAllByText("Configured");
        expect(configuredBadges.length).toBeGreaterThanOrEqual(2); // OpenAI and Anthropic
        const notConfiguredBadges = screen.getAllByText("API Key Required");
        expect(notConfiguredBadges.length).toBeGreaterThanOrEqual(3); // Google, OpenRouter, Grok
      });
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
        expect(document.getElementById("custom-model-id-input")).toBeDefined();
        expect(
          document.getElementById("custom-model-name-input"),
        ).toBeDefined();
        expect(screen.getByTestId("submit-add-model-btn")).toBeDefined();
      });
    });

    it("disables submit button when Model ID input is empty or whitespace only", async () => {
      renderAccount();

      fireEvent.click(screen.getByTestId("add-model-btn"));

      await waitFor(() => {
        expect(screen.getByText("Register AI Model")).toBeDefined();
      });

      const idInput = document.getElementById(
        "custom-model-id-input",
      ) as HTMLInputElement;
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

    it("displays warning note when unconfigured cloud provider is selected", async () => {
      renderAccount();

      fireEvent.click(screen.getByTestId("add-model-btn"));

      await waitFor(() => {
        expect(screen.getByText("Register AI Model")).toBeDefined();
      });

      expect(
        screen.getByText(/Add a model from a configured provider/i),
      ).toBeDefined();
    });
  });

  describe("3. Custom Model Addition, UI Reactivity & Deletion", () => {
    it("successfully submits new custom model and persists to DB", async () => {
      renderAccount();

      fireEvent.click(screen.getByTestId("add-model-btn"));

      await waitFor(() => {
        expect(screen.getByText("Register AI Model")).toBeDefined();
      });

      const idInput = document.getElementById(
        "custom-model-id-input",
      ) as HTMLInputElement;
      const nameInput = document.getElementById(
        "custom-model-name-input",
      ) as HTMLInputElement;

      fireEvent.change(idInput, { target: { value: "gpt-4o-custom-2026" } });
      fireEvent.change(nameInput, { target: { value: "Custom 4o Pro" } });

      const submitBtn = screen.getByTestId("submit-add-model-btn");
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockInsertCalls.length).toBe(1);
        expect(mockInsertCalls[0]).toEqual({
          user_id: "user-stress-1",
          provider: "openai",
          model_id: "gpt-4o-custom-2026",
          name: "Custom 4o Pro",
        });
      });
    });

    it("renders delete confirmation dialog when removing custom models", async () => {
      mockDbUserModels = [
        {
          id: "m-to-delete",
          provider: "openai",
          model_id: "gpt-obsolete",
          name: "Obsolete Model",
        },
      ];

      renderAccount();

      await waitFor(() => {
        expect(screen.getByText("Obsolete Model")).toBeDefined();
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
        expect(screen.getByText("openai : gpt-obsolete")).toBeDefined();
      });

      const confirmDeleteBtn = screen.getByTestId("confirm-delete-model-btn");
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(mockDeleteCalls.length).toBe(1);
        expect(mockDeleteCalls[0]).toEqual({
          provider: "openai",
          model_id: "gpt-obsolete",
        });
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

  describe("5. Local Model Detection Simulation (Online, Offline & Malformed)", () => {
    it("displays 'Local Offline' and help banner when local ports are unreachable", async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        const urlStr = String(url);
        if (
          urlStr.includes("11434") ||
          urlStr.includes("1234") ||
          urlStr.includes("5001")
        ) {
          return Promise.reject(new Error("ECONNREFUSED"));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      renderAccount();

      await waitFor(() => {
        expect(screen.getAllByText(/Local Offline/i).length).toBeGreaterThan(0);
        expect(
          screen.getByText(/No local models detected\. Launch Ollama/i),
        ).toBeDefined();
      });
    });

    it("handles malformed JSON responses from local ports gracefully without crash", async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes(":11434/api/tags")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ corrupted: "not-an-array" }),
          });
        }
        if (urlStr.includes(":1234/v1/models")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: "invalid-data" }),
          });
        }
        if (urlStr.includes(":5001/api/v1/model")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ result: 99999 }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      renderAccount();

      await waitFor(() => {
        expect(screen.getByTestId("models-tab-content")).toBeDefined();
      });
    });

    it("displays discovered model when local Ollama models are discovered without count badge", async () => {
      global.fetch = vi.fn().mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes(":11434/api/tags")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ models: [{ name: "deepseek-r1:14b" }] }),
          });
        }
        if (urlStr.includes(":11434/v1/models")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ data: [] }),
          });
        }
        if (urlStr.includes("1234") || urlStr.includes("5001")) {
          return Promise.reject(new Error("Offline"));
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
      });

      renderAccount();

      await waitFor(() => {
        expect(screen.getAllByText(/deepseek-r1:14b/i).length).toBeGreaterThan(
          0,
        );
      });
      expect(screen.queryByText(/\d+\s+detected/i)).toBeNull();
    });
  });
});
