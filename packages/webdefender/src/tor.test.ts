import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TorDetector } from './tor';

describe('TorDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  const mockTorExitData = `
ExitNode 1234567890
ExitAddress 1.1.1.1 2023-01-01 00:00:00
ExitAddress 2.2.2.2 2023-01-01 00:00:00
SomeOtherLine
ExitAddress 3.3.3.3 2023-01-01 00:00:00
`;

  it('should initialize and fetch exit nodes correctly', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => mockTorExitData,
    });

    const detector = new TorDetector();

    // Wait for the async refresh to complete
    // We have to wait for microtasks to clear since refresh is async and called in constructor
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('https://check.torproject.org/exit-addresses');
      expect(detector.isTorExitNode('1.1.1.1')).toBe(true);
    });

    // Check if correctly parsed
    expect(detector.isTorExitNode('2.2.2.2')).toBe(true);
    expect(detector.isTorExitNode('3.3.3.3')).toBe(true);
    expect(detector.isTorExitNode('4.4.4.4')).toBe(false);
    expect(detector.isTorExitNode('')).toBe(false);

    detector.destroy();
  });

  it('should gracefully handle network errors and preserve existing nodes', async () => {
    // First, populate some nodes
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      text: async () => mockTorExitData,
    });

    const detector = new TorDetector();

    await vi.waitFor(() => {
      expect(detector.isTorExitNode('1.1.1.1')).toBe(true);
    });

    // Now, simulate a network error on the next refresh
    (global.fetch as any).mockRejectedValueOnce(new Error('Network Error'));

    // Trigger refresh manually to check error handling
    await detector.refresh();

    // The existing nodes should be preserved
    expect(detector.isTorExitNode('1.1.1.1')).toBe(true);
    expect(detector.isTorExitNode('2.2.2.2')).toBe(true);

    // Now simulate a non-ok response
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500
    });

    await detector.refresh();

    // The existing nodes should still be preserved
    expect(detector.isTorExitNode('1.1.1.1')).toBe(true);
    expect(detector.isTorExitNode('2.2.2.2')).toBe(true);

    detector.destroy();
  });

  it('should refresh periodically every hour', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => mockTorExitData,
    });

    const detector = new TorDetector();

    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Advance by 1 hour
    await vi.advanceTimersByTimeAsync(3600000);

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Advance by another hour
    await vi.advanceTimersByTimeAsync(3600000);

    expect(global.fetch).toHaveBeenCalledTimes(3);

    detector.destroy();
  });

  it('should not allow concurrent refreshes', async () => {
    let resolveText: (value: string) => void;
    const textPromise = new Promise<string>((resolve) => {
      resolveText = resolve;
    });

    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: () => textPromise,
    });

    const detector = new TorDetector();

    // First refresh starts on init

    // Attempting a second refresh manually
    detector.refresh();
    detector.refresh();

    // Since the first refresh hasn't resolved text yet, isRefreshing should be true
    // Meaning fetch is only called once
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Resolve the promise to let it finish
    resolveText!(mockTorExitData);

    // Wait for the first refresh to fully complete
    await vi.waitFor(() => {
      expect(detector.isTorExitNode('1.1.1.1')).toBe(true);
    });

    detector.destroy();
  });

  it('should cleanup interval and clear nodes on destroy', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      text: async () => mockTorExitData,
    });

    const detector = new TorDetector();

    await vi.waitFor(() => {
      expect(detector.isTorExitNode('1.1.1.1')).toBe(true);
    });

    // Check we have an active interval timer
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    detector.destroy();

    // Timer should be cleared
    expect(vi.getTimerCount()).toBe(0);

    // Set should be cleared
    expect(detector.isTorExitNode('1.1.1.1')).toBe(false);
  });
});
