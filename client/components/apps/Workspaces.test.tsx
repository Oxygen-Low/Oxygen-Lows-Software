/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WorkspacesApp } from "./Workspaces";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: {
      access_token: "mock_test_token",
      user: { id: "user_123", username: "Alice" },
    },
    loading: false,
  }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (_key: string, _opts?: any, defaultVal?: string) => defaultVal || _key,
  }),
}));

vi.mock("@/lib/db", () => ({
  supabase: {
    channel: () => ({
      on: function () {
        return this;
      },
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
  },
  db: {
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  },
}));

vi.mock("@/lib/storage", () => ({
  storage: {
    from: () => ({
      list: () => Promise.resolve({ data: [], error: null }),
    }),
  },
}));

describe("WorkspacesApp Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn((url: string | URL | Request) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/workspaces") && !urlStr.includes("/api/workspaces/")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [
                {
                  id: "ws_apollo",
                  name: "Project Apollo",
                  description: "Lunar mission workspace",
                  owner_id: "user_123",
                  invite_code: "apollo123",
                  role: "owner",
                  member_count: 3,
                  file_count: 5,
                  owner_name: "Alice",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
              error: null,
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: null, error: null }),
      } as Response);
    }) as any;
  });

  it("renders the workspaces dashboard with title and loaded workspaces", async () => {
    render(
      <MemoryRouter initialEntries={["/apps/workspaces"]}>
        <WorkspacesApp />
      </MemoryRouter>,
    );

    expect(screen.getByText("Workspaces")).toBeDefined();
    expect(screen.getByText("New Workspace")).toBeDefined();
    expect(screen.getByText("Join with Code")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Project Apollo")).toBeDefined();
      expect(screen.getByText("Lunar mission workspace")).toBeDefined();
    });
  });
});
