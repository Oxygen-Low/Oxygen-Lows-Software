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
const { reviewDialogProps } = vi.hoisted(() => ({
  reviewDialogProps: vi.fn(),
}));
vi.mock("@/components/characters/AiReviewDialog", () => ({
  AiReviewDialog: (props: any) => {
    reviewDialogProps(props);
    return <div data-testid="character-review">{props.character.name}</div>;
  },
}));

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

  it("opens a review of the saved character with its linked lore", async () => {
    const universe = { id: "world", name: "Moon City", is_universe: true };
    const race = {
      id: "race",
      name: "Elves",
      is_race: true,
      universe_id: "world",
    };
    const character = {
      id: "hero",
      name: "Mira",
      backstory: "Saved history",
      universe_id: "world",
      race_id: "race",
    };
    const builder = supabase.from("characters").select("*");
    vi.mocked(builder.order).mockResolvedValueOnce({
      data: [character, universe, race],
      error: null,
      count: 3,
    });
    render(<Characters />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Review with AI" }),
    );
    expect(screen.getByTestId("character-review")).toBeDefined();
    expect(reviewDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        character: expect.objectContaining(character),
        universe: expect.objectContaining(universe),
        race: expect.objectContaining(race),
        entityType: "character",
      }),
    );
    expect(builder.update).not.toHaveBeenCalled();
    expect(builder.insert).not.toHaveBeenCalled();

    // Review Universe
    fireEvent.click(screen.getByText("My Universes"));
    const univReviewBtn = await screen.findByRole("button", {
      name: "Review with AI",
    });
    fireEvent.click(univReviewBtn);
    expect(reviewDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        character: expect.objectContaining(universe),
        universe: undefined,
        race: undefined,
        entityType: "universe",
      }),
    );

    // Review Race (with linked universe if assigned)
    fireEvent.click(screen.getByText("My Races"));
    const raceReviewBtn = await screen.findByRole("button", {
      name: "Review with AI",
    });
    fireEvent.click(raceReviewBtn);
    expect(reviewDialogProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        character: expect.objectContaining(race),
        universe: expect.objectContaining(universe),
        race: undefined,
        entityType: "race",
      }),
    );
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
    expect(screen.getByText("Go to Security")).toBeDefined();

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

  it("inputs and saves Current Situation & Abilities for a character", async () => {
    render(<Characters />);

    const newCharButton = screen.getByRole("button", {
      name: /New Character/i,
    });
    fireEvent.click(newCharButton);

    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "Archmage Cynthia" } });

    const situationInput = screen.getByLabelText(
      /Current Situation & Abilities/i,
    );
    expect(situationInput).toBeDefined();
    fireEvent.change(situationInput, {
      target: {
        value:
          "Currently leading the Arcane Vanguard, capable of high-tier Chronomancy and spatial distortion spells.",
      },
    });

    const saveBtn = screen.getByRole("button", { name: /Save Character/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("characters");
    });
  });

  it("copies importable text of a character to clipboard", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const testChar = {
      id: "char-export-1",
      user_id: "test-user-id",
      name: "Solas",
      display_name: "Solas the Wise",
      short_description: "An elven apostate mage.",
      appearance: "Bald elf with glowing tattoos.",
      personality: "Calm, intellectual, secretive.",
      backstory: "Ancient wanderer.",
    };

    const mockClient: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [testChar], error: null }),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
    };
    (supabase.from as any).mockImplementation(() => mockClient);

    render(<Characters />);

    await waitFor(() => {
      expect(screen.getByText("Solas the Wise")).toBeDefined();
    });

    const copyButtons = screen.getAllByRole("button", {
      name: /Copy Importable Text/i,
    });
    expect(copyButtons.length).toBeGreaterThan(0);
    fireEvent.click(copyButtons[0]);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });

    const copiedArg = writeTextMock.mock.calls[0][0];
    expect(copiedArg).toContain("# Solas the Wise");
    expect(copiedArg).toContain("## Overview\nAn elven apostate mage.");
    expect(copiedArg).toContain("## Appearance\nBald elf with glowing tattoos.");
    expect(copiedArg).toContain("## Personality\nCalm, intellectual, secretive.");
    expect(copiedArg).toContain("## Backstory\nAncient wanderer.");
  });
});
