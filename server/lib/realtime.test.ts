import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  subscribeUser,
  unsubscribeUser,
  subscribeAdmin,
  unsubscribeAdmin,
  broadcastChange,
  type RealtimeChangeEvent,
} from "./realtime.ts";

describe("realtime event hub", () => {
  const user1Listener = vi.fn();
  const user2Listener = vi.fn();
  const adminListener = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    unsubscribeUser("user_1", user1Listener);
    unsubscribeUser("user_2", user2Listener);
    unsubscribeAdmin(adminListener);
  });

  it("delivers events to the targeted user", () => {
    subscribeUser("user_1", user1Listener);
    subscribeUser("user_2", user2Listener);

    const event: RealtimeChangeEvent = {
      table: "support_tickets",
      event: "INSERT",
      schema: "public",
      new: { id: "ticket_1", title: "Test Ticket", user_id: "user_1" },
      old: null,
      targetUserId: "user_1",
    };

    broadcastChange(event);

    expect(user1Listener).toHaveBeenCalledTimes(1);
    expect(user1Listener).toHaveBeenCalledWith(event);
    expect(user2Listener).not.toHaveBeenCalled();
  });

  it("delivers support table events to all admin listeners", () => {
    subscribeUser("user_1", user1Listener);
    subscribeAdmin(adminListener);

    const event: RealtimeChangeEvent = {
      table: "support_tickets",
      event: "UPDATE",
      schema: "public",
      new: { id: "ticket_1", status: "Closed", user_id: "user_1" },
      old: null,
      targetUserId: "user_1",
    };

    broadcastChange(event);

    expect(user1Listener).toHaveBeenCalledWith(event);
    expect(adminListener).toHaveBeenCalledWith(event);
  });

  it("delivers support messages to both user and admin listeners", () => {
    subscribeUser("user_1", user1Listener);
    subscribeAdmin(adminListener);

    const event: RealtimeChangeEvent = {
      table: "support_messages",
      event: "INSERT",
      schema: "public",
      new: { id: "msg_1", ticket_id: "ticket_1", message: "Hello", sender_id: "1" },
      old: null,
      targetUserId: "user_1",
    };

    broadcastChange(event);

    expect(user1Listener).toHaveBeenCalledWith(event);
    expect(adminListener).toHaveBeenCalledWith(event);
  });

  it("stops delivering events after unsubscribe", () => {
    subscribeUser("user_1", user1Listener);
    unsubscribeUser("user_1", user1Listener);

    const event: RealtimeChangeEvent = {
      table: "support_tickets",
      event: "INSERT",
      schema: "public",
      new: { id: "ticket_2" },
      old: null,
      targetUserId: "user_1",
    };

    broadcastChange(event);

    expect(user1Listener).not.toHaveBeenCalled();
  });

  it("stops delivering events to admin after unsubscribeAdmin", () => {
    subscribeAdmin(adminListener);
    unsubscribeAdmin(adminListener);

    const event: RealtimeChangeEvent = {
      table: "support_tickets",
      event: "INSERT",
      schema: "public",
      new: { id: "ticket_3" },
      old: null,
      targetUserId: "user_1",
    };

    broadcastChange(event);

    expect(adminListener).not.toHaveBeenCalled();
  });
});
