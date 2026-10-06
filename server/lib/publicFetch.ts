import { Agent } from "undici";
import { lookup } from "node:dns";
import { assertPublicHostname, isPrivateIP } from "./safeAiUrl.ts";

// Resolve at connection time, preserving the hostname for TLS and Host headers.
// A separate preflight DNS lookup cannot protect against DNS rebinding.
export const publicLookup: typeof lookup = ((hostname: string, options: any, callback: any) => {
  lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(({ address }) => isPrivateIP(address))) {
      return callback(new Error("Public origin required"));
    }
    const candidates = options?.family ? addresses.filter(a => a.family === options.family) : addresses;
    if (!candidates.length) return callback(new Error("No compatible public address"));
    if (options?.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  });
}) as typeof lookup;

/** Bounded public HTTP(S) GET, with validation at every redirect and connection. */
export async function fetchPublicUrl(input: string, init: RequestInit = {}, maxBytes = 8 * 1024 * 1024): Promise<Response> {
  let url = new URL(input);
  const dispatcher = new Agent({ connect: { lookup: publicLookup } });
  const signal = AbortSignal.any([AbortSignal.timeout(15000), ...(init.signal ? [init.signal] : [])]);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error("Invalid public URL");
      }
      assertPublicHostname(url.hostname);
      const response = await fetch(url.href, {
        ...init, method: "GET", body: undefined, credentials: "omit", redirect: "manual", signal, dispatcher,
      } as RequestInit);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get("location");
        if (!location || redirects === 5) throw new Error("Invalid or excessive redirects");
        url = new URL(location, url);
        continue;
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > maxBytes) throw new Error("Remote response too large");
            chunks.push(value);
          }
        }
      } finally {
        await reader?.cancel();
      }
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      const body = [204, 205, 304].includes(response.status) ? null : Buffer.concat(chunks);
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    }
    throw new Error("Too many redirects");
  } finally {
    await dispatcher.destroy();
  }
}
