/** @vitest-environment jsdom */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ErrorBoundary } from "./ErrorBoundary";

const ProblemChild = ({ shouldThrow, message }: { shouldThrow: boolean; message: string }) => {
  if (shouldThrow) {
    throw new Error(message);
  }
  return <div>Normal Content</div>;
};

describe("ErrorBoundary", () => {
  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} message="" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Normal Content")).toBeDefined();
  });

  it("renders error state when a general error occurs", () => {
    // Suppress console.error in tests for expected thrown error
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} message="Something broken" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeDefined();
    expect(screen.getByText("Something broken")).toBeDefined();
    expect(screen.getByRole("button", { name: /Reload Page/i })).toBeDefined();

    spy.mockRestore();
  });

  it("renders chunk load error state when dynamic import fails", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild
          shouldThrow={true}
          message="Failed to fetch dynamically imported module: https://oxygenlow.com/assets/Download-123.js"
        />
      </ErrorBoundary>,
    );

    expect(screen.getByText("New Version Available")).toBeDefined();
    expect(
      screen.getByText(/A new version of the app was deployed/i),
    ).toBeDefined();

    spy.mockRestore();
  });
});
