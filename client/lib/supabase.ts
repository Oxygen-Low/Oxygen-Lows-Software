import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

export const supabase = createClient(supabaseUrl, supabaseKey);

export function getAuthenticatedClient(token?: string) {
  if (token && token !== supabaseKey) {
    return createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }
  return supabase;
}
