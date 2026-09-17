import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import { DATA_DIR, getTableRows } from "../lib/dataStore.ts";

export const modelsRouter = new Hono();

export interface SharedModelDefinition {
  id: string; // unique model identifier e.g. "user1_llama3"
  hostUserId: string;
  hostUsername: string;
  name: string;
  model_id: string; // local engine id e.g. "llama3.2:latest"
  provider: "ollama" | "lmstudio" | "kobold" | "python" | "custom";
  modality: "text" | "vision" | "embeddings";
  sharing_mode: "public" | "friends" | "private" | "password";
  enabled: boolean;
  password?: string;
  has_password?: boolean;
  max_tokens: number;
  max_concurrent: number;
  rate_limit_rpm: number;
  daily_token_cap: number;
  tokens_served_today: number;
  auto_pause_gaming: boolean;
  context_length?: number;
  is_paused?: boolean;
}

export interface InboundInferenceJob {
  jobId: string;
  type: "chat" | "embeddings";
  model_id: string;
  provider: string;
  messages?: any[];
  prompt?: string;
  input?: string | string[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface JobHandler {
  onChunk: (data: { chunk?: string; delta?: any; tokens?: number }) => void;
  onComplete: (data: { tokens?: number; text?: string; embeddings?: any }) => void;
  onError: (error: string) => void;
}

export interface HostSession {
  hostId: string;
  userId: string;
  username: string;
  models: Map<string, SharedModelDefinition>;
  connectedAt: number;
  lastHeartbeat: number;
  activeRequests: number;
  totalRequests: number;
  totalTokens: number;
  isGaming: boolean;
  masterPaused: boolean;
  sendJob: (job: InboundInferenceJob) => Promise<boolean>;
  closeTunnel?: () => void;
}

export interface QueuedJob {
  jobId: string;
  priority: number; // 1 = Owner, 2 = Friend, 3 = Public
  requesterUserId: string;
  modelId: string;
  job: InboundInferenceJob;
  queuedAt: number;
  execute: () => void;
  sendQueueUpdate?: (position: number, total: number) => void;
  timeoutTimer: NodeJS.Timeout;
}

// In-memory state for active host relay
const activeHosts = new Map<string, HostSession>(); // hostUserId -> HostSession
const activeJobs = new Map<string, JobHandler>(); // jobId -> JobHandler
const modelQueues = new Map<string, QueuedJob[]>(); // modelId -> sorted array of QueuedJob
const userRateLimits = new Map<string, { count: number; resetAt: number }>();

// Helper to check friendship between host and requester
export function checkIsFriend(hostUserId: string, requesterUserId: string): boolean {
  if (String(hostUserId) === String(requesterUserId)) return true;
  try {
    const friendships = getTableRows("friendships", hostUserId);
    return friendships.some(
      (f: any) =>
        f.status === "accepted" &&
        ((String(f.user_id) === String(hostUserId) && String(f.friend_id) === String(requesterUserId)) ||
          (String(f.friend_id) === String(hostUserId) && String(f.user_id) === String(requesterUserId))),
    );
  } catch {
    return false;
  }
}

// Helper: Ensure user models storage folder exists
function getUserModelsDir(userId: string): string {
  const dir = path.join(DATA_DIR, String(userId), "models");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Read/write host config
export function getHostConfig(userId: string): any {
  const file = path.join(getUserModelsDir(userId), "host_config.json");
  if (!fs.existsSync(file)) {
    return {
      enabled: false,
      masterPaused: false,
      autoPauseGaming: true,
      models: [],
      customEndpoints: [],
    };
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {
      enabled: false,
      masterPaused: false,
      autoPauseGaming: true,
      models: [],
      customEndpoints: [],
    };
  }
}

export function saveHostConfig(userId: string, config: any): void {
  const file = path.join(getUserModelsDir(userId), "host_config.json");
  fs.writeFileSync(file, JSON.stringify(config, null, 2), "utf-8");
}

// Read/write pinned models
export function getPinnedModels(userId: string): string[] {
  const file = path.join(getUserModelsDir(userId), "pinned.json");
  if (!fs.existsSync(file)) return [];
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

export function savePinnedModels(userId: string, pinned: string[]): void {
  const file = path.join(getUserModelsDir(userId), "pinned.json");
  fs.writeFileSync(file, JSON.stringify(pinned, null, 2), "utf-8");
}

// Process the next job in queue for a model
function processNextInQueue(modelId: string) {
  const queue = modelQueues.get(modelId);
  if (!queue || queue.length === 0) return;

  const modelDef = findSharedModel(modelId);
  if (!modelDef || !modelDef.enabled) return;

  const host = activeHosts.get(modelDef.hostUserId);
  if (!host || host.masterPaused || (modelDef.auto_pause_gaming && host.isGaming)) return;

  if (host.activeRequests >= modelDef.max_concurrent) return;

  // Queue is already sorted by priority (ascending) and queuedAt (ascending)
  const nextJob = queue.shift();
  if (!nextJob) return;

  clearTimeout(nextJob.timeoutTimer);

  // Notify remaining waiters of their updated positions
  notifyQueuePositions(modelId);

  nextJob.execute();
}

function notifyQueuePositions(modelId: string) {
  const queue = modelQueues.get(modelId);
  if (!queue) return;
  queue.forEach((item, index) => {
    if (item.sendQueueUpdate) {
      item.sendQueueUpdate(index + 1, queue.length);
    }
  });
}

export function findSharedModel(modelId: string): SharedModelDefinition | null {
  for (const host of activeHosts.values()) {
    if (host.models.has(modelId)) {
      return host.models.get(modelId)!;
    }
  }
  return null;
}

// Reset in-memory state (useful for tests)
export function _resetModelsState() {
  activeHosts.clear();
  activeJobs.clear();
  modelQueues.clear();
  userRateLimits.clear();
}

// ---------------------------------------------------------------------------
// Host Relay Registration & Heartbeat
// ---------------------------------------------------------------------------

modelsRouter.post("/relay/register", async (c) => {
  const isDesktop = c.req.header("x-oxygen-client") === "desktop";
  if (!isDesktop) {
    return c.json(
      { error: "Model hosting is only supported on the Oxygen Low's Software desktop app." },
      403,
    );
  }

  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const userId = String(user.id);
  const username = user.username || `User_${userId}`;
  const rawModels: any[] = Array.isArray(body.models) ? body.models : [];

  let host = activeHosts.get(userId);
  if (!host) {
    host = {
      hostId: `host_${userId}_${crypto.randomBytes(4).toString("hex")}`,
      userId,
      username,
      models: new Map(),
      connectedAt: Date.now(),
      lastHeartbeat: Date.now(),
      activeRequests: 0,
      totalRequests: 0,
      totalTokens: 0,
      isGaming: !!body.isGaming,
      masterPaused: !!body.masterPaused,
      sendJob: async () => false,
    };
    activeHosts.set(userId, host);
  } else {
    host.lastHeartbeat = Date.now();
    host.isGaming = !!body.isGaming;
    host.masterPaused = !!body.masterPaused;
  }

  // Update models map
  host.models.clear();
  for (const m of rawModels) {
    if (!m.id || !m.model_id) continue;
    const modelDef: SharedModelDefinition = {
      id: m.id,
      hostUserId: userId,
      hostUsername: username,
      name: m.name || m.model_id,
      model_id: m.model_id,
      provider: m.provider || "ollama",
      modality: m.modality || "text",
      sharing_mode: m.sharing_mode || "public",
      enabled: m.enabled !== false,
      password: m.password || undefined,
      has_password: !!m.password,
      max_tokens: Number(m.max_tokens) || 2048,
      max_concurrent: Math.max(1, Number(m.max_concurrent) || 2),
      rate_limit_rpm: Number(m.rate_limit_rpm) || 30,
      daily_token_cap: Number(m.daily_token_cap) || 200000,
      tokens_served_today: Number(m.tokens_served_today) || 0,
      auto_pause_gaming: m.auto_pause_gaming !== false,
      context_length: Number(m.context_length) || 4096,
      is_paused: host.masterPaused || (m.auto_pause_gaming !== false && host.isGaming),
    };
    host.models.set(m.id, modelDef);
  }

  // Save to host config in background
  try {
    const existingConfig = getHostConfig(userId);
    saveHostConfig(userId, {
      ...existingConfig,
      masterPaused: host.masterPaused,
      autoPauseGaming: body.autoPauseGaming !== false,
      models: rawModels,
    });
  } catch {}

  return c.json({
    success: true,
    hostId: host.hostId,
    activeModelsCount: host.models.size,
  });
});

// Host Tunnel: SSE stream where host listens for incoming inference requests
modelsRouter.get("/relay/tunnel", async (c) => {
  const isDesktop =
    c.req.header("x-oxygen-client") === "desktop" ||
    c.req.query("client") === "desktop";
  if (!isDesktop) {
    return c.json(
      { error: "Model hosting is only supported on the Oxygen Low's Software desktop app." },
      403,
    );
  }

  const token =
    c.req.query("token") ||
    c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return c.json({ error: "Unauthorized: Missing token" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized: Invalid token" }, 401);
  }

  const userId = String(user.id);
  const username = user.username || `User_${userId}`;

  return streamSSE(c, async (stream) => {
    let host = activeHosts.get(userId);
    if (!host) {
      host = {
        hostId: `host_${userId}_${crypto.randomBytes(4).toString("hex")}`,
        userId,
        username,
        models: new Map(),
        connectedAt: Date.now(),
        lastHeartbeat: Date.now(),
        activeRequests: 0,
        totalRequests: 0,
        totalTokens: 0,
        isGaming: false,
        masterPaused: false,
        sendJob: async () => false,
      };
      activeHosts.set(userId, host);
    }

    // Attach sendJob to this SSE stream
    host.sendJob = async (job: InboundInferenceJob) => {
      try {
        await stream.writeSSE({
          event: "inference_job",
          data: JSON.stringify(job),
        });
        return true;
      } catch {
        return false;
      }
    };

    host.closeTunnel = () => {
      try {
        stream.close();
      } catch {}
    };

    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        hostId: host.hostId,
        userId,
        timestamp: Date.now(),
      }),
    });

    stream.onAbort(() => {
      activeHosts.delete(userId);
    });

    // Keep-alive heartbeat loop
    while (!stream.aborted) {
      await stream.sleep(15_000);
      try {
        host.lastHeartbeat = Date.now();
        await stream.writeSSE({ event: "ping", data: "heartbeat" });
      } catch {
        break;
      }
    }

    activeHosts.delete(userId);
  });
});

// Host posts stream chunks back to server
modelsRouter.post("/relay/chunk", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { jobId, chunk, delta, done, error, embeddings, tokens } = body;

  if (!jobId) {
    return c.json({ error: "Missing jobId" }, 400);
  }

  const handler = activeJobs.get(jobId);
  if (!handler) {
    return c.json({ error: "Job handler not found or already completed" }, 404);
  }

  if (error) {
    handler.onError(error);
    activeJobs.delete(jobId);
    return c.json({ success: true });
  }

  if (chunk !== undefined || delta !== undefined) {
    handler.onChunk({ chunk, delta, tokens });
  }

  if (done) {
    handler.onComplete({ tokens, embeddings });
    activeJobs.delete(jobId);
  }

  return c.json({ success: true });
});

// Host updates real-time status (e.g. isGaming or masterPaused)
modelsRouter.post("/relay/status", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const host = activeHosts.get(String(user.id));
  if (!host) {
    return c.json({ error: "Host session not active" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  if (body.isGaming !== undefined) host.isGaming = !!body.isGaming;
  if (body.masterPaused !== undefined) host.masterPaused = !!body.masterPaused;

  for (const m of host.models.values()) {
    m.is_paused = host.masterPaused || (m.auto_pause_gaming && host.isGaming);
  }

  return c.json({
    success: true,
    isGaming: host.isGaming,
    masterPaused: host.masterPaused,
  });
});

// ---------------------------------------------------------------------------
// Directory & Discovery
// ---------------------------------------------------------------------------

// List active shared models with permission filtering
modelsRouter.get("/shared", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  const requesterUserId = user ? String(user.id) : null;

  const result: any[] = [];

  for (const host of activeHosts.values()) {
    for (const model of host.models.values()) {
      const isOwner = requesterUserId === model.hostUserId;
      const isFriend = requesterUserId ? checkIsFriend(model.hostUserId, requesterUserId) : false;

      // When sharing is disabled, only the owner can see the model (marked as disabled)
      if (model.enabled === false && !isOwner) {
        continue;
      }

      // Permission checks
      if (model.sharing_mode === "private") {
        if (!requesterUserId || !isOwner) {
          continue; // Private models only visible to the owner
        }
      } else if (model.sharing_mode === "friends") {
        if (!requesterUserId) continue;
        if (!isOwner && !isFriend) {
          continue;
        }
      }

      const queue = modelQueues.get(model.id) || [];

      result.push({
        id: model.id,
        name: model.name,
        model_id: model.model_id,
        hostUserId: model.hostUserId,
        hostUsername: model.hostUsername,
        provider: model.provider,
        modality: model.modality,
        sharing_mode: model.sharing_mode,
        has_password: model.has_password,
        max_tokens: model.max_tokens,
        max_concurrent: model.max_concurrent,
        context_length: model.context_length,
        status: !model.enabled
          ? "disabled"
          : model.is_paused
          ? "paused"
          : host.activeRequests >= model.max_concurrent
          ? "busy"
          : "online",
        activeRequests: host.activeRequests,
        queueLength: queue.length,
        isOwner,
        isFriend,
        tokensServedToday: model.tokens_served_today,
      });
    }
  }

  return c.json({ models: result });
});

// ---------------------------------------------------------------------------
// Inference Endpoints (Chat & Embeddings with Priority Queue)
// ---------------------------------------------------------------------------

modelsRouter.post("/shared/:id/chat", async (c) => {
  const modelId = c.req.param("id");
  const model = findSharedModel(modelId);
  if (!model) {
    return c.json({ error: "Shared model not found or currently offline" }, 404);
  }

  const host = activeHosts.get(model.hostUserId);
  if (!host) {
    return c.json({ error: "Host is currently offline" }, 503);
  }

  if (!model.enabled) {
    return c.json({ error: "This model is currently disabled by the host" }, 403);
  }

  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  const requesterUserId = user ? String(user.id) : `anon_${c.req.header("x-forwarded-for") || "ip"}`;
  const isOwner = user && String(user.id) === model.hostUserId;
  const isFriend = user ? checkIsFriend(model.hostUserId, String(user.id)) : false;

  // Access check
  if (model.sharing_mode === "private" && !isOwner) {
    return c.json({ error: "This model is private to the host's own devices" }, 403);
  }
  if (model.sharing_mode === "friends" && !isOwner && !isFriend) {
    return c.json({ error: "This model is restricted to friends of the host" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));

  if (model.sharing_mode === "password" && !isOwner) {
    const providedPassword =
      c.req.header("x-model-password") || body.password || "";
    if (model.password && providedPassword !== model.password) {
      return c.json({ error: "Incorrect password for this shared model" }, 401);
    }
  }

  // Check rate limit per requester
  const rateLimitKey = `${requesterUserId}_${modelId}`;
  const now = Date.now();
  const rl = userRateLimits.get(rateLimitKey);
  if (rl && rl.resetAt > now) {
    if (rl.count >= model.rate_limit_rpm) {
      return c.json({ error: "Rate limit exceeded for this shared model. Please slow down." }, 429);
    }
    rl.count++;
  } else {
    userRateLimits.set(rateLimitKey, { count: 1, resetAt: now + 60_000 });
  }

  // Check daily token cap
  if (model.tokens_served_today >= model.daily_token_cap && !isOwner) {
    return c.json({ error: "Host daily token cap reached for this model" }, 429);
  }

  // Priority: 1 = Owner, 2 = Friend, 3 = Public
  const priority = isOwner ? 1 : isFriend ? 2 : 3;
  const jobId = `job_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  const inferenceJob: InboundInferenceJob = {
    jobId,
    type: "chat",
    model_id: model.model_id,
    provider: model.provider,
    messages: body.messages || [],
    prompt: body.prompt,
    max_tokens: Math.min(Number(body.max_tokens) || model.max_tokens, model.max_tokens),
    temperature: body.temperature,
    stream: true,
  };

  return streamSSE(c, async (stream) => {
    let jobDispatched = false;

    const executeJob = async () => {
      jobDispatched = true;
      host.activeRequests++;
      host.totalRequests++;

      activeJobs.set(jobId, {
        onChunk: async ({ chunk, delta, tokens }) => {
          try {
            if (tokens) {
              model.tokens_served_today += tokens;
              host.totalTokens += tokens;
            }
            await stream.writeSSE({
              event: "chunk",
              data: JSON.stringify({ chunk: chunk || delta?.content || "", delta }),
            });
          } catch {}
        },
        onComplete: async ({ tokens }) => {
          try {
            if (tokens) {
              model.tokens_served_today += tokens;
              host.totalTokens += tokens;
            }
            await stream.writeSSE({
              event: "done",
              data: JSON.stringify({ done: true, tokens }),
            });
          } catch {}
          host.activeRequests = Math.max(0, host.activeRequests - 1);
          processNextInQueue(modelId);
        },
        onError: async (err) => {
          try {
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ error: err }),
            });
          } catch {}
          host.activeRequests = Math.max(0, host.activeRequests - 1);
          processNextInQueue(modelId);
        },
      });

      const sent = await host.sendJob(inferenceJob);
      if (!sent) {
        activeJobs.delete(jobId);
        host.activeRequests = Math.max(0, host.activeRequests - 1);
        try {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: "Failed to dispatch job to host. Host may have disconnected." }),
          });
        } catch {}
        processNextInQueue(modelId);
      }
    };

    // Clean up if consumer disconnects
    stream.onAbort(() => {
      if (!jobDispatched) {
        const queue = modelQueues.get(modelId);
        if (queue) {
          const idx = queue.findIndex((q) => q.jobId === jobId);
          if (idx !== -1) {
            clearTimeout(queue[idx].timeoutTimer);
            queue.splice(idx, 1);
            notifyQueuePositions(modelId);
          }
        }
      } else {
        activeJobs.delete(jobId);
        host.activeRequests = Math.max(0, host.activeRequests - 1);
        processNextInQueue(modelId);
      }
    });

    // If host is paused, return notification
    if (model.is_paused) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({ error: "Host model is currently paused (host is gaming or has paused sharing)." }),
      });
      return;
    }

    // Check if slot is immediately available
    if (host.activeRequests < model.max_concurrent) {
      await executeJob();
    } else {
      // Enqueue
      if (!modelQueues.has(modelId)) {
        modelQueues.set(modelId, []);
      }
      const queue = modelQueues.get(modelId)!;

      const timeoutTimer = setTimeout(async () => {
        const idx = queue.findIndex((q) => q.jobId === jobId);
        if (idx !== -1) {
          queue.splice(idx, 1);
          try {
            await stream.writeSSE({
              event: "error",
              data: JSON.stringify({ error: "Queue timeout waiting for host model." }),
            });
          } catch {}
          notifyQueuePositions(modelId);
        }
      }, 60_000);

      const queuedItem: QueuedJob = {
        jobId,
        priority,
        requesterUserId,
        modelId,
        job: inferenceJob,
        queuedAt: Date.now(),
        execute: executeJob,
        sendQueueUpdate: async (pos, total) => {
          try {
            await stream.writeSSE({
              event: "queue_status",
              data: JSON.stringify({
                position: pos,
                totalWaiting: total,
                message: `In queue (position ${pos} of ${total})...`,
              }),
            });
          } catch {}
        },
        timeoutTimer,
      };

      queue.push(queuedItem);
      // Sort by priority (asc), then queuedAt (asc)
      queue.sort((a, b) => a.priority - b.priority || a.queuedAt - b.queuedAt);

      const pos = queue.findIndex((q) => q.jobId === jobId) + 1;
      await stream.writeSSE({
        event: "queue_status",
        data: JSON.stringify({
          position: pos,
          totalWaiting: queue.length,
          message: `In queue (position ${pos} of ${queue.length})...`,
        }),
      });
    }

    // Keep stream open while job is active
    while (!stream.aborted && activeJobs.has(jobId)) {
      await stream.sleep(1000);
    }
  });
});

modelsRouter.post("/shared/:id/embeddings", async (c) => {
  const modelId = c.req.param("id");
  const model = findSharedModel(modelId);
  if (!model) {
    return c.json({ error: "Shared model not found or currently offline" }, 404);
  }

  const host = activeHosts.get(model.hostUserId);
  if (!host) {
    return c.json({ error: "Host is currently offline" }, 503);
  }

  if (!model.enabled) {
    return c.json({ error: "This model is currently disabled by the host" }, 403);
  }

  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  const isOwner = user && String(user.id) === model.hostUserId;
  const isFriend = user ? checkIsFriend(model.hostUserId, String(user.id)) : false;

  if (model.sharing_mode === "private" && !isOwner) {
    return c.json({ error: "This model is private" }, 403);
  }
  if (model.sharing_mode === "friends" && !isOwner && !isFriend) {
    return c.json({ error: "This model is restricted to friends" }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  if (model.sharing_mode === "password" && !isOwner) {
    const providedPassword = c.req.header("x-model-password") || body.password || "";
    if (model.password && providedPassword !== model.password) {
      return c.json({ error: "Incorrect password" }, 401);
    }
  }

  const jobId = `job_emb_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
  const inferenceJob: InboundInferenceJob = {
    jobId,
    type: "embeddings",
    model_id: model.model_id,
    provider: model.provider,
    input: body.input,
  };

  return new Promise<Response>((resolve) => {
    const timeout = setTimeout(() => {
      activeJobs.delete(jobId);
      resolve(c.json({ error: "Timeout waiting for host embeddings" }, 504));
    }, 30_000);

    activeJobs.set(jobId, {
      onChunk: () => {},
      onComplete: ({ embeddings }) => {
        clearTimeout(timeout);
        activeJobs.delete(jobId);
        resolve(c.json({ success: true, embeddings: embeddings || [] }));
      },
      onError: (err) => {
        clearTimeout(timeout);
        activeJobs.delete(jobId);
        resolve(c.json({ error: err }, 500));
      },
    });

    host.sendJob(inferenceJob).catch(() => {
      clearTimeout(timeout);
      activeJobs.delete(jobId);
      resolve(c.json({ error: "Failed to dispatch to host" }, 502));
    });
  });
});

// ---------------------------------------------------------------------------
// Host Configuration & Pinned Models Persistence
// ---------------------------------------------------------------------------

modelsRouter.get("/host/config", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const config = getHostConfig(String(user.id));
  return c.json(config);
});

modelsRouter.post("/host/config", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  saveHostConfig(String(user.id), body);
  return c.json({ success: true });
});

modelsRouter.get("/pinned", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ pinned: [] });
  }
  const pinned = getPinnedModels(String(user.id));
  return c.json({ pinned });
});

modelsRouter.post("/pinned", async (c) => {
  const token = c.req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const body = await c.req.json().catch(() => ({}));
  const modelId = body.modelId;
  if (!modelId) {
    return c.json({ error: "Missing modelId" }, 400);
  }

  const current = getPinnedModels(String(user.id));
  const exists = current.includes(modelId);
  const updated = exists ? current.filter((id) => id !== modelId) : [...current, modelId];
  savePinnedModels(String(user.id), updated);

  return c.json({ success: true, pinned: updated, isPinned: !exists });
});
