import { Hono } from "hono";
import { resolveUserFromToken } from "../lib/auth.ts";

/**
 * Search HuggingFace and ModelScope model hubs for GGUF / safetensors models.
 *
 * SSRF hardening: the upstream URL is constructed entirely from a fixed
 * allowlisted host and a fixed path. User input only ever appears as an
 * encoded query parameter, never as a host, path segment, or scheme.
 */

export const modelSearchRouter = new Hono();

const HF_API = "https://huggingface.co/api/models";
const MS_API_BASE = "https://modelscope.cn/api/v1/models";

const FILE_EXTENSIONS = ["gguf", "safetensors", "bin", "onnx", "pt", "pth", "ckpt"];

async function requireUser(c: any) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) return null;
  return resolveUserFromToken(token);
}

function safeQuery(value: unknown, max = 120): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max).replace(/[^\w.\-/ ]/g, "");
}

async function getJson(url: string, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "OxygenLowsSoftware", ...headers },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 2_000_000) return null;
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

modelSearchRouter.get("/search", async (c) => {
  const user = await requireUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const rawQuery = safeQuery(c.req.query("q"));
  if (!rawQuery) return c.json({ results: [] });

  const type = safeQuery(c.req.query("type"), 30).toLowerCase();
  const source = safeQuery(c.req.query("source"), 20).toLowerCase();
  const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "20", 10) || 20, 1), 50);

  const results: any[] = [];

  try {
    if (source !== "modelscope") {
      // HuggingFace Hub search API. The query is encoded as a URL parameter.
      const params = new URLSearchParams({ search: rawQuery, limit: String(limit), full: "false" });
      if (type && FILE_EXTENSIONS.includes(type)) params.set("filter", type);
      const data = await getJson(`${HF_API}?${params.toString()}`);
      if (Array.isArray(data)) {
        for (const model of data) {
          if (!model?.id || typeof model.id !== "string") continue;
          const files: string[] = Array.isArray(model.siblings)
            ? model.siblings
                .map((s: any) => (typeof s?.rfilename === "string" ? s.rfilename : ""))
                .filter((f: string) => f)
            : [];
          const detected = detectType(files, model.id);
          if (type && FILE_EXTENSIONS.includes(type) && detected !== type) continue;
          results.push({
            source: "huggingface",
            id: model.id,
            name: model.id.split("/").pop() || model.id,
            author: model.id.includes("/") ? model.id.split("/")[0] : "",
            description: typeof model.description === "string" ? model.description.slice(0, 300) : "",
            downloads: typeof model.downloads === "number" ? model.downloads : 0,
            likes: typeof model.likes === "number" ? model.likes : 0,
            fileType: detected,
            files: files.filter((f) => FILE_EXTENSIONS.some((e) => f.toLowerCase().endsWith("." + e))).slice(0, 20),
            url: `https://huggingface.co/${model.id}`,
          });
        }
      }
    }
  } catch {
    // HuggingFace search is best-effort; still return ModelScope results.
  }

  try {
    if (source !== "huggingface") {
      // ModelScope search API. Query is URL-encoded; path is fixed.
      const params = new URLSearchParams({
        pageNumber: "1",
        pageSize: String(limit),
        name: rawQuery,
      });
      const data = await getJson(`${MS_API_BASE}?${params.toString()}`);
      const models = Array.isArray(data?.Data?.Models)
        ? data.Data.Models
        : Array.isArray(data?.models)
          ? data.models
          : [];
      for (const model of models) {
        const id = typeof model?.ModelId === "string"
          ? model.ModelId
          : typeof model?.modelId === "string"
            ? model.modelId
            : typeof model?.id === "string"
              ? model.id
              : "";
        if (!id) continue;
        const detected = detectType([], id, model);
        if (type && FILE_EXTENSIONS.includes(type) && detected !== type) continue;
        results.push({
          source: "modelscope",
          id,
          name: id.split("/").pop() || id,
          author: id.includes("/") ? id.split("/")[0] : "",
          description: typeof model?.Description === "string"
            ? model.Description.slice(0, 300)
            : typeof model?.description === "string" ? model.description.slice(0, 300) : "",
          downloads: Number(model?.Downloads ?? model?.downloadCount ?? 0) || 0,
          likes: Number(model?.Stars ?? model?.likes ?? 0) || 0,
          fileType: detected,
          files: [],
          url: `https://modelscope.cn/models/${id}`,
        });
      }
    }
  } catch {
    // ModelScope search is best-effort.
  }

  // Merge duplicates across sources, keeping the first result.
  const seen = new Set<string>();
  const unique = results.filter((r) => {
    const key = `${r.source}:${r.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return c.json({ results: unique.slice(0, limit * 2) });
});

function detectType(files: string[], id: string, meta?: any): string {
  const joined = (files.join(" ") + " " + id + " " + JSON.stringify(meta || {})).toLowerCase();
  // Prefer the most specific type present.
  for (const ext of ["gguf", "safetensors", "onnx", "bin", "pt", "pth", "ckpt"]) {
    if (joined.includes("." + ext)) return ext;
  }
  return "gguf";
}
