/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MigrationModal } from "./MigrationModal";
import { LanguageProvider } from "@/contexts/LanguageContext";

const mockMigrateAccount = vi.fn().mockResolvedValue({ success: true });
const mockSignOut = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    supabaseSession: {
      access_token: "mock-sb-token",
      user: {
        id: "sb-user-123",
        email: "testuser@gmail.com",
        user_metadata: { username: "testgoogleuser" },
      },
    },
    hasSupabaseSession: true,
    migrateAccount: mockMigrateAccount,
    signOut: mockSignOut,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("MigrationModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("should render migration modal when open with prefilled username and email", async () => {
    render(
      <LanguageProvider>
        <MigrationModal isOpen={true} />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("testgoogleuser")).toBeDefined();
      expect(screen.getByDisplayValue("testuser@gmail.com")).toBeDefined();
    });
  });

  it("should allow entering passwords and submitting migration", async () => {
    render(
      <LanguageProvider>
        <MigrationModal isOpen={true} />
      </LanguageProvider>,
    );

    const passwordInput = screen.getByPlaceholderText("Min 6 characters");
    const confirmInput = screen.getByPlaceholderText("Confirm password");
    const submitButton = screen.getByRole("button", {
      name: /migrate account/i,
    });

    fireEvent.change(passwordInput, { target: { value: "secret12345" } });
    fireEvent.change(confirmInput, { target: { value: "secret12345" } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mockMigrateAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          supabaseToken: "mock-sb-token",
          username: "testgoogleuser",
          email: "testuser@gmail.com",
          password: "secret12345",
        }),
      );
    });
  });

  it("should allow uploading a .key file to populate the master key", async () => {
    render(
      <LanguageProvider>
        <MigrationModal isOpen={true} />
      </LanguageProvider>,
    );

    const keyHex =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const file = new File([keyHex], "master.key", {
      type: "application/octet-stream",
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue(keyHex)).toBeDefined();
    });
  });
});
