import { getLocalSession } from "./localSession";

export interface StorageFileItem {
  id: string | null;
  name: string;
  metadata: {
    size: number;
    mimetype: string;
  };
  created_at: string;
  updated_at: string;
}

export interface UploadOptions {
  upsert?: boolean;
  contentType?: string;
  [key: string]: any;
}

function getAuthToken(): string | undefined {
  try {
    return getLocalSession()?.access_token;
  } catch {
    return undefined;
  }
}

const getFetch = () =>
  typeof fetch !== "undefined" ? fetch : (globalThis as any).fetch;
const getFormData = () =>
  typeof FormData !== "undefined" ? FormData : (globalThis as any).FormData;

async function parseResponse<T = any>(
  res: any,
): Promise<{ data: T | null; error: Error | null }> {
  let json: any = null;
  const isOk =
    res.ok !== undefined
      ? res.ok
      : typeof res.status === "number"
        ? res.status >= 200 && res.status < 300
        : true;

  try {
    if (typeof res.json === "function") {
      json = await res.json();
    }
  } catch {
    json = null;
  }

  if (!isOk || (json && json.error)) {
    let errorMsg = json?.error;
    if (!errorMsg) {
      try {
        if (typeof res.text === "function") {
          const text = await res.text();
          if (
            text.includes("<html") ||
            text.includes("<!DOCTYPE") ||
            text.includes("<HTML")
          ) {
            errorMsg = `Server error (${res.status || 500}): Please try again later.`;
          } else if (text.trim()) {
            errorMsg = text.trim().slice(0, 200);
          }
        }
      } catch {
        // ignore
      }
    }
    if (!errorMsg) {
      errorMsg = `Request failed with status ${res.status || "unknown"}`;
    }
    return { data: null, error: new Error(errorMsg) };
  }

  return { data: json?.data !== undefined ? json.data : json, error: null };
}

export class CustomStorageClient {
  async upload(
    bucket: string,
    path: string,
    file: Blob | File | ArrayBuffer | Uint8Array | string,
    options?: UploadOptions,
  ): Promise<{ data: { path: string } | null; error: Error | null }> {
    try {
      const token = await getAuthToken();
      const FormDataConstructor = getFormData();
      const formData = new FormDataConstructor();

      let uploadBlob: Blob;
      if (typeof Blob !== "undefined" && file instanceof Blob) {
        uploadBlob = file;
      } else if (file instanceof ArrayBuffer || file instanceof Uint8Array) {
        uploadBlob = new Blob([file as any]);
      } else if (typeof file === "string") {
        uploadBlob = new Blob([file], { type: "text/plain" });
      } else {
        uploadBlob = file as any;
      }

      formData.append("file", uploadBlob);
      if (options) {
        formData.append("options", JSON.stringify(options));
      }

      const fetchFn = getFetch();
      const cleanPath = path.replace(/^\/+/, "");
      const res = await fetchFn(`/api/storage/upload/${bucket}/${cleanPath}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      const parsed = await parseResponse<{ path: string }>(res);
      if (parsed.error) {
        return { data: null, error: parsed.error };
      }
      return { data: parsed.data || { path: cleanPath }, error: null };
    } catch (e: any) {
      return {
        data: null,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }

  async list(
    bucket: string,
    path: string = "",
    _options?: { sortBy?: { column: string; order: string } },
  ): Promise<{ data: StorageFileItem[] | null; error: Error | null }> {
    try {
      const token = await getAuthToken();
      const fetchFn = getFetch();
      const res = await fetchFn(`/api/storage/list/${bucket}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ path: path.replace(/^\/+/, "") }),
      });

      const parsed = await parseResponse<StorageFileItem[]>(res);
      if (parsed.error) {
        return { data: null, error: parsed.error };
      }
      return { data: parsed.data || [], error: null };
    } catch (e: any) {
      return {
        data: null,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }

  async remove(
    bucket: string,
    paths: string[],
  ): Promise<{ data: string[] | null; error: Error | null }> {
    try {
      const token = await getAuthToken();
      const fetchFn = getFetch();
      const cleanPaths = paths.map((p) => p.replace(/^\/+/, ""));
      const res = await fetchFn(`/api/storage/remove/${bucket}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ paths: cleanPaths }),
      });

      const parsed = await parseResponse<string[]>(res);
      if (parsed.error) {
        return { data: null, error: parsed.error };
      }
      return { data: parsed.data || cleanPaths, error: null };
    } catch (e: any) {
      return {
        data: null,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }

  async download(
    bucket: string,
    path: string,
  ): Promise<{ data: Blob | null; error: Error | null }> {
    try {
      const token = await getAuthToken();
      const fetchFn = getFetch();
      const cleanPath = path.replace(/^\/+/, "");
      const res = await fetchFn(
        `/api/storage/download/${bucket}/${cleanPath}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );

      if (!res.ok) {
        let errorMsg = "";
        try {
          const text = await res.text();
          if (
            text.includes("<html") ||
            text.includes("<!DOCTYPE") ||
            text.includes("<HTML")
          ) {
            errorMsg = `Download failed with status ${res.status}`;
          } else if (text.trim()) {
            errorMsg = text.trim();
          }
        } catch {
          // ignore
        }
        return {
          data: null,
          error: new Error(
            errorMsg || `Download failed with status ${res.status}`,
          ),
        };
      }
      const blob = await res.blob();
      return { data: blob, error: null };
    } catch (e: any) {
      return {
        data: null,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }

  async createSignedUrls(
    bucket: string,
    paths: string[],
    expiresIn: number = 3600,
  ): Promise<{
    data: Array<{
      signedUrl: string;
      error: string | null;
      path?: string;
    }> | null;
    error: Error | null;
  }> {
    try {
      const token = await getAuthToken();
      const fetchFn = getFetch();
      const cleanPaths = paths.map((p) => p.replace(/^\/+/, ""));
      const res = await fetchFn(`/api/storage/signed-urls/${bucket}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ paths: cleanPaths, expiresIn }),
      });

      const parsed = await parseResponse<
        Array<{
          signedUrl: string;
          error: string | null;
          path?: string;
        }>
      >(res);
      if (parsed.error) {
        return { data: null, error: parsed.error };
      }
      return { data: parsed.data || [], error: null };
    } catch (e: any) {
      return {
        data: null,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }

  async createSignedUrl(
    bucket: string,
    path: string,
    expiresIn: number = 3600,
  ): Promise<{ data: { signedUrl: string } | null; error: Error | null }> {
    try {
      const res = await this.createSignedUrls(bucket, [path], expiresIn);
      if (res.error) return { data: null, error: res.error };
      if (res.data && res.data.length > 0 && res.data[0].signedUrl) {
        return { data: { signedUrl: res.data[0].signedUrl }, error: null };
      }
      return { data: null, error: new Error("Failed to create signed URL") };
    } catch (e: any) {
      return {
        data: null,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
  }

  getPublicUrl(bucket: string, path: string): { data: { publicUrl: string } } {
    const cleanPath = path.replace(/^\/+/, "");
    return {
      data: { publicUrl: `/api/storage/public/${bucket}/${cleanPath}` },
    };
  }

  from(bucket: string) {
    return {
      upload: (
        path: string,
        file: Blob | File | ArrayBuffer | Uint8Array | string,
        options?: UploadOptions,
      ) => this.upload(bucket, path, file, options),
      list: (
        path: string = "",
        options?: { sortBy?: { column: string; order: string } },
      ) => this.list(bucket, path, options),
      remove: (paths: string[]) => this.remove(bucket, paths),
      download: (path: string) => this.download(bucket, path),
      createSignedUrl: (path: string, expiresIn?: number) =>
        this.createSignedUrl(bucket, path, expiresIn),
      createSignedUrls: (paths: string[], expiresIn?: number) =>
        this.createSignedUrls(bucket, paths, expiresIn),
      getPublicUrl: (path: string) => this.getPublicUrl(bucket, path),
    };
  }
}

export const storage = new CustomStorageClient();
export const customStorage = storage;
