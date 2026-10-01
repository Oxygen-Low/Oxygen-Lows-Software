/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Projects from "./Projects";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ projectId: "proj-123" }),
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: {
      access_token: "mock-token",
      user: { id: "user-1", email: "test@example.com" },
    },
  }),
}));

vi.mock("@/hooks/usePageTitle", () => ({
  usePageTitle: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("Projects Page", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();

    const mockFetchFn = vi.fn(async (url: any) => {
      const urlStr = String(url);
      if (urlStr === "/api/projects" || urlStr.endsWith("/api/projects")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "proj-123",
              user_id: "user-1",
              name: "Alpha Cyber Shield",
              description: "Core defense workspace",
              defender_app_ids: ["app-1"],
              resources: [],
              tags: ["prod", "security"],
              settings: {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              attached_apps_count: 1,
              threat_count: 2,
              open_issues_count: 2,
              has_critical: true,
            },
          ],
        } as any;
      }
      if (urlStr.includes("/api/projects/proj-123/issues")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "auto-issue-1",
              project_id: "proj-123",
              title: "Block Mode Disabled for Main Gateway App",
              description: "App is in monitoring mode only.",
              severity: "high",
              status: "open",
              category: "security",
              is_automated: true,
              quick_fix_type: "enable_block_mode",
              target_app_id: "app-1",
              created_at: new Date().toISOString(),
            },
            {
              id: "custom-issue-2",
              project_id: "proj-123",
              title: "Rotate Database Secrets",
              description: "Quarterly credential rotation.",
              severity: "medium",
              status: "open",
              category: "task",
              created_at: new Date().toISOString(),
            },
          ],
        } as any;
      }
      if (urlStr.includes("/api/projects/proj-123/threats")) {
        return {
          ok: true,
          json: async () => ({
            threats: [
              {
                id: "threat-1",
                app_id: "app-1",
                app_name: "Main Gateway App",
                type: "SQL Injection Probe",
                ip: "198.51.100.42",
                country: "US",
                path: "/api/v1/query",
                blocked: false,
                created_at: new Date().toISOString(),
              },
            ],
            total: 1,
          }),
        } as any;
      }
      if (urlStr.includes("/api/projects/proj-123")) {
        return {
          ok: true,
          json: async () => ({
            id: "proj-123",
            user_id: "user-1",
            name: "Alpha Cyber Shield",
            description: "Core defense workspace",
            defender_app_ids: ["app-1"],
            resources: [],
            tags: ["prod", "security"],
            settings: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            attached_apps: [
              {
                id: "app-1",
                name: "Main Gateway App",
                block_mode_enabled: false,
                abuseipdb_configured: false,
              },
            ],
          }),
        } as any;
      }
      if (urlStr === "/api/webdefender/apps" || urlStr.endsWith("/api/webdefender/apps")) {
        return {
          ok: true,
          json: async () => [
            {
              id: "app-1",
              name: "Main Gateway App",
              block_mode_enabled: false,
              abuseipdb_configured: false,
            },
            {
              id: "app-2",
              name: "Secondary Auth Service",
              block_mode_enabled: true,
              abuseipdb_configured: true,
            },
          ],
        } as any;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as any;
    });

    global.fetch = mockFetchFn;
    window.fetch = mockFetchFn;
    vi.stubGlobal("fetch", mockFetchFn);
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    window.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it("renders projects sidebar and active project overview", async () => {
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    // Should display project name in sidebar and header
    await waitFor(() => {
      expect(screen.getAllByText("Alpha Cyber Shield").length).toBeGreaterThan(0);
    });

    // Check tabs rendered
    expect(screen.getByRole("tab", { name: /Overview/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Issues Manager/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /Recent Threats/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /WebDefender Apps/i })).toBeDefined();
  });

  it("displays issues with quick-fix button and recent threats", async () => {
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Block Mode Disabled for Main Gateway App")).toBeDefined();
    });

    // Check quick fix button is present
    const quickFixButtons = screen.getAllByRole("button", { name: /Quick Fix/i });
    expect(quickFixButtons.length).toBeGreaterThan(0);

    // Check recent threats
    expect(screen.getByText("198.51.100.42")).toBeDefined();
    expect(screen.getByText("SQL Injection Probe")).toBeDefined();
  });

  it("switches to Issues Manager tab and displays issue filters", async () => {
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alpha Cyber Shield")).toBeDefined();
    });

    const issuesTab = screen.getByRole("tab", { name: /Issues Manager/i });
    fireEvent.click(issuesTab);

    await waitFor(() => {
      expect(screen.getByText("Rotate Database Secrets")).toBeDefined();
    });
  });

  it("opens create issue modal when clicking New Issue", async () => {
    render(
      <MemoryRouter>
        <Projects />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Block Mode Disabled for Main Gateway App")).toBeDefined();
    });

    const newIssueButtons = screen.getAllByRole("button", { name: /New Issue/i });
    fireEvent.click(newIssueButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("Issue Title")).toBeDefined();
    });
  });
});
