import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn function", () => {
  it("should merge classes correctly", () => {
    expect(cn("text-red-500", "bg-blue-500")).toBe("text-red-500 bg-blue-500");
  });

  it("should handle conditional classes", () => {
    const isActive = true;
    expect(cn("base-class", isActive && "active-class")).toBe(
      "base-class active-class",
    );
  });

  it("should handle false and null conditions", () => {
    const isActive = false;
    expect(cn("base-class", isActive && "active-class", null)).toBe(
      "base-class",
    );
  });

  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("should work with object notation", () => {
    expect(cn("base", { conditional: true, "not-included": false })).toBe(
      "base conditional",
    );
  });

  it("should handle arrays of classes", () => {
    expect(cn(["class-1", "class-2"])).toBe("class-1 class-2");
  });

  it("should handle nested arrays of classes", () => {
    expect(cn(["class-1", ["class-2", "class-3"]])).toBe(
      "class-1 class-2 class-3",
    );
  });

  it("should ignore undefined, null, and empty string values", () => {
    expect(cn("class-1", undefined, "class-2", null, "", "class-3")).toBe(
      "class-1 class-2 class-3",
    );
  });

  it("should resolve conflicting tailwind classes correctly", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
    expect(cn("bg-red-500", "bg-blue-500 hover:bg-green-500")).toBe(
      "bg-blue-500 hover:bg-green-500",
    );
    expect(cn("flex", "inline-flex")).toBe("inline-flex");
  });
});
