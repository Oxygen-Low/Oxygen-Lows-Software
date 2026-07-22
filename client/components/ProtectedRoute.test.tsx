/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

function AuthLocation() {
  const location = useLocation();
  return <div>{location.search}</div>;
}

describe("ProtectedRoute", () => {
  it("preserves a desktop Apps URL for the sign-in return path", () => {
    (useAuth as any).mockReturnValue({ session: null, loading: false });

    render(
      <MemoryRouter initialEntries={["/apps?desktop=1"]}>
        <Routes>
          <Route
            path="/apps"
            element={
              <ProtectedRoute>
                <div>Apps</div>
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<AuthLocation />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("?returnTo=%2Fapps%3Fdesktop%3D1")).toBeDefined();
  });
});
