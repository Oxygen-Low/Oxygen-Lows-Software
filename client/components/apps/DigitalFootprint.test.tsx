/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { DigitalFootprintApp } from "./DigitalFootprint";
import {
  executeDigitalFootprintScan,
  filterSocialItems,
  checkPasswordBreachClientSide,
  RECON_PLATFORMS,
  KNOWN_BREACHES,
  DATA_BROKERS,
  SAMPLE_SOCIAL_ITEMS,
} from "@/lib/digitalFootprint";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

describe("DigitalFootprint Logic & Engine", () => {
  it("has predefined recon platforms, known breaches, and data brokers", () => {
    expect(RECON_PLATFORMS.length).toBeGreaterThanOrEqual(20);
    expect(KNOWN_BREACHES.length).toBeGreaterThanOrEqual(5);
    expect(DATA_BROKERS.length).toBeGreaterThanOrEqual(5);
  });

  it("filters social items by type, keyword, and date", () => {
    const items = SAMPLE_SOCIAL_ITEMS.reddit;
    expect(items.length).toBeGreaterThan(0);

    // Filter by keyword
    const filteredByKeyword = filterSocialItems(items, {
      keyword: "Austin",
      types: ["post", "comment"],
    });
    expect(filteredByKeyword.length).toBeGreaterThan(0);
    expect(filteredByKeyword.every((i) => i.content.toLowerCase().includes("austin"))).toBe(true);

    // Filter by type
    const commentsOnly = filterSocialItems(items, {
      types: ["comment"],
    });
    expect(commentsOnly.every((i) => i.type === "comment")).toBe(true);

    // Filter by date
    const dateFiltered = filterSocialItems(items, {
      startDate: "2024-01-01",
      endDate: "2025-12-31",
      types: ["post", "comment"],
    });
    expect(dateFiltered.every((i) => new Date(i.createdAt).getFullYear() >= 2024)).toBe(true);
  });

  it("executes a digital footprint scan and calculates privacy score", async () => {
    const scan = await executeDigitalFootprintScan({
      username: "alex99",
      email: "alex@example.com",
      phone: "+15551234567",
      realName: "Alex Mercer",
    });

    expect(scan).toBeDefined();
    expect(scan.privacyScore).toBeLessThan(100);
    expect(scan.reconProfiles.length).toBe(RECON_PLATFORMS.length);
    expect(scan.breachesFound.length).toBe(KNOWN_BREACHES.length);
    expect(scan.dataBrokerRisks.length).toBe(DATA_BROKERS.length);
    expect(scan.alerts.length).toBeGreaterThan(0);
    expect(scan.summary.exposedDataTypes.length).toBeGreaterThan(0);
  });

  it("performs client-side k-anonymity breach check safely with fallback", async () => {
    const res = await checkPasswordBreachClientSide("TestPassword123!");
    expect(typeof res.isPwned).toBe("boolean");
    expect(typeof res.count).toBe("number");
  });
});

describe("DigitalFootprintApp UI Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  const renderComponent = () =>
    render(
      <LanguageProvider>
        <ThemeProvider>
          <DigitalFootprintApp />
        </ThemeProvider>
      </LanguageProvider>
    );

  it("renders the digital footprint app header, tabs, and initial state", () => {
    renderComponent();
    expect(screen.getByText("Digital Footprint")).toBeDefined();
    expect(screen.getByText("Scanner")).toBeDefined();
    expect(screen.getByText("Social Redact")).toBeDefined();
    expect(screen.getByText("Opt-Out Guide")).toBeDefined();
    expect(screen.getByText("Target Identifiers")).toBeDefined();
  });

  it("performs a scan when identifiers are provided and displays results", async () => {
    renderComponent();

    const usernameInput = screen.getByPlaceholderText("e.g. cyberninja, user123");
    fireEvent.change(usernameInput, { target: { value: "testuser" } });

    const scanButton = screen.getByText("Run Footprint Scan");
    fireEvent.click(scanButton);

    await waitFor(() => {
      expect(screen.getByText("Privacy Score")).toBeDefined();
      expect(screen.getByText("Security & Privacy Alerts")).toBeDefined();
      expect(screen.getByText("Public Platform Footprint")).toBeDefined();
    });
  });

  it("switches to Social Redact tab, connects session, and shows mass delete UI", async () => {
    renderComponent();

    const tabs = screen.getAllByRole("tab");
    // Tab 1: Scanner, Tab 2: Social Redact, Tab 3: Opt-Out Guide
    fireEvent.click(tabs[1]);

    await waitFor(() => {
      expect(screen.getByText("Select Platform")).toBeDefined();
      expect(
        screen.getByText("Session Authentication & Content Loader"),
      ).toBeDefined();
    });

    const loadDataBtn = screen.getByText("Fetch & List Account Content");
    fireEvent.click(loadDataBtn);

    await waitFor(() => {
      expect(screen.getByText("Redact Filters")).toBeDefined();
      expect(screen.getByText("Export Backup JSON")).toBeDefined();
      expect(screen.getByText(/Mass Delete Selected/i)).toBeDefined();
    });
  });

  it("switches to Opt-Out Guide tab and displays data broker directory and checklist", async () => {
    renderComponent();

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[2]);

    await waitFor(() => {
      expect(screen.getByText("Data Broker Opt-Out Directory")).toBeDefined();
      expect(screen.getByText("Privacy Hardening Checklist")).toBeDefined();
      expect(screen.getByText("Whitepages")).toBeDefined();
      expect(
        screen.getByText("Rotate Reused & Breached Passwords"),
      ).toBeDefined();
    });
  });
});
