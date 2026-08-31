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
import { setLocalSession } from "@/lib/localSession";

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
let msgIdCounter = 0;
let mockUserModels: any[] = [{ provider: "openai", model_id: "gpt-4" }];
let mockUserPreferences: any = {
  theme: "default",
  use_gradient: true,
  language: "English",
  sub_language: "GB",
};

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

vi.mock("@/lib/db", () => {
  const mockClient = {
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
      if (table === "user_models") return mockSupabaseChain(mockUserModels);
      if (table === "chat_messages") {
        const builder: any = {
          insert: vi.fn(() => builder),
          update: vi.fn(() => builder),
          delete: vi.fn(() => builder),
          select: vi.fn(() => builder),
          eq: vi.fn(() => builder),
          order: vi.fn(() => builder),
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: { id: "mock-msg-id-" + ++msgIdCounter },
              error: null,
            }),
          ),
          single: vi.fn(() =>
            Promise.resolve({
              data: { id: "mock-msg-id-" + ++msgIdCounter },
              error: null,
            }),
          ),
          then: vi.fn((onFulfilled) => {
            return Promise.resolve({ data: [], error: null }).then(onFulfilled);
          }),
        };
        return builder;
      }
      if (table === "characters") return mockSupabaseChain([]);
      if (table === "user_preferences")
        return mockSupabaseChain(mockUserPreferences);
      return mockSupabaseChain(null);
    }),
    rpc: vi.fn((name) => {
      if (name === "upsert_user_preferences")
        return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    }),
    storage: {
      from: vi.fn(() => ({
        list: vi.fn().mockResolvedValue({ data: [], error: null }),
        download: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    },
  };

  return {
    getAuthenticatedClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(() =>
              Promise.resolve({ data: {}, error: null }),
            ),
            single: vi.fn(() => Promise.resolve({ data: {}, error: null })),
          })),
        })),
      })),
    })),
    db: mockClient,
    supabase: mockClient,
    getLocalSession: vi.fn(() => ({
      access_token: "test-token",
      token_type: "bearer",
      user: { id: "test-user" },
    })),
    setLocalSession: vi.fn(),
    notifyAuthListeners: vi.fn(),
  };
});

// Mock fetch for streaming
global.fetch = vi.fn((url, options: any) => {
  if (url === "/api/ai/proxy") {
    if (options?.body && options.body.includes('"stream":false')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "Mock Title" } }],
          }),
      });
    }
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"Hello from AI"}}]}\n',
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
        controller.close();
      },
    });
    return Promise.resolve({
      ok: true,
      body: stream,
      headers: { get: () => null },
    });
  }

  if (url === "/api/ai/agent-search") {
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"delta","content":"Web search response content"}\n',
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 50));
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
        controller.close();
      },
    });
    return Promise.resolve({
      ok: true,
      body: stream,
      headers: { get: () => null },
    });
  }

  return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
}) as any;

describe("ChatbotApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocalSession({
      access_token: "test-token",
      token_type: "bearer",
      user: { id: "test-user", email: "test@test.com", username: "testuser" },
    });
    msgIdCounter = 0;
    mockChats = [
      {
        id: "chat-1",
        title: "Existing Chat",
        updated_at: new Date().toISOString(),
      },
    ];
    mockUserModels = [{ provider: "openai", model_id: "gpt-4" }];
    mockUserPreferences = {
      theme: "default",
      use_gradient: true,
      language: "English",
      sub_language: "GB",
    };
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
      global.fetch = vi.fn((url, options: any) => {
        if (url === "/api/ai/proxy") {
          if (options?.body && options.body.includes('"stream":false')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  choices: [{ message: { content: "Mock Title" } }],
                }),
            });
          }
          const stream = new ReadableStream({
            async start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{}}],"queue_info":{"position":2,"eta":75,"workers":5,"totalInQueue":12}}\n',
                ),
              );
              await new Promise((resolve) => setTimeout(resolve, 2000));
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
            headers: { get: () => null },
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

  it("handles Anthropic streaming tool call correctly", async () => {
    mockUserPreferences = {
      theme: "default",
      use_gradient: true,
      language: "English",
      sub_language: "GB",
      last_model_id: "claude-3-5-sonnet-20241022",
      last_provider: "anthropic",
    };
    mockUserModels = [
      { provider: "anthropic", model_id: "claude-3-5-sonnet-20241022" },
    ];

    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn((url, options: any) => {
        if (url === "/api/ai/proxy") {
          if (options?.body && options.body.includes('"stream":false')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  content: [{ type: "text", text: "Weather Chat" }],
                }),
            });
          }
          const stream = new ReadableStream({
            async start(controller) {
              const events = [
                'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022"}}\n',
                'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_weather","input":{}}}\n',
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"location\\":"}}\n',
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":" \\"San Francisco\\"}"}}\n',
                'data: {"type":"content_block_stop","index":0}\n',
                'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n',
                'data: {"type":"message_stop"}\n',
                "data: [DONE]\n",
              ];
              for (const ev of events) {
                controller.enqueue(new TextEncoder().encode(ev));
              }
              controller.close();
            },
          });
          return Promise.resolve({
            ok: true,
            body: stream,
            headers: { get: () => null },
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
      fireEvent.change(input, { target: { value: "What is the weather?" } });

      const sendButton = screen.getByLabelText("Send message");
      fireEvent.click(sendButton);

      await screen.findByText(
        /Using Tool: get_weather/,
        {},
        { timeout: 10000 },
      );
      await screen.findByText(/San Francisco/, {}, { timeout: 10000 });
    } finally {
      global.fetch = originalFetch;
    }
  }, 30000);

  it("handles multiple Anthropic tool calls in a single response", async () => {
    mockUserPreferences = {
      theme: "default",
      use_gradient: true,
      language: "English",
      sub_language: "GB",
      last_model_id: "claude-3-5-sonnet-20241022",
      last_provider: "anthropic",
    };
    mockUserModels = [
      { provider: "anthropic", model_id: "claude-3-5-sonnet-20241022" },
    ];

    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn((url, options: any) => {
        if (url === "/api/ai/proxy") {
          if (options?.body && options.body.includes('"stream":false')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  content: [{ type: "text", text: "Multi Tool Chat" }],
                }),
            });
          }
          const stream = new ReadableStream({
            async start(controller) {
              const events = [
                'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022"}}\n',
                'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"tool_first","input":{}}}\n',
                'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"step\\": 1}"}}\n',
                'data: {"type":"content_block_stop","index":0}\n',
                'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_2","name":"tool_second","input":{}}}\n',
                'data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"step\\": 2}"}}\n',
                'data: {"type":"content_block_stop","index":1}\n',
                'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n',
                'data: {"type":"message_stop"}\n',
                "data: [DONE]\n",
              ];
              for (const ev of events) {
                controller.enqueue(new TextEncoder().encode(ev));
              }
              controller.close();
            },
          });
          return Promise.resolve({
            ok: true,
            body: stream,
            headers: { get: () => null },
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
      fireEvent.change(input, { target: { value: "Execute both tools" } });

      const sendButton = screen.getByLabelText("Send message");
      fireEvent.click(sendButton);

      await screen.findByText(/Using Tool: tool_first/, {}, { timeout: 10000 });
      await screen.findByText(
        /Using Tool: tool_second/,
        {},
        { timeout: 10000 },
      );
    } finally {
      global.fetch = originalFetch;
    }
  }, 30000);

  it("handles Anthropic tool calls with empty arguments", async () => {
    mockUserPreferences = {
      theme: "default",
      use_gradient: true,
      language: "English",
      sub_language: "GB",
      last_model_id: "claude-3-5-sonnet-20241022",
      last_provider: "anthropic",
    };
    mockUserModels = [
      { provider: "anthropic", model_id: "claude-3-5-sonnet-20241022" },
    ];

    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn((url, options: any) => {
        if (url === "/api/ai/proxy") {
          if (options?.body && options.body.includes('"stream":false')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  content: [{ type: "text", text: "Empty Args Chat" }],
                }),
            });
          }
          const stream = new ReadableStream({
            async start(controller) {
              const events = [
                'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-3-5-sonnet-20241022"}}\n',
                'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"get_time","input":{}}}\n',
                'data: {"type":"content_block_stop","index":0}\n',
                'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}\n',
                'data: {"type":"message_stop"}\n',
                "data: [DONE]\n",
              ];
              for (const ev of events) {
                controller.enqueue(new TextEncoder().encode(ev));
              }
              controller.close();
            },
          });
          return Promise.resolve({
            ok: true,
            body: stream,
            headers: { get: () => null },
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
      fireEvent.change(input, { target: { value: "Get the current time" } });

      const sendButton = screen.getByLabelText("Send message");
      fireEvent.click(sendButton);

      await screen.findByText(/Using Tool: get_time/, {}, { timeout: 10000 });
    } finally {
      global.fetch = originalFetch;
    }
  }, 30000);

  it("renders reasoning toggle in options dropdown and reasoning process in chat message", async () => {
    render(
      <ThemeProvider>
        <ChatbotApp />
      </ThemeProvider>,
    );

    const newChatButton = await screen.findByRole("button", {
      name: "New Chat",
    });
    fireEvent.click(newChatButton);

    const toggleOptionsButton = await screen.findByTitle("Toggle Options");
    fireEvent.click(toggleOptionsButton);

    const reasoningToggle = await screen.findByText("Reasoning Process");
    expect(reasoningToggle).toBeDefined();
    expect(screen.getByText("Toggle AI thought process")).toBeDefined();
  });

  it("displays Searched The Web and does not count as reasoning when only web search is enabled", async () => {
    render(
      <ThemeProvider>
        <ChatbotApp />
      </ThemeProvider>,
    );

    const newChatButton = await screen.findByRole("button", {
      name: "New Chat",
    });
    fireEvent.click(newChatButton);

    // Open options and enable web search
    const toggleOptionsButton = await screen.findByTitle("Toggle Options");
    fireEvent.click(toggleOptionsButton);

    const webSearchToggle = await screen.findByText("Web Search");
    fireEvent.click(webSearchToggle);

    // Send a message with web search enabled
    const input = await screen.findByPlaceholderText("Type a message...");
    fireEvent.change(input, { target: { value: "Search for latest news" } });

    const sendButton = screen.getByLabelText("Send message");
    fireEvent.click(sendButton);

    // Check that 'Searched The Web' is rendered with no reasoning block, and the selected model output is rendered
    await screen.findByText("Searched The Web", {}, { timeout: 15000 });
    await screen.findByText("Hello from AI", {}, { timeout: 15000 });
    expect(document.querySelector(".reasoning-block")).toBeNull();
  }, 30000);

  it("runs reasoning after web search when both are enabled", async () => {
    const callOrder: string[] = [];
    const originalFetch = global.fetch;

    try {
      global.fetch = vi.fn((url: string, options: any) => {
        if (url === "/api/ai/proxy") {
          const bodyStr = options?.body || "";
          if (bodyStr.includes('"stream":false')) {
            return Promise.resolve({
              ok: true,
              json: () =>
                Promise.resolve({
                  choices: [{ message: { content: "Mock Title" } }],
                }),
            });
          }

          if (bodyStr.includes("Formulate a targeted web search query")) {
            callOrder.push("plan_search");
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'data: {"choices":[{"delta":{"content":"{\\"query\\":\\"latest updates\\",\\"responseFormat\\":\\"summary\\"}"}}]}\n',
                  ),
                );
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
                controller.close();
              },
            });
            return Promise.resolve({
              ok: true,
              body: stream,
              headers: { get: () => null },
            });
          }

          if (bodyStr.includes("Based on the web search findings above")) {
            callOrder.push("reasoning_after_search");
            expect(bodyStr).toContain("Web Search Findings");
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'data: {"choices":[{"delta":{"content":"Analyzed web search findings carefully."}}]}\n',
                  ),
                );
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
                controller.close();
              },
            });
            return Promise.resolve({
              ok: true,
              body: stream,
              headers: { get: () => null },
            });
          }

          if (
            bodyStr.includes("based on your web search findings and reasoning")
          ) {
            callOrder.push("final_synthesis");
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    'data: {"choices":[{"delta":{"content":"Final response synthesized from search."}}]}\n',
                  ),
                );
                controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
                controller.close();
              },
            });
            return Promise.resolve({
              ok: true,
              body: stream,
              headers: { get: () => null },
            });
          }

          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"Generic AI message"}}]}\n',
                ),
              );
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
              controller.close();
            },
          });
          return Promise.resolve({
            ok: true,
            body: stream,
            headers: { get: () => null },
          });
        }

        if (url === "/api/ai/agent-search") {
          callOrder.push("agent_search");
          const bodyJson = JSON.parse((options?.body as string) || "{}");
          expect(bodyJson.researchModel).toBeDefined();
          expect(bodyJson.researchProvider).toBeDefined();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  'data: {"type":"delta","content":"Raw web search results about updates"}\n',
                ),
              );
              controller.enqueue(new TextEncoder().encode("data: [DONE]\n"));
              controller.close();
            },
          });
          return Promise.resolve({
            ok: true,
            body: stream,
            headers: { get: () => null },
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

      // Open options dropdown
      const toggleOptionsButton = await screen.findByTitle("Toggle Options");
      fireEvent.click(toggleOptionsButton);

      // Enable Web Search
      const webSearchToggle = await screen.findByText("Web Search");
      fireEvent.click(webSearchToggle);

      // Enable Reasoning Process
      const reasoningToggle = await screen.findByText("Reasoning Process");
      fireEvent.click(reasoningToggle);

      // Send a message
      const input = await screen.findByPlaceholderText("Type a message...");
      fireEvent.change(input, { target: { value: "Tell me the news" } });

      const sendButton = screen.getByLabelText("Send message");
      fireEvent.click(sendButton);

      // Verify UI elements
      await screen.findByText("Searched The Web", {}, { timeout: 15000 });
      await waitFor(
        () => {
          expect(document.querySelector(".reasoning-block")).not.toBeNull();
        },
        { timeout: 15000 },
      );
      await screen.findByText(
        "Final response synthesized from search.",
        {},
        { timeout: 15000 },
      );

      // Verify execution call order: search planning -> agent search -> reasoning with findings -> final synthesis
      expect(callOrder).toEqual([
        "plan_search",
        "agent_search",
        "reasoning_after_search",
        "final_synthesis",
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  }, 30000);

  it("renders local running models in the model dropdown and allows selecting them", async () => {
    const originalFetch = global.fetch;
    try {
      global.fetch = vi.fn((url: any) => {
        const urlStr = typeof url === "string" ? url : url.toString();
        if (urlStr.includes("/api/ai/local-providers")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve([
                { provider: "horde", model_id: "Fast" },
                { provider: "local-ollama", model_id: "llama3:latest" },
                { provider: "local-lmstudio", model_id: "deepseek-r1-7b" },
              ]),
          });
        }
        if (urlStr.includes("127.0.0.1:11434/api/tags")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                models: [{ name: "llama3:latest" }],
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([]),
        });
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

      // Open model dropdown
      const modelDropdownButton = await screen.findByRole("button", {
        name: /Fast/i,
      });
      fireEvent.click(modelDropdownButton);

      // Verify "Local Running Apps" header is visible
      await screen.findByText("Local Running Apps");
      await screen.findByText("llama3:latest");
      await screen.findByText("deepseek-r1-7b");

      // Select local model
      const ollamaOption = screen.getByText("llama3:latest");
      fireEvent.click(ollamaOption);

      // Verify the selected model is now Ollama/llama3:latest without reverting to Horde
      await waitFor(() => {
        expect(screen.getByText("Ollama/llama3:latest")).toBeDefined();
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
