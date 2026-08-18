/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { EncryptionRequiredPrompt } from "./EncryptionRequiredPrompt";
import {
  generateAes256Key,
  bytesToHex,
  getActiveMasterKey,
  clearActiveMasterKey,
} from "@/lib/crypto";

const mockedNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe("EncryptionRequiredPrompt Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    clearActiveMasterKey();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Decryption Required card with Go to Security button", () => {
    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt
          category="characters"
          returnTo="/characters"
          categoryLabel="My Characters"
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Decryption Required")).toBeDefined();
    expect(screen.getByText("My Characters")).toBeDefined();
    expect(screen.getByText("AES-256-GCM")).toBeDefined();
    expect(screen.getByText("Zero-Knowledge")).toBeDefined();
    expect(screen.getByText("Go to Security to Unlock")).toBeDefined();
  });

  it("navigates to security page with returnTo parameter on button click", () => {
    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt
          category="data_save"
          returnTo="/apps?app=datasave"
        />
      </MemoryRouter>
    );

    const btn = screen.getByText("Go to Security to Unlock");
    fireEvent.click(btn);

    expect(mockedNavigate).toHaveBeenCalledWith("/security?returnTo=%2Fapps%3Fapp%3Ddatasave");
  });

  it("supports inline quick unlock and invokes onUnlocked callback", async () => {
    const onUnlockedMock = vi.fn();
    const testKey = generateAes256Key();
    const testKeyHex = bytesToHex(testKey);

    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt
          category="chatbot"
          returnTo="/apps?app=chatbot"
          onUnlocked={onUnlockedMock}
        />
      </MemoryRouter>
    );

    // Click toggle for quick unlock
    const quickUnlockToggle = screen.getByText("Quick Unlock on this Page");
    fireEvent.click(quickUnlockToggle);

    const input = screen.getByPlaceholderText("Paste 64-char Hex or Base64 masterkey...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: testKeyHex } });

    const unlockBtn = screen.getByText("Unlock & Decrypt");
    fireEvent.click(unlockBtn);

    await waitFor(() => {
      expect(getActiveMasterKey()).toEqual(testKey);
      expect(onUnlockedMock).toHaveBeenCalled();
    });
  });

  it("supports unlocking by uploading a .key file", async () => {
    const onUnlockedMock = vi.fn();
    const testKey = generateAes256Key();
    const testKeyHex = bytesToHex(testKey);
    const fileContent = `===========================================================\n Oxygen Low's Software - AES-256 Masterkey Backup\n===========================================================\n\n[HEXADECIMAL MASTERKEY - 64 CHARACTERS]\n${testKeyHex}\n`;
    const file = new File([fileContent], "backup.key", { type: "text/plain" });

    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt
          category="characters"
          returnTo="/characters"
          onUnlocked={onUnlockedMock}
        />
      </MemoryRouter>
    );

    const fileInput = document.getElementById("prompt-upload-key-input") as HTMLInputElement;
    expect(fileInput).toBeDefined();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(getActiveMasterKey()).toEqual(testKey);
      expect(onUnlockedMock).toHaveBeenCalled();
    });
  });

  it("supports unlocking by dropping a .key file onto the prompt card", async () => {
    const onUnlockedMock = vi.fn();
    const testKey = generateAes256Key();
    const testKeyHex = bytesToHex(testKey);
    const file = new File([testKeyHex], "masterkey.key", { type: "text/plain" });

    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt
          category="data_save"
          returnTo="/apps?app=datasave"
          onUnlocked={onUnlockedMock}
        />
      </MemoryRouter>
    );

    const promptContainer = screen.getByTestId("encryption-required-prompt");
    fireEvent.dragOver(promptContainer);
    fireEvent.drop(promptContainer, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(getActiveMasterKey()).toEqual(testKey);
      expect(onUnlockedMock).toHaveBeenCalled();
    });
  });
});
