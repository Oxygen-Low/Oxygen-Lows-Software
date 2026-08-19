/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Integrations, { INTEGRATION_DEFINITIONS } from "./Integrations";
import { useAuth } from "@/hooks/useAuth";
import {
  clearActiveMasterKey,
  setActiveMasterKey,
  generateAes256Key,
  setCategoryEncryptionEnabled,
} from "@/lib/crypto";

// Mock Supabase
const mockSupabaseData: any[] = [];
vi.mock("@/lib/supabase", () => {
  const queryBuilder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() =>
      Promise.resolve({
        data: {
          id: "int-mock-1",
          user_id: "user-123",
          category: "llm_models",
          provider: "openai",
          name: "OpenAI / ChatGPT",
          api_key: "ENC:aes-256-gcm:mockencryptedkey",
          base_url: "https://api.openai.com/v1",
        },
        error: null,
      })
    ),
    delete: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => resolve({ data: mockSupabaseData, error: null })),
  };

  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } } }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "user-123" } } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnValue(queryBuilder),
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/ui/tabs", () => {
  const React = require("react");
  const TabsContext = React.createContext({
    value: "all",
    onValueChange: (_: string) => {},
  });

  return {
    Tabs: ({ value, onValueChange, children }: any) => (
      <TabsContext.Provider value={{ value, onValueChange }}>
        <div data-testid="tabs-root">{children}</div>
      </TabsContext.Provider>
    ),
    TabsList: ({ children }: any) => <div>{children}</div>,
    TabsTrigger: ({ value, children, ...props }: any) => {
      const ctx = React.useContext(TabsContext);
      return (
        <button
          type="button"
          onClick={() => ctx.onValueChange?.(value)}
          data-state={ctx.value === value ? "active" : "inactive"}
          {...props}
        >
          {children}
        </button>
      );
    },
    TabsContent: ({ value, children }: any) => {
      const ctx = React.useContext(TabsContext);
      return ctx.value === value ? <div>{children}</div> : null;
    },
  };
});

const renderWithRouter = (initialEntries = ["/integrations"]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Integrations />
    </MemoryRouter>
  );

describe("Integrations Page Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    clearActiveMasterKey();
    (useAuth as any).mockReturnValue({
      session: { user: { id: "user-123", email: "tester@example.com" } },
    });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders encryption required banner when encryption is disabled", () => {
    setCategoryEncryptionEnabled("integrations", false);
    renderWithRouter();

    expect(screen.getByText("Zero-Knowledge Encryption Required")).toBeDefined();
    expect(
      screen.getByText(
        "To protect your private API keys and tokens from unauthorized access, Oxygen Low's Software requires client-side AES-256 masterkey encryption for all stored integrations. Data is encrypted directly in your browser before saving."
      )
    ).toBeDefined();
    expect(document.getElementById("enable-integration-encryption-btn")).toBeDefined();
  });

  it("enables integration encryption on button click", async () => {
    setCategoryEncryptionEnabled("integrations", false);
    renderWithRouter();

    const enableBtn = document.getElementById("enable-integration-encryption-btn") as HTMLButtonElement;
    expect(enableBtn).toBeDefined();

    fireEvent.click(enableBtn);

    await waitFor(() => {
      expect(screen.getByText("Total Supported")).toBeDefined();
      expect(screen.getByText("OpenAI / ChatGPT")).toBeDefined();
      expect(screen.getByText("Google / Gemini")).toBeDefined();
      expect(screen.getByText("OpenRouter")).toBeDefined();
      expect(screen.getByText("xAI / Grok")).toBeDefined();
      expect(screen.getByText("Anthropic / Claude")).toBeDefined();
      expect(screen.getByText("Google Jules")).toBeDefined();
      expect(screen.getByText("Google Stitch MCP")).toBeDefined();
      expect(screen.getByText("GitHub MCP")).toBeDefined();
    });
  });

  it("renders all categories and integration definitions when unlocked", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("integrations", true);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Integrations & API Keys")).toBeDefined();
      expect(
        screen.getByText("Securely manage API keys and credentials for LLM models, integrations, and MCP servers.")
      ).toBeDefined();
      expect(screen.getByText("LLM Models")).toBeDefined();
      expect(screen.getByText("LLM Integrations")).toBeDefined();
      expect(screen.getByText("LLM Mcps")).toBeDefined();
    });

    // Ensure Protection card and AES-256 Encrypted top badge are not rendered
    expect(screen.queryByText("Protection")).toBeNull();
    expect(screen.queryByText("AES-256 Encrypted")).toBeNull();
    expect(screen.getByText("Total Supported")).toBeDefined();
    expect(screen.getByText("Configured")).toBeDefined();

    // Check all requested providers are present in the list
    expect(screen.getByText("OpenAI / ChatGPT")).toBeDefined();
    expect(screen.getByText("Google / Gemini")).toBeDefined();
    expect(screen.getByText("OpenRouter")).toBeDefined();
    expect(screen.getByText("xAI / Grok")).toBeDefined();
    expect(screen.getByText("Anthropic / Claude")).toBeDefined();
    expect(screen.getByText("Google Jules")).toBeDefined();
    expect(screen.getByText("Google Stitch MCP")).toBeDefined();
    expect(screen.getByText("GitHub MCP")).toBeDefined();
  });

  it("filters integrations by category tabs", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("integrations", true);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("OpenAI / ChatGPT")).toBeDefined();
    });

    // Filter to LLM Mcps
    const mcpsTab = screen.getByText("LLM Mcps");
    fireEvent.click(mcpsTab);

    await waitFor(() => {
      expect(screen.getByText("Google Stitch MCP")).toBeDefined();
      expect(screen.getByText("GitHub MCP")).toBeDefined();
      expect(screen.queryByText("OpenAI / ChatGPT")).toBeNull();
      expect(screen.queryByText("Google Jules")).toBeNull();
    });

    // Filter to LLM Integrations
    const integrationsTab = screen.getByText("LLM Integrations");
    fireEvent.click(integrationsTab);

    await waitFor(() => {
      expect(screen.getByText("Google Jules")).toBeDefined();
      expect(screen.queryByText("Google Stitch MCP")).toBeNull();
      expect(screen.queryByText("OpenAI / ChatGPT")).toBeNull();
    });
  });

  it("filters integrations by search query", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("integrations", true);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("OpenAI / ChatGPT")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText("Search integrations...") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Jules" } });

    await waitFor(() => {
      expect(screen.getByText("Google Jules")).toBeDefined();
      expect(screen.queryByText("OpenAI / ChatGPT")).toBeNull();
      expect(screen.queryByText("GitHub MCP")).toBeNull();
    });
  });

  it("opens configure modal and saves integration key", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("integrations", true);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("OpenAI / ChatGPT")).toBeDefined();
    });

    const openaiCard = screen.getByTestId("integration-card-openai");
    const configureBtn = openaiCard.querySelector("button:last-child") as HTMLButtonElement;
    fireEvent.click(configureBtn);

    await waitFor(() => {
      expect(screen.getByText("Configure OpenAI / ChatGPT")).toBeDefined();
    });

    const keyInput = document.getElementById("input-api-key") as HTMLInputElement;
    fireEvent.change(keyInput, { target: { value: "sk-proj-test1234567890" } });

    const saveBtn = document.getElementById("save-integration-submit-btn") as HTMLButtonElement;
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.queryByText("Configure OpenAI / ChatGPT")).toBeNull();
    });
  });

  it("verifies Stitch MCP, Jules, and GitHub MCP definitions have correct default endpoints and docs URLs", () => {
    const stitchDef = INTEGRATION_DEFINITIONS.find((d) => d.provider === "google_stitch_mcp");
    expect(stitchDef).toBeDefined();
    expect(stitchDef?.defaultBaseUrl).toBe("https://stitch.googleapis.com/mcp");
    expect(stitchDef?.docsUrl).toBe("https://stitch.withgoogle.com");

    const julesDef = INTEGRATION_DEFINITIONS.find((d) => d.provider === "google_jules");
    expect(julesDef).toBeDefined();
    expect(julesDef?.defaultBaseUrl).toBe("https://jules.googleapis.com/v1alpha");
    expect(julesDef?.docsUrl).toBe("https://developers.google.com/jules/api");

    const githubDef = INTEGRATION_DEFINITIONS.find((d) => d.provider === "github_mcp");
    expect(githubDef).toBeDefined();
    expect(githubDef?.defaultBaseUrl).toBe("https://api.github.com");
    expect(githubDef?.docsUrl).toBe("https://github.com/settings/tokens");
  });

  it("displays default endpoint and does not show custom base URL input in configure modal", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("integrations", true);

    renderWithRouter();

    await waitFor(() => {
      expect(screen.getByText("Google Stitch MCP")).toBeDefined();
    });

    const stitchCard = screen.getByTestId("integration-card-google_stitch_mcp");
    const configureBtn = stitchCard.querySelector("button:last-child") as HTMLButtonElement;
    fireEvent.click(configureBtn);

    await waitFor(() => {
      expect(screen.getByText("Configure Google Stitch MCP")).toBeDefined();
      expect(screen.getByText("https://stitch.googleapis.com/mcp")).toBeDefined();
      expect(screen.getByText(/Default Endpoint/i)).toBeDefined();
      expect(document.getElementById("input-base-url")).toBeNull();
    });
  });
});
