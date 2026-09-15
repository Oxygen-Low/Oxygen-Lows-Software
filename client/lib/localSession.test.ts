// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { getLocalSession, setLocalSession, LocalSession } from './localSession';

describe('localSession', () => {
  const LOCAL_SESSION_KEY = "oxygen_auth_session";

  const mockSession: LocalSession = {
    access_token: 'token123',
    token_type: 'bearer',
    user: {
      id: 'user1',
      email: 'test@example.com',
      username: 'tester'
    }
  };

  let localStorageMock: { getItem: any; setItem: any; removeItem: any; };

  beforeEach(() => {
    localStorageMock = {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    vi.stubGlobal('localStorage', localStorageMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('getLocalSession', () => {
    it('returns null if localStorage is undefined', () => {
      vi.stubGlobal('localStorage', undefined);
      expect(getLocalSession()).toBeNull();
    });

    it('returns null if item is not found', () => {
      localStorageMock.getItem.mockReturnValue(null);
      expect(getLocalSession()).toBeNull();
      expect(localStorageMock.getItem).toHaveBeenCalledWith(LOCAL_SESSION_KEY);
    });

    it('returns parsed session if item is found', () => {
      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockSession));
      expect(getLocalSession()).toEqual(mockSession);
      expect(localStorageMock.getItem).toHaveBeenCalledWith(LOCAL_SESSION_KEY);
    });

    it('returns null if JSON parsing fails', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');
      expect(getLocalSession()).toBeNull();
    });

    it('returns null if localStorage.getItem throws', () => {
      localStorageMock.getItem.mockImplementation(() => { throw new Error('localStorage error'); });
      expect(getLocalSession()).toBeNull();
    });
  });

  describe('setLocalSession', () => {
    it('does nothing if localStorage is undefined', () => {
      vi.stubGlobal('localStorage', undefined);
      // Should not throw
      expect(() => setLocalSession(mockSession)).not.toThrow();
    });

    it('saves session if provided', () => {
      setLocalSession(mockSession);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(LOCAL_SESSION_KEY, JSON.stringify(mockSession));
    });

    it('removes session if null is provided', () => {
      setLocalSession(null);
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(LOCAL_SESSION_KEY);
    });

    it('silently handles errors when setItem throws', () => {
      localStorageMock.setItem.mockImplementation(() => { throw new Error('localStorage full'); });
      // Should not throw
      expect(() => setLocalSession(mockSession)).not.toThrow();
    });

    it('silently handles errors when removeItem throws', () => {
      localStorageMock.removeItem.mockImplementation(() => { throw new Error('localStorage error'); });
      // Should not throw
      expect(() => setLocalSession(null)).not.toThrow();
    });
  });
});
