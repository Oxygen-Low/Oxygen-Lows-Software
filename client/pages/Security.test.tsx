/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Security from "./Security";
import { useAuth } from "@/hooks/useAuth";
import { clearActiveMasterKey } from "@/lib/crypto";

// Mock db
let mockIntegrationsCount = 0;
let mockPasswordsCount = 0;

vi.mock("@/lib/db", () => {
  const queryBuilder: any = {
    select: vi.fn().mockImplementation((_cols: string, opts?: any) => {
      if (opts?.count === "exact" && opts?.head === true) {
        return Promise.resolve({
          count: mockIntegrationsCount || mockPasswordsCount,
          error: null,
        });
      }
      return queryBuilder;
    }),
    eq: vi.fn().mockImplementation(() => queryBuilder),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) =>
      resolve({
        count: mockIntegrationsCount || mockPasswordsCount,
        data: [],
        error: null,
      }),
    ),
  };
  const mockClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "u" } } },
        error: null,
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
    from: vi.fn().mockReturnValue(queryBuilder),
  };
  return {
    db: mockClient,
    supabase: mockClient,
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const renderWithRouter = (initialEntries = ["/security"]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <Security />
    </MemoryRouter>,
  );

describe("Security Page Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    clearActiveMasterKey();
    mockIntegrationsCount = 0;
    mockPasswordsCount = 0;
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "user@test.com" } },
      changePassword: vi.fn().mockResolvedValue({ success: true }),
    });

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Security page with header and Zero-Knowledge Password Encryption card in locked state", () => {
    renderWithRouter();
    expect(screen.getByText("Security & Data Encryption")).toBeDefined();
    expect(screen.getByText("Zero-Knowledge Password Encryption")).toBeDefined();
    expect(screen.getByText("Session Locked")).toBeDefined();
    expect(document.getElementById("unlock-password-input")).toBeDefined();
    expect(document.getElementById("unlock-with-password-btn")).toBeDefined();

    // Obsolete masterkey elements must NOT exist
    expect(document.getElementById("generate-masterkey-btn")).toBeNull();
    expect(screen.queryByText("AES-256 Masterkey")).toBeNull();
    expect(screen.queryByText("No Masterkey Set")).toBeNull();
    expect(screen.queryByText("Key Format")).toBeNull();
    expect(screen.queryByText("Show QR Code")).toBeNull();
    expect(screen.queryByText("Download key")).toBeNull();
  });

  it("renders encryption toggles for Characters, Data Save, Chatbot, Integrations, and Password Vault", () => {
    renderWithRouter();
    expect(screen.getByText("Protected Data Categories")).toBeDefined();
    expect(screen.getByText("Characters and Universes")).toBeDefined();
    expect(screen.getByText("Data Save Entries")).toBeDefined();
    expect(screen.getByText("Chatbot Chats")).toBeDefined();
    expect(screen.getByText("API Keys & Integrations")).toBeDefined();
    expect(screen.getByText("Password Vault")).toBeDefined();
  });

  it("disables category toggles and displays requirement notice when session is locked", () => {
    renderWithRouter();
    expect(
      screen.getByText(
        "Your session is currently locked. Enter your password above to modify encryption settings.",
      ),
    ).toBeDefined();

    const charactersToggle = document.getElementById(
      "toggle-characters",
    ) as HTMLButtonElement;
    const dataSaveToggle = document.getElementById(
      "toggle-datasave",
    ) as HTMLButtonElement;
    const chatbotToggle = document.getElementById(
      "toggle-chatbot",
    ) as HTMLButtonElement;
    const integrationsToggle = document.getElementById(
      "toggle-integrations",
    ) as HTMLButtonElement;
    const passwordsToggle = document.getElementById(
      "toggle-passwords",
    ) as HTMLButtonElement;

    expect(charactersToggle.disabled).toBe(true);
    expect(dataSaveToggle.disabled).toBe(true);
    expect(chatbotToggle.disabled).toBe(true);
    expect(integrationsToggle.disabled).toBe(true);
    expect(passwordsToggle.disabled).toBe(true);

    fireEvent.click(charactersToggle);
    expect(localStorage.getItem("oxygen_encrypt_characters")).toBeNull();
  });

  it("allows unlocking session with account password and shows active encryption state", async () => {
    renderWithRouter();
    const passwordInput = document.getElementById(
      "unlock-password-input",
    ) as HTMLInputElement;
    expect(passwordInput).toBeDefined();

    fireEvent.change(passwordInput, { target: { value: "MySecurePass123!" } });

    const unlockBtn = document.getElementById(
      "unlock-with-password-btn",
    ) as HTMLButtonElement;
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getByText("Encryption Active")).toBeDefined();
      expect(screen.getByText("Active Session Protected")).toBeDefined();
      expect(screen.getByText("AES-256-GCM")).toBeDefined();
      expect(screen.getByText("PBKDF2 (200k iterations)")).toBeDefined();
      expect(screen.getByText("Zero-Knowledge")).toBeDefined();
      expect(document.getElementById("change-password-btn")).toBeDefined();
      expect(document.getElementById("migrate-masterkey-btn")).toBeDefined();
      expect(document.getElementById("lock-session-btn")).toBeDefined();
      expect(sessionStorage.getItem("oxygen_active_master_key")).not.toBeNull();
    });
  });

  it("allows toggling encryption and saves to localStorage when unlocked", async () => {
    renderWithRouter();

    // Unlock session first
    const passwordInput = document.getElementById(
      "unlock-password-input",
    ) as HTMLInputElement;
    fireEvent.change(passwordInput, { target: { value: "MySecurePass123!" } });
    fireEvent.click(document.getElementById("unlock-with-password-btn")!);

    await waitFor(() => {
      expect(screen.getByText("Encryption Active")).toBeDefined();
    });

    const charactersToggle = document.getElementById(
      "toggle-characters",
    ) as HTMLButtonElement;
    expect(charactersToggle.disabled).toBe(false);

    fireEvent.click(charactersToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_characters")).toBe("true");
    });

    fireEvent.click(charactersToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_characters")).toBe("false");
    });
  });

  it("allows toggling encryption for Data Save, Chatbot, Integrations, and Passwords", async () => {
    renderWithRouter();

    // Unlock session
    fireEvent.change(document.getElementById("unlock-password-input")!, {
      target: { value: "MySecurePass123!" },
    });
    fireEvent.click(document.getElementById("unlock-with-password-btn")!);

    await waitFor(() => {
      expect(screen.getByText("Encryption Active")).toBeDefined();
    });

    const dataSaveToggle = document.getElementById(
      "toggle-datasave",
    ) as HTMLButtonElement;
    const chatbotToggle = document.getElementById(
      "toggle-chatbot",
    ) as HTMLButtonElement;
    const integrationsToggle = document.getElementById(
      "toggle-integrations",
    ) as HTMLButtonElement;
    const passwordsToggle = document.getElementById(
      "toggle-passwords",
    ) as HTMLButtonElement;

    fireEvent.click(dataSaveToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_data_save")).toBe("true");
    });

    fireEvent.click(chatbotToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_chatbot")).toBe("true");
    });

    fireEvent.click(integrationsToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_integrations")).toBe("true");
    });

    fireEvent.click(passwordsToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_passwords")).toBe("true");
    });
  });

  it("locks session and clears key on Lock Session click", async () => {
    renderWithRouter();

    // Unlock session
    fireEvent.change(document.getElementById("unlock-password-input")!, {
      target: { value: "MySecurePass123!" },
    });
    fireEvent.click(document.getElementById("unlock-with-password-btn")!);

    await waitFor(() => {
      expect(screen.getByText("Encryption Active")).toBeDefined();
    });

    fireEvent.click(document.getElementById("lock-session-btn")!);

    await waitFor(() => {
      expect(screen.getByText("Session Locked")).toBeDefined();
      expect(sessionStorage.getItem("oxygen_active_master_key")).toBeNull();
      const charactersToggle = document.getElementById(
        "toggle-characters",
      ) as HTMLButtonElement;
      expect(charactersToggle.disabled).toBe(true);
    });
  });

  it("shows returnTo banner when redirected with returnTo query param and session is unlocked", async () => {
    renderWithRouter(["/security?returnTo=%2Fcharacters"]);

    // Unlock session
    fireEvent.change(document.getElementById("unlock-password-input")!, {
      target: { value: "MySecurePass123!" },
    });
    fireEvent.click(document.getElementById("unlock-with-password-btn")!);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Encryption active. You can now return to your previous page:",
        ),
      ).toBeDefined();
      expect(screen.getByText("/characters")).toBeDefined();
      expect(screen.getByText("Return to Page")).toBeDefined();
    });
  });

  it("opens Change Password dialog and calls useAuth().changePassword", async () => {
    const mockChangePassword = vi.fn().mockResolvedValue({ success: true });
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "user@test.com" } },
      changePassword: mockChangePassword,
    });

    renderWithRouter();

    // Unlock session
    fireEvent.change(document.getElementById("unlock-password-input")!, {
      target: { value: "MySecurePass123!" },
    });
    fireEvent.click(document.getElementById("unlock-with-password-btn")!);

    await waitFor(() => {
      expect(screen.getByText("Encryption Active")).toBeDefined();
    });

    fireEvent.click(document.getElementById("change-password-btn")!);

    await waitFor(() => {
      expect(document.getElementById("current-password-input")).toBeDefined();
    });

    fireEvent.change(document.getElementById("current-password-input")!, {
      target: { value: "OldPassword123!" },
    });
    fireEvent.change(document.getElementById("new-password-input")!, {
      target: { value: "NewPassword123!" },
    });
    fireEvent.change(document.getElementById("confirm-new-password-input")!, {
      target: { value: "NewPassword123!" },
    });

    const submitBtn = document.getElementById(
      "submit-change-password-btn",
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockChangePassword).toHaveBeenCalledWith(
        "OldPassword123!",
        "NewPassword123!",
      );
    });
  });

  it("validates password mismatch and length in Change Password dialog", async () => {
    const mockChangePassword = vi.fn().mockResolvedValue({ success: true });
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "user@test.com" } },
      changePassword: mockChangePassword,
    });

    renderWithRouter();

    // Unlock session
    fireEvent.change(document.getElementById("unlock-password-input")!, {
      target: { value: "MySecurePass123!" },
    });
    fireEvent.click(document.getElementById("unlock-with-password-btn")!);

    await waitFor(() => {
      expect(screen.getByText("Encryption Active")).toBeDefined();
    });

    fireEvent.click(document.getElementById("change-password-btn")!);

    await waitFor(() => {
      expect(document.getElementById("current-password-input")).toBeDefined();
    });

    // Test password too short
    fireEvent.change(document.getElementById("current-password-input")!, {
      target: { value: "OldPass123!" },
    });
    fireEvent.change(document.getElementById("new-password-input")!, {
      target: { value: "123" },
    });
    fireEvent.change(document.getElementById("confirm-new-password-input")!, {
      target: { value: "123" },
    });

    fireEvent.click(document.getElementById("submit-change-password-btn")!);

    await waitFor(() => {
      expect(
        screen.getByText("Password must be at least 6 characters long"),
      ).toBeDefined();
      expect(mockChangePassword).not.toHaveBeenCalled();
    });

    // Test password mismatch
    fireEvent.change(document.getElementById("new-password-input")!, {
      target: { value: "Password123!" },
    });
    fireEvent.change(document.getElementById("confirm-new-password-input")!, {
      target: { value: "DifferentPassword123!" },
    });

    fireEvent.click(document.getElementById("submit-change-password-btn")!);

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeDefined();
      expect(mockChangePassword).not.toHaveBeenCalled();
    });
  });

  it("opens Migrate from Masterkey dialog and completes migration", async () => {
    renderWithRouter();

    // Open from locked state helper button
    const inactiveMigrateBtn = document.getElementById(
      "inactive-migrate-btn",
    ) as HTMLButtonElement;
    expect(inactiveMigrateBtn).toBeDefined();
    fireEvent.click(inactiveMigrateBtn);

    await waitFor(() => {
      expect(document.getElementById("migrate-old-key-input")).toBeDefined();
    });

    const testOldKeyHex =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    fireEvent.change(document.getElementById("migrate-old-key-input")!, {
      target: { value: testOldKeyHex },
    });
    fireEvent.change(document.getElementById("migrate-password-input")!, {
      target: { value: "NewPassword123!" },
    });

    const submitBtn = document.getElementById(
      "submit-migrate-masterkey-btn",
    ) as HTMLButtonElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Encryption Active")).toBeDefined();
    });
  });

  it("allows uploading .key file in Migrate from Masterkey dialog", async () => {
    renderWithRouter();

    const inactiveMigrateBtn = document.getElementById(
      "inactive-migrate-btn",
    ) as HTMLButtonElement;
    fireEvent.click(inactiveMigrateBtn);

    await waitFor(() => {
      expect(document.getElementById("migrate-old-key-input")).toBeDefined();
    });

    const testKeyHex =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const fileContent = `===========================================================\n Oxygen Low's Software - AES-256 Masterkey Backup\n===========================================================\n\n[HEXADECIMAL MASTERKEY - 64 CHARACTERS]\n${testKeyHex}\n`;

    const file = new File([fileContent], "oxygen-masterkey.key", {
      type: "text/plain",
    });
    const fileInput = document.getElementById(
      "migrate-key-file-upload-input",
    ) as HTMLInputElement;
    expect(fileInput).toBeDefined();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      const oldKeyInput = document.getElementById(
        "migrate-old-key-input",
      ) as HTMLInputElement;
      expect(oldKeyInput.value).toBe(testKeyHex);
    });
  });

  it("shows error when invalid masterkey format is submitted in migration dialog", async () => {
    renderWithRouter();

    const inactiveMigrateBtn = document.getElementById(
      "inactive-migrate-btn",
    ) as HTMLButtonElement;
    fireEvent.click(inactiveMigrateBtn);

    await waitFor(() => {
      expect(document.getElementById("migrate-old-key-input")).toBeDefined();
    });

    fireEvent.change(document.getElementById("migrate-old-key-input")!, {
      target: { value: "invalid-key-text" },
    });
    fireEvent.change(document.getElementById("migrate-password-input")!, {
      target: { value: "Password123!" },
    });

    fireEvent.click(document.getElementById("submit-migrate-masterkey-btn")!);

    await waitFor(() => {
      expect(
        screen.getByText(
          "Invalid masterkey format. Must be a 256-bit key (64 hex characters or Base64).",
        ),
      ).toBeDefined();
    });
  });

  it("prevents disabling integrations encryption when stored integrations exist in database", async () => {
    renderWithRouter();

    // Unlock session first
    fireEvent.change(document.getElementById("unlock-password-input")!, {
      target: { value: "MySecurePass123!" },
    });
    fireEvent.click(document.getElementById("unlock-with-password-btn")!);

    await waitFor(() => {
      expect(screen.getByText("Encryption Active")).toBeDefined();
    });

    // Set integration active in localStorage
    localStorage.setItem("oxygen_encrypt_integrations", "true");
    // Re-render to pick up state or set mock
    mockIntegrationsCount = 2;

    const integrationsToggle = document.getElementById(
      "toggle-integrations",
    ) as HTMLButtonElement;

    fireEvent.click(integrationsToggle);

    await waitFor(() => {
      // Should not have disabled integrations in localStorage
      expect(localStorage.getItem("oxygen_encrypt_integrations")).toBe("true");
    });
  });

  it("does not render removed architecture section", () => {
    renderWithRouter();
    expect(
      screen.queryByText("Zero-Knowledge & Privacy Architecture"),
    ).toBeNull();
    expect(screen.queryByText("Custom AI Provider API Keys")).toBeNull();
  });
});
