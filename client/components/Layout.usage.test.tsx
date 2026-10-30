// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { Layout } from "./Layout";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user" } },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({ unreadCount: 0 }),
}));

vi.mock("@/hooks/useAiModels", () => ({
  useAiModels: () => ({
    pollenBalance: 15.5,
    pollinationsApiKey: "pk_test_123",
    freeUsage: {
      userId: "test-user",
      ip: "127.0.0.1",
      date: "2026-10-21",
      userCountOnIp: 1,
      baseDailyPoints: 25,
      effectiveLimitPoints: 25,
      usedPoints: 5.2,
      remainingPoints: 19.8,
      models: {},
    },
  }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: (_key: string, _params?: any, fallback?: string) => fallback || _key,
  }),
}));

vi.mock("./TopbarMusicPlayer", () => ({
  TopbarMusicPlayer: () => null,
}));

describe("Layout - Usage Card", () => {
  it("renders Usage card above Pollinations pollen wallet button", () => {
    render(
      <BrowserRouter>
        <Layout>
          <div>Main Content</div>
        </Layout>
      </BrowserRouter>,
    );

    const usageCard = screen.getByTestId("sidebar-usage-card");
    expect(usageCard).toBeDefined();

    expect(screen.getByText("Usage")).toBeDefined();
    expect(screen.getByText(/19\.8 \/ 25 pts/)).toBeDefined();

    // Verify pollen wallet is also rendered
    const pollenWallet = screen.getByTestId("sidebar-pollen-wallet");
    expect(pollenWallet).toBeDefined();
  });
});
