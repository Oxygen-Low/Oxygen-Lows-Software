// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { useStarredApps } from "./useStarredApps";

let mockSession: any = null;
let mockServerStarred: string[] | null = null;

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockSingle = vi.fn().mockImplementation(() =>
  Promise.resolve({
    data: mockServerStarred ? { starred_apps: mockServerStarred } : null,
    error: mockServerStarred ? null : { code: "PGRST116" },
  }),
);
const mockEq = vi.fn(() => ({ single: mockSingle }));
const mockSelect = vi.fn(() => ({ eq: mockEq }));
const mockFrom = vi.fn((_table?: string) => ({
  select: mockSelect,
  upsert: mockUpsert,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ session: mockSession, loading: false }),
}));

vi.mock("@/lib/db", () => ({
  getAuthenticatedClient: vi.fn(() => ({
    from: (table: string) => mockFrom(table),
  })),
}));

function Consumer() {
  const { starredApps, isStarred, toggleStar } = useStarredApps();
  return (
    <div>
      <span data-testid="list">{starredApps.join(",")}</span>
      <span data-testid="chat-starred">{String(isStarred("chat"))}</span>
      <button onClick={() => toggleStar("chat")}>Toggle chat</button>
    </div>
  );
}

describe("useStarredApps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSession = null;
    mockServerStarred = null;
  });

  afterEach(() => {
    cleanup();
  });

  it("stores stars in localStorage for anonymous users without touching the account", async () => {
    render(<Consumer />);

    await waitFor(() =>
      expect(screen.getByTestId("list").textContent).toBe(""),
    );

    fireEvent.click(screen.getByRole("button", { name: "Toggle chat" }));
    await waitFor(() =>
      expect(screen.getByTestId("chat-starred").textContent).toBe("true"),
    );

    expect(JSON.parse(localStorage.getItem("starred_apps:guest")!)).toEqual([
      "chat",
    ]);
    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("loads stars from the user_preferences account row when signed in", async () => {
    mockSession = { user: { id: "user-42" }, access_token: "token-42" };
    mockServerStarred = ["json-formatter", "chat"];

    render(<Consumer />);

    await waitFor(() =>
      expect(screen.getByTestId("list").textContent).toBe(
        "json-formatter,chat",
      ),
    );
    expect(mockFrom).toHaveBeenCalledWith("user_preferences");
    expect(mockEq).toHaveBeenCalledWith("user_id", "user-42");
    expect(JSON.parse(localStorage.getItem("starred_apps:user-42")!)).toEqual([
      "json-formatter",
      "chat",
    ]);
  });

  it("persists toggles to the account while keeping the other preferences intact", async () => {
    mockSession = { user: { id: "user-42" }, access_token: "token-42" };

    render(<Consumer />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Toggle chat" }));
    });

    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith(
        { user_id: "user-42", starred_apps: ["chat"] },
        { onConflict: "user_id" },
      ),
    );
    expect(JSON.parse(localStorage.getItem("starred_apps:user-42")!)).toEqual([
      "chat",
    ]);
  });

  it("falls back to local stars when the account has no preference row", async () => {
    mockSession = { user: { id: "user-42" }, access_token: "token-42" };
    localStorage.setItem("starred_apps:user-42", JSON.stringify(["chatbot"]));

    render(<Consumer />);

    await waitFor(() =>
      expect(screen.getByTestId("list").textContent).toBe("chatbot"),
    );
  });
});
