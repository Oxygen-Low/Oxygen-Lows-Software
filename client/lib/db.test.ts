import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setLocalSession, db } from './db';
import * as localSessionModule from './localSession';
import { LocalSession } from './localSession';

vi.mock('./localSession', () => ({
  setLocalSession: vi.fn(),
  getLocalSession: vi.fn(),
}));

describe('db.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('setLocalSession', () => {
    it('should store the session and notify listeners of SIGNED_IN when given a valid session', () => {
      const mockSession: LocalSession = {
        access_token: 'test_token',
        token_type: 'bearer',
        user: {
          id: '123',
          email: 'test@example.com',
          username: 'testuser'
        }
      };

      const listener = vi.fn();
      db.auth.onAuthStateChange(listener);

      setLocalSession(mockSession);

      expect(localSessionModule.setLocalSession).toHaveBeenCalledWith(mockSession);
      expect(listener).toHaveBeenCalledWith('SIGNED_IN', mockSession);

      // Clean up
      db.auth.onAuthStateChange(listener).data.subscription.unsubscribe();
    });

    it('should store null and notify listeners of SIGNED_OUT when given null', () => {
      const listener = vi.fn();
      db.auth.onAuthStateChange(listener);

      setLocalSession(null);

      expect(localSessionModule.setLocalSession).toHaveBeenCalledWith(null);
      expect(listener).toHaveBeenCalledWith('SIGNED_OUT', null);

      // Clean up
      db.auth.onAuthStateChange(listener).data.subscription.unsubscribe();
    });

    it('should not throw if a listener throws an error', () => {
      const throwingListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      const nextListener = vi.fn();

      db.auth.onAuthStateChange(throwingListener);
      db.auth.onAuthStateChange(nextListener);

      expect(() => setLocalSession(null)).not.toThrow();

      expect(throwingListener).toHaveBeenCalledWith('SIGNED_OUT', null);
      expect(nextListener).toHaveBeenCalledWith('SIGNED_OUT', null);

      // Clean up
      db.auth.onAuthStateChange(throwingListener).data.subscription.unsubscribe();
      db.auth.onAuthStateChange(nextListener).data.subscription.unsubscribe();
    });
  });
});
