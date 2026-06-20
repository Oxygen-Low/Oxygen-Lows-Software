/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RepositoriesApp } from "./Repositories";
import { ThemeProvider } from "@/contexts/ThemeContext";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: { user: { id: "123" } } }) }));
vi.mock("@/lib/supabase", () => {
    const mockQueryBuilder = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: null, error: null }), then: vi.fn().mockResolvedValue({ data: [], error: null }) };
    return { supabase: { auth: { getSession: vi.fn(() => Promise.resolve({ data: { session: { access_token: "token" } } })), getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "123" } } })), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) }, from: vi.fn(() => mockQueryBuilder), rpc: vi.fn(() => Promise.resolve({ data: [], error: null })) } };
});
global.fetch = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]), text: () => Promise.resolve("") }));
global.ResizeObserver = vi.fn().mockImplementation(() => ({ observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() }));

describe("RepositoriesApp", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });
  it("renders the main heading", async () => {
    render(<ThemeProvider><RepositoriesApp /></ThemeProvider>);
    expect(screen.getByText("Your Repositories")).toBeDefined();
  });
  it("renders the new repo button", async () => {
    render(<ThemeProvider><RepositoriesApp /></ThemeProvider>);
    expect(screen.getByText("New Repo")).toBeDefined();
  });
});
