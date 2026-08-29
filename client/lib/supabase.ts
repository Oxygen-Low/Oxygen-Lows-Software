import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://vqmukrmpgvavscsyefqd.supabase.co";
const supabaseKey = "sb_publishable_t2Nj_QmKvYBkmhQZvGkPAQ_a6YFGq4Q";

export const rawSupabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    flowType: "pkce",
  },
});

const getFetch = () =>
  typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;

import {
  LocalSession,
  getLocalSession,
  setLocalSession as storeLocalSession,
} from "./localSession";

export type { LocalSession };
export { getLocalSession };

const authListeners = new Set<(event: string, session: any) => void>();

export function setLocalSession(session: LocalSession | null) {
  storeLocalSession(session);
  if (session) {
    notifyAuthListeners("SIGNED_IN", session);
  } else {
    notifyAuthListeners("SIGNED_OUT", null);
  }
}

export function notifyAuthListeners(event: string, session: any) {
  for (const listener of authListeners) {
    try {
      listener(event, session);
    } catch {}
  }
}

class LocalQueryBuilder implements PromiseLike<any> {
  private table: string;
  private token?: string;
  private action: "query" | "insert" | "update" | "upsert" | "delete" = "query";
  private payload: any = undefined;
  private filters: Array<{ field: string; operator: string; value: any }> = [];
  private orderConfig?: { column: string; ascending?: boolean };
  private limitCount?: number;
  private offsetCount?: number;
  private isSingle: boolean = false;
  private selectCols?: string;
  private onConflictField?: string;

  constructor(table: string, token?: string) {
    this.table = table;
    this.token = token;
  }

  select(columns: string = "*") {
    this.selectCols = columns;
    return this;
  }

  insert(values: any) {
    this.action = "insert";
    this.payload = values;
    return this;
  }

  update(values: any) {
    this.action = "update";
    this.payload = values;
    return this;
  }

  upsert(values: any, options?: { onConflict?: string }) {
    this.action = "upsert";
    this.payload = values;
    this.onConflictField = options?.onConflict;
    return this;
  }

  delete() {
    this.action = "delete";
    return this;
  }

  eq(field: string, value: any) {
    this.filters.push({ field, operator: "eq", value });
    return this;
  }

  neq(field: string, value: any) {
    this.filters.push({ field, operator: "neq", value });
    return this;
  }

  gt(field: string, value: any) {
    this.filters.push({ field, operator: "gt", value });
    return this;
  }

  gte(field: string, value: any) {
    this.filters.push({ field, operator: "gte", value });
    return this;
  }

  lt(field: string, value: any) {
    this.filters.push({ field, operator: "lt", value });
    return this;
  }

  lte(field: string, value: any) {
    this.filters.push({ field, operator: "lte", value });
    return this;
  }

  like(field: string, value: any) {
    this.filters.push({ field, operator: "like", value });
    return this;
  }

  ilike(field: string, value: any) {
    this.filters.push({ field, operator: "ilike", value });
    return this;
  }

  is(field: string, value: any) {
    this.filters.push({ field, operator: "is", value });
    return this;
  }

  in(field: string, values: any[]) {
    this.filters.push({ field, operator: "in", value: values });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderConfig = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this;
  }

  async execute(): Promise<{ data: any; error: any; count?: number | null }> {
    try {
      const fetchFn = getFetch();
      const session = getLocalSession();
      const activeToken = this.token || session?.access_token;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      };

      let endpoint = "/api/data/query";
      let body: any = {};

      if (this.action === "query") {
        endpoint = "/api/data/query";
        body = {
          table: this.table,
          filters: this.filters,
          order: this.orderConfig,
          limit: this.limitCount,
          offset: this.offsetCount,
          single: this.isSingle,
          select: this.selectCols,
        };
      } else if (this.action === "insert") {
        endpoint = "/api/data/insert";
        body = {
          table: this.table,
          data: this.payload,
        };
      } else if (this.action === "update") {
        endpoint = "/api/data/update";
        body = {
          table: this.table,
          filters: this.filters,
          data: this.payload,
        };
      } else if (this.action === "upsert") {
        endpoint = "/api/data/upsert";
        body = {
          table: this.table,
          data: this.payload,
          onConflict: this.onConflictField,
        };
      } else if (this.action === "delete") {
        endpoint = "/api/data/delete";
        body = {
          table: this.table,
          filters: this.filters,
        };
      }

      const res = await fetchFn(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        return {
          data: null,
          error: new Error(json.error || `HTTP error ${res.status}`),
        };
      }

      return { data: json.data, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const customClient = {
  from(table: string) {
    return new LocalQueryBuilder(table);
  },

  async rpc(name: string, args: any = {}) {
    try {
      const fetchFn = getFetch();
      const session = getLocalSession();
      const activeToken = session?.access_token;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      };

      const res = await fetchFn("/api/data/rpc", {
        method: "POST",
        headers,
        body: JSON.stringify({ fn: name, args }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        return {
          data: null,
          error: new Error(json.error || `RPC ${name} failed`),
        };
      }

      return { data: json.data, error: null };
    } catch (err: any) {
      return {
        data: null,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  },

  auth: {
    async getSession() {
      const local = getLocalSession();
      if (local) {
        return { data: { session: local }, error: null };
      }
      return rawSupabase.auth.getSession();
    },

    async getUser() {
      const local = getLocalSession();
      if (local) {
        return { data: { user: local.user }, error: null };
      }
      return rawSupabase.auth.getUser();
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
      authListeners.add(callback);
      const rawSub = rawSupabase.auth.onAuthStateChange((event, session) => {
        const local = getLocalSession();
        if (!local) {
          callback(event, session);
        }
      });

      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners.delete(callback);
              rawSub.data.subscription?.unsubscribe();
            },
          },
        },
      };
    },

    async signInWithOAuth(options: any) {
      return rawSupabase.auth.signInWithOAuth(options);
    },

    async linkIdentity(options: any) {
      return rawSupabase.auth.linkIdentity(options);
    },

    async signOut() {
      setLocalSession(null);
      return rawSupabase.auth.signOut();
    },

    oauth: (rawSupabase.auth as any).oauth || {
      getAuthorizationDetails: async (id: string) =>
        (rawSupabase.auth as any).oauth?.getAuthorizationDetails(id),
      approveAuthorization: async (id: string) =>
        (rawSupabase.auth as any).oauth?.approveAuthorization(id),
      denyAuthorization: async (id: string) =>
        (rawSupabase.auth as any).oauth?.denyAuthorization(id),
    },
  },

  channel(name: string) {
    return rawSupabase.channel(name);
  },

  removeChannel(channel: any) {
    return rawSupabase.removeChannel(channel);
  },
};

export const supabase = customClient;

export function getAuthenticatedClient(token?: string) {
  if (token) {
    return {
      from(table: string) {
        return new LocalQueryBuilder(table, token);
      },
      rpc(name: string, args: any = {}) {
        return customClient.rpc(name, args);
      },
    };
  }
  return customClient;
}
