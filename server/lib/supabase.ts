import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import fs from "fs";
import path from "path";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseAnonKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
  realtime: {
    transport: ws as any,
  },
});

const clientCache = new Map<string, any>();

class LocalServerStorage {
  from(bucket: string) {
    const STORAGE_DIR = path.join(process.cwd(), "uploads");
    return {
      remove: async (paths: string[]) => {
        for (const p of paths) {
          const fp = path.join(STORAGE_DIR, bucket, p);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
        return { data: paths, error: null };
      },
      upload: async (p: string, data: any, options?: any) => {
        const fp = path.join(STORAGE_DIR, bucket, p);
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        if (data instanceof Blob) {
           fs.writeFileSync(fp, Buffer.from(await data.arrayBuffer()));
        } else {
           fs.writeFileSync(fp, Buffer.from(data));
        }
        return { data: { path: p }, error: null };
      },
      download: async (p: string) => {
        const fp = path.join(STORAGE_DIR, bucket, p);
        if (fs.existsSync(fp)) {
          const buf = fs.readFileSync(fp);
          const blob = new Blob([buf]);
          return { data: blob, error: null };
        }
        return { data: null, error: new Error("Not found") };
      }
    };
  }
}

const patchStorage = (client: any) => {
  client.storage = new LocalServerStorage();
  return client;
};

patchStorage(supabase);

export function getAuthenticatedClient(token?: string) {
  if (token && token !== supabaseAnonKey) {
    if (clientCache.has(token)) {
      return clientCache.get(token);
    }
    const client = patchStorage(createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    }));
    clientCache.set(token, client);
    return client;
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

/**
 * Returns an admin client using the service role key, bypassing RLS.
 */
export function getAdminClient(serviceRoleKeyParam?: string) {
  const procEnv = typeof process !== "undefined" ? process.env : ({} as any);
  const serviceRoleKey = serviceRoleKeyParam || procEnv.SUPABASE_SECRET;
  
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SECRET is not set");
  }
  return patchStorage(createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  }));
}
