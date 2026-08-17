/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageSelect } from "./LanguageSelect";

describe("LanguageSelect Component", () => {
  it("renders with default language selection and flag", () => {
    render(<LanguageSelect value="English" />);
    expect(screen.getByText("English")).toBeDefined();
    expect(screen.getByText("🇬🇧")).toBeDefined();
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
