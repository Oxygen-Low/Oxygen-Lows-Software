import http from "http";
import https from "https";
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
    if (this.originalHttpRequest) return; // already installed

    this.originalHttpRequest = http.request;
    this.originalHttpGet = http.get;
    this.originalHttpsRequest = https.request;
    this.originalHttpsGet = https.get;
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

    // @ts-ignore
    http.request = patchMethod(this.originalHttpRequest, "http:");
    // @ts-ignore
    http.get = patchMethod(this.originalHttpGet, "http:");
    // @ts-ignore
    https.request = patchMethod(this.originalHttpsRequest, "https:");
    // @ts-ignore
    https.get = patchMethod(this.originalHttpsGet, "https:");

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
    if (!this.originalHttpRequest) return;

    http.request = this.originalHttpRequest;
    http.get = this.originalHttpGet;
    https.request = this.originalHttpsRequest;
    https.get = this.originalHttpsGet;
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
