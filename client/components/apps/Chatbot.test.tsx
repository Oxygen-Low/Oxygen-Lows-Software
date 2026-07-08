/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { ChatbotApp } from "./Chatbot";

// Mock i18next

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = function () {};

// Mock supabase
const mockSupabaseChain = (data: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    single: vi.fn(() =>
      Promise.resolve({
        data: Array.isArray(data) ? data[0] : data,
        error: null,
      }),
    ),
    then: vi.fn((onFulfilled) => {
      const res = { data, error: null };
      return onFulfilled
        ? Promise.resolve(res).then(onFulfilled)
        : Promise.resolve(res);
    }),
  };
  return builder;
};

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "test-user" } },
        error: null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: { user: { id: "test-user" }, access_token: "test-token" },
        },
        error: null,
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    from: vi.fn((table) => {
      if (table === "chats")
        return mockSupabaseChain([
          {
            id: "chat-1",
            title: "New Chat",
            style: "GeneralAssistant",
            updated_at: new Date().toISOString(),
          },
        ]);
      if (table === "user_models")
        return mockSupabaseChain([{ provider: "openai", model_id: "gpt-4" }]);
      if (table === "chat_messages") return mockSupabaseChain([]);
      if (table === "characters") return mockSupabaseChain([]);
      if (table === "user_preferences")
        return mockSupabaseChain({
          theme: "default",
          use_gradient: true,
          language: "English",
          sub_language: "GB",
        });
      return mockSupabaseChain(null);
    }),
    rpc: vi.fn((name) => {
      if (name === "get_chat_styles")
        return Promise.resolve({
          data: [
            {
              id: "GeneralAssistant",
              title: "Assistant",
              description: "Helpful",
              prompt: "",
            },
          ],
          error: null,
        });
      if (name === "upsert_user_preferences")
        return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    }),
  },
}));

// Mock fetch for streaming
global.fetch = vi.fn((url) => {
  if (url === "/api/ai/proxy") {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"Hello from AI"}}]}\n',
          ),
        );
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
        controller.close();
      },
    });
    return Promise.resolve({
      ok: true,
      body: stream,
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
    render(
      <ThemeProvider>
        <ChatbotApp />
      </ThemeProvider>,
    );
    await waitFor(() => {
      expect(screen.queryByText("New Chat")).not.toBeNull();
    });
    expect(screen.queryByText("Select a chat to start")).not.toBeNull();
  });

  it("creates a new chat and sends a message", async () => {
    render(
      <ThemeProvider>
        <ChatbotApp />
      </ThemeProvider>,
    );

    // Create a new chat instead of relying on the mocked initial list
    const newChatButton = await screen.findByRole("button", {
      name: "New Chat",
    });
    fireEvent.click(newChatButton);

    // Verify input is now visible
    const input = await screen.findByPlaceholderText("Ask anything...");
    fireEvent.change(input, { target: { value: "Hi" } });

    // Use click on Send button
    const sendButton = screen.getByLabelText("Send message");
    fireEvent.click(sendButton);

    // Verify message sent and received
    await waitFor(
      () => {
        expect(screen.queryByText("Hi")).not.toBeNull();
      },
      { timeout: 5000 },
    );

    await waitFor(
      () => {
        expect(screen.queryByText("Hello from AI")).not.toBeNull();
      },
      { timeout: 10000 },
    );
  });
});
