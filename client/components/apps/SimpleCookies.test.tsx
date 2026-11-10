vi.mock("@/components/ui/tabs", () => {
  const React = require("react");
  const TabsContext = React.createContext({ value: "overview", onValueChange: (_: string) => {} });
  return {
    Tabs: ({ value, onValueChange, children }: any) => {
      const [val, setVal] = React.useState(value || "overview");
      React.useEffect(() => { if (value) setVal(value); }, [value]);
      const change = (v: string) => { setVal(v); onValueChange?.(v); };
      return (
        <TabsContext.Provider value={{ value: val, onValueChange: change }}>
          <div>{children}</div>
        </TabsContext.Provider>
      );
    },
    TabsList: ({ children }: any) => <div>{children}</div>,
    TabsTrigger: ({ value, children }: any) => {
      const ctx = React.useContext(TabsContext);
      return (
        <button type="button" role="tab" onClick={() => ctx.onValueChange(value)}>
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
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SimpleCookiesApp } from "./SimpleCookies";
import { LanguageProvider } from "@/contexts/LanguageContext";

const mockSession = { access_token: "test-token", user: { id: "u1", username: "test" } };
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: mockSession,
  }),
}));

describe("SimpleCookiesApp", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url.includes("/api/simplecookies/projects")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders title and free badge with no projects", async () => {
    render(
      <LanguageProvider>
        <SimpleCookiesApp />
      </LanguageProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText("SimpleCookies")).toBeTruthy();
    });
    expect(screen.getByText("Installation")).toBeTruthy();
  });

  it("shows Powered by SimpleCookies switch and defaults disabled in preview", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input: any) => {
      const url = typeof input === "string" ? input : input?.url || "";
      if (url === "/api/simplecookies/projects") {
        return new Response(
          JSON.stringify([
            { id: "p1", name: "My Project", domain: "example.com", first_request_at: null, created_at: "2026-01-01T00:00:00Z" },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/api/simplecookies/projects/p1/consents")) {
        return new Response(JSON.stringify({ consents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/simplecookies/projects/p1/stats")) {
        return new Response(JSON.stringify({ total: 0, acceptance_rate: 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/simplecookies/projects/p1")) {
        return new Response(
          JSON.stringify({
            id: "p1",
            name: "My Project",
            domain: "example.com",
            config: { show_powered_by: false, title: "We value your privacy", text: "Cookies" },
            declaration: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    render(
      <LanguageProvider>
        <SimpleCookiesApp />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("My Project")).toBeTruthy();
    });

    // Click project to open dashboard
    screen.getByText("My Project").click();

    // Check Banner tab
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "Banner" })).toBeTruthy();
    });
    const bannerTab = screen.getByRole("tab", { name: "Banner" });
    fireEvent.pointerDown(bannerTab, { button: 0 });
    fireEvent.click(bannerTab);

    await waitFor(() => {
      expect(screen.getByText("Powered by SimpleCookies")).toBeTruthy();
    });

    // Check Preview tab - Powered by SimpleCookies should not be in the banner preview
    const previewTab = screen.getByRole("tab", { name: "Preview" });
    fireEvent.pointerDown(previewTab, { button: 0 });
    fireEvent.click(previewTab);
    await waitFor(() => {
      expect(screen.getByText("Banner preview")).toBeTruthy();
    });
    // In preview, "Powered by SimpleCookies" is only shown if enabled
    expect(screen.queryByText("Powered by SimpleCookies")).toBeNull();
  });
});
