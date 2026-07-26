import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    // The desktop app hands the browser's OAuth code back to its WebView.
    // PKCE keeps the verifier in that WebView and makes that handoff secure.
    flowType: "pkce",
  },
});

export function getAuthenticatedClient(token?: string) {
  if (token && token !== supabaseKey) {
    return createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }
  return supabase;
}
