import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportEntityToMarkdown,
  copyEntityAsMarkdown,
  type ExportableEntity,
} from "./characterExport";

describe("characterExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("exportEntityToMarkdown", () => {
    it("exports a standard character with full details and stats", () => {
      const char: ExportableEntity = {
        name: "hero_1",
        display_name: "Valerius",
        short_description: "A seasoned paladin of the Silver Sun.",
        appearance: "Tall warrior clad in polished sunstone armor.",
        personality: "Resolute, honorable, and fiercely loyal.",
        backstory: "Trained in the High Citadel since early childhood.",
        situation: "Currently investigating rumors of corruption in the capital.",
        hidden_description: "Possesses a secret celestial artifact in his heirloom ring.",
        stats_enabled: true,
        stats: {
          str: 18,
          dex: 12,
          con: 16,
          int: 10,
          wis: 14,
          cha: 15,
        },
      };

      const md = exportEntityToMarkdown(char);

      expect(md).toContain("# Valerius");
      expect(md).toContain("## Overview\nA seasoned paladin of the Silver Sun.");
      expect(md).toContain("## Appearance\nTall warrior clad in polished sunstone armor.");
      expect(md).toContain("## Personality\nResolute, honorable, and fiercely loyal.");
      expect(md).toContain("## Backstory\nTrained in the High Citadel since early childhood.");
      expect(md).toContain("## Current Situation & Abilities\nCurrently investigating rumors of corruption in the capital.");
      expect(md).toContain("## Attributes / Stats");
      expect(md).toContain("- Strength (STR): 18");
      expect(md).toContain("- Dexterity (DEX): 12");
      expect(md).toContain("- Constitution (CON): 16");
      expect(md).toContain("- Intelligence (INT): 10");
      expect(md).toContain("- Wisdom (WIS): 14");
      expect(md).toContain("- Charisma (CHA): 15");
      expect(md).toContain("## Hidden Notes\nPossesses a secret celestial artifact in his heirloom ring.");
    });

    it("exports a universe with setting details, tone, and lore", () => {
      const universe: ExportableEntity = {
        name: "world_elysium",
        display_name: "Elysium Prime",
        short_description: "A floating celestial realm powered by crystal spires.",
        appearance: "Floating islands interconnected by light bridges under twin moons.",
        personality: "Ethereal, tranquil, yet burdened by ancient tensions.",
        backstory: "Founded after the Cataclysm by elder mystics.",
        is_universe: true,
      };

      const md = exportEntityToMarkdown(universe);

      expect(md).toContain("# Elysium Prime");
      expect(md).toContain("## Overview\nA floating celestial realm powered by crystal spires.");
      expect(md).toContain("## Setting Details\nFloating islands interconnected by light bridges under twin moons.");
      expect(md).toContain("## Tone & Atmosphere\nEthereal, tranquil, yet burdened by ancient tensions.");
      expect(md).toContain("## Lore & History\nFounded after the Cataclysm by elder mystics.");
      expect(md).not.toContain("## Appearance");
      expect(md).not.toContain("## Personality");
    });

    it("exports a race with physiological traits, culture, and origins", () => {
      const race: ExportableEntity = {
        name: "sylphari",
        display_name: "Sylphari",
        short_description: "Winged avian humanoids attuned to the winds.",
        appearance: "Lightweight frames with feathered wings and iridescent eyes.",
        personality: "Free-spirited, migratory, and deeply communal.",
        backstory: "Descended from ancient sky leviathan watchers.",
        is_race: true,
      };

      const md = exportEntityToMarkdown(race);

      expect(md).toContain("# Sylphari");
      expect(md).toContain("## Overview\nWinged avian humanoids attuned to the winds.");
      expect(md).toContain("## Racial Traits & Physiology\nLightweight frames with feathered wings and iridescent eyes.");
      expect(md).toContain("## Racial Culture & Behaviors\nFree-spirited, migratory, and deeply communal.");
      expect(md).toContain("## Racial Origins & Lore\nDescended from ancient sky leviathan watchers.");
    });

    it("omits empty or undefined sections cleanly", () => {
      const char: ExportableEntity = {
        name: "Mysterious Wanderer",
      };

      const md = exportEntityToMarkdown(char);
      expect(md).toBe("# Mysterious Wanderer");
    });
  });

  describe("copyEntityAsMarkdown", () => {
    it("copies text using navigator.clipboard and calls toast", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      });

      const toastMock = vi.fn();
      const result = await copyEntityAsMarkdown(
        { name: "Test Hero", short_description: "Just a hero" },
        { toast: toastMock, successMessage: "Copied successfully!" }
      );

      expect(result).toBe(true);
      expect(writeTextMock).toHaveBeenCalledWith(
        "# Test Hero\n\n## Overview\nJust a hero"
      );
      expect(toastMock).toHaveBeenCalledWith("Copied successfully!");
    });
  });
});
