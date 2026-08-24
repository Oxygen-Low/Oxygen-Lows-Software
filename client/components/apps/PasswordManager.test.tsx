/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PasswordManagerApp } from "./PasswordManager";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  generateAes256Key,
  setActiveMasterKey,
  clearActiveMasterKey,
  setCategoryEncryptionEnabled,
} from "@/lib/crypto";

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

window.scrollTo = vi.fn();

// Mock clipboard
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

// Mock sonner
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useAuth
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { user: { id: "test-user-123" } },
    loading: false,
    error: null,
  }),
}));

const mockPasswords = [
  {
    id: "pw-1",
    user_id: "test-user-123",
    title: "GitHub Account",
    url: "https://github.com/login",
    password: "Password123!",
    notes: "Main work account",
    created_at: "2026-08-01T12:00:00Z",
    updated_at: "2026-08-01T12:00:00Z",
  },
  {
    id: "pw-2",
    user_id: "test-user-123",
    title: "Google Workspace",
    url: "https://accounts.google.com",
    password: "SecretGooglePass!",
    notes: null,
    created_at: "2026-08-02T12:00:00Z",
    updated_at: "2026-08-02T12:00:00Z",
  },
];

describe("PasswordManagerApp", () => {
  let insertMock: any;
  let updateMock: any;
  let deleteMock: any;
  let orderMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    insertMock = vi.fn().mockResolvedValue({ data: null, error: null });
    updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    orderMock = vi.fn().mockResolvedValue({ data: [...mockPasswords], error: null });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "user_passwords") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: orderMock,
            }),
            order: orderMock,
          }),
          insert: insertMock,
          update: updateMock,
          delete: deleteMock,
        } as any;
      }
      return {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      } as any;
    });
  });

  afterEach(() => {
    cleanup();
    clearActiveMasterKey();
    setCategoryEncryptionEnabled("passwords", false);
  });

  it("renders encryption required banner when encryption is disabled", () => {
    setCategoryEncryptionEnabled("passwords", false);
    render(
      <MemoryRouter>
        <PasswordManagerApp />
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Encryption Required/i)).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /Enable Password Encryption/i }),
    ).not.toBeNull();
  });

  it("enables encryption when clicking Enable Password Encryption", async () => {
    setCategoryEncryptionEnabled("passwords", false);
    render(
      <MemoryRouter>
        <PasswordManagerApp />
      </MemoryRouter>,
    );

    const enableBtn = screen.getByRole("button", {
      name: /Enable Password Encryption/i,
    });
    fireEvent.click(enableBtn);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/Password encryption enabled/i),
      );
    });
  });

  it("renders form and password vault when encryption is enabled and master key active", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("passwords", true);

    render(
      <MemoryRouter>
        <PasswordManagerApp />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText("GitHub Account")).not.toBeNull();
      expect(screen.queryByText("Google Workspace")).not.toBeNull();
    });

    expect(screen.queryByPlaceholderText(/e\.g\. GitHub Account/i)).not.toBeNull();
    expect(screen.queryByPlaceholderText(/https:\/\/example\.com/i)).not.toBeNull();
  });

  it("filters passwords based on search query", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("passwords", true);

    render(
      <MemoryRouter>
        <PasswordManagerApp />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText("GitHub Account")).not.toBeNull();
    });

    const searchInput = screen.getByPlaceholderText(/Search by title or URL/i);
    fireEvent.change(searchInput, { target: { value: "GitHub" } });

    expect(screen.queryByText("GitHub Account")).not.toBeNull();
    expect(screen.queryByText("Google Workspace")).toBeNull();
  });

  it("can toggle password generator and apply generated password", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("passwords", true);

    render(
      <MemoryRouter>
        <PasswordManagerApp />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Show Generator/i)).not.toBeNull();
    });

    fireEvent.click(screen.getByText(/Show Generator/i));

    expect(screen.queryByText(/Password Generator/i)).not.toBeNull();
    expect(screen.queryByText(/Apply to Password Field/i)).not.toBeNull();

    fireEvent.click(screen.getByText(/Apply to Password Field/i));

    const pwInput = screen.getByPlaceholderText(/Enter or generate a password/i) as HTMLInputElement;
    expect(pwInput.value.length).toBeGreaterThan(0);
  });

  it("saves a new password record", async () => {
    const key = generateAes256Key();
    setActiveMasterKey(key);
    setCategoryEncryptionEnabled("passwords", true);

    render(
      <MemoryRouter>
        <PasswordManagerApp />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.queryByText("GitHub Account")).not.toBeNull();
    });

    const titleInput = screen.getByPlaceholderText(/e\.g\. GitHub Account/i);
    const urlInput = screen.getByPlaceholderText(/https:\/\/example\.com/i);
    const pwInput = screen.getByPlaceholderText(/Enter or generate a password/i);

    fireEvent.change(titleInput, { target: { value: "Twitter/X" } });
    fireEvent.change(urlInput, { target: { value: "https://x.com" } });
    fireEvent.change(pwInput, { target: { value: "MySecret123!" } });

    const saveBtn = screen.getByRole("button", { name: /Save Password/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/Password saved/i),
      );
    });
  });
});
