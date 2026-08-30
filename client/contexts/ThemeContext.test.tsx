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
import { ThemeProvider, useTheme } from "./ThemeContext";

const mockCreateSignedUrl = vi.fn().mockResolvedValue({
  data: { signedUrl: "https://example.com/font.ttf" },
  error: null,
});
const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

const mockSupabase = {
  from: vi.fn((_table?: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            theme: "default",
            font: "font-zilla",
            use_gradient: true,
            last_model_id: null,
            last_provider: null,
          },
          error: null,
        }),
      })),
    })),
  })),
  storage: {
    from: vi.fn((_bucket?: string) => ({
      createSignedUrl: mockCreateSignedUrl,
    })),
  },
};

let mockSession: any = {
  user: { id: "test-user-id" },
  access_token: "mock-token",
};

vi.mock("@/lib/db", () => ({
  db: {
    from: (table: string) => mockSupabase.from(table),
  },
  supabase: {
    from: (table: string) => mockSupabase.from(table),
  },
  getAuthenticatedClient: () => ({
    rpc: (...args: any[]) => mockRpc(...args),
  }),
}));

vi.mock("@/lib/storage", () => ({
  storage: {
    from: (bucket: string) => mockSupabase.storage.from(bucket),
  },
  customStorage: {
    from: (bucket: string) => mockSupabase.storage.from(bucket),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: mockSession,
    loading: false,
  }),
}));

function TestThemeConsumer() {
  const {
    theme,
    font,
    useGradient,
    setTheme,
    setFont,
    setUseGradient,
    setModelPreference,
    isLoading,
  } = useTheme();

  return (
    <div>
      <span data-testid="is-loading">{String(isLoading)}</span>
      <span data-testid="current-theme">{theme}</span>
      <span data-testid="current-font">{font}</span>
      <span data-testid="current-gradient">{String(useGradient)}</span>
      <button
        data-testid="set-font-indie"
        onClick={() => setFont("font-indie")}
      >
        Set Indie Font
      </button>
      <button
        data-testid="set-custom-font"
        onClick={() => setFont("font-custom:myfont.ttf")}
      >
        Set Custom Font
      </button>
      <button
        data-testid="set-traversed-font"
        onClick={() => setFont("font-custom:....//....//secret/font.ttf")}
      >
        Set Traversed Font
      </button>
      <button
        data-testid="set-custom-theme"
        onClick={() => setTheme("custom:#ff0000-#000000")}
      >
        Set Custom Theme
      </button>
      <button
        data-testid="set-model-pref"
        onClick={() => setModelPreference("gpt-4", "openai")}
      >
        Set Model Pref
      </button>
    </div>
  );
}

describe("ThemeContext & Provider", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    mockSession = {
      user: { id: "test-user-id" },
      access_token: "mock-token",
    };
    mockCreateSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://example.com/font.ttf" },
      error: null,
    });
    mockSupabase.from.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              theme: "default",
              font: "font-zilla",
              use_gradient: true,
              last_model_id: null,
              last_provider: null,
            },
            error: null,
          }),
        })),
      })),
    }));
  });

  afterEach(() => {
    cleanup();
    const customStyle = document.getElementById("custom-font-style");
    if (customStyle) {
      customStyle.remove();
    }
  });

  it("loads preferences and sets initial state for authenticated user", async () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
    });
    expect(screen.getByTestId("current-theme").textContent).toBe("default");
    expect(screen.getByTestId("current-font").textContent).toBe("font-zilla");
  });

  it("updates standard font and classes", async () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
    });

    fireEvent.click(screen.getByTestId("set-font-indie"));

    await waitFor(() => {
      expect(screen.getByTestId("current-font").textContent).toBe("font-indie");
    });
    expect(document.documentElement.classList.contains("font-indie")).toBe(
      true,
    );
    expect(mockRpc).toHaveBeenCalledWith("upsert_user_preferences", {
      p_user_id: "test-user-id",
      p_font: "font-indie",
    });
  });

  it("sanitizes custom font paths and creates signed URL", async () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
    });

    fireEvent.click(screen.getByTestId("set-custom-font"));

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        "test-user-id/myfont.ttf",
        3600,
      );
    });
  });

  it("recursively sanitizes nested/spliced path traversal sequences in custom font", async () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
    });

    fireEvent.click(screen.getByTestId("set-traversed-font"));

    await waitFor(() => {
      expect(mockCreateSignedUrl).toHaveBeenCalledWith(
        "test-user-id/secret/font.ttf",
        3600,
      );
    });
  });

  it("applies custom color theme with CSS variables", async () => {
    render(
      <ThemeProvider>
        <TestThemeConsumer />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-loading").textContent).toBe("false");
    });

    fireEvent.click(screen.getByTestId("set-custom-theme"));

    await waitFor(() => {
      expect(screen.getByTestId("current-theme").textContent).toBe(
        "custom:#ff0000-#000000",
      );
    });
    expect(document.documentElement.classList.contains("theme-custom")).toBe(
      true,
    );
  });

  it("throws error when useTheme is used outside of ThemeProvider", () => {
    const TestOutside = () => {
      useTheme();
      return null;
    };
    expect(() => render(<TestOutside />)).toThrow(
      "useTheme must be used within ThemeProvider",
    );
  });
});
