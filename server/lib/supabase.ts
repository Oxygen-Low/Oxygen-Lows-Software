import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false
  },
  realtime: {
    transport: ws as any
  }
});

export function getSupabaseAdmin() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server");
    }
    return createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            persistSession: false
        }
    });
}

/**
 * Fetches the username and email for a given user ID from the public.profiles table.
 * Note: This uses the admin client to bypass RLS as it is used for git identity derivation.
 */
export async function getAuthorProfile(userId: string) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile, error } = await supabaseAdmin
        .from('profiles')
        .select('username, email')
        .eq('user_id', userId)
        .single();

    if (error) {
        console.error('Error fetching author profile:', error);
        return null;
    }

    return profile;
}
