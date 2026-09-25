/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Partners from "./Partners";

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

const mockToast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

describe("Partners Page", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockReset();
    mockToast.mockReset();

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("renders partner page header, email button, support button, and partners", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        existing_partners: [
          {
            id: "p1",
            name: "CloudTech",
            logo_url: "",
            website_url: "https://cloudtech.example",
            description: "Cloud computing partner",
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
        <Partners />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /Oxygen Low's Software Partners/i, level: 1 })).toBeDefined();
    expect(await screen.findByText("CloudTech")).toBeDefined();
    expect(screen.getByText("Cloud computing partner")).toBeDefined();
    expect(screen.getByText("Infrastructure")).toBeDefined();
  });

  it("copies email address to clipboard when clicking Copy Email button", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ existing_partners: [], wanted_partners: [] }),
    });

    render(
      <MemoryRouter>
        <Partners />
      </MemoryRouter>,
    );

    const copyBtn = (await screen.findAllByRole("button", { name: /Copy Email/i }))[0];
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("partner@oxygenlow.com");
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Email Copied",
        }),
      );
    });
  });

  it("navigates to support page with partner request query params when clicking Request Partnership", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ existing_partners: [], wanted_partners: [] }),
    });

    render(
      <MemoryRouter>
        <Partners />
      </MemoryRouter>,
    );

    const supportBtn = (await screen.findAllByRole("button", { name: /Request Partnership/i }))[0];
    fireEvent.click(supportBtn);

    expect(mockNavigate).toHaveBeenCalledWith("/support?type=Partner+Request&open=true");
  });

  it("opens modal when clicking View Wanted Partner Opportunities", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        existing_partners: [],
        wanted_partners: [
          {
            id: "w1",
            category: "AI Infrastructure",
            target_companies: "Cloudflare",
            what_we_provide: "Compute credits showcase",
            what_is_requested: "API rate limits boost",
          },
        ],
      }),
    });

    render(
      <MemoryRouter>
        <Partners />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: /Oxygen Low's Software Partners/i, level: 1 })).toBeDefined();

    const wantedBtn = (await screen.findAllByRole("button", { name: /View Wanted Partner Opportunities/i }))[0];
    fireEvent.click(wantedBtn);

    expect(await screen.findByRole("heading", { name: /Wanted Partner Categories & Opportunities/i })).toBeDefined();
    expect(screen.getByText("AI Infrastructure")).toBeDefined();
    expect(screen.getByText("Compute credits showcase")).toBeDefined();
  });
});
