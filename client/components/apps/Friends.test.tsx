/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FriendsApp } from './Friends';
import { supabase } from '@/lib/supabase';
import { MemoryRouter } from 'react-router-dom';

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    single: vi.fn(),
  },
}));

// Mock sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FriendsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (supabase.auth.getUser as any).mockResolvedValue({ data: { user: { id: 'test-user-id' } }, error: null });
    (supabase.from as any)().insert.mockResolvedValue({ data: {}, error: null });
    (supabase.from as any)().update.mockResolvedValue({ data: {}, error: null });
    (supabase.from as any)().delete.mockResolvedValue({ data: {}, error: null });
    (supabase.from as any)().single.mockResolvedValue({ data: null, error: null });
  });

  it('renders correctly and fetches initial data', async () => {
    render(
      <MemoryRouter>
        <FriendsApp />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Search by username/i);
    expect(input).toBeDefined();

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('friendships');
      expect(supabase.from).toHaveBeenCalledWith('follows');
      expect(supabase.from).toHaveBeenCalledWith('blocks');
    });
  });

  it('sends a friend request with correct payload', async () => {
    (supabase.from as any)().single.mockResolvedValue({
      data: { user_id: 'other-user-id', username: 'otheruser' },
      error: null
    });

    render(
      <MemoryRouter>
        <FriendsApp />
      </MemoryRouter>
    );

    const input = await screen.findByPlaceholderText(/Search by username/i);
    fireEvent.change(input, { target: { value: 'otheruser' } });

    const addButtons = await screen.findAllByText('Add');
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('friendships');
      expect((supabase.from as any)().insert).toHaveBeenCalledWith({
        user_id: 'test-user-id',
        friend_id: 'other-user-id',
        status: 'pending'
      });
    });
  });
});
