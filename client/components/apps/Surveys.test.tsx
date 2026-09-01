/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SurveysApp } from "./Surveys";

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

window.scrollTo = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: { access_token: "test-token-123", token_type: "bearer", user: { id: "test-user-123", email: "test@example.com", username: "testuser" } },
    loading: false,
    error: null,
  }),
}));

const mockSurveysList = [
  {
    id: "monthly-hardware-survey",
    titleKey: "surveys.hardwareTitle",
    defaultTitle: "Hardware Survey",
    descriptionKey: "surveys.hardwareDesc",
    defaultDescription: "Monthly automated and community hardware survey.",
    category: "Hardware",
    recurrence: "monthly",
    isPredefined: true,
    isActive: true,
    isHardwareSurvey: true,
    questionsCount: 12,
    hasSubmitted: false,
    currentMonthKey: "2026-09",
    daysRemaining: 29,
  },
  {
    id: "monthly-browser-survey",
    titleKey: "surveys.browserTitle",
    defaultTitle: "Browser Survey",
    descriptionKey: "surveys.browserDesc",
    defaultDescription: "Simple monthly browser survey.",
    category: "Fun",
    recurrence: "monthly",
    isPredefined: true,
    isActive: true,
    isHardwareSurvey: false,
    questionsCount: 3,
    hasSubmitted: true,
    currentMonthKey: "2026-09",
    daysRemaining: 29,
  },
];

const mockBrowserSurveyDetail = {
  id: "monthly-browser-survey",
  titleKey: "surveys.browserTitle",
  defaultTitle: "Browser Survey",
  descriptionKey: "surveys.browserDesc",
  defaultDescription: "Simple monthly browser survey.",
  category: "Fun",
  recurrence: "monthly",
  isPredefined: true,
  isActive: true,
  questions: [
    {
      id: "main_browser",
      titleKey: "surveys.browser.mainBrowser",
      defaultTitle: "Main Browser You Use",
      type: "single_choice",
      required: true,
      options: [
        { value: "Chrome", defaultLabel: "Google Chrome" },
        { value: "Firefox", defaultLabel: "Mozilla Firefox" },
      ],
    },
  ],
};

const mockResultsData = {
  surveyId: "monthly-browser-survey",
  title: "Browser Survey",
  monthKey: "2026-09",
  totalSubmissions: 10,
  verifiedCount: 8,
  unverifiedCount: 2,
  variantFilter: "all",
  questions: [
    {
      questionId: "main_browser",
      questionTitle: "Main Browser You Use",
      totalResponses: 10,
      optionsDistribution: [
        { name: "Chrome", count: 7, percentage: 70 },
        { name: "Firefox", count: 3, percentage: 30 },
      ],
      lineChartSeries: [
        { label: "Chrome", value: 70, count: 7 },
        { label: "Firefox", value: 30, count: 3 },
      ],
    },
  ],
};

describe("SurveysApp Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith("/api/surveys")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ surveys: mockSurveysList }),
        });
      }
      if (url.includes("/api/surveys/monthly-browser-survey/results")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ results: mockResultsData }),
        });
      }
      if (url.endsWith("/api/surveys/monthly-browser-survey")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ survey: mockBrowserSurveyDetail, hasSubmitted: false }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    });
  });

  it("renders survey catalog with title and cards", async () => {
    render(
      <MemoryRouter>
        <SurveysApp />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Community Surveys")).toBeDefined();
    expect(await screen.findByText("Hardware Survey")).toBeDefined();
    expect(await screen.findByText("Browser Survey")).toBeDefined();
  });

  it("allows opening and viewing survey results", async () => {
    render(
      <MemoryRouter>
        <SurveysApp />
      </MemoryRouter>,
    );

    const resultsBtn = await screen.findByRole("button", { name: /Results/i });
    fireEvent.click(resultsBtn);

    await waitFor(() => {
      expect(screen.getByText("Browser Survey Results")).toBeDefined();
      expect(screen.getByText("Line Charts")).toBeDefined();
      expect(screen.getByText("Bar Charts")).toBeDefined();
      expect(screen.getByText("Chrome")).toBeDefined();
    });
  });
});
