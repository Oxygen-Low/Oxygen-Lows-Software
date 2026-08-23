/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Download from "./Download";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

describe("Download Page", () => {
  it("renders Windows and Android download cards with correct download URLs", () => {
    render(
      <MemoryRouter>
        <Download />
      </MemoryRouter>
    );

    expect(screen.getByText("Windows")).toBeDefined();
    expect(screen.getByText("Android")).toBeDefined();

    const links = screen.getAllByRole("link");
    const windowsLink = links.find((link) =>
      link.getAttribute("href")?.includes("OxygenLowsSoftware_Installer.exe")
    );
    const androidLink = links.find((link) =>
      link.getAttribute("href")?.includes("OxygenLowsSoftware.apk")
    );

    expect(windowsLink).toBeDefined();
    expect(windowsLink?.getAttribute("href")).toBe(
      "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware_Installer.exe"
    );

    expect(androidLink).toBeDefined();
    expect(androidLink?.getAttribute("href")).toBe(
      "https://github.com/Oxygen-Low/Oxygen-Lows-Software/releases/latest/download/OxygenLowsSoftware.apk"
    );
  });
});
