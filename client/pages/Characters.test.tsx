/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Characters from "./Characters";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase, db } from "@/lib/db";
import { storage } from "@/lib/storage";
import {
  clearActiveMasterKey,
  setCategoryEncryptionEnabled,
} from "@/lib/crypto";

const mockToast = vi.fn();

const { mockStorage, mockStorageFrom } = vi.hoisted(() => {
  const mockStorageFrom = {
    createSignedUrl: vi.fn((path: string) =>
      Promise.resolve({
        data: { signedUrl: `https://example.com/${path}` },
        error: null,
      }),
    ),
  };
  const mockStorage = {
    from: vi.fn(() => mockStorageFrom),
  };
  return { mockStorage, mockStorageFrom };
});

vi.mock("@/lib/storage", () => ({
  storage: mockStorage,
  customStorage: mockStorage,
}));

vi.mock("@/lib/db", () => {
  const builder: any = {
    select: vi.fn(() => builder),
    order: vi.fn(() => Promise.resolve({ data: [], error: null })),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
  };

  const mockClient = {
    from: vi.fn(() => builder),
  };

  return {
    db: mockClient,
    supabase: mockClient,
  };
});

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock("@/components/Layout", () => ({
  __esModule: true,
  default: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

let lastOnSelect: ((file: any) => void) | null = null;
vi.mock("@/components/StorageFileSelector", () => ({
  StorageFileSelector: ({ onSelect, trigger }: any) => {
    lastOnSelect = onSelect;
    return (
      <div data-testid="storage-selector">
        <button
          type="button"
          data-testid="select-valid-file"
          onClick={() =>
            onSelect({
              id: "1",
              name: "user_123/avatar.png",
              metadata: { size: 1024, mimetype: "image/png" },
            })
          }
        >
          Select Valid File
        </button>
        <button
          type="button"
          data-testid="select-traversal-file"
          onClick={() =>
            onSelect({
              id: "2",
              name: "../secret/avatar.png",
              metadata: { size: 1024, mimetype: "image/png" },
            })
          }
        >
          Select Traversal File
        </button>
        <button
          type="button"
          data-testid="select-nested-traversal-file"
          onClick={() =>
            onSelect({
              id: "3",
              name: "....//secret/avatar.png",
              metadata: { size: 1024, mimetype: "image/png" },
            })
          }
        >
          Select Nested Traversal File
        </button>
        <button
          type="button"
          data-testid="select-null-file"
          onClick={() => onSelect(null)}
        >
          Select Null File
        </button>
        {trigger}
      </div>
    );
  },
}));

describe("Characters Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      session: { user: { id: "u123", email: "test@example.com" } },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders characters tabs and new character button", async () => {
    render(<Characters />);
    expect(screen.getByText("My Characters")).toBeDefined();
    expect(screen.getByText("My Universes")).toBeDefined();
  });

  it("opens modal and triggers storage selection with valid file", async () => {
    render(<Characters />);

    const newCharButton = screen.getByRole("button", {
      name: /New Character/i,
    });
    fireEvent.click(newCharButton);

    const selectValidBtn = screen.getByTestId("select-valid-file");
    fireEvent.click(selectValidBtn);

    await waitFor(() => {
      expect(storage.from).toHaveBeenCalledWith("Storage");
    });
  });

  it("blocks path traversal in storage selection and shows error toast", async () => {
    render(<Characters />);

    const newCharButton = screen.getByRole("button", {
      name: /New Character/i,
    });
    fireEvent.click(newCharButton);

    const selectTraversalBtn = screen.getByTestId("select-traversal-file");
    fireEvent.click(selectTraversalBtn);

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: "Invalid file name",
      }),
    );
  });

  it("blocks nested path traversal attempts in storage selection", async () => {
    render(<Characters />);

    const newCharButton = screen.getByRole("button", {
      name: /New Character/i,
    });
    fireEvent.click(newCharButton);

    const selectNestedTraversalBtn = screen.getByTestId(
      "select-nested-traversal-file",
    );
    fireEvent.click(selectNestedTraversalBtn);

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: "Invalid file name",
      }),
    );
  });

  it("blocks null or undefined file in storage selection", async () => {
    render(<Characters />);

    const newCharButton = screen.getByRole("button", {
      name: /New Character/i,
    });
    fireEvent.click(newCharButton);

    const selectNullBtn = screen.getByTestId("select-null-file");
    fireEvent.click(selectNullBtn);

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: "Invalid file name",
      }),
    );
  });

  it("renders EncryptionRequiredPrompt when characters encryption is enabled and no masterkey active", () => {
    clearActiveMasterKey();
    setCategoryEncryptionEnabled("characters", true);

    render(
      <MemoryRouter>
        <Characters />
      </MemoryRouter>,
    );

    expect(screen.getByText("Decryption Required")).toBeDefined();
    expect(screen.getByText("Go to Security to Unlock")).toBeDefined();

    setCategoryEncryptionEnabled("characters", false);
  });

  it("renders AI Generate button in header and opens AI generation modal", async () => {
    render(<Characters />);

    const aiGenButtons = screen.getAllByRole("button", {
      name: /AI Generate/i,
    });
    expect(aiGenButtons.length).toBeGreaterThan(0);

    fireEvent.click(aiGenButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("ai-generate-dialog")).toBeDefined();
      expect(screen.getByTestId("prompt-input")).toBeDefined();
    });
  });

  it("switches to Universes tab and renders AI Generate trigger", async () => {
    render(<Characters />);

    const universesTab = screen.getByText("My Universes");
    fireEvent.click(universesTab);

    const aiGenButtons = screen.getAllByRole("button", {
      name: /AI Generate/i,
    });
    expect(aiGenButtons.length).toBeGreaterThan(0);
  });

  it("toggles character stats and inputs stat values bounded between -100 and 100", async () => {
    render(<Characters />);

    const newCharButton = screen.getByRole("button", {
      name: /New Character/i,
    });
    fireEvent.click(newCharButton);

    // Enter character name
    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Valerius" } });

    // Enable stats toggle
    const statsToggle = screen.getByTestId("char-stats-toggle");
    expect(statsToggle).toBeDefined();
    fireEvent.click(statsToggle);

    // Stat inputs should now be visible
    const strInput = screen.getByTestId("char-stat-str");
    const intInput = screen.getByTestId("char-stat-int");
    expect(strInput).toBeDefined();
    expect(intInput).toBeDefined();

    // Set stat values
    fireEvent.change(strInput, { target: { value: "85" } });
    fireEvent.change(intInput, { target: { value: "-40" } });

    // Save character
    const saveBtn = screen.getByRole("button", { name: /Save Character/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("characters");
    });
  });
});
