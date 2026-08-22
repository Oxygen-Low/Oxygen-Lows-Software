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

const clientCache = new Map<string, any>();

class LocalClientStorage {
  private async getToken() {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token;
  }

  from(bucket: string) {
    return {
      upload: async (path: string, file: any, options?: any) => {
        const token = await this.getToken();
        const FormDataConstructor = typeof FormData !== "undefined" ? FormData : (globalThis as any).FormData;
        const formData = new FormDataConstructor();
        formData.append("file", file);
        if (options) formData.append("options", JSON.stringify(options));
        try {
const fetchFn = typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;
          const res = await fetchFn(`/api/storage/upload/${bucket}/${path}`, {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData
          });
          const json = await res.json();
          if (res.status >= 400) return { data: null, error: new Error(json.error) };
          return json;
        } catch (e: any) {
          return { data: null, error: e };
        }
      },
      list: async (path: string) => {
        const token = await this.getToken();
        try {
const fetchFn = typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;
          const res = await fetchFn(`/api/storage/list/${bucket}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ path })
          });
          const json = await res.json();
          if (res.status >= 400) return { data: null, error: new Error(json.error) };
          return json;
        } catch (e: any) {
          return { data: null, error: e };
        }
      },
      remove: async (paths: string[]) => {
        const token = await this.getToken();
        try {
const fetchFn = typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;
          const res = await fetchFn(`/api/storage/remove/${bucket}`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ paths })
          });
          const json = await res.json();
          if (res.status >= 400) return { data: null, error: new Error(json.error) };
          return json;
        } catch (e: any) {
          return { data: null, error: e };
        }
      },
      download: async (path: string) => {
        const token = await this.getToken();
        try {
const fetchFn = typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;
          const res = await fetchFn(`/api/storage/download/${bucket}/${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (!res.ok) {
            return { data: null, error: new Error(await res.text()) };
          }
          const blob = await res.blob();
          return { data: blob, error: null };
        } catch (e: any) {
          return { data: null, error: e };
        }
      },
      createSignedUrls: async (paths: string[], expiresIn: number) => {
        const token = await this.getToken();
        try {
const fetchFn = typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;
          const res = await fetchFn(`/api/storage/signed-urls/${bucket}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ paths, expiresIn })
          });
          const json = await res.json();
          if (res.status >= 400) return { data: null, error: new Error(json.error) };
          return json;
        } catch (e: any) {
          return { data: null, error: e };
        }
      },
      createSignedUrl: async (path: string, expiresIn: number) => {
        const token = await this.getToken();
        try {
          const fetchFn = typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;
          const res = await fetchFn(`/api/storage/signed-urls/${bucket}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({ paths: [path], expiresIn })
          });
          const json = await res.json();
          if (res.status >= 400) return { data: null, error: new Error(json.error) };
          if (json.data && json.data.length > 0) {
            return { data: { signedUrl: json.data[0].signedUrl }, error: null };
          }
          return { data: null, error: new Error("Failed to create signed URL") };
        } catch (e: any) {
          return { data: null, error: e };
        }
      },
      getPublicUrl: (path: string) => {
        return { data: { publicUrl: `/api/storage/public/${bucket}/${path}` } };
      }
    };
  }
}

const patchStorage = (client: any) => {
  client.storage = new LocalClientStorage();
  return client;
};

patchStorage(supabase);

export function getAuthenticatedClient(token?: string) {
  if (token && token !== supabaseKey) {
    if (clientCache.has(token)) {
      return clientCache.get(token)!;
    }
    const client = patchStorage(createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    }));
    clientCache.set(token, client);
    return client;
  }
  return supabase;
}
