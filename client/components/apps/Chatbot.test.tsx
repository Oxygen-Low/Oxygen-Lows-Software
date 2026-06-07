/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "test-user" } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "test-token" } }, error: null }),
    },
    from: vi.fn(() => {
      const builder: any = {
        select: vi.fn(() => builder),
        insert: vi.fn(() => builder),
        update: vi.fn(() => builder),
        delete: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve({ data: { id: "chat-1", title: "New Chat" }, error: null })),
        then: vi.fn((onFulfilled) => {
           if (typeof onFulfilled === "function") {
             return Promise.resolve({ data: [{ id: "chat-1", title: "New Chat" }], error: null }).then(onFulfilled);
           }
           return builder;
        }),
      };
      return builder;
    }),
  },
}));

// Mock fetch for streaming
global.fetch = vi.fn((url) => {
  if (url === "/api/ai/local-providers") {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ id: "ollama", name: "Ollama" }])
    });
  }
  if (url === "/api/ai/styles") {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ id: "GeneralAssistant", title: "Assistant", description: "Helpful" }])
    });
  }
  if (url === "/api/ai/proxy") {
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
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve([{ id: "GeneralAssistant", title: "Assistant", description: "Helpful" }]),
    text: () => Promise.resolve("Title: Test\nDescription: Test Desc")
  });
}) as any;

describe("ChatbotApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the chatbot app", async () => {
    render(<ChatbotApp />);
    expect(screen.getAllByText("New Chat")).toBeDefined();
    expect(screen.getByText("Select a chat to start")).toBeDefined();
  });

  it("creates a new chat and sends a message", async () => {
    render(<ChatbotApp />);

    await waitFor(() => {
        expect(screen.getAllByText("New Chat")).toBeDefined();
    });

    const chatInSidebar = await screen.findByText("New Chat", { selector: "span" });
    fireEvent.click(chatInSidebar);

    const input = await screen.findByPlaceholderText("Ask anything...");
    fireEvent.change(input, { target: { value: "Hi" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.queryByText("Hi")).not.toBeNull();
      expect(screen.queryByText("Hello from AI")).not.toBeNull();
    }, { timeout: 10000 });
  }, 20000);
});
