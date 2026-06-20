/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { RepositoriesApp } from "./Repositories";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { toast } from "sonner";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: { user: { id: "123" } } }) }));
vi.mock("@/lib/supabase", () => {
    const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: vi.fn().mockResolvedValue({ data: [], error: null }),
        insert: vi.fn().mockResolvedValue({ data: null, error: null })
    };
    return {
        supabase: {
            auth: {
                getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "token" } } })),
                getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "123" } } })),
                onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
            },
            from: vi.fn(() => mockQueryBuilder),
            rpc: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }
    };
});

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn()
    }
}));

global.fetch = vi.fn().mockImplementation(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve([]),
    text: () => Promise.resolve("")
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
  });

  it("renders the main heading", async () => {
    render(<ThemeProvider><RepositoriesApp /></ThemeProvider>);
    expect(screen.getByText("Your Repositories")).toBeDefined();
  });

  it("fetches repositories with correct bearer token on mount", async () => {
    render(<ThemeProvider><RepositoriesApp /></ThemeProvider>);
    await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/repos", expect.objectContaining({
            headers: expect.objectContaining({
                Authorization: "Bearer token"
            })
        }));
    });
  });

  it("handles repository creation flow", async () => {
    (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
    })); // for mount fetch

    render(<ThemeProvider><RepositoriesApp /></ThemeProvider>);

    const nameInput = screen.getByPlaceholderText("Repo name...");
    fireEvent.change(nameInput, { target: { value: "test-repo" } });

    const createBtn = screen.getByText("New Repo");

    (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: "new-repo-id" }),
    }));

    fireEvent.click(createBtn);

    await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/repos", expect.objectContaining({
            method: "POST",
            body: expect.stringContaining('"name":"test-repo"')
        }));
        expect(toast.success).toHaveBeenCalledWith("Repository created");
    });
  });

  it("shows error toast on non-OK response during creation", async () => {
    (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
    })); // for mount fetch

    render(<ThemeProvider><RepositoriesApp /></ThemeProvider>);

    const nameInput = screen.getByPlaceholderText("Repo name...");
    fireEvent.change(nameInput, { target: { value: "error-repo" } });

    (global.fetch as any).mockImplementationOnce(() => Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Failed to create repository" })
    }));

    fireEvent.click(screen.getByText("New Repo"));

    await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Failed to create repository");
    });
  });
});
