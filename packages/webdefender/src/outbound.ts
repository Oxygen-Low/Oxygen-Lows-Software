// Safely obtain Node http/https modules if running in an environment where they exist
let nodeHttp: any = null;
let nodeHttps: any = null;

try {
  if (typeof process !== "undefined" && process.versions?.node) {
    const importedHttp = await import("http");
    nodeHttp = importedHttp.default || importedHttp;
    const importedHttps = await import("https");
    nodeHttps = importedHttps.default || importedHttps;
  }
} catch (_) {
  // In non-Node or edge runtimes (e.g., Cloudflare Workers), http/https are unavailable
}
import { OutboundConnection } from "./types.js";

export class OutboundMonitor {
  private reporter: (conn: OutboundConnection) => void;
  private ignoreHost: string;
  private originalHttpRequest: any;
  private originalHttpGet: any;
  private originalHttpsRequest: any;
  private originalHttpsGet: any;
  private originalFetch: any;

  constructor(
    reporter: (conn: OutboundConnection) => void,
    ignoreHost: string,
  ) {
    this.reporter = reporter;
    this.ignoreHost = ignoreHost;
  }

  install(): void {
    if (this.originalHttpRequest || (this.originalFetch && !nodeHttp)) return; // already installed

    this.originalHttpRequest = nodeHttp?.request;
    this.originalHttpGet = nodeHttp?.get;
    this.originalHttpsRequest = nodeHttps?.request;
    this.originalHttpsGet = nodeHttps?.get;
    this.originalFetch = globalThis.fetch;

    const self = this;

    function patchMethod(original: any, protocol: string) {
      return function (this: any, ...args: any[]) {
        try {
          let host = "";
          let port = protocol === "https:" ? 443 : 80;

          const arg0 = args[0];
          if (typeof arg0 === "string" || arg0 instanceof URL) {
            const url = typeof arg0 === "string" ? new URL(arg0) : arg0;
            host = url.hostname;
            if (url.port) port = parseInt(url.port, 10);
          } else if (arg0 && typeof arg0 === "object") {
            host = arg0.hostname || arg0.host || "localhost";
            if (arg0.port) port = parseInt(arg0.port, 10);
          }

          if (host && host !== self.ignoreHost) {
            self.reporter({ host, port, protocol });
          }
        } catch (e) {
          // ignore parsing errors
        }

        return original.apply(this, args);
      };
    }

    if (nodeHttp) {
      // @ts-ignore
      nodeHttp.request = patchMethod(this.originalHttpRequest, "http:");
      // @ts-ignore
      nodeHttp.get = patchMethod(this.originalHttpGet, "http:");
    }
    if (nodeHttps) {
      // @ts-ignore
      nodeHttps.request = patchMethod(this.originalHttpsRequest, "https:");
      // @ts-ignore
      nodeHttps.get = patchMethod(this.originalHttpsGet, "https:");
    }

    if (this.originalFetch) {
      globalThis.fetch = async function (this: any, ...args: any[]) {
        try {
          const arg0 = args[0];
          let host = "";
          let port = 443;
          let protocol = "https:";

          if (
            typeof arg0 === "string" ||
            arg0 instanceof URL ||
            (arg0 && typeof arg0 === "object" && arg0.url)
          ) {
            const urlStr =
              arg0 && typeof arg0 === "object" && arg0.url
                ? arg0.url
                : typeof arg0 === "string"
                  ? arg0
                  : arg0.toString();
            const url = new URL(urlStr);
            host = url.hostname;
            protocol = url.protocol;
            if (url.port) {
              port = parseInt(url.port, 10);
            } else {
              port = protocol === "http:" ? 80 : 443;
            }
          }

          if (host && host !== self.ignoreHost) {
            self.reporter({ host, port, protocol });
          }
        } catch (e) {
          // ignore parsing errors
        }

        return self.originalFetch.apply(this, args);
      };
    }
  }

  uninstall(): void {
    if (!this.originalHttpRequest && !this.originalFetch) return;

    if (nodeHttp && this.originalHttpRequest) {
      nodeHttp.request = this.originalHttpRequest;
      nodeHttp.get = this.originalHttpGet;
    }
    if (nodeHttps && this.originalHttpsRequest) {
      nodeHttps.request = this.originalHttpsRequest;
      nodeHttps.get = this.originalHttpsGet;
    }
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
    }

    this.originalHttpRequest = undefined;
    this.originalHttpGet = undefined;
    this.originalHttpsRequest = undefined;
    this.originalHttpsGet = undefined;
    this.originalFetch = undefined;
  }
}
