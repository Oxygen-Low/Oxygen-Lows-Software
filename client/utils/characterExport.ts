export interface ExportableEntity {
  name: string;
  display_name?: string | null;
  short_description?: string | null;
  appearance?: string | null;
  personality?: string | null;
  backstory?: string | null;
  situation?: string | null;
  hidden_description?: string | null;
  is_universe?: boolean;
  is_race?: boolean;
  stats_enabled?: boolean;
  stats?: {
    str?: number | null;
    dex?: number | null;
    con?: number | null;
    int?: number | null;
    wis?: number | null;
    cha?: number | null;
    [key: string]: any;
  } | null;
}

/**
 * Converts a Character, Universe, or Race entity into a clean, markdown-formatted
 * importable text representation containing all lore and LLM context.
 */
export function exportEntityToMarkdown(entity: ExportableEntity): string {
  const sections: string[] = [];
  const title = entity.display_name?.trim() || entity.name?.trim() || "Untitled";
  sections.push(`# ${title}`);

  if (entity.short_description?.trim()) {
    sections.push(`## Overview\n${entity.short_description.trim()}`);
  }

  if (entity.is_universe) {
    if (entity.appearance?.trim()) {
      sections.push(`## Setting Details\n${entity.appearance.trim()}`);
    }
    if (entity.personality?.trim()) {
      sections.push(`## Tone & Atmosphere\n${entity.personality.trim()}`);
    }
    if (entity.backstory?.trim()) {
      sections.push(`## Lore & History\n${entity.backstory.trim()}`);
    }
  } else if (entity.is_race) {
    if (entity.appearance?.trim()) {
      sections.push(
        `## Racial Traits & Physiology\n${entity.appearance.trim()}`,
      );
    }
    if (entity.personality?.trim()) {
      sections.push(
        `## Racial Culture & Behaviors\n${entity.personality.trim()}`,
      );
    }
    if (entity.backstory?.trim()) {
      sections.push(`## Racial Origins & Lore\n${entity.backstory.trim()}`);
    }
  } else {
    // Standard Character
    if (entity.appearance?.trim()) {
      sections.push(`## Appearance\n${entity.appearance.trim()}`);
    }
    if (entity.personality?.trim()) {
      sections.push(`## Personality\n${entity.personality.trim()}`);
    }
    if (entity.backstory?.trim()) {
      sections.push(`## Backstory\n${entity.backstory.trim()}`);
    }
    if (entity.situation?.trim()) {
      sections.push(
        `## Current Situation & Abilities\n${entity.situation.trim()}`,
      );
    }
    if (
      entity.stats_enabled &&
      entity.stats &&
      typeof entity.stats === "object"
    ) {
      const statDefs = [
        { key: "str", label: "Strength (STR)" },
        { key: "dex", label: "Dexterity (DEX)" },
        { key: "con", label: "Constitution (CON)" },
        { key: "int", label: "Intelligence (INT)" },
        { key: "wis", label: "Wisdom (WIS)" },
        { key: "cha", label: "Charisma (CHA)" },
      ];
      const statLines: string[] = [];
      for (const { key, label } of statDefs) {
        const val = (entity.stats as any)[key];
        if (val !== undefined && val !== null && val !== "") {
          statLines.push(`- ${label}: ${val}`);
        }
      }
      if (statLines.length > 0) {
        sections.push(`## Attributes / Stats\n${statLines.join("\n")}`);
      }
    }
  }

  if (entity.hidden_description?.trim()) {
    sections.push(`## Hidden Notes\n${entity.hidden_description.trim()}`);
  }

  return sections.join("\n\n");
}

/**
 * Copies the entity markdown representation to clipboard and optionally displays feedback.
 */
export async function copyEntityAsMarkdown(
  entity: ExportableEntity,
  options?: {
    toast?: (msg: any, opts?: any) => void;
    successMessage?: string;
    errorMessage?: string;
  },
): Promise<boolean> {
  try {
    const text = exportEntityToMarkdown(entity);
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    if (options?.toast) {
      options.toast(
        options.successMessage || "Copied importable text to clipboard!",
      );
    }
    return true;
  } catch (err) {
    console.error("Failed to copy importable text:", err);
    if (options?.toast) {
      options.toast(
        options.errorMessage || "Failed to copy text to clipboard",
        {
          variant: "destructive",
        },
      );
    }
    return false;
  }
}
