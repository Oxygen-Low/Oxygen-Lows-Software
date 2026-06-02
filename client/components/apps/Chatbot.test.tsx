/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatbotApp } from './Chatbot';

// Mock ResizeObserver
global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'test-user' } }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'chat-1', title: 'New Chat' }, error: null }),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
}));

// Mock fetch
global.fetch = vi.fn((url) => {
  if (url === '/api/ai/local-providers') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ id: 'ollama', name: 'Ollama' }])
    });
  }
  if (url === '/api/ai/styles') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ id: 'GeneralAssistant', title: 'Assistant', description: 'Helpful' }])
    });
  }
  if (url === '/api/ai/proxy') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'Hello from AI' } }] })
    });
  }
  return Promise.reject(new Error('Unknown URL: ' + url));
}) as any;

describe('ChatbotApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the chatbot app', async () => {
    render(<ChatbotApp />);
    expect(screen.getAllByText('New Chat')).toBeDefined();
    expect(screen.getByText('No active chat')).toBeDefined();
  });

  it('creates a new chat and sends a message', async () => {
    render(<ChatbotApp />);

    // Create chat
    const newChatBtns = screen.getAllByText('New Chat');
    fireEvent.click(newChatBtns[0]);

    await waitFor(() => {
      // Sidebar should have "New Chat" entries
      const entries = screen.getAllByText('New Chat');
      expect(entries.length).toBeGreaterThan(1);
    });

    // Send message
    const input = screen.getByPlaceholderText('Ask anything...');
    fireEvent.change(input, { target: { value: 'Hi' } });

    // The send button is the one with the Send icon
    const buttons = screen.getAllByRole('button');
    const sendBtn = buttons.find(b => b.querySelector('svg.lucide-send'));
    if (sendBtn) {
        fireEvent.click(sendBtn);
    } else {
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    }

    await waitFor(() => {
      expect(screen.getByText('Hi')).toBeDefined();
      expect(screen.getByText('Hello from AI')).toBeDefined();
    }, { timeout: 3000 });
  });
});
