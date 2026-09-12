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
import { EncryptionRequiredPrompt } from "./EncryptionRequiredPrompt";
import {
  getActiveMasterKey,
  clearActiveMasterKey,
  deriveEncryptionKeyFromPassword,
} from "@/lib/crypto";

const mockedNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

// Mock useAuth to return a test session with an email for salt derivation
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: {
      user: {
        email: "test@example.com",
        username: "testuser",
        id: "test-id-123",
      },
    },
  }),
}));

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
      </MemoryRouter>,
    );

    expect(screen.getByText("Decryption Required")).toBeDefined();
    expect(screen.getByText("My Characters")).toBeDefined();
    expect(screen.getByText("AES-256-GCM")).toBeDefined();
    expect(screen.getByText("Zero-Knowledge")).toBeDefined();
    expect(screen.getByText("Go to Security")).toBeDefined();
  });

  it("navigates to security page with returnTo parameter on button click", () => {
    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt
          category="data_save"
          returnTo="/apps?app=datasave"
        />
      </MemoryRouter>,
    );

    const btn = screen.getByText("Go to Security");
    fireEvent.click(btn);

    expect(mockedNavigate).toHaveBeenCalledWith(
      "/security?returnTo=%2Fapps%3Fapp%3Ddatasave",
    );
  });

  it("renders the password input and Unlock & Decrypt button", () => {
    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt
          category="chatbot"
          returnTo="/apps?app=chatbot"
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByPlaceholderText("Enter your account password..."),
    ).toBeDefined();
    expect(screen.getByText("Unlock & Decrypt")).toBeDefined();
    expect(screen.getByText("Unlock Encryption")).toBeDefined();
  });

  it("unlocks with correct password and calls onUnlocked callback", async () => {
    const onUnlockedMock = vi.fn();

    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt
          category="characters"
          returnTo="/characters"
          onUnlocked={onUnlockedMock}
        />
      </MemoryRouter>,
    );

    // Type the test password
    const input = screen.getByPlaceholderText(
      "Enter your account password...",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "my-test-password" } });

    const unlockBtn = screen.getByText("Unlock & Decrypt");
    fireEvent.click(unlockBtn);

    // Derive what the expected key should be using the same salt the component uses
    const expectedKey = await deriveEncryptionKeyFromPassword(
      "my-test-password",
      "test@example.com",
    );

    await waitFor(() => {
      expect(getActiveMasterKey()).toEqual(expectedKey);
      expect(onUnlockedMock).toHaveBeenCalled();
    });
  });

  it("shows zero-knowledge footer notice", () => {
    render(
      <MemoryRouter>
        <EncryptionRequiredPrompt category="passwords" returnTo="/passwords" />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/Your encryption key is derived from your password/i),
    ).toBeDefined();
  });
});
