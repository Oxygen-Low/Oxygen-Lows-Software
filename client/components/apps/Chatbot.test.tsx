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

// Mock chats list
let mockChats: any[] = [];

// Mock supabase
const mockSupabaseChain = (data: any) => {
  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: {}, error: null })),
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

const createChatsChain = () => {
  let currentResult: any = mockChats;
  const builder: any = {
    select: vi.fn(() => builder),
    insert: vi.fn((payload: any) => {
      const items = Array.isArray(payload) ? payload : [payload];
      const inserted = items.map((item) => ({
        id: "chat-" + Math.random().toString(36).substr(2, 9),
        updated_at: new Date().toISOString(),
        is_encrypted: false,
        llm_character_id: null,
        user_character_id: null,
        ...item,
      }));
      mockChats.push(...inserted);
      currentResult = inserted;
      return builder;
    }),
    update: vi.fn((updates: any) => {
      builder._updates = updates;
      return builder;
    }),
    delete: vi.fn(() => {
      builder._isDelete = true;
      return builder;
    }),
    eq: vi.fn((field: string, value: any) => {
      if (builder._updates) {
        mockChats = mockChats.map((c) => {
          if (c[field] === value) {
            return { ...c, ...builder._updates };
          }
          return c;
        });
        currentResult = mockChats.filter((c) => c[field] === value);
      } else if (builder._isDelete) {
        mockChats = mockChats.filter((c) => c[field] !== value);
        currentResult = [];
      } else {
        currentResult = mockChats.filter((c) => c[field] === value);
      }
      return builder;
    }),
    order: vi.fn(() => {
      currentResult = [...mockChats].sort((a, b) =>
        b.updated_at.localeCompare(a.updated_at),
      );
      return builder;
    }),
    maybeSingle: vi.fn(() => {
      const item = Array.isArray(currentResult)
        ? currentResult[0]
        : currentResult;
      return Promise.resolve({ data: item || null, error: null });
    }),
    single: vi.fn(() => {
      const item = Array.isArray(currentResult)
        ? currentResult[0]
        : currentResult;
      return Promise.resolve({ data: item || null, error: null });
    }),
    then: vi.fn((onFulfilled) => {
      const res = { data: currentResult, error: null };
      return onFulfilled
        ? Promise.resolve(res).then(onFulfilled)
        : Promise.resolve(res);
    }),
  };
  return builder;
};

vi.mock("@/lib/supabase", () => ({
  getAuthenticatedClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: {}, error: null })),
          single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
        })),
      })),
    })),
  })),
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
      if (table === "chats") return createChatsChain();
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
  if (url === "/api/ai/styles") {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            id: "GeneralAssistant",
            title: "Assistant",
            description: "Helpful",
            prompt: "",
          },
        ]),
    });
  }
  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
}) as any;

describe("ChatbotApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChats = [
      {
        id: "chat-1",
        title: "Existing Chat",
        style: "GeneralAssistant",
        updated_at: new Date().toISOString(),
      },
    ];
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
    await screen.findByText("Existing Chat");
    expect(screen.queryByText("How can I help you?")).not.toBeNull();
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
    const input = await screen.findByPlaceholderText(
      "Type a message...",
      {},
      { timeout: 5000 },
    );
    fireEvent.change(input, { target: { value: "Hi" } });

    // Use click on Send button
    const sendButton = screen.getByLabelText("Send message");
    fireEvent.click(sendButton);

    // Verify message sent and received
    await screen.findByText("Hi", {}, { timeout: 10000 });
    await screen.findByText("Hello from AI", {}, { timeout: 20000 });
  }, 30000);

  it("displays queue status when receiving queue_info on horde default model", async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn((url) => {
        if (url === "/api/ai/proxy") {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{}}],"queue_info":{"position":2,"eta":75,"workers":5,"totalInQueue":12}}\n',
                ),
              );
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"Hi from queue"}}]}\n',
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

      render(
        <ThemeProvider>
          <ChatbotApp />
        </ThemeProvider>,
      );

      const newChatButton = await screen.findByRole("button", {
        name: "New Chat",
      });
      fireEvent.click(newChatButton);

      const input = await screen.findByPlaceholderText("Type a message...");
      fireEvent.change(input, { target: { value: "Hello Queue" } });

      const sendButton = screen.getByLabelText("Send message");
      fireEvent.click(sendButton);

      await screen.findByText(
        /Queue Position: 2 \| ETA: 1m 15s \| Workers: 5 \| People in Queue: 12/,
        {},
        { timeout: 10000 },
      );

      await screen.findByText("Hi from queue", {}, { timeout: 10000 });
    } finally {
      global.fetch = originalFetch;
    }
  }, 30000);
});
