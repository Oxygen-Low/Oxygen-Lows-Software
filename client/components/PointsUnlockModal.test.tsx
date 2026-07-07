/** @vitest-environment jsdom */
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { PointsUnlockModal } from "./PointsUnlockModal";
import { supabase } from "@/lib/supabase";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase");
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("PointsUnlockModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    onSuccess: vi.fn(),
    itemName: "Premium App",
    cost: 100,
    currentPoints: 300,
  };

  it("renders modal content correctly", () => {
    render(<PointsUnlockModal {...defaultProps} />);
    expect(screen.getByText(/Unlock Premium App/i)).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
    expect(screen.getByText("300")).toBeDefined();
  });

  it("calls adjust_points RPC and onSuccess when Unlock Now is clicked", async () => {
    (supabase.rpc as any).mockResolvedValue({ error: null });

    render(<PointsUnlockModal {...defaultProps} />);

    const unlockButton = screen.getByRole("button", { name: /Unlock Now/i });
    fireEvent.click(unlockButton);

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith("adjust_points", {
        p_amount: -100,
      });
      expect(defaultProps.onSuccess).toHaveBeenCalled();
      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  it("disables unlock button if points are insufficient", () => {
    render(<PointsUnlockModal {...defaultProps} currentPoints={50} />);
    const unlockButton = screen.getByRole("button", { name: /Unlock Now/i });
    expect(unlockButton).toHaveProperty("disabled", true);
  });
});
