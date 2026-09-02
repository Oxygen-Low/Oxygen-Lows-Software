/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VPNApp } from "./VPN";
import L from "leaflet";

// Mock leaflet since Leaflet requires window/canvas/DOM features not present in jsdom
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: any) => (
    <div data-testid="map-container">{children}</div>
  ),
  TileLayer: () => <div data-testid="tile-layer" />,
  Marker: ({ children }: any) => <div data-testid="marker">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  useMap: () => ({
    flyTo: vi.fn(),
    dragging: { enable: vi.fn(), disable: vi.fn() },
    touchZoom: { enable: vi.fn(), disable: vi.fn() },
    doubleClickZoom: { enable: vi.fn(), disable: vi.fn() },
    scrollWheelZoom: { enable: vi.fn(), disable: vi.fn() },
    keyboard: { enable: vi.fn(), disable: vi.fn() },
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: null, // Test unauthenticated by default
  }),
}));

afterEach(() => {
  cleanup();
});

describe("VPNApp Unauthenticated Direct Connection", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  });

  it("renders Direct Connect view for unauthenticated guest users", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VPNApp />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Should show Direct Connect headings and guest notice
    expect(
      screen.getByRole("heading", { name: /Direct Connect/i }),
    ).toBeDefined();
    expect(
      screen.getAllByText(/connect directly without saving/i).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole("link", { name: /Sign In/i })).toBeDefined();
    expect(
      screen.getByPlaceholderText(/e\.g\. Temporary Connection/i),
    ).toBeDefined();
    expect(screen.getByText(/Kill Switch/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Connect VPN/i })).toBeDefined();
  });

  it("updates configuration input in direct connect mode", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VPNApp />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const textarea = screen.getByRole("textbox", {
      name: /Configuration Content/i,
    });
    expect(textarea).toBeDefined();

    const sampleWireGuard = `[Interface]
PrivateKey = aaaaaa=
Address = 10.0.0.2/32

[Peer]
PublicKey = bbbbbb=
Endpoint = 198.51.100.1:51820
AllowedIPs = 0.0.0.0/0`;

    fireEvent.change(textarea, { target: { value: sampleWireGuard } });
    expect((textarea as HTMLTextAreaElement).value).toBe(sampleWireGuard);
  });

  it("handles OpenVPN config and KillSwitch toggle", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VPNApp />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(switches[0]);

    const textarea = screen.getByRole("textbox", {
      name: /Configuration Content/i,
    });
    const sampleOpenVPN = `client
dev tun
proto udp
remote us1.vpnbook.com 1194
resolv-retry infinite`;

    fireEvent.change(textarea, { target: { value: sampleOpenVPN } });
    expect((textarea as HTMLTextAreaElement).value).toBe(sampleOpenVPN);
  });
});

describe("Leaflet Vite Icon Configuration", () => {
  it("properly configures default icon assets and removes dynamic _getIconUrl", () => {
    // _getIconUrl on Icon.Default.prototype should be deleted so it delegates to L.Icon.prototype._getIconUrl
    expect(
      Object.prototype.hasOwnProperty.call(
        L.Icon.Default.prototype,
        "_getIconUrl",
      ),
    ).toBe(false);
    expect((L.Icon.Default.prototype as any)._getIconUrl).toBe(
      (L.Icon.prototype as any)._getIconUrl,
    );
    expect(L.Icon.Default.prototype.options.iconUrl).toBeDefined();
    expect(L.Icon.Default.prototype.options.iconRetinaUrl).toBeDefined();
    expect(L.Icon.Default.prototype.options.shadowUrl).toBeDefined();
  });
});
