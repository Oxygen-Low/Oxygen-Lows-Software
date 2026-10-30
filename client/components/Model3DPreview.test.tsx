/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Model3DPreview } from "./Model3DPreview";

vi.mock("@/lib/storage", () => ({
  storage: {
    from: vi.fn(() => ({
      createSignedUrl: vi.fn(() =>
        Promise.resolve({ data: { signedUrl: "https://example.com/test.glb" } }),
      ),
      getPublicUrl: vi.fn(() => ({
        data: { publicUrl: "https://example.com/public-test.glb" },
      })),
      download: vi.fn(() =>
        Promise.resolve({ data: new Blob(["mock"], { type: "model/gltf-binary" }) }),
      ),
    })),
  },
}));

describe("Model3DPreview Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders without crashing in jsdom environment and displays fallback", () => {
    render(
      <Model3DPreview
        fileName="robot.glb"
        src="https://example.com/robot.glb"
      />,
    );

    expect(screen.getByText("robot.glb")).toBeDefined();
    expect(screen.getByText("3D Model")).toBeDefined();
    expect(screen.getByText(/WebGL preview unavailable/i)).toBeDefined();
  });

  it("handles custom className and file paths", () => {
    const { container } = render(
      <Model3DPreview
        filePath="user-123/space-ship.gltf"
        className="custom-preview-class"
      />,
    );

    expect(screen.getByText("space-ship.gltf")).toBeDefined();
    expect(container.querySelector(".custom-preview-class")).toBeDefined();
  });

  it("triggers onOpenFullscreen callback when expand button clicked", () => {
    const handleFullscreen = vi.fn();
    render(
      <Model3DPreview
        fileName="character.obj"
        variant="thumbnail"
        allowFullscreen={true}
        onOpenFullscreen={handleFullscreen}
      />,
    );

    const expandBtn = screen.getByTitle("Open Interactive 3D Viewer");
    expect(expandBtn).toBeDefined();
    fireEvent.click(expandBtn);
    expect(handleFullscreen).toHaveBeenCalledTimes(1);
  });
});
