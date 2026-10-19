import { Hono } from "hono";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import * as parquetModule from "@dsnp/parquetjs";
import { resolveUserFromToken } from "../lib/auth.ts";
import { rateLimiter } from "../lib/rateLimiter.ts";
import {
  DATASETS_STORAGE_DIR,
  MAX_USER_QUOTA,
  assertSafeStoragePath,
  getFolderSize,
  getUserDatasetsSize,
  getUserTotalSize,
} from "../lib/storage.ts";
import { getUserApiKey } from "../lib/userApiKeys.ts";
import { safeParseJson } from "../../shared/jsonRepair.ts";
import { scanText } from "../lib/safety/csamGuard.ts";
import {
  executeZeroToleranceLockdown,
  extractClientIp,
} from "../lib/safety/enforcement.ts";
import {
  moderateText,
  handleModerationEnforcement,
} from "../lib/safety/openAiModeration.ts";
import { isInvalidOrMaskedApiKey, extractBearerToken } from "./ai.ts";

const parquet: any = (parquetModule as any).default ?? parquetModule;

export const datasetsRouter = new Hono();

const DATASET_NAME_REGEX = /^[a-zA-Z0-9._\s-]{1,100}$/;
const REPO_NAME_REGEX = DATASET_NAME_REGEX;
const DATASET_ID_REGEX = /^[a-zA-Z0-9._-]{1,100}$/;

const MAX_DATASET_INSTRUCTIONS_LENGTH = 5000;
const BYTES_PER_TOKEN = 4; // 1 token ≈ 4 bytes
const TOKENS_PER_ROW_ESTIMATE = 100;
const MAX_ESTIMATED_ROWS = 500;
const LLM_TOKEN_BUFFER = 512;
const MAX_DATASET_RETRIES = 3;
const MAX_INDIVIDUAL_ROWS = 100000;
const DEFAULT_MAX_DATASET_TOKENS_GB = 1;

const REFINE_ROW_PROMPT_TEMPLATE = `You are a dataset quality refinement assistant. Your task is to improve a single training data row for an LLM fine-tuning dataset.

Review and fix the following training data row:
- Fix any grammar, spelling, or punctuation errors
- Improve clarity and readability
- Ensure consistency between the instruction, input, and output fields
- Fix any factual inaccuracies if obvious
- Maintain the original intent and meaning`;

const REFINE_POST_TRAINING_PROMPT_TEMPLATE = `You are a post-training dataset quality refinement assistant. Your task is to improve a single preference learning data row (prompt, chosen, rejected).

Review and fix the following preference data row:
- Fix any grammar, spelling, or punctuation errors in prompt and chosen
- Improve clarity, helpfulness, and accuracy of the chosen response
- Ensure the rejected response remains clearly inferior to chosen while staying plausible
- Maintain the original intent and meaning`;

export type DatasetType = "standard" | "post-training";

export interface DatasetRow {
  instruction: string;
  input: string;
  output: string;
}

export interface PostTrainingRow {
  prompt: string;
  chosen: string;
  rejected: string;
}

export interface DatasetEntry {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  username: string;
  userId?: string;
  rowCount: number;
  totalTokens: number;
  createdAt: string;
  archivedAt: string | null;
  size?: number;
  datasetType?: DatasetType;
}

if (!fs.existsSync(DATASETS_STORAGE_DIR)) {
  fs.mkdirSync(DATASETS_STORAGE_DIR, { recursive: true });
}

function sanitizeUserKey(userIdOrName: string): string {
  const safe = String(userIdOrName || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safe || safe === "." || safe === "..") {
    throw new Error("Invalid user identifier");
  }
  return safe;
}

export function getUserDatasetsDir(userId: string): string {
  const safe = sanitizeUserKey(userId);
  const dir = assertSafeStoragePath(DATASETS_STORAGE_DIR, safe);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getUserDatasetsMetaFile(userId: string): string {
  const safe = sanitizeUserKey(userId);
  return assertSafeStoragePath(DATASETS_STORAGE_DIR, `${safe}.json`);
}

export function readUserDatasets(userId: string): DatasetEntry[] {
  const file = getUserDatasetsMetaFile(userId);
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeUserDatasets(
  userId: string,
  datasets: DatasetEntry[],
): void {
  if (!fs.existsSync(DATASETS_STORAGE_DIR)) {
    fs.mkdirSync(DATASETS_STORAGE_DIR, { recursive: true });
  }
  const file = getUserDatasetsMetaFile(userId);
  fs.writeFileSync(file, JSON.stringify(datasets, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function getUserDatasetDir(userId: string, datasetId: string): string {
  if (!DATASET_ID_REGEX.test(datasetId)) {
    throw new Error("Invalid dataset ID");
  }
  const userDir = getUserDatasetsDir(userId);
  return assertSafeStoragePath(userDir, datasetId);
}

export function getUserDatasetArchivePath(
  userId: string,
  datasetId: string,
): string {
  if (!DATASET_ID_REGEX.test(datasetId)) {
    throw new Error("Invalid dataset ID");
  }
  const userDir = getUserDatasetsDir(userId);
  return assertSafeStoragePath(userDir, `${datasetId}.tar.gz`);
}

export function getDatasetBytesOnDisk(
  userId: string,
  datasetId: string,
): number {
  try {
    const activeDir = getUserDatasetDir(userId, datasetId);
    if (fs.existsSync(activeDir)) {
      return getFolderSize(activeDir);
    }
    const archivePath = getUserDatasetArchivePath(userId, datasetId);
    if (fs.existsSync(archivePath)) {
      return fs.statSync(archivePath).size;
    }
    return 0;
  } catch {
    return 0;
  }
}

export function deleteAllUserDatasets(userId: string): void {
  try {
    const safe = sanitizeUserKey(userId);
    const userDir = assertSafeStoragePath(DATASETS_STORAGE_DIR, safe);
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }
    const metaFile = getUserDatasetsMetaFile(userId);
    if (fs.existsSync(metaFile)) {
      fs.unlinkSync(metaFile);
    }
  } catch (err: any) {
    console.error("deleteAllUserDatasets error:", err?.message || err);
  }
}

export function estimateTokenCount(text: string): number {
  if (!text || typeof text !== "string") return 0;
  return Math.ceil(Buffer.byteLength(text, "utf-8") / BYTES_PER_TOKEN);
}

export function getMaxDatasetTokens(): number {
  return (
    (DEFAULT_MAX_DATASET_TOKENS_GB * 1024 * 1024 * 1024) / BYTES_PER_TOKEN
  );
}

// ---------------------------------------------------------------------------
// Parquet & JSONL Helpers
// ---------------------------------------------------------------------------

const PARQUET_STANDARD_SCHEMA = new parquet.ParquetSchema({
  instruction: { type: "UTF8" },
  input: { type: "UTF8" },
  output: { type: "UTF8" },
});

const PARQUET_POST_TRAINING_SCHEMA = new parquet.ParquetSchema({
  prompt: { type: "UTF8" },
  chosen: { type: "UTF8" },
  rejected: { type: "UTF8" },
});

export async function writeDatasetParquet(
  filePath: string,
  rows: Array<any>,
  isPostTraining: boolean,
): Promise<void> {
  const schema = isPostTraining
    ? PARQUET_POST_TRAINING_SCHEMA
    : PARQUET_STANDARD_SCHEMA;
  const writer = await parquet.ParquetWriter.openFile(schema, filePath);
  for (const r of rows) {
    if (isPostTraining) {
      await writer.appendRow({
        prompt: String(r.prompt || "").trim(),
        chosen: String(r.chosen || "").trim(),
        rejected: String(r.rejected || "").trim(),
      });
    } else {
      await writer.appendRow({
        instruction: String(r.instruction || "").trim(),
        input: typeof r.input === "string" ? r.input.trim() : "",
        output: String(r.output || "").trim(),
      });
    }
  }
  await writer.close();
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // chmod may be a no-op on Windows
  }
}

export async function readDatasetParquet(
  filePath: string,
  isPostTraining: boolean,
): Promise<Array<DatasetRow | PostTrainingRow>> {
  const reader = await parquet.ParquetReader.openFile(filePath);
  try {
    const cursor = reader.getCursor();
    const rows: Array<DatasetRow | PostTrainingRow> = [];
    let record: any;
    while ((record = await cursor.next())) {
      if (isPostTraining) {
        rows.push({
          prompt: typeof record.prompt === "string" ? record.prompt : "",
          chosen: typeof record.chosen === "string" ? record.chosen : "",
          rejected: typeof record.rejected === "string" ? record.rejected : "",
        });
      } else {
        rows.push({
          instruction:
            typeof record.instruction === "string" ? record.instruction : "",
          input: typeof record.input === "string" ? record.input : "",
          output: typeof record.output === "string" ? record.output : "",
        });
      }
    }
    return rows;
  } finally {
    await reader.close();
  }
}

export function getDatasetFilePath(datasetDir: string): {
  filePath: string;
  format: "parquet" | "jsonl";
} {
  const parquetPath = path.join(datasetDir, "dataset.parquet");
  if (fs.existsSync(parquetPath)) {
    return { filePath: parquetPath, format: "parquet" };
  }
  const jsonlPath = path.join(datasetDir, "dataset.jsonl");
  if (fs.existsSync(jsonlPath)) {
    return { filePath: jsonlPath, format: "jsonl" };
  }
  return { filePath: parquetPath, format: "parquet" };
}

export async function readDatasetRows(
  datasetDir: string,
  isPostTraining: boolean,
): Promise<Array<DatasetRow | PostTrainingRow>> {
  const { filePath, format } = getDatasetFilePath(datasetDir);
  if (!fs.existsSync(filePath)) {
    throw new Error("Dataset file not found");
  }
  if (format === "parquet") {
    return readDatasetParquet(filePath, isPostTraining);
  }
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const lines = fileContent.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line, idx) => {
    try {
      const parsed = JSON.parse(line);
      if (isPostTraining) {
        return {
          prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
          chosen: typeof parsed.chosen === "string" ? parsed.chosen : "",
          rejected: typeof parsed.rejected === "string" ? parsed.rejected : "",
        };
      }
      return {
        instruction:
          typeof parsed.instruction === "string" ? parsed.instruction : "",
        input: typeof parsed.input === "string" ? parsed.input : "",
        output: typeof parsed.output === "string" ? parsed.output : "",
      };
    } catch {
      if (isPostTraining) {
        return {
          prompt: "",
          chosen: "",
          rejected: `[Parse error on line ${idx + 1}]`,
        };
      }
      return {
        instruction: "",
        input: "",
        output: `[Parse error on line ${idx + 1}]`,
      };
    }
  });
}

// ---------------------------------------------------------------------------
// Cross-platform Archive / Unarchive Helpers
// ---------------------------------------------------------------------------

interface ArchiveBundle {
  version: 1;
  files: Record<string, string>; // filename -> base64 content
}

function createArchiveFromDir(sourceDir: string, archivePath: string): void {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.isFile()) {
      const fullPath = assertSafeStoragePath(sourceDir, entry.name);
      files[entry.name] = fs.readFileSync(fullPath).toString("base64");
    }
  }
  const bundle: ArchiveBundle = { version: 1, files };
  const compressed = zlib.gzipSync(
    Buffer.from(JSON.stringify(bundle), "utf-8"),
  );
  fs.writeFileSync(archivePath, compressed, { mode: 0o600 });
}

function extractArchiveToDir(archivePath: string, targetDir: string): void {
  const compressed = fs.readFileSync(archivePath);
  const decompressed = zlib.gunzipSync(compressed);
  const bundle = JSON.parse(decompressed.toString("utf-8")) as ArchiveBundle;
  if (!bundle || typeof bundle.files !== "object") {
    throw new Error("Invalid archive format");
  }
  fs.mkdirSync(targetDir, { recursive: true });
  for (const [fileName, b64] of Object.entries(bundle.files)) {
    const safeName = path.basename(fileName);
    if (!safeName || safeName === "." || safeName === "..") continue;
    const destPath = assertSafeStoragePath(targetDir, safeName);
    fs.writeFileSync(destPath, Buffer.from(b64, "base64"), { mode: 0o600 });
  }
}

// ---------------------------------------------------------------------------
// LLM Completion & JSON Extraction Helpers
// ---------------------------------------------------------------------------

export function extractObjectsFromLlmResponse(raw: string): any[] {
  const cleaned = String(raw || "")
    .replace(/```json\n?|\n?```/g, "")
    .trim();
  if (!cleaned) {
    throw new Error("Empty response from LLM");
  }

  try {
    const direct = JSON.parse(cleaned);
    return Array.isArray(direct) ? direct : [direct];
  } catch {
    // Try safeParseJson
    try {
      const repaired = safeParseJson<any>(cleaned);
      if (repaired && typeof repaired === "object") {
        return Array.isArray(repaired) ? repaired : [repaired];
      }
    } catch {
      // Fall through to brace-depth object scanner
    }
  }

  const objects: any[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (inString) {
      if (char === "\\" && i + 1 < cleaned.length) {
        i++;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        const candidate = cleaned.slice(start, i + 1);
        try {
          objects.push(JSON.parse(candidate));
        } catch {
          try {
            const rep = safeParseJson<any>(candidate);
            if (rep && typeof rep === "object" && !Array.isArray(rep)) {
              objects.push(rep);
            }
          } catch {
            // skip malformed object
          }
        }
        start = -1;
      }
    }
  }

  if (objects.length === 0) {
    throw new Error("No valid JSON objects found in LLM response");
  }
  return objects;
}

async function completeWithLlm(
  userId: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    provider: string;
    model: string;
    maxTokens: number;
    temperature: number;
    apiKey?: string;
  },
): Promise<string> {
  const provider = (options.provider || "pollinations").toLowerCase();
  const model = options.model || "inclusionai/ling-3.1-flash";

  let effectiveApiKey = isInvalidOrMaskedApiKey(options.apiKey)
    ? ""
    : String(options.apiKey).trim();
  if (!effectiveApiKey && userId) {
    effectiveApiKey = (await getUserApiKey(userId, provider)) || "";
  }
  if (!effectiveApiKey) {
    if (provider === "pollinations") {
      effectiveApiKey = process.env.POLLINATIONS_API_KEY || "";
    } else if (provider === "openai") {
      effectiveApiKey = process.env.OPENAI_API_KEY || "";
    } else if (provider === "anthropic") {
      effectiveApiKey = process.env.ANTHROPIC_API_KEY || "";
    } else if (provider === "google" || provider === "gemini") {
      effectiveApiKey =
        process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    } else if (provider === "openrouter") {
      effectiveApiKey = process.env.OPENROUTER_API_KEY || "";
    } else if (provider === "grok" || provider === "xai") {
      effectiveApiKey =
        process.env.GROK_API_KEY || process.env.XAI_API_KEY || "";
    }
  }

  let targetUrl = "https://gen.pollinations.ai/v1/chat/completions";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  let body: Record<string, any> = {
    model,
    messages,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
    stream: false,
  };

  if (provider === "pollinations") {
    targetUrl = "https://gen.pollinations.ai/v1/chat/completions";
    if (effectiveApiKey) {
      headers["Authorization"] = `Bearer ${effectiveApiKey}`;
    }
  } else if (provider === "openai") {
    if (!effectiveApiKey) {
      throw new Error(
        `No API key configured for provider "${provider}". Add one in Settings.`,
      );
    }
    targetUrl = "https://api.openai.com/v1/chat/completions";
    headers["Authorization"] = `Bearer ${effectiveApiKey}`;
  } else if (provider === "openrouter") {
    if (!effectiveApiKey) {
      throw new Error(
        `No API key configured for provider "${provider}". Add one in Settings.`,
      );
    }
    targetUrl = "https://openrouter.ai/api/v1/chat/completions";
    headers["Authorization"] = `Bearer ${effectiveApiKey}`;
    headers["HTTP-Referer"] = "https://oxygenlow.com";
    headers["X-Title"] = "Oxygen Low's Software";
  } else if (provider === "grok" || provider === "xai") {
    if (!effectiveApiKey) {
      throw new Error(
        `No API key configured for provider "${provider}". Add one in Settings.`,
      );
    }
    targetUrl = "https://api.x.ai/v1/chat/completions";
    headers["Authorization"] = `Bearer ${effectiveApiKey}`;
  } else if (provider === "anthropic") {
    if (!effectiveApiKey) {
      throw new Error(
        `No API key configured for provider "${provider}". Add one in Settings.`,
      );
    }
    targetUrl = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = effectiveApiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model,
      messages: messages.filter((m) => m.role !== "system"),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    };
  } else if (provider === "google" || provider === "gemini") {
    if (!effectiveApiKey) {
      throw new Error(
        `No API key configured for provider "${provider}". Add one in Settings.`,
      );
    }
    targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(effectiveApiKey)}`;
    body = {
      contents: messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      generationConfig: {
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
      },
    };
  } else {
    throw new Error(`Invalid provider "${provider}".`);
  }

  const res = await fetch(targetUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errText = `Upstream LLM error (${res.status})`;
    try {
      const errJson = await res.json();
      if (typeof errJson?.error === "string") errText = errJson.error;
      else if (typeof errJson?.error?.message === "string")
        errText = errJson.error.message;
      else if (typeof errJson?.message === "string") errText = errJson.message;
    } catch {
      // ignore
    }
    throw new Error(errText);
  }

  const data: any = await res.json();
  const content =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    data?.content?.[0]?.text ??
    data?.candidates?.[0]?.content?.parts?.[0]?.text ??
    (typeof data === "string" ? data : "");

  return String(content || "");
}

// ---------------------------------------------------------------------------
// HuggingFace Datasets Server Column Conversion
// ---------------------------------------------------------------------------

export function convertRawItemsToDatasetRows(
  rawItems: Record<string, any>[],
  requestedType?: DatasetType,
): {
  rows: Array<DatasetRow | PostTrainingRow>;
  datasetType: DatasetType;
  detectedType: DatasetType;
} {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    const dt = requestedType || "standard";
    return { rows: [], datasetType: dt, detectedType: dt };
  }

  const columnSet = new Set<string>();
  for (const item of rawItems.slice(0, 10)) {
    if (item && typeof item === "object") {
      for (const k of Object.keys(item)) columnSet.add(k);
    }
  }
  const columns = Array.from(columnSet);

  const hasInstruction = columns.includes("instruction");
  const hasInput = columns.includes("input");
  const hasOutput = columns.includes("output");
  const hasText = columns.includes("text");
  const hasQuestion = columns.includes("question");
  const hasAnswer = columns.includes("answer");
  const hasContext = columns.includes("context");
  const hasPrompt = columns.includes("prompt");
  const hasResponse = columns.includes("response");
  const hasCompletion = columns.includes("completion");
  const hasChosen = columns.includes("chosen");
  const hasRejected = columns.includes("rejected");

  const isPostTraining =
    requestedType === "post-training" ||
    (!requestedType && hasPrompt && hasChosen && hasRejected);

  if (isPostTraining) {
    const rows: PostTrainingRow[] = [];
    for (const item of rawItems) {
      if (!item || typeof item !== "object") continue;
      const prompt = String(
        item.prompt ?? item.instruction ?? item.question ?? columns[0] ? item[columns[0]] ?? "" : "",
      ).trim();
      const chosen = String(
        item.chosen ?? item.output ?? item.response ?? (columns[1] ? item[columns[1]] ?? "" : ""),
      ).trim();
      const rejected = String(
        item.rejected ?? (columns[2] ? item[columns[2]] ?? "" : ""),
      ).trim();
      if (prompt && chosen && rejected) {
        rows.push({ prompt, chosen, rejected });
      }
    }
    return {
      rows,
      datasetType: "post-training",
      detectedType: "post-training",
    };
  }

  const rows: DatasetRow[] = [];
  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const row: DatasetRow = { instruction: "", input: "", output: "" };

    if (hasInstruction && hasOutput) {
      row.instruction = String(item.instruction ?? "");
      row.input = hasInput ? String(item.input ?? "") : "";
      row.output = String(item.output ?? "");
    } else if (hasPrompt && (hasResponse || hasCompletion || hasChosen)) {
      row.instruction = String(item.prompt ?? "");
      const outKey = hasResponse
        ? "response"
        : hasCompletion
          ? "completion"
          : "chosen";
      row.output = String(item[outKey] ?? "");
    } else if (hasQuestion && hasAnswer) {
      row.instruction = String(item.question ?? "");
      row.input = hasContext ? String(item.context ?? "") : "";
      const answer = item.answer ?? "";
      if (answer && typeof answer === "object" && !Array.isArray(answer)) {
        row.output = String(answer.text ?? JSON.stringify(answer));
      } else if (Array.isArray(answer)) {
        row.output = answer.length > 0 ? String(answer[0]) : "";
      } else {
        row.output = String(answer);
      }
    } else if (hasText) {
      row.instruction = String(item.text ?? "");
      row.output = String(item.text ?? "");
    } else {
      const vals = columns.slice(0, 3).map((c) => String(item[c] ?? ""));
      row.instruction = vals[0] || "";
      row.output = vals.length > 1 ? vals[1] : vals[0] || "";
      row.input = vals.length > 2 ? vals[2] : "";
    }

    if (row.instruction.trim() || row.output.trim()) {
      rows.push({
        instruction: row.instruction.trim(),
        input: row.input.trim(),
        output: row.output.trim(),
      });
    }
  }

  return {
    rows,
    datasetType: "standard",
    detectedType: "standard",
  };
}

// ---------------------------------------------------------------------------
// Authentication Middleware
// ---------------------------------------------------------------------------

const datasetsLimiter = rateLimiter(60, 60_000, "datasets");

datasetsRouter.use("*", datasetsLimiter, async (c, next) => {
  const authHeader = c.req.header("Authorization");
  let token = extractBearerToken(authHeader);
  if (!token && c.req.method === "GET" && c.req.path.endsWith("/download")) {
    token = c.req.query("token") || null;
  }
  if (!token) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ success: false, error: "Unauthorized" }, 401);
  }
  c.set("user" as any, user);
  c.set("token" as any, token);
  await next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /api/datasets/generate - Generate dataset rows using an LLM
datasetsRouter.post("/generate", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const body = await c.req.json().catch(() => ({}));
    const {
      instructions,
      prompt: bodyPrompt,
      provider = "pollinations",
      model,
      numTokens,
      targetTokens,
      retryOnFail,
      individualGeneration,
      generationMode,
      numRows,
      targetRowCount,
      datasetType,
      apiKey,
      contextLimit: rawContextLimit,
      contextTokens: rawContextTokens,
      existingRows,
    } = body;
    const isPostTraining = datasetType === "post-training";

    const rawTokensOrLimit = rawContextTokens ?? rawContextLimit;
    const parsedContextTokens =
      typeof rawTokensOrLimit === "number"
        ? rawTokensOrLimit
        : typeof rawTokensOrLimit === "string" &&
            rawTokensOrLimit.trim().length > 0
          ? parseInt(rawTokensOrLimit.trim(), 10)
          : 2000;
    const effectiveContextTokens = Math.max(
      0,
      Math.min(128000, isNaN(parsedContextTokens) ? 2000 : parsedContextTokens),
    );

    const effectiveInstructions =
      typeof instructions === "string" && instructions.trim()
        ? instructions.trim()
        : typeof bodyPrompt === "string" && bodyPrompt.trim()
          ? bodyPrompt.trim()
          : "";

    if (!effectiveInstructions) {
      return c.json(
        { success: false, error: "Instructions are required" },
        400,
      );
    }
    if (effectiveInstructions.length > MAX_DATASET_INSTRUCTIONS_LENGTH) {
      return c.json(
        {
          success: false,
          error: `Instructions must be ${MAX_DATASET_INSTRUCTIONS_LENGTH} characters or less`,
        },
        400,
      );
    }
    if (!provider || typeof provider !== "string") {
      return c.json({ success: false, error: "Provider is required" }, 400);
    }
    if (!model || typeof model !== "string" || !model.trim()) {
      return c.json({ success: false, error: "Model is required" }, 400);
    }

    // Content safety & moderation check on instructions
    const trimmedInstructions = effectiveInstructions;
    const textSafety = await scanText(trimmedInstructions);
    if (!textSafety.safe && textSafety.severity >= 2) {
      const ip = extractClientIp(c);
      const userAgent = c.req.header("user-agent");
      const lockdown = await executeZeroToleranceLockdown({
        ip,
        user,
        userAgent,
        surface: "datasets_generate",
        promptText: trimmedInstructions,
        severity: textSafety.severity,
        reason:
          textSafety.reason ||
          "CSAM / Child safety violation in dataset generation prompt",
      });
      return c.json(lockdown.clientResponse, 400);
    }

    const openAiCheck = await moderateText(trimmedInstructions);
    if (!openAiCheck.allowed) {
      const ip = extractClientIp(c);
      const userAgent = c.req.header("user-agent");
      const enforcement = await handleModerationEnforcement(openAiCheck, {
        ip,
        user,
        userAgent,
        surface: "datasets_generate",
        promptText: trimmedInstructions,
      });
      if (enforcement) {
        return c.json(enforcement.clientResponse, 400);
      }
    }

    const isIndividual =
      individualGeneration === true || generationMode === "individual";
    const rawRows = numRows ?? targetRowCount;

    if (isIndividual) {
      const rowCount =
        typeof rawRows === "number"
          ? rawRows
          : typeof rawRows === "string" && rawRows.trim().length > 0
            ? Number(rawRows.trim())
            : NaN;
      if (
        !Number.isInteger(rowCount) ||
        rowCount < 1 ||
        rowCount > MAX_INDIVIDUAL_ROWS
      ) {
        return c.json(
          {
            success: false,
            error: `Number of rows must be between 1 and ${MAX_INDIVIDUAL_ROWS}`,
          },
          400,
        );
      }
    }

    const rawTokens = numTokens ?? targetTokens;
    const tokenCount =
      typeof rawTokens === "number"
        ? rawTokens
        : typeof rawTokens === "string" && rawTokens.trim().length > 0
          ? Number(rawTokens.trim())
          : NaN;
    if (!isIndividual) {
      const maxTokens = getMaxDatasetTokens();
      if (
        !Number.isInteger(tokenCount) ||
        tokenCount < 1 ||
        tokenCount > maxTokens
      ) {
        return c.json(
          {
            success: false,
            error: `Number of tokens must be between 1 and ${maxTokens} (${DEFAULT_MAX_DATASET_TOKENS_GB} GB)`,
          },
          400,
        );
      }
    }

    // --- Individual generation mode (SSE streaming) ---
    if (isIndividual) {
      const totalRows = typeof numRows === "number" ? numRows : Number(numRows);
      const individualPrompt = isPostTraining
        ? `You are a post-training dataset generator. Based on the following instructions, generate exactly ONE post-training data row for preference learning (teaching an LLM which responses are good vs bad).

Instructions: ${trimmedInstructions}

Output a single JSON object with three fields: "prompt", "chosen", and "rejected".
- "prompt": The user prompt or question
- "chosen": The preferred/good response that the model should learn to produce
- "rejected": The undesired/bad response that the model should learn to avoid

Return ONLY valid JSON, no markdown, no explanation. Example format:
{"prompt": "...", "chosen": "...", "rejected": "..."}`
        : `You are a dataset generator. Based on the following instructions, generate exactly ONE training data row.

Instructions: ${trimmedInstructions}

Output a single JSON object with three fields: "instruction", "input", and "output".
- "instruction": The task description or prompt for the model
- "input": Additional context or input for the task (can be empty string if not needed)
- "output": The expected model response

Return ONLY valid JSON, no markdown, no explanation. Example format:
{"instruction": "...", "input": "...", "output": "..."}`;

      const perRowMaxTokens = TOKENS_PER_ROW_ESTIMATE + LLM_TOKEN_BUFFER;
      const maxRetries = retryOnFail ? MAX_DATASET_RETRIES : 0;

      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          const encoder = new TextEncoder();
          const sendSSE = (payload: Record<string, any>) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
            );
          };

          const priorBaseRows: Array<DatasetRow | PostTrainingRow> =
            Array.isArray(existingRows) ? existingRows : [];
          const collectedRows: Array<DatasetRow | PostTrainingRow> = [];

          for (let rowIdx = 0; rowIdx < totalRows; rowIdx++) {
            let rowParsed: DatasetRow | PostTrainingRow | null = null;

            let promptForThisRow = individualPrompt;
            const historyPool = [...priorBaseRows, ...collectedRows];
            if (effectiveContextTokens > 0 && historyPool.length > 0) {
              const selectedEntries: Array<DatasetRow | PostTrainingRow> = [];
              let currentTokens = 0;
              for (let i = historyPool.length - 1; i >= 0; i--) {
                const entry = historyPool[i];
                const entryTokens = isPostTraining
                  ? estimateTokenCount((entry as PostTrainingRow).prompt) +
                    estimateTokenCount((entry as PostTrainingRow).chosen) +
                    estimateTokenCount((entry as PostTrainingRow).rejected)
                  : estimateTokenCount((entry as DatasetRow).instruction) +
                    estimateTokenCount((entry as DatasetRow).input || "") +
                    estimateTokenCount((entry as DatasetRow).output);

                if (
                  currentTokens + entryTokens > effectiveContextTokens &&
                  selectedEntries.length > 0
                ) {
                  break;
                }
                selectedEntries.unshift(entry);
                currentTokens += entryTokens;
              }

              if (selectedEntries.length > 0) {
                const summaryList = selectedEntries
                  .map((r, i) => {
                    if (isPostTraining) {
                      const pt = r as PostTrainingRow;
                      return `[Entry ${i + 1}]\nPrompt: ${pt.prompt}\nChosen: ${pt.chosen}\nRejected: ${pt.rejected}`;
                    }
                    const st = r as DatasetRow;
                    const inp = st.input ? `\nInput: ${st.input}` : "";
                    return `[Entry ${i + 1}]\nInstruction: ${st.instruction}${inp}\nOutput: ${st.output}`;
                  })
                  .join("\n\n");

                promptForThisRow = `${individualPrompt}\n\nCRITICAL ANTI-REPETITION REQUIREMENT:\nDo NOT duplicate, rephrase, or repeat the concepts, prompts, or tasks from the following previously generated entries (~${currentTokens} tokens of context). Generate a fresh, novel, and diverse entry covering a different perspective, problem, or topic:\n\n${summaryList}`;
              }
            }

            for (let attempt = 0; attempt <= maxRetries; attempt++) {
              let responseText = "";
              try {
                responseText = await completeWithLlm(
                  userKey,
                  [{ role: "user", content: promptForThisRow }],
                  {
                    provider,
                    model: model.trim(),
                    maxTokens: perRowMaxTokens,
                    temperature: 0.8,
                    apiKey,
                  },
                );
              } catch {
                if (attempt === maxRetries) break;
                continue;
              }

              try {
                const objs = extractObjectsFromLlmResponse(responseText);
                const parsed = objs[0];
                if (parsed && typeof parsed === "object") {
                  if (isPostTraining) {
                    const row: PostTrainingRow = {
                      prompt:
                        typeof parsed.prompt === "string"
                          ? parsed.prompt.trim()
                          : "",
                      chosen:
                        typeof parsed.chosen === "string"
                          ? parsed.chosen.trim()
                          : "",
                      rejected:
                        typeof parsed.rejected === "string"
                          ? parsed.rejected.trim()
                          : "",
                    };
                    if (row.prompt && row.chosen && row.rejected) {
                      rowParsed = row;
                      break;
                    }
                  } else {
                    const row: DatasetRow = {
                      instruction:
                        typeof parsed.instruction === "string"
                          ? parsed.instruction.trim()
                          : "",
                      input:
                        typeof parsed.input === "string"
                          ? parsed.input.trim()
                          : "",
                      output:
                        typeof parsed.output === "string"
                          ? parsed.output.trim()
                          : "",
                    };
                    if (row.instruction && row.output) {
                      rowParsed = row;
                      break;
                    }
                  }
                }
              } catch {
                // Retry if possible
              }
            }

            if (rowParsed) {
              collectedRows.push(rowParsed);
            }

            sendSSE({
              type: "progress",
              completed: rowIdx + 1,
              current: rowIdx + 1,
              total: totalRows,
              successCount: collectedRows.length,
              row: rowParsed,
            });
          }

          if (collectedRows.length === 0) {
            sendSSE({
              type: "done",
              success: false,
              error:
                "Failed to generate any valid dataset rows. Please try again.",
            });
            controller.close();
            return;
          }

          const totalTokens = collectedRows.reduce((sum, r) => {
            if (isPostTraining) {
              const pt = r as PostTrainingRow;
              return (
                sum +
                estimateTokenCount(pt.prompt) +
                estimateTokenCount(pt.chosen) +
                estimateTokenCount(pt.rejected)
              );
            }
            const st = r as DatasetRow;
            return (
              sum +
              estimateTokenCount(st.instruction) +
              estimateTokenCount(st.input) +
              estimateTokenCount(st.output)
            );
          }, 0);

          sendSSE({
            type: "done",
            success: true,
            rows: collectedRows,
            totalTokens,
            tokenCount: totalTokens,
          });
          controller.close();
        },
      });

      c.header("Content-Type", "text/event-stream");
      c.header("Cache-Control", "no-cache");
      c.header("Connection", "keep-alive");
      return c.body(stream as any);
    }

    // --- Batch generation mode ---
    const estimatedRows = Math.max(
      1,
      Math.min(
        Math.ceil(tokenCount / TOKENS_PER_ROW_ESTIMATE),
        MAX_ESTIMATED_ROWS,
      ),
    );

    const prompt = isPostTraining
      ? `You are a post-training dataset generator. Based on the following instructions, generate post-training data rows for preference learning (teaching an LLM which responses are good vs bad). Target approximately ${tokenCount} tokens of total output (roughly ${estimatedRows} rows).

Instructions: ${trimmedInstructions}

Output a JSON array of objects, each with three fields: "prompt", "chosen", and "rejected".
- "prompt": The user prompt or question
- "chosen": The preferred/good response that the model should learn to produce
- "rejected": The undesired/bad response that the model should learn to avoid

Return ONLY valid JSON, no markdown, no explanation. Example format:
[
  {"prompt": "...", "chosen": "...", "rejected": "..."},
  {"prompt": "...", "chosen": "...", "rejected": "..."}
]`
      : `You are a dataset generator. Based on the following instructions, generate training data rows. Target approximately ${tokenCount} tokens of total output (roughly ${estimatedRows} rows).

Instructions: ${trimmedInstructions}

Output a JSON array of objects, each with three fields: "instruction", "input", and "output".
- "instruction": The task description or prompt for the model
- "input": Additional context or input for the task (can be empty string if not needed)
- "output": The expected model response

Return ONLY valid JSON, no markdown, no explanation. Example format:
[
  {"instruction": "...", "input": "...", "output": "..."},
  {"instruction": "...", "input": "...", "output": "..."}
]`;

    let batchPromptForExecution = prompt;
    if (
      effectiveContextTokens > 0 &&
      Array.isArray(existingRows) &&
      existingRows.length > 0
    ) {
      const selectedEntries: Array<DatasetRow | PostTrainingRow> = [];
      let currentTokens = 0;
      for (let i = existingRows.length - 1; i >= 0; i--) {
        const entry = existingRows[i];
        const entryTokens = isPostTraining
          ? estimateTokenCount((entry as PostTrainingRow).prompt) +
            estimateTokenCount((entry as PostTrainingRow).chosen) +
            estimateTokenCount((entry as PostTrainingRow).rejected)
          : estimateTokenCount((entry as DatasetRow).instruction) +
            estimateTokenCount((entry as DatasetRow).input || "") +
            estimateTokenCount((entry as DatasetRow).output);

        if (
          currentTokens + entryTokens > effectiveContextTokens &&
          selectedEntries.length > 0
        ) {
          break;
        }
        selectedEntries.unshift(entry);
        currentTokens += entryTokens;
      }

      if (selectedEntries.length > 0) {
        const summaryList = selectedEntries
          .map((r, i) => {
            if (isPostTraining) {
              const pt = r as PostTrainingRow;
              return `[Entry ${i + 1}]\nPrompt: ${pt.prompt}\nChosen: ${pt.chosen}\nRejected: ${pt.rejected}`;
            }
            const st = r as DatasetRow;
            const inp = st.input ? `\nInput: ${st.input}` : "";
            return `[Entry ${i + 1}]\nInstruction: ${st.instruction}${inp}\nOutput: ${st.output}`;
          })
          .join("\n\n");

        batchPromptForExecution = `${prompt}\n\nCRITICAL ANTI-REPETITION REQUIREMENT:\nDo NOT duplicate or repeat the concepts from the following existing entries (~${currentTokens} tokens of context):\n\n${summaryList}`;
      }
    }

    const llmMaxTokens = tokenCount + LLM_TOKEN_BUFFER;
    const maxAttempts = retryOnFail ? MAX_DATASET_RETRIES + 1 : 1;
    let lastError = "";
    let bestResult: {
      rows: Array<DatasetRow | PostTrainingRow>;
      totalTokens: number;
    } | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let responseText = "";
      try {
        responseText = await completeWithLlm(
          userKey,
          [{ role: "user", content: batchPromptForExecution }],
          {
            provider,
            model: model.trim(),
            maxTokens: llmMaxTokens,
            temperature: 0.8,
            apiKey,
          },
        );
      } catch (llmErr: any) {
        lastError = llmErr?.message || "LLM generation failed";
        if (!retryOnFail || attempt === maxAttempts) {
          return c.json({ success: false, error: lastError }, 500);
        }
        continue;
      }

      let rows: any[];
      try {
        rows = extractObjectsFromLlmResponse(responseText);
      } catch {
        if (retryOnFail && attempt < maxAttempts) {
          lastError = "Failed to parse LLM response as valid JSON.";
          continue;
        }
        return c.json(
          {
            success: false,
            error:
              "Failed to parse LLM response as valid JSON. Please try again.",
          },
          500,
        );
      }

      let sanitizedRows: Array<DatasetRow | PostTrainingRow>;
      let hasEmptyRequiredFields = false;
      if (isPostTraining) {
        sanitizedRows = rows.map((r) => ({
          prompt: typeof r?.prompt === "string" ? r.prompt.trim() : "",
          chosen: typeof r?.chosen === "string" ? r.chosen.trim() : "",
          rejected: typeof r?.rejected === "string" ? r.rejected.trim() : "",
        }));
        hasEmptyRequiredFields = (sanitizedRows as PostTrainingRow[]).some(
          (r) => !r.prompt || !r.chosen || !r.rejected,
        );
      } else {
        sanitizedRows = rows.map((r) => ({
          instruction:
            typeof r?.instruction === "string" ? r.instruction.trim() : "",
          input: typeof r?.input === "string" ? r.input.trim() : "",
          output: typeof r?.output === "string" ? r.output.trim() : "",
        }));
        hasEmptyRequiredFields = (sanitizedRows as DatasetRow[]).some(
          (r) => !r.instruction || !r.output,
        );
      }

      if (hasEmptyRequiredFields) {
        if (retryOnFail && attempt < maxAttempts) {
          lastError = "LLM returned rows with empty required fields.";
          continue;
        }
        return c.json(
          {
            success: false,
            error:
              "LLM returned rows with empty required fields. Please try again.",
          },
          502,
        );
      }

      const totalTokens = sanitizedRows.reduce((sum, r) => {
        if (isPostTraining) {
          const pt = r as PostTrainingRow;
          return (
            sum +
            estimateTokenCount(pt.prompt) +
            estimateTokenCount(pt.chosen) +
            estimateTokenCount(pt.rejected)
          );
        }
        const st = r as DatasetRow;
        return (
          sum +
          estimateTokenCount(st.instruction) +
          estimateTokenCount(st.input) +
          estimateTokenCount(st.output)
        );
      }, 0);

      if (
        retryOnFail &&
        totalTokens < tokenCount * 0.5 &&
        attempt < maxAttempts
      ) {
        if (!bestResult || totalTokens > bestResult.totalTokens) {
          bestResult = { rows: sanitizedRows, totalTokens };
        }
        continue;
      }

      return c.json({
        success: true,
        rows: sanitizedRows,
        totalTokens,
        tokenCount: totalTokens,
      });
    }

    if (bestResult) {
      return c.json({
        success: true,
        rows: bestResult.rows,
        totalTokens: bestResult.totalTokens,
        tokenCount: bestResult.totalTokens,
      });
    }

    return c.json(
      {
        success: false,
        error:
          lastError ||
          "Failed to generate dataset after multiple attempts.",
      },
      500,
    );
  } catch (err: any) {
    console.error("Dataset generate error:", err);
    return c.json(
      { success: false, error: "Failed to generate dataset" },
      500,
    );
  }
});

// POST /api/datasets/save - Save generated dataset as a standalone dataset
datasetsRouter.post("/save", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const body = await c.req.json().catch(() => ({}));
    const { name, description, rows, datasetType, model, prompt: bodyPrompt } =
      body;
    const isPostTraining = datasetType === "post-training";

    if (!name || typeof name !== "string" || !REPO_NAME_REGEX.test(name.trim())) {
      return c.json(
        {
          success: false,
          error:
            "Invalid dataset name. Use letters, digits, hyphens, underscores, or dots (1–100 chars).",
        },
        400,
      );
    }
    const cleanName = name.trim();

    if (!Array.isArray(rows) || rows.length === 0) {
      return c.json(
        { success: false, error: "Dataset rows are required" },
        400,
      );
    }

    // Validate row schema
    if (isPostTraining) {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (typeof r !== "object" || r === null || Array.isArray(r)) {
          return c.json(
            { success: false, error: `Row ${i + 1} is not a valid object` },
            400,
          );
        }
        if (typeof r.prompt !== "string" || !r.prompt.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "prompt" field`,
            },
            400,
          );
        }
        if (typeof r.chosen !== "string" || !r.chosen.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "chosen" field`,
            },
            400,
          );
        }
        if (typeof r.rejected !== "string" || !r.rejected.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "rejected" field`,
            },
            400,
          );
        }
      }
    } else {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (typeof r !== "object" || r === null || Array.isArray(r)) {
          return c.json(
            { success: false, error: `Row ${i + 1} is not a valid object` },
            400,
          );
        }
        if (typeof r.instruction !== "string" || !r.instruction.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "instruction" field`,
            },
            400,
          );
        }
        if (typeof r.output !== "string" || !r.output.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "output" field`,
            },
            400,
          );
        }
      }
    }

    const totalTokens = rows.reduce((sum: number, r: any) => {
      if (isPostTraining) {
        return (
          sum +
          estimateTokenCount(r.prompt) +
          estimateTokenCount(r.chosen) +
          estimateTokenCount(r.rejected)
        );
      }
      return (
        sum +
        estimateTokenCount(r.instruction) +
        estimateTokenCount(typeof r.input === "string" ? r.input : "") +
        estimateTokenCount(r.output)
      );
    }, 0);

    const maxTokens = getMaxDatasetTokens();
    if (totalTokens > maxTokens) {
      return c.json(
        {
          success: false,
          error: `Dataset exceeds the maximum token limit of ${maxTokens} tokens (${DEFAULT_MAX_DATASET_TOKENS_GB} GB)`,
        },
        400,
      );
    }

    const datasets = readUserDatasets(userKey);
    if (datasets.some((d) => d.name === cleanName && d.status !== "archived")) {
      return c.json(
        { success: false, error: "A dataset with this name already exists" },
        409,
      );
    }

    // Check 500 MB user storage quota before writing
    const estimatedBytes = totalTokens * BYTES_PER_TOKEN + 4096;
    const currentTotalBytes = getUserTotalSize(userKey);
    if (currentTotalBytes + estimatedBytes > MAX_USER_QUOTA) {
      return c.json(
        {
          success: false,
          error: "Quota exceeded. Maximum 500MB allowed per user.",
        },
        400,
      );
    }

    const datasetId = crypto.randomUUID();
    const datasetDir = getUserDatasetDir(userKey, datasetId);
    fs.mkdirSync(datasetDir, { recursive: true });

    try {
      await writeDatasetParquet(
        path.join(datasetDir, "dataset.parquet"),
        rows,
        isPostTraining,
      );
      const defaultDesc = isPostTraining
        ? "Post-training preference dataset"
        : "AI-generated dataset";
      const typeLabel = isPostTraining ? "post-training" : "training";
      const readmeContent = `# ${cleanName}\n\n${description || defaultDesc}\n\nDataset containing ${rows.length} ${typeLabel} data rows (~${totalTokens} tokens).\n`;
      fs.writeFileSync(path.join(datasetDir, "README.md"), readmeContent, {
        mode: 0o600,
      });

      if (getUserTotalSize(userKey) > MAX_USER_QUOTA) {
        fs.rmSync(datasetDir, { recursive: true, force: true });
        return c.json(
          {
            success: false,
            error: "Quota exceeded. Maximum 500MB allowed per user.",
          },
          400,
        );
      }
    } catch (writeErr) {
      if (fs.existsSync(datasetDir)) {
        fs.rmSync(datasetDir, { recursive: true, force: true });
      }
      throw writeErr;
    }

    const datasetEntry: DatasetEntry = {
      id: datasetId,
      name: cleanName,
      description: typeof description === "string" ? description.trim() : "",
      status: "active",
      username: user.username || user.email || userKey,
      userId: userKey,
      rowCount: rows.length,
      totalTokens,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      datasetType: isPostTraining ? "post-training" : "standard",
    };

    datasets.push(datasetEntry);
    writeUserDatasets(userKey, datasets);

    const bytesOnDisk = getDatasetBytesOnDisk(userKey, datasetId);
    const metadata = {
      ...datasetEntry,
      tokenCount: totalTokens,
      archived: false,
      updatedAt: datasetEntry.createdAt,
      model: typeof model === "string" ? model : undefined,
      prompt: typeof bodyPrompt === "string" ? bodyPrompt : undefined,
      bytesOnDisk,
    };

    return c.json({
      success: true,
      datasetId,
      datasetName: cleanName,
      metadata,
    });
  } catch (err: any) {
    console.error("Dataset save error:", err);
    return c.json({ success: false, error: "Failed to save dataset" }, 500);
  }
});

// POST /api/datasets/import-huggingface - Import a dataset from HuggingFace Hub
datasetsRouter.post("/import-huggingface", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const body = await c.req.json().catch(() => ({}));
    const {
      datasetId,
      hfDataset,
      name,
      split,
      maxRows,
      hfToken,
      description: customDesc,
      subset,
    } = body;
    const rawDatasetId = datasetId || hfDataset;

    if (!rawDatasetId || typeof rawDatasetId !== "string" || !rawDatasetId.trim()) {
      return c.json(
        {
          success: false,
          error: 'datasetId is required (e.g. "tatsu-lab/alpaca")',
        },
        400,
      );
    }

    const trimmedDatasetId = rawDatasetId.trim();
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(trimmedDatasetId)) {
      return c.json(
        {
          success: false,
          error:
            'Invalid datasetId format. Expected "owner/dataset" (e.g. "tatsu-lab/alpaca")',
        },
        400,
      );
    }

    const datasetName = (
      name?.trim() ||
      trimmedDatasetId.split("/").pop() ||
      trimmedDatasetId
    ).substring(0, 100);
    if (!REPO_NAME_REGEX.test(datasetName)) {
      return c.json(
        {
          success: false,
          error:
            "Invalid dataset name. Use letters, digits, hyphens, underscores, or dots (1–100 chars).",
        },
        400,
      );
    }

    const safeSplit =
      split && typeof split === "string" && split.trim()
        ? split.trim().substring(0, 100)
        : "train";
    const safeMaxRows =
      typeof maxRows === "number" && Number.isInteger(maxRows) && maxRows > 0
        ? Math.min(maxRows, 50000)
        : 1000;

    const datasets = readUserDatasets(userKey);
    if (
      datasets.some((d) => d.name === datasetName && d.status !== "archived")
    ) {
      return c.json(
        { success: false, error: "A dataset with this name already exists" },
        409,
      );
    }

    let effectiveHfToken =
      typeof hfToken === "string" && hfToken.trim() ? hfToken.trim() : "";
    if (!effectiveHfToken) {
      effectiveHfToken =
        (await getUserApiKey(userKey, "huggingface")) ||
        process.env.HF_TOKEN ||
        "";
    }

    const fetchHeaders: Record<string, string> = {};
    if (effectiveHfToken) {
      fetchHeaders["Authorization"] = `Bearer ${effectiveHfToken}`;
    }

    // 1. Discover config for the dataset & split from HuggingFace Datasets Server
    let configName = "default";
    try {
      const splitsUrl = `https://datasets-server.huggingface.co/splits?dataset=${encodeURIComponent(trimmedDatasetId)}`;
      const splitsRes = await fetch(splitsUrl, { headers: fetchHeaders });
      if (splitsRes.status === 404) {
        return c.json(
          {
            success: false,
            error: `Dataset '${trimmedDatasetId}' not found on HuggingFace Hub`,
          },
          404,
        );
      }
      if (splitsRes.status === 401 || splitsRes.status === 403) {
        return c.json(
          {
            success: false,
            error: `Access denied for dataset '${trimmedDatasetId}'. It may be private or gated. Try providing a HuggingFace token.`,
          },
          403,
        );
      }
      if (splitsRes.ok) {
        const splitsData: any = await splitsRes.json();
        const splitsList: Array<{ config: string; split: string }> =
          Array.isArray(splitsData?.splits) ? splitsData.splits : [];
        const matched =
          splitsList.find((s) => s.split === safeSplit) || splitsList[0];
        if (matched?.config) {
          configName = matched.config;
        }
      }
    } catch {
      // Fallback to default configName
    }

    // 2. Fetch rows in batches of up to 100 from HuggingFace Datasets Server
    const rawItems: Record<string, any>[] = [];
    const batchSize = Math.min(100, safeMaxRows);
    let offset = 0;

    while (rawItems.length < safeMaxRows) {
      const length = Math.min(batchSize, safeMaxRows - rawItems.length);
      const rowsUrl = `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(trimmedDatasetId)}&config=${encodeURIComponent(configName)}&split=${encodeURIComponent(safeSplit)}&offset=${offset}&length=${length}`;
      const rowsRes = await fetch(rowsUrl, { headers: fetchHeaders });

      if (!rowsRes.ok) {
        if (rawItems.length > 0) break;
        if (rowsRes.status === 404) {
          return c.json(
            {
              success: false,
              error: `Dataset '${trimmedDatasetId}' (split '${safeSplit}') not found on HuggingFace Hub`,
            },
            404,
          );
        }
        if (rowsRes.status === 401 || rowsRes.status === 403) {
          return c.json(
            {
              success: false,
              error: `Access denied for dataset '${trimmedDatasetId}'. It may be private or gated.`,
            },
            403,
          );
        }
        let errDetail = "Failed to download dataset from HuggingFace";
        try {
          const errJson: any = await rowsRes.json();
          if (typeof errJson?.error === "string") errDetail = errJson.error;
        } catch {
          // ignore
        }
        return c.json({ success: false, error: errDetail }, 502);
      }

      const pageData: any = await rowsRes.json();
      const pageRows: any[] = Array.isArray(pageData?.rows)
        ? pageData.rows
        : [];
      if (pageRows.length === 0) break;

      for (const r of pageRows) {
        const rowObj = r && typeof r.row === "object" && r.row !== null ? r.row : r;
        if (rowObj && typeof rowObj === "object") {
          rawItems.push(rowObj);
          if (rawItems.length >= safeMaxRows) break;
        }
      }

      if (pageRows.length < length) break;
      offset += pageRows.length;
    }

    const { rows, datasetType: detectedType } =
      convertRawItemsToDatasetRows(rawItems);
    if (rows.length === 0) {
      return c.json(
        {
          success: false,
          error: "No valid rows returned from HuggingFace dataset",
        },
        502,
      );
    }

    const isPostTraining = detectedType === "post-training";
    const totalTokens = rows.reduce((sum, r) => {
      if (isPostTraining) {
        const pt = r as PostTrainingRow;
        return (
          sum +
          estimateTokenCount(pt.prompt) +
          estimateTokenCount(pt.chosen) +
          estimateTokenCount(pt.rejected)
        );
      }
      const st = r as DatasetRow;
      return (
        sum +
        estimateTokenCount(st.instruction) +
        estimateTokenCount(st.input) +
        estimateTokenCount(st.output)
      );
    }, 0);

    const maxTokens = getMaxDatasetTokens();
    if (totalTokens > maxTokens) {
      return c.json(
        {
          success: false,
          error: `Dataset exceeds the maximum token limit of ${maxTokens} tokens (${DEFAULT_MAX_DATASET_TOKENS_GB} GB)`,
        },
        400,
      );
    }

    const estimatedBytes = totalTokens * BYTES_PER_TOKEN + 4096;
    if (getUserTotalSize(userKey) + estimatedBytes > MAX_USER_QUOTA) {
      return c.json(
        {
          success: false,
          error: "Quota exceeded. Maximum 500MB allowed per user.",
        },
        400,
      );
    }

    const dsId = crypto.randomUUID();
    const datasetDir = getUserDatasetDir(userKey, dsId);
    fs.mkdirSync(datasetDir, { recursive: true });
    const description =
      typeof customDesc === "string" && customDesc.trim()
        ? customDesc.trim()
        : `Imported from HuggingFace: ${trimmedDatasetId} (split: ${safeSplit})`;

    await writeDatasetParquet(
      path.join(datasetDir, "dataset.parquet"),
      rows,
      isPostTraining,
    );
    fs.writeFileSync(
      path.join(datasetDir, "README.md"),
      `# ${datasetName}\n\n${description}\n\nDataset containing ${rows.length} imported rows (~${totalTokens} tokens).\n\nSource: [${trimmedDatasetId}](https://huggingface.co/datasets/${trimmedDatasetId})\n`,
      { mode: 0o600 },
    );

    const datasetEntry: DatasetEntry = {
      id: dsId,
      name: datasetName,
      description,
      status: "active",
      username: user.username || user.email || userKey,
      userId: userKey,
      rowCount: rows.length,
      totalTokens,
      createdAt: new Date().toISOString(),
      archivedAt: null,
      datasetType: detectedType,
    };

    datasets.push(datasetEntry);
    writeUserDatasets(userKey, datasets);

    const bytesOnDisk = getDatasetBytesOnDisk(userKey, dsId);
    const metadata = {
      ...datasetEntry,
      tokenCount: totalTokens,
      archived: false,
      updatedAt: datasetEntry.createdAt,
      model: "HuggingFace",
      prompt: description,
      bytesOnDisk,
    };

    return c.json({
      success: true,
      datasetId: dsId,
      datasetName,
      rowCount: rows.length,
      totalTokens,
      tokenCount: totalTokens,
      datasetType: detectedType,
      metadata,
    });
  } catch (err: any) {
    console.error("Dataset import error:", err);
    return c.json(
      {
        success: false,
        error: "Failed to import dataset from HuggingFace",
      },
      500,
    );
  }
});

// GET /api/datasets - List all datasets for the current user
datasetsRouter.get("/", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const datasets = readUserDatasets(userKey);
    const storageUsed = getUserDatasetsSize(userKey);
    const totalStorageUsed = getUserTotalSize(userKey);

    const normalizedDatasets = datasets.map((d) => ({
      ...d,
      tokenCount: d.totalTokens,
      archived: d.status === "archived",
      updatedAt: d.archivedAt || d.createdAt,
      model: (d as any).model || "HuggingFace",
      prompt: (d as any).prompt || d.description,
      bytesOnDisk: getDatasetBytesOnDisk(userKey, d.id),
    }));

    return c.json({
      success: true,
      datasets: normalizedDatasets,
      storageUsed,
      totalStorageUsed,
      maxQuota: MAX_USER_QUOTA,
    });
  } catch (err: any) {
    console.error("List datasets error:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// GET /api/datasets/:id - Get single dataset details
datasetsRouter.get("/:id", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const id = c.req.param("id");
    const datasets = readUserDatasets(userKey);
    const dataset = datasets.find((d) => d.id === id);
    if (!dataset) {
      return c.json({ success: false, error: "Dataset not found" }, 404);
    }
    const size = getDatasetBytesOnDisk(userKey, dataset.id);
    return c.json({ success: true, dataset: { ...dataset, size } });
  } catch (err: any) {
    console.error("Get dataset error:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// GET /api/datasets/:id/rows - Get dataset rows from parquet file (with JSONL fallback)
datasetsRouter.get("/:id/rows", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const id = c.req.param("id");
    const datasets = readUserDatasets(userKey);
    const ds = datasets.find((d) => d.id === id && d.status === "active");
    if (!ds) {
      return c.json(
        { success: false, error: "Active dataset not found" },
        404,
      );
    }
    const datasetDir = getUserDatasetDir(userKey, ds.id);
    const isPostTraining = ds.datasetType === "post-training";
    const { filePath } = getDatasetFilePath(datasetDir);
    if (!fs.existsSync(filePath)) {
      return c.json({ success: false, error: "Dataset file not found" }, 404);
    }
    const rows = await readDatasetRows(datasetDir, isPostTraining);
    return c.json({ success: true, rows });
  } catch (err: any) {
    console.error("Get dataset rows error:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// PUT /api/datasets/:id/rows - Update all rows in a dataset
datasetsRouter.put("/:id/rows", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const { rows } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return c.json(
        {
          success: false,
          error: "Dataset rows are required and must not be empty",
        },
        400,
      );
    }

    const datasets = readUserDatasets(userKey);
    const dsIdx = datasets.findIndex(
      (d) => d.id === id && d.status === "active",
    );
    if (dsIdx === -1) {
      return c.json(
        { success: false, error: "Active dataset not found" },
        404,
      );
    }
    const ds = datasets[dsIdx];
    const isPostTraining = ds.datasetType === "post-training";

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (typeof r !== "object" || r === null || Array.isArray(r)) {
        return c.json(
          { success: false, error: `Row ${i + 1} is not a valid object` },
          400,
        );
      }
      if (isPostTraining) {
        if (typeof r.prompt !== "string" || !r.prompt.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "prompt" field`,
            },
            400,
          );
        }
        if (typeof r.chosen !== "string" || !r.chosen.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "chosen" field`,
            },
            400,
          );
        }
        if (typeof r.rejected !== "string" || !r.rejected.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "rejected" field`,
            },
            400,
          );
        }
      } else {
        if (typeof r.instruction !== "string" || !r.instruction.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "instruction" field`,
            },
            400,
          );
        }
        if (typeof r.output !== "string" || !r.output.trim()) {
          return c.json(
            {
              success: false,
              error: `Row ${i + 1} has an empty or missing "output" field`,
            },
            400,
          );
        }
      }
    }

    const totalTokens = rows.reduce((sum: number, r: any) => {
      if (isPostTraining) {
        return (
          sum +
          estimateTokenCount(r.prompt) +
          estimateTokenCount(r.chosen) +
          estimateTokenCount(r.rejected)
        );
      }
      return (
        sum +
        estimateTokenCount(r.instruction) +
        estimateTokenCount(typeof r.input === "string" ? r.input : "") +
        estimateTokenCount(r.output)
      );
    }, 0);

    const maxTokens = getMaxDatasetTokens();
    if (totalTokens > maxTokens) {
      return c.json(
        {
          success: false,
          error: `Dataset exceeds the maximum token limit of ${maxTokens} tokens (${DEFAULT_MAX_DATASET_TOKENS_GB} GB)`,
        },
        400,
      );
    }

    const datasetDir = getUserDatasetDir(userKey, ds.id);
    if (!fs.existsSync(datasetDir)) {
      return c.json(
        { success: false, error: "Dataset directory not found" },
        404,
      );
    }

    const existingDatasetSize = getFolderSize(datasetDir);
    const estimatedBytes = totalTokens * BYTES_PER_TOKEN + 4096;
    if (
      getUserTotalSize(userKey) - existingDatasetSize + estimatedBytes >
      MAX_USER_QUOTA
    ) {
      return c.json(
        {
          success: false,
          error: "Quota exceeded. Maximum 500MB allowed per user.",
        },
        400,
      );
    }

    const parquetPath = path.join(datasetDir, "dataset.parquet");
    const oldJsonlPath = path.join(datasetDir, "dataset.jsonl");
    await writeDatasetParquet(parquetPath, rows, isPostTraining);
    if (fs.existsSync(oldJsonlPath)) {
      fs.unlinkSync(oldJsonlPath);
    }

    ds.rowCount = rows.length;
    ds.totalTokens = totalTokens;
    datasets[dsIdx] = ds;
    writeUserDatasets(userKey, datasets);

    const bytesOnDisk = getDatasetBytesOnDisk(userKey, ds.id);
    const metadata = {
      ...ds,
      tokenCount: totalTokens,
      archived: ds.status === "archived",
      updatedAt: new Date().toISOString(),
      bytesOnDisk,
    };

    return c.json({
      success: true,
      rowCount: rows.length,
      totalTokens,
      tokenCount: totalTokens,
      metadata,
    });
  } catch (err: any) {
    console.error("Update dataset rows error:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// DELETE /api/datasets/:id - Delete a dataset
datasetsRouter.delete("/:id", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const id = c.req.param("id");
    const datasets = readUserDatasets(userKey);
    const dsIdx = datasets.findIndex((d) => d.id === id);
    if (dsIdx === -1) {
      return c.json({ success: false, error: "Dataset not found" }, 404);
    }
    const ds = datasets[dsIdx];

    try {
      const dd = getUserDatasetDir(userKey, ds.id);
      if (fs.existsSync(dd)) {
        fs.rmSync(dd, { recursive: true, force: true });
      }
    } catch (rmErr: any) {
      console.error("Delete dataset files error:", rmErr?.message);
    }

    try {
      const ap = getUserDatasetArchivePath(userKey, ds.id);
      if (fs.existsSync(ap)) {
        fs.unlinkSync(ap);
      }
    } catch (rmErr: any) {
      console.error("Delete dataset archive error:", rmErr?.message);
    }

    datasets.splice(dsIdx, 1);
    writeUserDatasets(userKey, datasets);
    return c.json({ success: true });
  } catch (err: any) {
    console.error("Delete dataset error:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});

// POST /api/datasets/:id/archive - Archive a dataset
datasetsRouter.post("/:id/archive", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const id = c.req.param("id");
    const datasets = readUserDatasets(userKey);
    const dsIdx = datasets.findIndex(
      (d) => d.id === id && d.status === "active",
    );
    if (dsIdx === -1) {
      return c.json(
        { success: false, error: "Active dataset not found" },
        404,
      );
    }
    const ds = datasets[dsIdx];

    const datasetDir = getUserDatasetDir(userKey, ds.id);
    const archivePath = getUserDatasetArchivePath(userKey, ds.id);
    if (fs.existsSync(datasetDir)) {
      createArchiveFromDir(datasetDir, archivePath);
      fs.rmSync(datasetDir, { recursive: true, force: true });
    }

    const updated = {
      ...ds,
      status: "archived" as const,
      archivedAt: new Date().toISOString(),
    };
    datasets[dsIdx] = updated;
    writeUserDatasets(userKey, datasets);

    const bytesOnDisk = getDatasetBytesOnDisk(userKey, ds.id);
    const metadata = {
      ...updated,
      tokenCount: updated.totalTokens,
      archived: true,
      updatedAt: updated.archivedAt,
      bytesOnDisk,
    };
    return c.json({ success: true, metadata });
  } catch (err: any) {
    console.error("Archive dataset error:", err);
    return c.json({ success: false, error: "Failed to archive dataset" }, 500);
  }
});

// POST /api/datasets/:id/unarchive - Unarchive a dataset
datasetsRouter.post("/:id/unarchive", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const id = c.req.param("id");
    const datasets = readUserDatasets(userKey);
    const dsIdx = datasets.findIndex(
      (d) => d.id === id && d.status === "archived",
    );
    if (dsIdx === -1) {
      return c.json(
        { success: false, error: "Archived dataset not found" },
        404,
      );
    }
    const ds = datasets[dsIdx];

    const archivePath = getUserDatasetArchivePath(userKey, ds.id);
    if (!fs.existsSync(archivePath)) {
      return c.json({ success: false, error: "Archive file not found" }, 404);
    }
    const datasetDir = getUserDatasetDir(userKey, ds.id);
    extractArchiveToDir(archivePath, datasetDir);
    fs.unlinkSync(archivePath);

    const updated = { ...ds, status: "active" as const, archivedAt: null };
    datasets[dsIdx] = updated;
    writeUserDatasets(userKey, datasets);

    const bytesOnDisk = getDatasetBytesOnDisk(userKey, ds.id);
    const metadata = {
      ...updated,
      tokenCount: updated.totalTokens,
      archived: false,
      updatedAt: new Date().toISOString(),
      bytesOnDisk,
    };
    return c.json({ success: true, metadata });
  } catch (err: any) {
    console.error("Unarchive dataset error:", err);
    return c.json(
      { success: false, error: "Failed to unarchive dataset" },
      500,
    );
  }
});

// POST /api/datasets/:id/refine - Refine an existing dataset row-by-row using an LLM
datasetsRouter.post("/:id/refine", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const datasetId = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const {
      provider = "pollinations",
      model,
      instructions,
      apiKey,
    } = body;

    if (!provider || typeof provider !== "string") {
      return c.json({ success: false, error: "Provider is required" }, 400);
    }
    if (!model || typeof model !== "string" || !model.trim()) {
      return c.json({ success: false, error: "Model is required" }, 400);
    }
    if (
      instructions &&
      typeof instructions === "string" &&
      instructions.length > MAX_DATASET_INSTRUCTIONS_LENGTH
    ) {
      return c.json(
        {
          success: false,
          error: `Instructions must be ${MAX_DATASET_INSTRUCTIONS_LENGTH} characters or less`,
        },
        400,
      );
    }

    if (instructions && typeof instructions === "string" && instructions.trim()) {
      const textSafety = await scanText(instructions.trim());
      if (!textSafety.safe && textSafety.severity >= 2) {
        const ip = extractClientIp(c);
        const userAgent = c.req.header("user-agent");
        const lockdown = await executeZeroToleranceLockdown({
          ip,
          user,
          userAgent,
          surface: "datasets_refine",
          promptText: instructions.trim(),
          severity: textSafety.severity,
          reason:
            textSafety.reason ||
            "CSAM / Child safety violation in dataset refine prompt",
        });
        return c.json(lockdown.clientResponse, 400);
      }
    }

    const datasets = readUserDatasets(userKey);
    const ds = datasets.find(
      (d) => d.id === datasetId && d.status === "active",
    );
    if (!ds) {
      return c.json(
        { success: false, error: "Active dataset not found" },
        404,
      );
    }

    const datasetDir = getUserDatasetDir(userKey, ds.id);
    const { filePath } = getDatasetFilePath(datasetDir);
    if (!fs.existsSync(filePath)) {
      return c.json({ success: false, error: "Dataset file not found" }, 404);
    }

    const isPostTraining = ds.datasetType === "post-training";
    const allRows = await readDatasetRows(datasetDir, isPostTraining);
    if (allRows.length === 0) {
      return c.json(
        { success: false, error: "Dataset has no rows to refine" },
        400,
      );
    }

    const customInstructions =
      instructions && typeof instructions === "string" && instructions.trim()
        ? `\n\nAdditional refinement instructions from the user:\n${instructions.trim()}`
        : "";

    const refinedRows: Array<DatasetRow | PostTrainingRow> = [];

    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      const basePrompt = isPostTraining
        ? REFINE_POST_TRAINING_PROMPT_TEMPLATE
        : REFINE_ROW_PROMPT_TEMPLATE;
      const fieldsLabel = isPostTraining
        ? '"prompt", "chosen", and "rejected"'
        : '"instruction", "input", and "output"';

      const refinementPrompt = `${basePrompt}${customInstructions}

Here is the row to refine:
${JSON.stringify(row)}

Return ONLY a single valid JSON object with the corrected fields: ${fieldsLabel}.
Do not include any markdown, explanation, or extra text. Return raw JSON only.`;

      try {
        const responseText = await completeWithLlm(
          userKey,
          [{ role: "user", content: refinementPrompt }],
          {
            provider,
            model: model.trim(),
            maxTokens: 2048,
            temperature: 0.3,
            apiKey,
          },
        );

        const objs = extractObjectsFromLlmResponse(responseText);
        const refined = objs[0];
        if (refined && typeof refined === "object") {
          if (isPostTraining) {
            const orig = row as PostTrainingRow;
            refinedRows.push({
              prompt:
                typeof refined.prompt === "string" && refined.prompt.trim()
                  ? refined.prompt.trim()
                  : orig.prompt,
              chosen:
                typeof refined.chosen === "string" && refined.chosen.trim()
                  ? refined.chosen.trim()
                  : orig.chosen,
              rejected:
                typeof refined.rejected === "string" && refined.rejected.trim()
                  ? refined.rejected.trim()
                  : orig.rejected,
            });
          } else {
            const orig = row as DatasetRow;
            refinedRows.push({
              instruction:
                typeof refined.instruction === "string" &&
                refined.instruction.trim()
                  ? refined.instruction.trim()
                  : orig.instruction,
              input:
                typeof refined.input === "string"
                  ? refined.input.trim()
                  : orig.input,
              output:
                typeof refined.output === "string" && refined.output.trim()
                  ? refined.output.trim()
                  : orig.output,
            });
          }
        } else {
          refinedRows.push(row);
        }
      } catch {
        refinedRows.push(row);
      }
    }

    const totalTokens = refinedRows.reduce((sum, r) => {
      if (isPostTraining) {
        const pt = r as PostTrainingRow;
        return (
          sum +
          estimateTokenCount(pt.prompt) +
          estimateTokenCount(pt.chosen) +
          estimateTokenCount(pt.rejected)
        );
      }
      const st = r as DatasetRow;
      return (
        sum +
        estimateTokenCount(st.instruction) +
        estimateTokenCount(st.input) +
        estimateTokenCount(st.output)
      );
    }, 0);

    const parquetPath = path.join(datasetDir, "dataset.parquet");
    const oldJsonlPath = path.join(datasetDir, "dataset.jsonl");
    await writeDatasetParquet(parquetPath, refinedRows, isPostTraining);
    if (fs.existsSync(oldJsonlPath)) {
      fs.unlinkSync(oldJsonlPath);
    }

    const dsIndex = datasets.findIndex((d) => d.id === ds.id);
    if (dsIndex !== -1) {
      datasets[dsIndex].rowCount = refinedRows.length;
      datasets[dsIndex].totalTokens = totalTokens;
      writeUserDatasets(userKey, datasets);
    }

    const bytesOnDisk = getDatasetBytesOnDisk(userKey, ds.id);
    const metadata = {
      ...ds,
      rowCount: refinedRows.length,
      totalTokens,
      tokenCount: totalTokens,
      archived: ds.status === "archived",
      updatedAt: new Date().toISOString(),
      bytesOnDisk,
    };

    return c.json({
      success: true,
      rows: refinedRows,
      totalTokens,
      tokenCount: totalTokens,
      originalName: ds.name,
      datasetType: ds.datasetType || "standard",
      metadata,
    });
  } catch (err: any) {
    console.error("Dataset refine error:", err);
    return c.json({ success: false, error: "Failed to refine dataset" }, 500);
  }
});

// GET /api/datasets/:id/download - Download the dataset file (parquet or jsonl)
datasetsRouter.get("/:id/download", async (c) => {
  try {
    const user = c.get("user" as any);
    const userKey = String(user.id);
    const id = c.req.param("id");
    const requestedFormat = (c.req.query("format") || "").toLowerCase();
    const datasets = readUserDatasets(userKey);
    const ds = datasets.find((d) => d.id === id && d.status === "active");
    if (!ds) {
      return c.json(
        { success: false, error: "Active dataset not found" },
        404,
      );
    }

    const datasetDir = getUserDatasetDir(userKey, ds.id);
    const { filePath, format } = getDatasetFilePath(datasetDir);
    if (!fs.existsSync(filePath)) {
      return c.json({ success: false, error: "Dataset file not found" }, 404);
    }

    if (requestedFormat === "jsonl") {
      const isPostTraining = ds.datasetType === "post-training";
      const rows = await readDatasetRows(datasetDir, isPostTraining);
      const jsonlContent = rows.map((r) => JSON.stringify(r)).join("\n");
      c.header(
        "Content-Disposition",
        `attachment; filename="${ds.name}.jsonl"`,
      );
      c.header("Content-Type", "application/x-ndjson; charset=utf-8");
      return c.body(jsonlContent);
    }

    const buffer = fs.readFileSync(filePath);
    if (format === "parquet") {
      c.header(
        "Content-Disposition",
        `attachment; filename="${ds.name}.parquet"`,
      );
      c.header("Content-Type", "application/octet-stream");
    } else {
      c.header(
        "Content-Disposition",
        `attachment; filename="${ds.name}.jsonl"`,
      );
      c.header("Content-Type", "application/x-ndjson");
    }
    return c.body(new Uint8Array(buffer));
  } catch (err: any) {
    console.error("Download dataset error:", err);
    return c.json({ success: false, error: "Internal server error" }, 500);
  }
});
