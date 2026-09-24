import { describe, it, expect } from "vitest";
import { repairJson, safeParseJson } from "./jsonRepair";

describe("JSON Repair & Safe Parsing Utility", () => {
  describe("Fast-path and clean JSON", () => {
    it("parses valid JSON without modification", () => {
      const input = '{"name": "Valid", "count": 42, "items": [1, 2, 3]}';
      expect(JSON.parse(repairJson(input))).toEqual({
        name: "Valid",
        count: 42,
        items: [1, 2, 3],
      });
      expect(safeParseJson(input)).toEqual({
        name: "Valid",
        count: 42,
        items: [1, 2, 3],
      });
    });

    it("parses valid JSON array", () => {
      const input = '["alpha", "beta", "gamma"]';
      expect(safeParseJson(input)).toEqual(["alpha", "beta", "gamma"]);
    });
  });

  describe("Markdown Codeblocks and Conversational Text", () => {
    it("extracts JSON enclosed in ```json ... ``` codeblock", () => {
      const input = `Here is your character:\n\`\`\`json\n{\n  "name": "Aragorn",\n  "level": 20\n}\n\`\`\`\nHope you like it!`;
      expect(safeParseJson(input)).toEqual({
        name: "Aragorn",
        level: 20,
      });
    });

    it("extracts JSON enclosed in untyped ``` ... ``` codeblock", () => {
      const input = `\`\`\`\n{"status": "ok", "value": true}\n\`\`\``;
      expect(safeParseJson(input)).toEqual({
        status: "ok",
        value: true,
      });
    });

    it("extracts JSON surrounded by conversation without codeblocks", () => {
      const input = `Sure, I can help with that!\n{\n  "title": "Brave New World",\n  "author": "Aldous Huxley"\n}\nLet me know if you need more details.`;
      expect(safeParseJson(input)).toEqual({
        title: "Brave New World",
        author: "Aldous Huxley",
      });
    });
  });

  describe("Syntax Quirks: Quotes and Keys", () => {
    it("fixes single-quoted strings and property keys", () => {
      const input = "{ 'name': 'Sir Lancelot', 'title': 'Knight of the Round Table' }";
      expect(safeParseJson(input)).toEqual({
        name: "Sir Lancelot",
        title: "Knight of the Round Table",
      });
    });

    it("fixes unquoted object keys", () => {
      const input = "{ name: 'Galahad', age: 28, is_brave: true }";
      expect(safeParseJson(input)).toEqual({
        name: "Galahad",
        age: 28,
        is_brave: true,
      });
    });

    it("handles embedded quotes inside single-quoted strings", () => {
      const input = "{ 'quote': 'He said \"hello\" to everyone' }";
      expect(safeParseJson(input)).toEqual({
        quote: 'He said "hello" to everyone',
      });
    });
  });

  describe("Syntax Quirks: Trailing Commas and Comments", () => {
    it("removes trailing commas in objects and arrays", () => {
      const input = `{\n  "a": 1,\n  "b": [10, 20, ],\n  "c": { "nested": "val", },\n}`;
      expect(safeParseJson(input)).toEqual({
        a: 1,
        b: [10, 20],
        c: { nested: "val" },
      });
    });

    it("strips single-line and multi-line comments", () => {
      const input = `{
        // Primary user data
        "user": "Alice",
        /* Multi-line
           comment here */
        "role": "admin"
      }`;
      expect(safeParseJson(input)).toEqual({
        user: "Alice",
        role: "admin",
      });
    });
  });

  describe("Python and Pseudocode Literals", () => {
    it("converts True, False, None to true, false, null", () => {
      const input = `{
        "active": True,
        "archived": False,
        "deleted_at": None,
        "note": "True None False in a string stays unmodified"
      }`;
      expect(safeParseJson(input)).toEqual({
        active: true,
        archived: false,
        deleted_at: null,
        note: "True None False in a string stays unmodified",
      });
    });

    it("converts undefined and NaN to null", () => {
      const input = `{ "missing": undefined, "invalidNum": NaN }`;
      expect(safeParseJson(input)).toEqual({
        missing: null,
        invalidNum: null,
      });
    });
  });

  describe("Truncation and Cut-off Recovery", () => {
    it("repairs truncated unclosed string and closes object", () => {
      const input = `{"name": "Incomplete`;
      expect(safeParseJson(input)).toEqual({
        name: "Incomplete",
      });
    });

    it("discards trailing dangling key and closes object", () => {
      const input = `{"name": "Incomplete", "display_name": "Truncated", "short_description": `;
      expect(safeParseJson(input)).toEqual({
        name: "Incomplete",
        display_name: "Truncated",
      });
    });

    it("recovers truncated codeblock", () => {
      const input = "```json\n{\"name\": \"Cut off\"\n";
      expect(safeParseJson(input)).toEqual({
        name: "Cut off",
      });
    });

    it("recovers deeply nested truncated structures", () => {
      const input = `{"character": {"stats": {"str": 18, "dex": 14, "items": ["sword", "shield`;
      expect(safeParseJson(input)).toEqual({
        character: {
          stats: {
            str: 18,
            dex: 14,
            items: ["sword", "shield"],
          },
        },
      });
    });

    it("handles postscript text following valid JSON", () => {
      const input = `{"result": "success", "score": 99}\nI hope this satisfies your requirements!`;
      expect(safeParseJson(input)).toEqual({
        result: "success",
        score: 99,
      });
    });

    it("handles unquoted keys with underscores and hyphens", () => {
      const input = `{ first_name: "John", display-title: "Hero" }`;
      expect(safeParseJson(input)).toEqual({
        first_name: "John",
        "display-title": "Hero",
      });
    });

    it("preserves escaped quotes inside double-quoted strings", () => {
      const input = `{"quote": "She said, \\"Never back down\\""}`;
      expect(safeParseJson(input)).toEqual({
        quote: 'She said, "Never back down"',
      });
    });
  });

  describe("Error Handling and Fallbacks", () => {
    it("throws clear error on empty or whitespace strings", () => {
      expect(() => repairJson("")).toThrow("Empty response received from generator");
      expect(() => repairJson("   ")).toThrow("Empty response received from generator");
      expect(() => repairJson(null as any)).toThrow("Empty response received from generator");
    });

    it("throws descriptive error when input is completely non-JSON text", () => {
      expect(() => repairJson("I cannot fulfill this request as an AI assistant.")).toThrow(
        "Failed to parse structured JSON from generator output",
      );
    });

    it("returns provided fallback when safeParseJson encounters unparseable text", () => {
      const fallback = { fallback: true };
      const result = safeParseJson("Refusal text without JSON", fallback);
      expect(result).toBe(fallback);
    });
  });
});
