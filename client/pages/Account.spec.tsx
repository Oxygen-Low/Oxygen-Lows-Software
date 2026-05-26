/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Account from './Account';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// Mock supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn(),
      getUserIdentities: vi.fn().mockResolvedValue({ data: { identities: [] }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

// Mock useAuth hook
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

// Mock Layout component
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
  Layout: ({ children }: { children: React.ReactNode }) => <div data-testid="layout">{children}</div>,
}));

// Mock use-toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('Account Component', () => {
  const mockLinkIdentity = vi.fn();
  const mockUpdateUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      session: { user: { id: 'test-user-id', email: 'test@example.com' } },
      linkIdentity: mockLinkIdentity,
    });
    (supabase.auth.updateUser as any).mockImplementation(mockUpdateUser);
  });

  it('sets manual_link_allowed flag before linking identity', async () => {
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    mockLinkIdentity.mockResolvedValue({});

    render(<Account />);

    // Use getAllByText and take the first one if multiple are found
    const githubButtons = await screen.findAllByText(/Link GitHub/i);
    fireEvent.click(githubButtons[0]);

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({
        data: { manual_link_allowed: true },
      });
    });

    await waitFor(() => {
      expect(mockLinkIdentity).toHaveBeenCalledWith('github');
    });
  });

  it('sets manual_link_allowed flag before linking GitLab identity', async () => {
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    mockLinkIdentity.mockResolvedValue({});

    render(<Account />);

    const gitlabButtons = await screen.findAllByText(/Link GitLab/i);
    fireEvent.click(gitlabButtons[0]);

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({
        data: { manual_link_allowed: true },
      });
    });

    await waitFor(() => {
      expect(mockLinkIdentity).toHaveBeenCalledWith('gitlab');
    });
  });

  it('sets manual_link_allowed flag before linking Google identity', async () => {
    mockUpdateUser.mockResolvedValue({ data: {}, error: null });
    mockLinkIdentity.mockResolvedValue({});

    render(<Account />);

    const googleButtons = await screen.findAllByText(/Link Google/i);
    fireEvent.click(googleButtons[0]);

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({
        data: { manual_link_allowed: true },
      });
    });

    await waitFor(() => {
      expect(mockLinkIdentity).toHaveBeenCalledWith('google');
    });
  });

  it('shows error toast if updateUser fails', async () => {
    mockUpdateUser.mockResolvedValue({ data: null, error: new Error('Update failed') });

    render(<Account />);

    const githubButtons = await screen.findAllByText(/Link GitHub/i);
    fireEvent.click(githubButtons[0]);

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalled();
    });

    expect(mockLinkIdentity).not.toHaveBeenCalled();
  });
});
