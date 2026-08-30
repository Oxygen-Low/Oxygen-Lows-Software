import {
  LocalSession,
  getLocalSession,
  setLocalSession as storeLocalSession,
} from "./localSession";

export type { LocalSession };
export { getLocalSession };

const getFetch = () =>
  typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;

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

export class LocalQueryBuilder implements PromiseLike<any> {
  private table: string;
  private token?: string;
  private action: "query" | "insert" | "update" | "upsert" | "delete" = "query";
  private payload: any = undefined;
  private filters: Array<{ field: string; operator: string; value: any }> = [];
  private orFilters: string[] = [];
  private orderConfig?: { column: string; ascending?: boolean };
  private limitCount?: number;
  private offsetCount?: number;
  private isSingle: boolean = false;
  private selectCols?: string;
  private selectOptions?: {
    count?: "exact" | "planned" | "estimated";
    head?: boolean;
  };
  private onConflictField?: string;

  constructor(table: string, token?: string) {
    this.table = table;
    this.token = token;
  }

  select(
    columns: string = "*",
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ) {
    this.selectCols = columns;
    this.selectOptions = options;
    return this;
  }

  match(criteria: Record<string, any>) {
    for (const [key, value] of Object.entries(criteria)) {
      this.filters.push({ field: key, operator: "eq", value });
    }
    return this;
  }

  or(filterString: string) {
    this.orFilters.push(filterString);
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

  async execute(): Promise<{ data: any; error: any; count: number | null }> {
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
          orFilters: this.orFilters,
          order: this.orderConfig,
          limit: this.limitCount,
          offset: this.offsetCount,
          single: this.isSingle,
          select: this.selectCols,
          count: this.selectOptions?.count,
          head: this.selectOptions?.head,
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
          orFilters: this.orFilters,
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
          orFilters: this.orFilters,
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
          count: null,
        };
      }

      return {
        data: json.data,
        error: null,
        count:
          json.count !== undefined
            ? json.count
            : Array.isArray(json.data)
              ? json.data.length
              : null,
      };
    } catch (err: any) {
      return {
        data: null,
        error: err instanceof Error ? err : new Error(String(err)),
        count: null,
      };
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((value: {
          data: any;
          error: any;
          count: number | null;
        }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export class LocalChannel {
  private name: string;

  constructor(name: string) {
    this.name = name;
  }

  on(_event: string, _config: any, _callback?: (payload: any) => void) {
    return this;
  }

  subscribe(callback?: (status: string) => void) {
    if (callback) {
      try {
        callback("SUBSCRIBED");
      } catch {}
    }
    return this;
  }

  async unsubscribe() {
    return "ok";
  }
}

async function executeRpc(name: string, args: any = {}, token?: string) {
  try {
    const fetchFn = getFetch();
    const session = getLocalSession();
    const activeToken = token || session?.access_token;
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
}

export const db = {
  from(table: string) {
    return new LocalQueryBuilder(table);
  },

  async rpc(name: string, args: any = {}) {
    return executeRpc(name, args);
  },

  auth: {
    async getSession() {
      const local = getLocalSession();
      return { data: { session: local }, error: null };
    },

    async getUser() {
      const local = getLocalSession();
      return { data: { user: local?.user || null }, error: null };
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
      authListeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              authListeners.delete(callback);
            },
          },
        },
      };
    },

    async signOut() {
      setLocalSession(null);
      return { error: null };
    },
  },

  channel(name: string) {
    return new LocalChannel(name);
  },

  removeChannel(_channel: any) {
    return Promise.resolve("ok");
  },
};

export const customClient = db;
export const supabase = db;
export const rawSupabase = db;
export default db;

export function getAuthenticatedClient(token?: string) {
  if (token) {
    return {
      from(table: string) {
        return new LocalQueryBuilder(table, token);
      },
      rpc(name: string, args: any = {}) {
        return executeRpc(name, args, token);
      },
      auth: db.auth,
      channel(name: string) {
        return db.channel(name);
      },
      removeChannel(channel: any) {
        return db.removeChannel(channel);
      },
    };
  }
  return db;
}
