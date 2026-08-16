export class TorDetector {
  private exitNodes: Set<string> = new Set();
  private intervalId?: ReturnType<typeof setInterval>;
  private isRefreshing = false;

  constructor() {
    this.startRefreshInterval();
  }

  private startRefreshInterval() {
    this.refresh();
    // Refresh every hour
    this.intervalId = setInterval(() => this.refresh(), 3600000);
  }

  async refresh(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      const response = await fetch('https://check.torproject.org/exit-addresses');
      if (response.ok) {
        const text = await response.text();
        const newNodes = new Set<string>();
        
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('ExitAddress ')) {
            const parts = line.split(' ');
            if (parts.length >= 2) {
              newNodes.add(parts[1]);
            }
          }
        }
        
        if (newNodes.size > 0) {
          this.exitNodes = newNodes;
        }
      }
    } catch (error) {
      // Silently fail on network error and keep existing set
    } finally {
      this.isRefreshing = false;
    }
  }

  isTorExitNode(ip: string): boolean {
    if (!ip) return false;
    return this.exitNodes.has(ip);
  }

  destroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.exitNodes.clear();
  }
}
