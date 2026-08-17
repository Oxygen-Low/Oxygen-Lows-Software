/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageSelect } from "./LanguageSelect";

describe("LanguageSelect Component", () => {
  it("renders with default language selection and FlagCDN country flag", () => {
    const { container } = render(<LanguageSelect value="English" />);
    expect(screen.getByText("English")).toBeDefined();
    const img = container.querySelector("img");
    expect(img).toBeDefined();
    expect(img?.getAttribute("src")).toBe("https://flagcdn.com/w40/gb.png");
    expect(img?.getAttribute("srcset")).toBe("https://flagcdn.com/w80/gb.png 2x");
  });

  it("renders Korean language selection with South Korea FlagCDN flag", () => {
    const { container } = render(<LanguageSelect value="Korean" />);
    expect(screen.getByText("Korean")).toBeDefined();
    const img = container.querySelector("img");
    expect(img).toBeDefined();
    expect(img?.getAttribute("src")).toBe("https://flagcdn.com/w40/kr.png");
  });

  it("renders with custom id and accessibility label", () => {
    render(
      <LanguageSelect
        id="custom-lang-select"
        ariaLabel="Choose language"
        value="English"
      />,
    );
    const trigger = screen.getByLabelText("Choose language");
    expect(trigger).toBeDefined();
    expect(trigger.getAttribute("id")).toBe("custom-lang-select");
  });
});
