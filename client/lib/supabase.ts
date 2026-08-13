import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // The desktop app hands the browser's OAuth code back to its WebView.
    // PKCE keeps the verifier in that WebView and makes that handoff secure.
    flowType: "pkce",
  },
});

const clientCache = new Map<string, ReturnType<typeof createClient>>();

export function getAuthenticatedClient(token?: string) {
  if (token && token !== supabaseKey) {
    if (clientCache.has(token)) {
      return clientCache.get(token)!;
    }
    const client = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
    clientCache.set(token, client);
    return client;
  }
  return supabase;
}
