/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { SimpleCookiesApp } from "./SimpleCookies";
import { LanguageProvider } from "@/contexts/LanguageContext";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "test-token", user: { id: "u1", username: "test" } },
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
});
