/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Security from "./Security";
import { useAuth } from "@/hooks/useAuth";
import { clearActiveMasterKey } from "@/lib/crypto";

// Mock Supabase
vi.mock("@/lib/supabase", () => {
  const queryBuilder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => resolve({ data: [], error: null })),
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "u" } } }),
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: "u" } } },
          error: null,
        }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn().mockReturnValue(queryBuilder),
    },
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
    </MemoryRouter>
  );

describe("Security Page Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    clearActiveMasterKey();
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u", email: "user@test.com" } },
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

  it("renders Security page with header and AES-256 master key card", () => {
    renderWithRouter();
    expect(screen.getByText("Security & Data Encryption")).toBeDefined();
    expect(screen.getByText("AES-256 Masterkey")).toBeDefined();
    expect(document.getElementById("generate-masterkey-btn")).toBeDefined();
    expect(screen.getByText("No Masterkey Set")).toBeDefined();
    expect(screen.queryByText("Show QR Code")).toBeNull();
  });

  it("renders encryption toggles for Characters, Data Save, Chatbot, and Integrations", () => {
    renderWithRouter();
    expect(screen.getByText("Protected Data Categories")).toBeDefined();
    expect(screen.getByText("Characters and Universes")).toBeDefined();
    expect(screen.getByText("Data Save Entries")).toBeDefined();
    expect(screen.getByText("Chatbot Chats")).toBeDefined();
    expect(screen.getByText("API Keys & Integrations")).toBeDefined();
  });

  it("allows toggling encryption and saves to localStorage", async () => {
    renderWithRouter();
    const generateBtn = document.getElementById("generate-masterkey-btn") as HTMLButtonElement;
    fireEvent.click(generateBtn);

    const charactersToggle = document.getElementById("toggle-characters") as HTMLButtonElement;
    expect(charactersToggle).toBeDefined();

    fireEvent.click(charactersToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_characters")).toBe("true");
    });

    fireEvent.click(charactersToggle);
    await waitFor(() => {
      expect(localStorage.getItem("oxygen_encrypt_characters")).toBe("false");
    });
  });

  it("allows toggling encryption for Data Save, Chatbot, and Integrations", async () => {
    renderWithRouter();
    const generateBtn = document.getElementById("generate-masterkey-btn") as HTMLButtonElement;
    fireEvent.click(generateBtn);

    const dataSaveToggle = document.getElementById("toggle-datasave") as HTMLButtonElement;
    const chatbotToggle = document.getElementById("toggle-chatbot") as HTMLButtonElement;
    const integrationsToggle = document.getElementById("toggle-integrations") as HTMLButtonElement;

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
  });

  it("generates a 256-bit key when clicking Generate Masterkey and displays actions without QR code", async () => {
    renderWithRouter();
    const generateBtn = document.getElementById("generate-masterkey-btn") as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("Masterkey Active")).toBeDefined();
      expect(screen.getByText("Copy to Clipboard")).toBeDefined();
      expect(screen.getByText("Download key")).toBeDefined();
      expect(screen.getByText("Lock / Clear Key")).toBeDefined();
      expect(screen.queryByText("Show QR Code")).toBeNull();
      expect(screen.queryByText("Hide QR Code")).toBeNull();
    });
  });

  it("copies generated master key to clipboard", async () => {
    renderWithRouter();
    const generateBtn = document.getElementById("generate-masterkey-btn") as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("Copy to Clipboard")).toBeDefined();
    });

    const copyBtn = screen.getByText("Copy to Clipboard");
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it("has key format hidden by default and allows toggling to switch format between Hex, Base64, Base58 and Words", async () => {
    renderWithRouter();
    const generateBtn = document.getElementById("generate-masterkey-btn") as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("Key Format")).toBeDefined();
    });

    // Key format options should be hidden by default
    expect(screen.queryByText("Base64 (44 chars)")).toBeNull();
    expect(screen.queryByText("Base58")).toBeNull();

    // Toggle format options visible
    const toggleFormatBtn = screen.getByText("Key Format");
    fireEvent.click(toggleFormatBtn);

    await waitFor(() => {
      expect(screen.getByText("Base64 (44 chars)")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Base64 (44 chars)"));
    fireEvent.click(screen.getByText("Base58"));
    fireEvent.click(screen.getByText("Passphrase Words"));
    fireEvent.click(screen.getByText("Hex (64 chars)"));

    // Toggle format options hidden
    const hideFormatBtn = screen.getByText("Hide Key Format");
    fireEvent.click(hideFormatBtn);

    await waitFor(() => {
      expect(screen.queryByText("Base64 (44 chars)")).toBeNull();
    });
  });

  it("allows unlocking / activating an existing master key", async () => {
    renderWithRouter();
    const testKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const input = screen.getByPlaceholderText("Paste 64-char Hex or 256-bit Base64 masterkey...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: testKeyHex } });

    const unlockBtn = screen.getByText("Unlock / Activate Key");
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getByText("Masterkey Active")).toBeDefined();
      expect(sessionStorage.getItem("oxygen_active_master_key")).toBe(testKeyHex);
    });
  });

  it("shows error for invalid key during manual activation", async () => {
    renderWithRouter();
    const input = screen.getByPlaceholderText("Paste 64-char Hex or 256-bit Base64 masterkey...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "invalid-key" } });

    const unlockBtn = screen.getByText("Unlock / Activate Key");
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(screen.getByText("Invalid masterkey format. Must be a 256-bit key (64 hex characters or Base64).")).toBeDefined();
    });
  });

  it("clears / locks active master key on Lock / Clear Key click", async () => {
    renderWithRouter();
    const generateBtn = document.getElementById("generate-masterkey-btn") as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("Lock / Clear Key")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Lock / Clear Key"));

    await waitFor(() => {
      expect(screen.getByText("No Masterkey Set")).toBeDefined();
      expect(sessionStorage.getItem("oxygen_active_master_key")).toBeNull();
    });
  });

  it("shows returnTo banner when redirected with returnTo query param and masterkey active", async () => {
    renderWithRouter(["/security?returnTo=%2Fcharacters"]);
    const generateBtn = document.getElementById("generate-masterkey-btn") as HTMLButtonElement;
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText("Masterkey active. You can now return to your previous page:")).toBeDefined();
      expect(screen.getByText("/characters")).toBeDefined();
      expect(screen.getByText("Return to Page")).toBeDefined();
    });
  });

  it("allows activating masterkey by uploading a .key file", async () => {
    renderWithRouter();
    const testKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const fileContent = `===========================================================\n Oxygen Low's Software - AES-256 Masterkey Backup\n===========================================================\n\n[HEXADECIMAL MASTERKEY - 64 CHARACTERS]\n${testKeyHex}\n`;
    
    const file = new File([fileContent], "oxygen-masterkey.key", { type: "text/plain" });
    const fileInput = document.getElementById("key-file-upload-input") as HTMLInputElement;
    expect(fileInput).toBeDefined();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("Masterkey Active")).toBeDefined();
      expect(sessionStorage.getItem("oxygen_active_master_key")).toBe(testKeyHex);
    });
  });

  it("allows activating masterkey by dropping a .key file", async () => {
    renderWithRouter();
    const testKeyHex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const file = new File([testKeyHex], "masterkey.key", { type: "text/plain" });
    
    const dropContainer = screen.getByTestId("key-drop-zone");

    fireEvent.dragOver(dropContainer);
    fireEvent.drop(dropContainer, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(screen.getByText("Masterkey Active")).toBeDefined();
      expect(sessionStorage.getItem("oxygen_active_master_key")).toBe(testKeyHex);
    });
  });

  it("shows error when uploading an invalid file", async () => {
    renderWithRouter();
    const file = new File(["not a valid masterkey"], "invalid.key", { type: "text/plain" });
    const fileInput = document.getElementById("key-file-upload-input") as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("No valid 256-bit AES masterkey found in the provided .key file.")).toBeDefined();
    });
  });

  it("does not render removed architecture section", () => {
    renderWithRouter();
    expect(screen.queryByText("Zero-Knowledge & Privacy Architecture")).toBeNull();
    expect(screen.queryByText("Custom AI Provider API Keys")).toBeNull();
  });
});
