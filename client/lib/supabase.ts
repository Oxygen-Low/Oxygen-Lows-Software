import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

const options: any = {};

// Fix for Node.js < 22 environments (like CI) where native WebSocket is missing
if (typeof window === "undefined") {
  try {
    const ws = await import("ws");
    options.realtime = {
      transport: ws.default || ws,
    };
  } catch (e) {
    // ws might not be available in all environments, but should be in ours now
  }
}

export const supabase = createClient(supabaseUrl, supabaseKey, options);
