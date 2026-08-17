import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ThreatActorDetector } from './threatActors';

describe('ThreatActorDetector', () => {
  let detector: ThreatActorDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(''),
      })
    );
  });

  afterEach(() => {
    if (detector) {
      detector.destroy();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('should initialize and start refresh interval', async () => {
    const fetchSpy = vi.mocked(fetch);
    detector = new ThreatActorDetector();

    // refresh() is called in constructor, so fetch should be called immediately
    expect(fetchSpy).toHaveBeenCalled();

    const callCount = fetchSpy.mock.calls.length;

    // Advance timers by 1 hour (3600000ms)
    await vi.advanceTimersByTimeAsync(3600000);

    // refresh() should be called again
    expect(fetchSpy.mock.calls.length).toBeGreaterThan(callCount);
  });

  it('should parse IPs correctly and handle comments/whitespace', async () => {
    const mockFeedContent = `
# This is a comment
1.1.1.1
  2.2.2.2
// Another comment
3.3.3.3:80
4.4.4.4/24
; Yet another comment

5.5.5.5
`;
    // Make sure we mock the actual implementation of refresh with this custom text for this test
    vi.mocked(fetch).mockImplementation(async () => {
      return {
        ok: true,
        text: () => Promise.resolve(mockFeedContent),
      } as Response;
    });

    detector = new ThreatActorDetector();

    // Allow initial fetch promises to resolve
    await Promise.resolve();
    // Allow the setTimeouts in refresh to resolve and text() to resolve
    await vi.runOnlyPendingTimersAsync();

    expect(detector.checkThreatActor('1.1.1.1')).not.toBeNull();
    expect(detector.checkThreatActor('2.2.2.2')).not.toBeNull();
    expect(detector.checkThreatActor('3.3.3.3')).not.toBeNull();
    expect(detector.checkThreatActor('4.4.4.4')).not.toBeNull();
    expect(detector.checkThreatActor('5.5.5.5')).not.toBeNull();

    expect(detector.checkThreatActor('6.6.6.6')).toBeNull();
  });

  it('should handle network errors silently', async () => {
    let callCount = 0;
    vi.mocked(fetch).mockImplementation(async () => {
      callCount++;
      if (callCount <= 7) { // 7 is number of urls in THREAT_FEEDS
         return { ok: true, text: () => Promise.resolve('1.1.1.1') } as Response;
      }
      throw new Error('Network error');
    });

    detector = new ThreatActorDetector();
    await Promise.resolve();
    await vi.runOnlyPendingTimersAsync();

    expect(detector.checkThreatActor('1.1.1.1')).not.toBeNull();

    // Advance 1 hour to trigger next refresh which will fail
    await vi.advanceTimersByTimeAsync(3600000);

    // Existing IPs should still be there
    expect(detector.checkThreatActor('1.1.1.1')).not.toBeNull();
  });

  it('should not update categories if fetch is not ok', async () => {
    vi.mocked(fetch).mockImplementation(async () => {
      return { ok: false, text: () => Promise.resolve('2.2.2.2') } as Response;
    });

    detector = new ThreatActorDetector();
    await Promise.resolve();
    await vi.runOnlyPendingTimersAsync();

    expect(detector.checkThreatActor('2.2.2.2')).toBeNull();
  });

  it('should categorize correctly with checkThreatActor', () => {
    detector = new ThreatActorDetector();

    detector.addThreatIp('http_exploit', '10.0.0.1');
    detector.addThreatIp('botnet', '10.0.0.2');

    expect(detector.checkThreatActor('10.0.0.1')).toEqual({
      category: 'http_exploit',
      feed: 'http_exploit'
    });

    expect(detector.checkThreatActor('10.0.0.2')).toEqual({
      category: 'botnet',
      feed: 'botnet'
    });

    expect(detector.checkThreatActor('10.0.0.3')).toBeNull();
    expect(detector.checkThreatActor('')).toBeNull();
  });

  it('should clear sets and intervals on destroy', () => {
    detector = new ThreatActorDetector();
    detector.addThreatIp('botnet', '1.2.3.4');

    expect(detector.checkThreatActor('1.2.3.4')).not.toBeNull();

    detector.destroy();

    expect(detector.checkThreatActor('1.2.3.4')).toBeNull();
  });
});
