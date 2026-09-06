/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Notifications from "./Notifications";

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="layout">{children}</div>
  ),
}));

const mockNotifications = [
  {
    id: "notif-1",
    title: "Welcome Announcement",
    message: "Welcome to Oxygen Low's Software!",
    type: "announcement",
    target_type: "all",
    action_url: "/apps",
    created_by: "1",
    created_by_username: "Admin",
    created_at: new Date().toISOString(),
    is_read: false,
    dismissed: false,
  },
  {
    id: "notif-2",
    title: "Account Security Notice",
    message: "Your masterkey was created.",
    type: "info",
    target_type: "user",
    target_user_id: "user-1",
    created_by: "1",
    created_by_username: "Admin",
    created_at: new Date(Date.now() - 3600000).toISOString(),
    is_read: true,
    dismissed: false,
  },
];

const mockMarkAsRead = vi.fn();
const mockMarkAsUnread = vi.fn();
const mockMarkAllAsRead = vi.fn();
const mockDismiss = vi.fn();

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: mockNotifications,
    unreadCount: 1,
    loading: false,
    markAsRead: mockMarkAsRead,
    markAsUnread: mockMarkAsUnread,
    markAllAsRead: mockMarkAllAsRead,
    dismissNotification: mockDismiss,
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    session: {
      access_token: "token",
      user: {
        id: "user-1",
        email: "user@example.com",
        username: "testuser",
        role: "user",
      },
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Notifications Page", () => {
  it("renders the notifications header, unread count badge, and notification items", () => {
    render(
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>,
    );

    expect(screen.getByText("Notifications")).toBeDefined();
    expect(screen.getByText("Welcome Announcement")).toBeDefined();
    expect(screen.getByText("Account Security Notice")).toBeDefined();
    expect(screen.getByText(/Welcome to Oxygen Low's Software!/)).toBeDefined();
  });

  it("filters notifications when clicking tabs", () => {
    render(
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>,
    );

    // Default "All" shows both
    expect(screen.getByText("Welcome Announcement")).toBeDefined();
    expect(screen.getByText("Account Security Notice")).toBeDefined();

    // Click "Unread"
    const unreadTab = screen.getByRole("button", { name: /Unread/ });
    fireEvent.click(unreadTab);

    // Only unread one should remain visible
    expect(screen.getByText("Welcome Announcement")).toBeDefined();
    expect(screen.queryByText("Account Security Notice")).toBeNull();

    // Click "Announcements"
    const announcementsTab = screen.getByRole("button", { name: /Announcements/ });
    fireEvent.click(announcementsTab);

    expect(screen.getByText("Welcome Announcement")).toBeDefined();
    expect(screen.queryByText("Account Security Notice")).toBeNull();
  });

  it("triggers markAllAsRead when clicking the mark all read button", () => {
    render(
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>,
    );

    const markAllBtn = screen.getByRole("button", { name: /Mark all as read/ });
    fireEvent.click(markAllBtn);

    expect(mockMarkAllAsRead).toHaveBeenCalled();
  });

  it("does not render the manage notifications button or admin link", () => {
    render(
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>,
    );

    expect(screen.queryByText("Manage Notifications")).toBeNull();
    expect(screen.queryByRole("link", { name: /Manage Notifications/i })).toBeNull();
  });
});
