/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Account from './Account';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// Full mock of Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u', identities: [] } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc: vi.fn().mockResolvedValue({ data: [] }),
    storage: {
      from: vi.fn().mockReturnThis(),
      getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
      upload: vi.fn().mockResolvedValue({ data: { path: '' } }),
      remove: vi.fn().mockResolvedValue({}),
    }
  }
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('@/components/Layout', () => ({ default: ({ children }: any) => <div data-testid="layout">{children}</div> }));

// Mock Radix UI Tabs to always render children
vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: any) => <div>{children}</div>,
  TabsList: ({ children }: any) => <div>{children}</div>,
  TabsTrigger: ({ children }: any) => <button>{children}</button>,
  TabsContent: ({ children }: any) => <div>{children}</div>,
}));

describe('Account Component', () => {
  const mockLinkIdentity = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({ session: { user: { id: 'u', email: 'e@e.com' } }, linkIdentity: mockLinkIdentity });
  });

  it('links identities correctly', async () => {
    render(<Account />);
    const githubBtn = await screen.findByText(/Link GitHub/i);
    fireEvent.click(githubBtn);
    await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledWith('github'));

    const gitlabBtn = await screen.findByText(/Link GitLab/i);
    fireEvent.click(gitlabBtn);
    await waitFor(() => expect(mockLinkIdentity).toHaveBeenCalledWith('gitlab'));
  });
});
