/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Privacy from "./Privacy";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/usePageTitle", () => ({
  usePageTitle: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("Privacy Policy", () => {
  it("renders the Privacy Policy header and correct operator name", () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeDefined();
    expect(screen.getAllByText(/Oxygen Low's Software/).length).toBeGreaterThan(0);
  });

  it("includes the dedicated Google OAuth & User Data section", () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "5. Google API Services & OAuth User Data",
      }),
    ).toBeDefined();
  });

  it("details the OAuth scopes requested and their purposes", () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    );

    expect(screen.getByText("openid")).toBeDefined();
    expect(
      screen.getByText("https://www.googleapis.com/auth/userinfo.email"),
    ).toBeDefined();
    expect(
      screen.getByText("https://www.googleapis.com/auth/userinfo.profile"),
    ).toBeDefined();
  });

  it("includes Google Limited Use compliance disclosure", () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/adhere to the/i),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: /Google API Services User Data Policy/i }),
    ).toHaveProperty(
      "href",
      "https://developers.google.com/terms/api-services-user-data-policy",
    );
    expect(
      screen.getByText(/We do not sell, rent, or lease your Google user data/i),
    ).toBeDefined();
    expect(
      screen.getByText(/We do not use or transfer your Google user data to serve advertisements/i),
    ).toBeDefined();
    expect(
      screen.getByText(/We do not use your Google user data to train, retrain, or fine-tune generalized artificial intelligence/i),
    ).toBeDefined();
  });

  it("describes how users can unlink or revoke permissions", () => {
    render(
      <MemoryRouter>
        <Privacy />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/Settings → Security → OAuth/i),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: /Google Account Third-Party Permissions/i }),
    ).toHaveProperty("href", "https://myaccount.google.com/permissions");
  });
});
