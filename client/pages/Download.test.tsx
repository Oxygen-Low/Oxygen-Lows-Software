/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Download from "./Download";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

describe("Download Page", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("renders Windows and Android download cards with default download URLs", () => {
    global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

    render(
      <MemoryRouter>
        <Download />
      </MemoryRouter>,
    );

    expect(screen.getByText("Windows")).toBeDefined();
    expect(screen.getByText("Android")).toBeDefined();

    const links = screen.getAllByRole("link");
    const windowsLink = links.find((link) =>
      link.getAttribute("href")?.includes("OxygenLowsSoftware_Installer.exe"),
    );
    const androidLink = links.find((link) =>
      link.getAttribute("href")?.includes("OxygenLowsSoftware.apk"),
    );

    expect(windowsLink).toBeDefined();
    expect(windowsLink?.getAttribute("href")).toBe(
      "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware_Installer.exe",
    );

    expect(androidLink).toBeDefined();
    expect(androidLink?.getAttribute("href")).toBe(
      "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware.apk",
    );
  });

  it("updates URLs to direct release assets when API returns valid releases", async () => {
    const mockReleases = [
      {
        tag_name: "v1.3.1",
        draft: false,
        assets: [
          {
            name: "OxygenLowsSoftware_Installer.exe",
            browser_download_url:
              "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1.3.1/OxygenLowsSoftware_Installer.exe",
          },
          {
            name: "OxygenLowsSoftware.apk",
            browser_download_url:
              "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1.3.1/OxygenLowsSoftware.apk",
          },
        ],
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockReleases,
    } as any);

    render(
      <MemoryRouter>
        <Download />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const windowsLink = links.find((link) =>
        link
          .getAttribute("href")
          ?.includes("v1.3.1/OxygenLowsSoftware_Installer.exe"),
      );
      const androidLink = links.find((link) =>
        link.getAttribute("href")?.includes("v1.3.1/OxygenLowsSoftware.apk"),
      );

      expect(windowsLink?.getAttribute("href")).toBe(
        "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1.3.1/OxygenLowsSoftware_Installer.exe",
      );
      expect(androidLink?.getAttribute("href")).toBe(
        "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1.3.1/OxygenLowsSoftware.apk",
      );
    });
  });

  it("falls back to previous release if newest release is still missing build assets", async () => {
    const mockReleases = [
      {
        tag_name: "v1.3.2",
        draft: false,
        assets: [], // New release created, but build still running / no assets yet
      },
      {
        tag_name: "v1.3.1",
        draft: false,
        assets: [
          {
            name: "OxygenLowsSoftware_Installer.exe",
            browser_download_url:
              "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1.3.1/OxygenLowsSoftware_Installer.exe",
          },
          {
            name: "OxygenLowsSoftware.apk",
            browser_download_url:
              "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1.3.1/OxygenLowsSoftware.apk",
          },
        ],
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockReleases,
    } as any);

    render(
      <MemoryRouter>
        <Download />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const links = screen.getAllByRole("link");
      const windowsLink = links.find((link) =>
        link
          .getAttribute("href")
          ?.includes("v1.3.1/OxygenLowsSoftware_Installer.exe"),
      );
      const androidLink = links.find((link) =>
        link.getAttribute("href")?.includes("v1.3.1/OxygenLowsSoftware.apk"),
      );

      expect(windowsLink?.getAttribute("href")).toBe(
        "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1.3.1/OxygenLowsSoftware_Installer.exe",
      );
      expect(androidLink?.getAttribute("href")).toBe(
        "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/download/v1.3.1/OxygenLowsSoftware.apk",
      );
    });
  });

  it("handles fetch errors gracefully and retains default URLs", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    render(
      <MemoryRouter>
        <Download />
      </MemoryRouter>,
    );

    const links = screen.getAllByRole("link");
    const windowsLink = links.find((link) =>
      link.getAttribute("href")?.includes("OxygenLowsSoftware_Installer.exe"),
    );
    const androidLink = links.find((link) =>
      link.getAttribute("href")?.includes("OxygenLowsSoftware.apk"),
    );

    expect(windowsLink?.getAttribute("href")).toBe(
      "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware_Installer.exe",
    );
    expect(androidLink?.getAttribute("href")).toBe(
      "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware.apk",
    );
  });
});
