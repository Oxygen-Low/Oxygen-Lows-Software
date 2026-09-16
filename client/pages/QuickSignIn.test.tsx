/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import Auth from "./Auth";
import Security from "./Security";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock useAuth
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockMigrateAccount = vi.fn();
let mockSession: any = null;

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: mockSession,
    loading: false,
    signIn: mockSignIn,
    signUp: mockSignUp,
    migrateAccount: mockMigrateAccount,
  }),
}));

vi.mock("@/lib/crypto", () => ({
  isValidMasterKeyString: vi.fn(),
  parseMasterKeyString: vi.fn(),
  parseKeyFileContent: vi.fn(),
  bytesToHex: vi.fn(),
  deriveEncryptionKeyFromPassword: vi.fn().mockResolvedValue(new Uint8Array(32)),
  setActiveMasterKey: vi.fn(),
  getActiveMasterKey: vi.fn().mockReturnValue(null),
  clearActiveMasterKey: vi.fn(),
  migrateCategoryEncryption: vi.fn(),
}));

describe("Quick Sign In Client Flows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = null;
    (global as any).fetch = vi.fn();
  });

  it("should render Quick Sign In tab on Auth page and generate a code", async () => {
    (global as any).fetch.mockImplementation((url: string, opts?: any) => {
      if (url === "/api/auth/oauth/config") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ google: { enabled: true }, github: { enabled: true } }),
        });
      }
      if (url === "/api/auth/quick-sign-in/create" && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              sessionId: "test-session-123",
              code: "A8K49X",
              expiresAt: Date.now() + 300000,
            }),
        });
      }
      if (url.includes("/api/auth/quick-sign-in/poll")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "pending" }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <BrowserRouter>
        <LanguageProvider>
          <Auth />
        </LanguageProvider>
      </BrowserRouter>,
    );

    // Click "Quick Sign In" tab
    const quickTab = screen.getByText("Quick Sign In");
    expect(quickTab).toBeTruthy();
    fireEvent.click(quickTab);

    // Should fetch code and render code
    await waitFor(() => {
      expect(screen.getByText("A8K49X")).toBeTruthy();
    });

    expect(
      screen.getByText("Waiting for approval from your other device..."),
    ).toBeTruthy();
  });

  it("should render Quick Sign In card on Security page and verify code", async () => {
    mockSession = {
      access_token: "test_token_123",
      user: { id: "1", username: "testuser", email: "test@example.com" },
    };

    (global as any).fetch.mockImplementation((url: string, opts?: any) => {
      if (url === "/api/auth/oauth/config") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ google: { enabled: true }, github: { enabled: true } }),
        });
      }
      if (url === "/api/auth/session") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ user: mockSession.user }),
        });
      }
      if (url === "/api/auth/quick-sign-in/verify" && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              valid: true,
              code: "A8K49X",
              createdAt: Date.now(),
              expiresAt: Date.now() + 300000,
              ip: "192.168.1.1",
              userAgent: "Mozilla/5.0 TestBrowser",
            }),
        });
      }
      if (url === "/api/auth/quick-sign-in/approve" && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(
      <BrowserRouter>
        <LanguageProvider>
          <TooltipProvider>
            <Security />
          </TooltipProvider>
        </LanguageProvider>
      </BrowserRouter>,
    );

    // Find the code input in Security page
    const codeInput = screen.getByPlaceholderText("Enter 6-character code");
    expect(codeInput).toBeTruthy();

    fireEvent.change(codeInput, { target: { value: "A8K49X" } });

    const verifyBtn = screen.getByText("Verify Code");
    fireEvent.click(verifyBtn);

    // Verification modal should appear with details
    await waitFor(() => {
      expect(screen.getByText("Confirm Quick Sign In")).toBeTruthy();
      expect(screen.getByText("192.168.1.1")).toBeTruthy();
      expect(screen.getByText("Mozilla/5.0 TestBrowser")).toBeTruthy();
    });

    // Click "Grant Access & Sign In"
    const approveBtn = screen.getByText("Grant Access & Sign In");
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(screen.queryByText("Confirm Quick Sign In")).toBeNull();
    });
  });
});
