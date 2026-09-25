/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminPartners from "./AdminPartners";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "mock-admin-token", user: { id: "1", role: "admin" } },
  }),
}));

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("AdminPartners Page", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockToast.mockReset();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("renders Admin Partners header and tabs with loaded partners data", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        existing_partners: [
          {
            id: "p1",
            name: "Cloudflare",
            logo_url: "",
            website_url: "https://cloudflare.com",
            description: "CDN and DDoS protection partner",
            category: "Infrastructure",
          },
        ],
        wanted_partners: [
          {
            id: "w1",
            category: "Game Studios",
            target_companies: "Indie Studios",
            what_we_provide: "Publishing platform",
            what_is_requested: "Cross-promotion",
          },
        ],
      }),
    });

    render(
      <MemoryRouter>
        <AdminPartners />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /Partners Management/i, level: 1 })).toBeDefined();
    expect(await screen.findByText("Cloudflare")).toBeDefined();
    expect(screen.getByText("CDN and DDoS protection partner")).toBeDefined();
  });

  it("switches to Wanted Categories tab and displays opportunities", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        existing_partners: [],
        wanted_partners: [
          {
            id: "w1",
            category: "Game Studios",
            target_companies: "Indie Studios",
            what_we_provide: "Publishing platform",
            what_is_requested: "Cross-promotion",
          },
        ],
      }),
    });

    render(
      <MemoryRouter>
        <AdminPartners />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /Partners Management/i, level: 1 })).toBeDefined();
    expect(await screen.findByText("No existing partners added yet.")).toBeDefined();

    const wantedTab = screen.getByRole("tab", { name: /Wanted Categories/i });
    fireEvent.click(wantedTab);

    await waitFor(() => {
      expect(screen.getByText("Game Studios")).toBeDefined();
      expect(screen.getByText("Publishing platform")).toBeDefined();
    });
  });
});
