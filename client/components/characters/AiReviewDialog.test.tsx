/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createTranslator } from "@/lib/i18n";
import { AiReviewDialog } from "./AiReviewDialog";
import {
  reviewCharacter,
  type CharacterReview,
} from "@/services/characterReviewer";

vi.mock("@/contexts/LanguageContext", () => ({
  useTranslation: () => ({
    t: createTranslator("English"),
    language: "English",
  }),
}));
const { modelState } = vi.hoisted(() => ({
  modelState: {
    models: [
      { provider: "horde", model_id: "same", name: "Free" },
      { provider: "openrouter", model_id: "same", name: "Custom" },
    ],
    selectedModel: "same",
    selectedProvider: "horde",
    getDecryptedApiKey: vi.fn(),
    encryptedKeys: {} as Record<string, string>,
    isMasterKeyActive: false,
  },
}));
vi.mock("@/hooks/useAiModels", () => ({
  useAiModels: () => modelState,
  BUILTIN_MODELS: [{ provider: "horde", model_id: "Fast" }],
}));
vi.mock("@/services/characterReviewer", () => ({ reviewCharacter: vi.fn() }));
const result: CharacterReview = {
  summary: "A compelling hero.",
  strengths: ["Clear goals."],
  improvements: {
    story: "Clarify the betrayal.",
    appearance: "Add a signature detail.",
    personality: "Show her doubts.",
    consistency: "Explain the timeline.",
  },
};
const character = Object.freeze({ name: "Mira", backstory: "Saved story" });
const renderDialog = (onClose = vi.fn()) =>
  render(
    <AiReviewDialog
      character={character}
      universe={{ name: "Moon City" }}
      onClose={onClose}
    />,
  );
const start = () =>
  fireEvent.click(screen.getByRole("button", { name: "Start review" }));

beforeEach(() => {
  vi.resetAllMocks();
  modelState.encryptedKeys = {};
  modelState.getDecryptedApiKey.mockReturnValue(null);
  vi.mocked(reviewCharacter).mockResolvedValue(result);
});
afterEach(cleanup);

describe("AiReviewDialog", () => {
  it("uses the selected provider even when model IDs match and renders readable feedback", async () => {
    modelState.getDecryptedApiKey.mockReturnValue("test-key");
    renderDialog();
    fireEvent.change(screen.getByLabelText("AI Model"), {
      target: { value: JSON.stringify(["openrouter", "same"]) },
    });
    start();
    await screen.findByText(result.summary);
    expect(reviewCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        character,
        universe: { name: "Moon City" },
        model: modelState.models[1],
        apiKey: "test-key",
        language: "English",
      }),
    );
    Object.values(result.improvements).forEach((text) =>
      expect(screen.getByText(text)).toBeDefined(),
    );
    expect(screen.getByText("Clear goals.")).toBeDefined();
    expect(character.backstory).toBe("Saved story");
  });

  it.each([false, true])(
    "blocks missing or locked provider credentials (locked: %s)",
    (locked) => {
      if (locked) modelState.encryptedKeys = { openrouter: "encrypted" };
      renderDialog();
      fireEvent.change(screen.getByLabelText("AI Model"), {
        target: { value: JSON.stringify(["openrouter", "same"]) },
      });
      start();
      expect(screen.getByRole("alert").textContent).toMatch(
        locked ? /Master Key.*locked/ : /not configured/,
      );
      expect(reviewCharacter).not.toHaveBeenCalled();
    },
  );

  it("shows errors and allows a successful retry", async () => {
    vi.mocked(reviewCharacter).mockRejectedValueOnce(new Error("Bad response"));
    renderDialog();
    start();
    await screen.findByRole("alert");
    start();
    await screen.findByText(result.summary);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("cancels an in-flight review and ignores its late result after retry", async () => {
    let finish!: (value: CharacterReview) => void;
    vi.mocked(reviewCharacter).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderDialog();
    start();
    expect(
      (screen.getByLabelText("AI Model") as HTMLSelectElement).disabled,
    ).toBe(true);
    const signal = vi.mocked(reviewCharacter).mock.calls[0][0].signal!;
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(signal.aborted).toBe(true);
    start();
    await screen.findByText(result.summary);
    await act(async () => {
      finish({ ...result, summary: "Stale result" });
    });
    expect(screen.queryByText("Stale result")).toBeNull();
    expect(screen.getByText(result.summary)).toBeDefined();
  });

  it("aborts on close and unmount", async () => {
    vi.mocked(reviewCharacter).mockImplementation(() => new Promise(() => {}));
    const onClose = vi.fn();
    const view = renderDialog(onClose);
    start();
    const signal = vi.mocked(reviewCharacter).mock.calls[0][0].signal!;
    fireEvent.click(
      screen.getAllByRole("button", { name: "Close" })[0],
    );
    expect(signal.aborted).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    const second = renderDialog();
    start();
    const secondSignal = vi.mocked(reviewCharacter).mock.calls[1][0].signal!;
    second.unmount();
    await waitFor(() => expect(secondSignal.aborted).toBe(true));
  });

  it("renders universe-specific review labels and triggers review with entityType universe", async () => {
    const universe = {
      name: "Cyber City",
      short_description: "Neon lit dystopia",
      is_universe: true,
    };
    render(
      <AiReviewDialog
        character={universe}
        entityType="universe"
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Review world lore, geography, tone, history, and secrets/),
    ).toBeDefined();
    start();
    await screen.findByText(result.summary);
    expect(reviewCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        character: universe,
        entityType: "universe",
      }),
    );
    expect(screen.getByText("History & Factions")).toBeDefined();
    expect(screen.getByText("Geography & Environment")).toBeDefined();
    expect(screen.getByText("Tone & Atmosphere")).toBeDefined();
    expect(screen.getByText("World Consistency")).toBeDefined();
  });

  it("renders race-specific review labels and triggers review with entityType race", async () => {
    const race = {
      name: "Androids",
      short_description: "Synthetic beings",
      is_race: true,
    };
    const universe = { name: "Cyber City" };
    render(
      <AiReviewDialog
        character={race}
        universe={universe}
        entityType="race"
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/Review biology, culture, lineage, and lore/),
    ).toBeDefined();
    start();
    await screen.findByText(result.summary);
    expect(reviewCharacter).toHaveBeenCalledWith(
      expect.objectContaining({
        character: race,
        universe,
        entityType: "race",
      }),
    );
    expect(screen.getByText("Origins & Lineage")).toBeDefined();
    expect(screen.getByText("Biology & Physical Traits")).toBeDefined();
    expect(screen.getByText("Culture & Society")).toBeDefined();
    expect(screen.getByText("Lore & Universe Fit")).toBeDefined();
  });
});
