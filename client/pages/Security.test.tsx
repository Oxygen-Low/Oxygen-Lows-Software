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
let mockPasswordsCount = 0;

vi.mock("@/lib/db", () => {
  const queryBuilder: any = {
    select: vi.fn().mockImplementation((_cols: string, opts?: any) => {
      if (opts?.count === "exact" && opts?.head === true) {
        return Promise.resolve({
          count: mockPasswordsCount,
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
        count: mockPasswordsCount,
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

    // Obsolete masterkey and removed sections must NOT exist
    expect(document.getElementById("generate-masterkey-btn")).toBeNull();
    expect(screen.queryByText("AES-256 Masterkey")).toBeNull();
    expect(screen.queryByText("No Masterkey Set")).toBeNull();
    expect(screen.queryByText("Key Format")).toBeNull();
    expect(screen.queryByText("Show QR Code")).toBeNull();
    expect(screen.queryByText("Download key")).toBeNull();
    expect(screen.queryByText("Active Session Protected")).toBeNull();
    expect(screen.queryByText("Migrate from Masterkey")).toBeNull();
    expect(document.getElementById("inactive-migrate-btn")).toBeNull();
    expect(document.getElementById("lock-session-btn")).toBeNull();
    expect(
      screen.queryByText(
        "Zero-Knowledge: Your encryption key is derived only in your browser session and is never sent to any server.",
      ),
    ).toBeNull();
  });

  it("renders encryption toggles for Characters, Data Save, Chatbot, and Password Vault", () => {
    renderWithRouter();
    expect(screen.getByText("Protected Data Categories")).toBeDefined();
    expect(screen.getByText("Characters and Universes")).toBeDefined();
    expect(screen.getByText("Data Save Entries")).toBeDefined();
    expect(screen.getByText("Chatbot Chats")).toBeDefined();
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
    const passwordsToggle = document.getElementById(
      "toggle-passwords",
    ) as HTMLButtonElement;

    expect(charactersToggle.disabled).toBe(true);
    expect(dataSaveToggle.disabled).toBe(true);
    expect(chatbotToggle.disabled).toBe(true);
    expect(passwordsToggle.disabled).toBe(true);

    fireEvent.click(charactersToggle);
    expect(localStorage.getItem("oxygen_encrypt_characters")).toBeNull();
  });

  it("allows unlocking session with account password and shows active encryption state without Active Session Protected banner", async () => {
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
      expect(document.getElementById("change-password-btn")).toBeDefined();
      expect(sessionStorage.getItem("oxygen_active_master_key")).not.toBeNull();
      // Ensure removed buttons and banners are not present
      expect(document.getElementById("lock-session-btn")).toBeNull();
      expect(screen.queryByText("Active Session Protected")).toBeNull();
      expect(document.getElementById("migrate-masterkey-btn")).toBeNull();
      expect(screen.queryByText("Migrate from Masterkey")).toBeNull();
      expect(
        screen.queryByText(
          "Zero-Knowledge: Your encryption key is derived only in your browser session and is never sent to any server.",
        ),
      ).toBeNull();
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

  it("allows toggling encryption for Data Save, Chatbot, and Passwords", async () => {
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

    fireEvent.click(passwordsToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_passwords")).toBe("true");
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

  it("does not render removed architecture section, lock session button, or client side notice", () => {
    renderWithRouter();
    expect(
      screen.queryByText("Zero-Knowledge & Privacy Architecture"),
    ).toBeNull();
    expect(screen.queryByText("Custom AI Provider API Keys")).toBeNull();
    expect(document.getElementById("lock-session-btn")).toBeNull();
    expect(
      screen.queryByText(
        "Zero-Knowledge: Your encryption key is derived only in your browser session and is never sent to any server.",
      ),
    ).toBeNull();
  });

  it("renders OAuth section and handles link/unlink dialogs", async () => {
    const mockInitLink = vi.fn().mockResolvedValue("https://accounts.google.com/oauth");
    const mockUnlink = vi.fn().mockResolvedValue({ success: true });

    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "user@test.com" } },
      changePassword: vi.fn(),
      initLinkGoogle: mockInitLink,
      unlinkGoogle: mockUnlink,
    });

    renderWithRouter();

    // Verify OAuth section
    expect(screen.getByText("OAuth")).toBeDefined();
    expect(screen.getByText("Google")).toBeDefined();
    expect(screen.getByText("GitHub")).toBeDefined();
    expect(screen.getAllByText("Not Linked").length).toBe(2);

    const linkBtn = document.getElementById("link-google-btn")!;
    expect(linkBtn).toBeDefined();

    // Click link -> opens password prompt dialog
    fireEvent.click(linkBtn);
    expect(
      screen.getByText(
        "Enter your account password to verify your identity before linking Google:",
      ),
    ).toBeDefined();

    const passInput = document.getElementById(
      "link-google-password-input",
    ) as HTMLInputElement;
    fireEvent.change(passInput, { target: { value: "mypassword" } });

    const submitLink = document.getElementById("submit-link-google-btn")!;
    fireEvent.click(submitLink);

    await waitFor(() => {
      expect(mockInitLink).toHaveBeenCalledWith("mypassword");
    });
  });

  it("renders linked Google account and unlinking dialog", async () => {
    const mockUnlink = vi.fn().mockResolvedValue({ success: true });

    (useAuth as any).mockReturnValue({
      session: {
        user: {
          id: "u",
          email: "user@test.com",
          oauth: { google: { id: "g1", email: "googleuser@gmail.com", linked: true } },
        },
      },
      changePassword: vi.fn(),
      unlinkGoogle: mockUnlink,
    });

    renderWithRouter();

    expect(screen.getByText("Linked as googleuser@gmail.com")).toBeDefined();
    const unlinkBtn = document.getElementById("unlink-google-btn")!;
    expect(unlinkBtn).toBeDefined();

    fireEvent.click(unlinkBtn);
    expect(
      screen.getByText(
        "Enter your account password to confirm unlinking your Google account:",
      ),
    ).toBeDefined();

    const passInput = document.getElementById(
      "unlink-google-password-input",
    ) as HTMLInputElement;
    fireEvent.change(passInput, { target: { value: "mypassword" } });

    const submitUnlink = document.getElementById("submit-unlink-google-btn")!;
    fireEvent.click(submitUnlink);

    await waitFor(() => {
      expect(mockUnlink).toHaveBeenCalledWith("mypassword");
    });
  });

  it("renders GitHub OAuth section and handles link dialog", async () => {
    const mockInitLinkGithub = vi.fn().mockResolvedValue("https://github.com/login/oauth/authorize");
    const mockUnlinkGithub = vi.fn().mockResolvedValue({ success: true });

    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "user@test.com" } },
      changePassword: vi.fn(),
      initLinkGoogle: vi.fn(),
      unlinkGoogle: vi.fn(),
      initLinkGithub: mockInitLinkGithub,
      unlinkGithub: mockUnlinkGithub,
    });

    renderWithRouter();

    expect(screen.getByText("GitHub")).toBeDefined();
    const linkBtn = document.getElementById("link-github-btn")!;
    expect(linkBtn).toBeDefined();

    // Click link -> opens password prompt dialog
    fireEvent.click(linkBtn);
    expect(
      screen.getByText(
        "Enter your account password to verify your identity before linking GitHub:",
      ),
    ).toBeDefined();

    const passInput = document.getElementById(
      "link-github-password-input",
    ) as HTMLInputElement;
    fireEvent.change(passInput, { target: { value: "mypassword" } });

    const submitLink = document.getElementById("submit-link-github-btn")!;
    fireEvent.click(submitLink);

    await waitFor(() => {
      expect(mockInitLinkGithub).toHaveBeenCalledWith("mypassword");
    });
  });

  it("renders linked GitHub account and handles unlinking dialog", async () => {
    const mockUnlinkGithub = vi.fn().mockResolvedValue({ success: true });

    (useAuth as any).mockReturnValue({
      session: {
        user: {
          id: "u",
          email: "user@test.com",
          oauth: { github: { id: "gh1", email: "ghuser@github.com", linked: true } },
        },
      },
      changePassword: vi.fn(),
      unlinkGoogle: vi.fn(),
      unlinkGithub: mockUnlinkGithub,
    });

    renderWithRouter();

    expect(screen.getByText("Linked as ghuser@github.com")).toBeDefined();
    const unlinkBtn = document.getElementById("unlink-github-btn")!;
    expect(unlinkBtn).toBeDefined();

    fireEvent.click(unlinkBtn);
    expect(
      screen.getByText(
        "Enter your account password to confirm unlinking your GitHub account:",
      ),
    ).toBeDefined();

    const passInput = document.getElementById(
      "unlink-github-password-input",
    ) as HTMLInputElement;
    fireEvent.change(passInput, { target: { value: "mypassword" } });

    const submitUnlink = document.getElementById("submit-unlink-github-btn")!;
    fireEvent.click(submitUnlink);

    await waitFor(() => {
      expect(mockUnlinkGithub).toHaveBeenCalledWith("mypassword");
    });
  });
});
