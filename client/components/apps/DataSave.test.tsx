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
import { DataSaveApp } from "./DataSave";
import { supabase, db } from "@/lib/db";
import { toast } from "sonner";
import {
  clearActiveMasterKey,
  setCategoryEncryptionEnabled,
} from "@/lib/crypto";

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

window.scrollTo = vi.fn();

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

const mockSaves = [
  {
    id: "save-1",
    user_id: "test-user-123",
    key_name: "API_CONFIG",
    content: JSON.stringify(
      { endpoint: "https://api.example.com", timeout: "5000" },
      null,
      2,
    ),
    category_id: "cat-1",
    category: { id: "cat-1", name: "Work" },
    created_at: "2026-08-01T12:00:00Z",
    updated_at: "2026-08-01T12:00:00Z",
  },
  {
    id: "save-2",
    user_id: "test-user-123",
    key_name: "NOTE_PLAIN",
    content: "Simple text note content",
    category_id: null,
    category: null,
    created_at: "2026-08-02T12:00:00Z",
    updated_at: "2026-08-02T12:00:00Z",
  },
];

const mockCategories = [{ id: "cat-1", name: "Work" }];

describe("DataSaveApp", () => {
  let updateMock: any;
  let insertMock: any;
  let deleteMock: any;

  beforeEach(() => {
    vi.clearAllMocks();

    updateMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({
            data: { id: "new-id", name: "NewCat" },
            error: null,
          }),
      }),
      then: vi.fn((onFulfilled) =>
        Promise.resolve({ data: null, error: null }).then(onFulfilled),
      ),
    });

    deleteMock = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    vi.spyOn(supabase, "from").mockImplementation((table: string) => {
      if (table === "data_saves") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi
              .fn()
              .mockResolvedValue({ data: [...mockSaves], error: null }),
          }),
          update: updateMock,
          insert: insertMock,
          delete: deleteMock,
        } as any;
      }
      if (table === "data_save_categories") {
        return {
          select: vi.fn().mockReturnValue({
            order: vi
              .fn()
              .mockResolvedValue({ data: [...mockCategories], error: null }),
          }),
          insert: insertMock,
        } as any;
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      } as any;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders data saves and displays keys and categories", async () => {
    render(<DataSaveApp />);

    await waitFor(() => {
      expect(screen.queryByText("API_CONFIG")).not.toBeNull();
      expect(screen.queryByText("NOTE_PLAIN")).not.toBeNull();
    });

    expect(screen.queryAllByText("Work").length).toBeGreaterThan(0);
    expect(screen.queryByText("2 values")).not.toBeNull();
  });

  it("loads a save into the form for direct editing", async () => {
    render(<DataSaveApp />);

    await waitFor(() => {
      expect(screen.queryByText("API_CONFIG")).not.toBeNull();
    });

    const loadButtons = screen.getAllByText("Load in form editor");
    fireEvent.click(loadButtons[0]);

    // Should enter edit mode in left form
    expect(screen.queryByText("Edit Data Save")).not.toBeNull();
    expect(screen.queryByText("Editing Mode")).not.toBeNull();
    expect(screen.queryByText("Update Key & Values")).not.toBeNull();

    const keyInput = screen.getByPlaceholderText(
      "e.g. Server URL or Note Title",
    ) as HTMLInputElement;
    expect(keyInput.value).toBe("API_CONFIG");

    // Modify key name
    fireEvent.change(keyInput, { target: { value: "API_CONFIG_UPDATED" } });

    // Submit form
    const updateButton = screen.getByText("Update Key & Values");
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          key_name: "API_CONFIG_UPDATED",
        }),
      );
      expect(toast.success).toHaveBeenCalledWith(
        "Data save updated successfully!",
      );
    });
  });

  it("cancels form edit mode and resets form", async () => {
    render(<DataSaveApp />);

    await waitFor(() => {
      expect(screen.queryByText("API_CONFIG")).not.toBeNull();
    });

    const loadButtons = screen.getAllByText("Load in form editor");
    fireEvent.click(loadButtons[0]);

    expect(screen.queryByText("Edit Data Save")).not.toBeNull();

    const cancelButton = screen.getByText("Cancel Edit");
    fireEvent.click(cancelButton);

    expect(screen.queryByText("Save New Data")).not.toBeNull();
    expect(screen.queryByText("Editing Mode")).toBeNull();
  });

  it("opens the edit dialog and updates structured key-value values", async () => {
    render(<DataSaveApp />);

    await waitFor(() => {
      expect(screen.queryByText("API_CONFIG")).not.toBeNull();
    });

    const editButtons = screen.getAllByText("Edit");
    fireEvent.click(editButtons[0]); // Click Edit on API_CONFIG

    await waitFor(() => {
      expect(screen.queryByText("Edit Data Save & Values")).not.toBeNull();
    });

    // In modal, check that structured Key-Values tab is selected for JSON content
    const addFieldButton = screen.getByText("Add Field");
    expect(addFieldButton).not.toBeNull();

    // Add a new field
    fireEvent.click(addFieldButton);

    // Save changes
    const saveChangesButton = screen.getByText("Save Changes");
    fireEvent.click(saveChangesButton);

    await waitFor(() => {
      expect(updateMock).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith(
        "Data save updated successfully!",
      );
    });
  });

  it("prevents renaming to an existing duplicate key name", async () => {
    render(<DataSaveApp />);

    await waitFor(() => {
      expect(screen.queryByText("API_CONFIG")).not.toBeNull();
    });

    const loadButtons = screen.getAllByText("Load in form editor");
    fireEvent.click(loadButtons[0]);

    const keyInput = screen.getByPlaceholderText(
      "e.g. Server URL or Note Title",
    ) as HTMLInputElement;
    // Try to rename to NOTE_PLAIN which already exists
    fireEvent.change(keyInput, { target: { value: "NOTE_PLAIN" } });

    const updateButton = screen.getByText("Update Key & Values");
    fireEvent.click(updateButton);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'A save with the key "NOTE_PLAIN" already exists.',
      );
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("allows searching saves by search term", async () => {
    render(<DataSaveApp />);

    await waitFor(() => {
      expect(screen.queryByText("API_CONFIG")).not.toBeNull();
      expect(screen.queryByText("NOTE_PLAIN")).not.toBeNull();
    });

    const searchInput = screen.getByPlaceholderText(
      "Search keys or content...",
    );
    fireEvent.change(searchInput, { target: { value: "NOTE_PLAIN" } });

    expect(screen.queryByText("API_CONFIG")).toBeNull();
    expect(screen.queryByText("NOTE_PLAIN")).not.toBeNull();
  });

  it("renders EncryptionRequiredPrompt when data save encryption is enabled and no masterkey active", () => {
    clearActiveMasterKey();
    setCategoryEncryptionEnabled("data_save", true);

    render(
      <MemoryRouter>
        <DataSaveApp />
      </MemoryRouter>,
    );

    expect(screen.getByText("Decryption Required")).toBeDefined();
    expect(screen.getByText("Go to Security to Unlock")).toBeDefined();

    setCategoryEncryptionEnabled("data_save", false);
  });
});
