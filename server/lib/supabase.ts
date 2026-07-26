import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
  realtime: {
    transport: ws as any,
  },
});

export function getAuthenticatedClient(token?: string) {
  if (token && token !== supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });
  }
  return supabase;
}

/**
 * Historically this returned an admin client using the service role key.
 * Now it returns the standard anon client to remove the service role key requirement.
 * Database operations formerly relying on bypassing RLS should now be covered by
 * appropriate RLS policies or use authenticated clients.
 */
export function getAnonClient() {
  return supabase;
}

/**
 * Fetches the username and email for a given user ID from the public.profiles table.
 * Now uses the anon client as profiles are viewable by everyone.
 */
export async function getAuthorProfile(userId: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("username, email")
    .eq("user_id", userId)
    .single();

  if (error) {
    console.error("Error fetching author profile:", error);
    return null;
  }

  return profile;
}
