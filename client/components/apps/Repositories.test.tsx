/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { RepositoriesApp } from "./Repositories";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { toast } from "sonner";

// Stable session object to prevent infinite loops
const mockSession = { user: { id: "123" } };
const mockAuthResult = { session: mockSession, loading: false };
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => mockAuthResult }));

const mockQueryBuilder = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  single: vi.fn().mockResolvedValue({ data: null, error: null }),
  then: vi.fn(function (cb) {
    return Promise.resolve({ data: [], error: null }).then(cb);
  }),
  insert: vi.fn().mockResolvedValue({ data: null, error: null }),
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session: { access_token: "token" } } }),
      ),
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "123" } } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn(() => mockQueryBuilder),
    rpc: vi.fn(() => Promise.resolve({ data: [], error: null })),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock ResizeObserver for Radix UI
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe("RepositoriesApp", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it("renders the main heading", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    render(
      <ThemeProvider>
        <RepositoriesApp />
      </ThemeProvider>,
    );
    expect(await screen.findByText("Your Repositories")).toBeDefined();
  });

  it("fetches repositories with correct bearer token on mount", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });
    render(
      <ThemeProvider>
        <RepositoriesApp />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/repos",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer token",
          }),
        }),
      );
    });
  });

  it("handles repository creation flow", async () => {
    (global.fetch as any).mockImplementation((url: string, init?: any) => {
      if (url === "/api/repos" && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: "new-repo-id" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    });

    render(
      <ThemeProvider>
        <RepositoriesApp />
      </ThemeProvider>,
    );

    const nameInput = await screen.findByPlaceholderText("Repo name...");
    fireEvent.change(nameInput, { target: { value: "test-repo" } });

    const createBtn = screen.getByText("New Repo");
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/repos",
        expect.objectContaining({
          method: "POST",
        }),
      );
      expect(toast.success).toHaveBeenCalledWith("Repository created");
    });
  });

  it("handles navigation and nested paths", async () => {
    const mockRepo = {
      id: "repo-1",
      name: "test-repo",
      profiles: { username: "user" },
      zip_size_bytes: 0,
      is_loaded: false,
    };
    const mockTree = [{ name: "folder", type: "tree" }];
    const mockNestedTree = [{ name: "file.txt", type: "blob" }];

    (global.fetch as any).mockImplementation((url: string) => {
      if (url === "/api/repos") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([mockRepo]),
        });
      }
      if (url.includes("/tree?path=") && !url.includes("path=folder")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockTree),
        });
      }
      if (url.includes("path=folder")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockNestedTree),
        });
      }
      if (url.includes("/file?path=")) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve("hello world"),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    render(
      <ThemeProvider>
        <RepositoriesApp />
      </ThemeProvider>,
    );

    // 1. Click repo to enter detail
    const repoCard = await screen.findByText("user/test-repo");
    fireEvent.click(repoCard);

    // 2. Find folder and click it
    const folderBtn = await screen.findByText("folder");
    fireEvent.click(folderBtn);

    // 3. Verify nested tree fetch
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("path=folder"),
        expect.anything(),
      );
    });

    // 4. Find file and click it
    const fileBtn = await screen.findByText("file.txt");
    fireEvent.click(fileBtn);

    // 5. Verify file fetch
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/file?path=folder%2Ffile.txt"),
        expect.anything(),
      );
    });

    // Verify breadcrumb or file name shown in editor area
    expect(await screen.findByText("folder/file.txt")).toBeDefined();
  });
});
