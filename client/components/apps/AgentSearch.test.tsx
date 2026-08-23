import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { AgentSearchApp } from "./AgentSearch";
import { useAgentSearch } from "@/hooks/useAgentSearch";

// Mock hooks
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: { access_token: "test_token" } })
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({ t: (key: string, _p?: any, fallback?: string) => fallback || key })
}));

vi.mock("@/hooks/useAgentSearch", () => ({
  useAgentSearch: vi.fn()
}));

// Mock Layout so we can just render the component
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>
}));

describe("AgentSearchApp", () => {
  it("renders correctly", () => {
    (useAgentSearch as any).mockReturnValue({
      search: vi.fn(),
      isSearching: false,
      status: "",
      toolCalls: [],
      result: null,
      error: null,
      abort: vi.fn()
    });

    render(<AgentSearchApp />);
    
    // Check if the title rendered using our mock fallback
    expect(screen.getByText("Agent Search")).toBeDefined();
    // Check if search button rendered
    expect(screen.getByRole("button", { name: /Agent Search/i })).toBeDefined(); // The search button uses the same translation or icon?
  });
});
