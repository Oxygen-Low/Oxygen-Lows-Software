/** @vitest-environment jsdom */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import React from "react";
import {
  getAppConfig,
  CountryFlag,
  COUNTRIES,
  EventsTab,
  SettingsTab,
} from "./WebDefender";

afterEach(() => {
  cleanup();
});

describe("Defender getAppConfig", () => {
  it("returns default configuration when defenderConfig is null or undefined", () => {
    const configNull = getAppConfig(null);
    expect(configNull.block_sql_injection).toBe(true);
    expect(configNull.block_shell_injection).toBe(true);
    expect(configNull.block_tor).toBe(true);
    expect(configNull.block_vpn).toBe(true);
    expect(configNull.block_countries).toEqual([]);
    expect(configNull.block_ips).toEqual([]);
    expect(configNull.ddos_threshold_rpm).toBe(1000);
    expect(configNull.block_bruteforce).toBe(true);
    expect(configNull.block_http_dos).toBe(true);
    expect(configNull.block_http_exploit).toBe(true);
    expect(configNull.block_botnets).toBe(true);
    expect(configNull.events_limit).toBe(50);

    const configUndefined = getAppConfig(undefined);
    expect(configUndefined.block_sql_injection).toBe(true);
    expect(configUndefined.block_vpn).toBe(true);
    expect(configUndefined.block_ips).toEqual([]);
    expect(configUndefined.block_bruteforce).toBe(true);
    expect(configUndefined.block_http_dos).toBe(true);
    expect(configUndefined.block_http_exploit).toBe(true);
    expect(configUndefined.block_botnets).toBe(true);
    expect(configUndefined.events_limit).toBe(50);
  });

  it("extracts config correctly from a single object (1-to-1 relation)", () => {
    const singleObjConfig = {
      app_id: "app-123",
      block_sql_injection: false,
      block_shell_injection: true,
      block_tor: false,
      block_vpn: false,
      block_countries: ["US", "CA"],
      block_ips: ["192.168.1.100", "10.0.0.1"],
      ddos_threshold_rpm: 500,
      block_bruteforce: false,
      block_http_dos: true,
      block_http_exploit: false,
      block_botnets: true,
    };

    const config = getAppConfig(singleObjConfig);
    expect(config.block_sql_injection).toBe(false);
    expect(config.block_shell_injection).toBe(true);
    expect(config.block_tor).toBe(false);
    expect(config.block_vpn).toBe(false);
    expect(config.block_countries).toEqual(["US", "CA"]);
    expect(config.block_ips).toEqual(["192.168.1.100", "10.0.0.1"]);
    expect(config.ddos_threshold_rpm).toBe(500);
    expect(config.block_bruteforce).toBe(false);
    expect(config.block_http_dos).toBe(true);
    expect(config.block_http_exploit).toBe(false);
    expect(config.block_botnets).toBe(true);
    // Unspecified fields fallback to defaults
    expect(config.block_path_traversal).toBe(true);
  });

  it("extracts config correctly from an array of objects", () => {
    const arrayConfig = [
      {
        app_id: "app-123",
        block_sql_injection: false,
        block_countries: ["FR"],
        block_ad_bots: true,
        block_vpn: true,
        block_bruteforce: true,
        block_botnets: false,
      },
    ];

    const config = getAppConfig(arrayConfig);
    expect(config.block_sql_injection).toBe(false);
    expect(config.block_countries).toEqual(["FR"]);
    expect(config.block_ad_bots).toBe(true);
    expect(config.block_vpn).toBe(true);
    expect(config.block_bruteforce).toBe(true);
    expect(config.block_botnets).toBe(false);
    expect(config.block_http_dos).toBe(true);
  });

  it("handles empty array gracefully", () => {
    const config = getAppConfig([]);
    expect(config.block_sql_injection).toBe(true);
    expect(config.block_tor).toBe(true);
    expect(config.block_vpn).toBe(true);
    expect(config.block_bruteforce).toBe(true);
    expect(config.block_http_dos).toBe(true);
    expect(config.block_http_exploit).toBe(true);
    expect(config.block_botnets).toBe(true);
    expect(config.events_limit).toBe(50);
  });

  it("extracts and clamps custom events_limit within 1-1000 range", () => {
    const configCustom = getAppConfig({ events_limit: 500 });
    expect(configCustom.events_limit).toBe(500);

    const configMaxClamped = getAppConfig({ events_limit: 2500 });
    expect(configMaxClamped.events_limit).toBe(1000);

    const configMinClamped = getAppConfig({ events_limit: -10 });
    expect(configMinClamped.events_limit).toBe(1);
  });
});

describe("Defender CountryFlag and COUNTRIES", () => {
  it("exports COUNTRIES list containing country codes and names", () => {
    expect(COUNTRIES.length).toBeGreaterThan(50);
    const argentina = COUNTRIES.find((c) => c.code === "AR");
    expect(argentina).toBeDefined();
    expect(argentina?.name).toBe("Argentina");

    const us = COUNTRIES.find((c) => c.code === "US");
    expect(us).toBeDefined();
    expect(us?.name).toBe("United States");
  });

  it("renders CountryFlag img element for valid 2-letter country code", () => {
    const { container } = render(<CountryFlag countryCode="AR" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://flagcdn.com/w40/ar.png");
    expect(img?.getAttribute("alt")).toBe("AR flag");
  });

  it("renders globe fallback when country code is invalid or empty", () => {
    const { container } = render(<CountryFlag countryCode="" />);
    const img = container.querySelector("img");
    expect(img).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("Defender EventsTab", () => {
  it("renders table headers without User Agent", () => {
    const mockEvents = [
      {
        id: "evt-1",
        created_at: new Date().toISOString(),
        ip: "192.168.1.1",
        country_code: "US",
        event_type: "sql_injection",
        method: "POST",
        path: "/api/login",
        blocked: true,
      },
    ];

    const { queryByText, getAllByRole, container } = render(
      <EventsTab events={mockEvents} />,
    );
    const headers = getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual([
      "Time",
      "IP",
      "Location",
      "Type",
      "Target",
      "Status",
    ]);
    expect(queryByText("User Agent")).toBeNull();

    // Verify row rendered without User Agent cell
    expect(container.textContent).toContain("192.168.1.1");
    expect(container.textContent).toContain("/api/login");
    expect(container.textContent).toContain("blocked");
  });

  it("renders empty state with colSpan 6", () => {
    const { getByText, container } = render(<EventsTab events={[]} />);
    expect(getByText("No events found matching filters.")).toBeDefined();
    const emptyCell = container.querySelector("tbody td");
    expect(emptyCell?.getAttribute("colspan")).toBe("6");
  });
});

describe("Defender SettingsTab Total Events Limit", () => {
  const mockApp = {
    id: "app-test-123",
    name: "My App",
    api_key_prefix: "wd_live_test",
    block_mode_enabled: false,
    block_mode_enabled_at: null,
    first_request_at: null,
    created_at: new Date().toISOString(),
    defender_config: {
      events_limit: 50,
    },
  };

  it("renders total events limit with initial value and does not save on change", () => {
    const authFetch = vi.fn().mockResolvedValue({ ok: true });
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    const { getByDisplayValue } = render(
      <SettingsTab
        app={mockApp}
        authFetch={authFetch}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    const input = getByDisplayValue("50") as HTMLInputElement;
    expect(input).toBeDefined();

    // Type new values
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.change(input, { target: { value: "250" } });

    // Should NOT have made any API calls on change
    expect(authFetch).not.toHaveBeenCalled();
    expect(input.value).toBe("250");
  });

  it("saves config on blur (clicking/pressing off) when value has changed", () => {
    const authFetch = vi.fn().mockResolvedValue({ ok: true });
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    const { getByDisplayValue } = render(
      <SettingsTab
        app={mockApp}
        authFetch={authFetch}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    const input = getByDisplayValue("50") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "200" } });
    expect(authFetch).not.toHaveBeenCalled();

    // Blur (clicking off)
    fireEvent.blur(input);

    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(authFetch).toHaveBeenCalledWith(
      "/api/webdefender/apps/app-test-123/config",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"events_limit":200'),
      }),
    );
  });

  it("does not call API on blur if the value was not changed", () => {
    const authFetch = vi.fn().mockResolvedValue({ ok: true });
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    const { getByDisplayValue } = render(
      <SettingsTab
        app={mockApp}
        authFetch={authFetch}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    const input = getByDisplayValue("50") as HTMLInputElement;
    fireEvent.blur(input);

    expect(authFetch).not.toHaveBeenCalled();
  });

  it("clamps out-of-range values between 1 and 1000 on blur", () => {
    const authFetch = vi.fn().mockResolvedValue({ ok: true });
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    const { getByDisplayValue } = render(
      <SettingsTab
        app={mockApp}
        authFetch={authFetch}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    const input = getByDisplayValue("50") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "9999" } });
    fireEvent.blur(input);

    expect(input.value).toBe("1000");
    expect(authFetch).toHaveBeenCalledWith(
      "/api/webdefender/apps/app-test-123/config",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"events_limit":1000'),
      }),
    );
  });

  it("triggers blur and saves when Enter key is pressed", () => {
    const authFetch = vi.fn().mockResolvedValue({ ok: true });
    const onUpdate = vi.fn();
    const onDelete = vi.fn();

    const { getByDisplayValue } = render(
      <SettingsTab
        app={mockApp}
        authFetch={authFetch}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />,
    );

    const input = getByDisplayValue("50") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "350" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(authFetch).toHaveBeenCalledWith(
      "/api/webdefender/apps/app-test-123/config",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining('"events_limit":350'),
      }),
    );
  });
});
