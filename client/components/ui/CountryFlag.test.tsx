/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CountryFlag } from "./CountryFlag";

describe("CountryFlag Component", () => {
  it("renders flag image using FlagCDN for valid country code", () => {
    const { container } = render(<CountryFlag countryCode="kr" />);
    const img = container.querySelector("img");
    expect(img).toBeDefined();
    expect(img?.getAttribute("src")).toBe("https://flagcdn.com/w40/kr.png");
    expect(img?.getAttribute("srcset")).toBe("https://flagcdn.com/w80/kr.png 2x");
  });

  it("handles uppercase country codes correctly", () => {
    const { container } = render(<CountryFlag countryCode="GB" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://flagcdn.com/w40/gb.png");
  });

  it("falls back to Globe icon for empty or invalid country code length", () => {
    const { container } = render(<CountryFlag countryCode="" />);
    const img = container.querySelector("img");
    expect(img).toBeNull();
  });

  it("renders uppercase fallback badge when image fails to load", () => {
    const { container } = render(<CountryFlag countryCode="fr" />);
    const img = container.querySelector("img");
    expect(img).toBeDefined();
    if (img) {
      fireEvent.error(img);
    }
    expect(screen.getByText("FR")).toBeDefined();
  });
});
