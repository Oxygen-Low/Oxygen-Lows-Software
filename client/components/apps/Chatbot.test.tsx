/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ChatbotApp } from "./Chatbot";

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = function() {};

// Mock supabase
const mockSupabaseChain = (data: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null })),
    then: vi.fn((onFulfilled) => {
      const res = { data, error: null };
      return onFulfilled ? Promise.resolve(res).then(onFulfilled) : Promise.resolve(res);
    }),
  };
  return builder;
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null }),
    },
    from: vi.fn((table) => {
      if (table === "chats") return mockSupabaseChain([{ id: "chat-1", title: "New Chat", style: "GeneralAssistant", updated_at: new Date().toISOString() }]);
      if (table === "user_models") return mockSupabaseChain([{ provider: "openai", model_id: "gpt-4" }]);
      if (table === "chat_messages") return mockSupabaseChain([]);
      return mockSupabaseChain(null);
    }),
  },
}));

// Mock fetch for streaming
global.fetch = vi.fn((url) => {
  if (url === "/api/ai/styles") {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ id: "GeneralAssistant", title: "Assistant", description: "Helpful" }])
    });
  }
  if (url === "/api/ai/chat") {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {\"choices\":[{\"delta\":{\"content\":\"Hello from AI\"}}]}\n"));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
        controller.close();
      }
    });
    return Promise.resolve({
      ok: true,
      body: stream
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
}) as any;

describe("ChatbotApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the chatbot app", async () => {
    render(<ChatbotApp />);
    await waitFor(() => {
      expect(screen.queryByText("New Chat", { selector: "button" })).not.toBeNull();
    });
    expect(screen.queryByText("Select a chat to start")).not.toBeNull();
  });

  it("creates a new chat and sends a message", async () => {
    render(<ChatbotApp />);

    // Wait for initial load
    const chatItem = await screen.findByText("New Chat", { selector: "span" });
    fireEvent.click(chatItem);

    // Verify input is now visible
    const input = await screen.findByPlaceholderText("Ask anything...");
    fireEvent.change(input, { target: { value: "Hi" } });

    // Use click on Send button as well to be sure
    const sendButton = screen.getByLabelText("Send message");
    fireEvent.click(sendButton);

    // Verify message sent and received
    await waitFor(() => {
      expect(screen.queryByText("Hi")).not.toBeNull();
    }, { timeout: 5000 });

    await waitFor(() => {
      expect(screen.queryByText("Hello from AI")).not.toBeNull();
    }, { timeout: 10000 });
  });
});
