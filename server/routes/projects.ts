import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getTableRows,
  insertTable,
  updateTable,
  deleteTable,
  upsertTable,
} from "../lib/dataStore.ts";
import { rateLimiter } from "../lib/rateLimiter.ts";
import { broadcastConfigUpdate } from "./webdefender.ts";
import type { Context, Next } from "hono";

export const projectsRouter = new Hono<{
  Variables: { user: any; userId: string };
}>();

const projectLimiter = rateLimiter(120, 60000, "proj_api");

// Authentication middleware
async function requireAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7)
    : null;
  if (!token) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  c.set("user", user);
  c.set("userId", user.id);
  await next();
}

projectsRouter.use("*", projectLimiter);
projectsRouter.use("*", requireAuth);

export interface ProjectRecord {
  id: string;
  user_id: string;
  name: string;
  description: string;
  defender_app_ids: string[];
  resources: Array<{
    type: string;
    id: string;
    name?: string;
    metadata?: Record<string, any>;
  }>;
  tags: string[];
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface ProjectIssueRecord {
  id: string;
  project_id: string;
  user_id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: "open" | "in_progress" | "resolved";
  category: "security" | "config" | "task" | "bug" | "enhancement";
  target_app_id?: string | null;
  quick_fix_type?: string | null;
  created_at: string;
  updated_at: string;
}

// Severity ranking for sorting
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

// 1. GET /api/projects - List all projects for authenticated user
projectsRouter.get("/", async (c) => {
  const userId = c.get("userId");
  const projects = getTableRows("projects", userId) as ProjectRecord[];
  const userDefenderApps = getTableRows("defender_apps", userId);
  const userEvents = getTableRows("defender_events", userId);
  const userCustomIssues = getTableRows("project_issues", userId) as ProjectIssueRecord[];

  const projectsWithStats = projects.map((project) => {
    const attachedAppIds = Array.isArray(project.defender_app_ids)
      ? project.defender_app_ids
      : [];
    const attachedApps = userDefenderApps.filter((app: any) =>
      attachedAppIds.includes(app.id),
    );

    // Compute threat count for attached apps
    const appEvents = userEvents.filter((evt: any) =>
      attachedAppIds.includes(evt.app_id),
    );

    // Compute open issues count
    const customOpen = userCustomIssues.filter(
      (iss) => iss.project_id === project.id && iss.status !== "resolved",
    );

    // Automated security findings count
    let autoIssuesCount = 0;
    if (attachedApps.length === 0) {
      autoIssuesCount += 1;
    }
    for (const app of attachedApps) {
      if (!app.block_mode_enabled) autoIssuesCount += 1;
      if (!app.abuseipdb_api_key) autoIssuesCount += 1;
    }

    const totalOpenIssues = customOpen.length + autoIssuesCount;

    return {
      ...project,
      attached_apps_count: attachedApps.length,
      threat_count: appEvents.length,
      open_issues_count: totalOpenIssues,
      has_critical: attachedApps.some((a: any) => !a.block_mode_enabled) || customOpen.some((i) => i.severity === "critical"),
    };
  });

  return c.json(projectsWithStats);
});

// 2. POST /api/projects - Create a new project
projectsRouter.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => ({}));
  const { name, description = "", defender_app_ids = [], tags = [], resources = [] } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return c.json({ error: "Project name is required" }, 400);
  }

  if (name.trim().length > 100) {
    return c.json({ error: "Project name must be 100 characters or less" }, 400);
  }

  // Validate defender_app_ids belong to the user
  const userDefenderApps = getTableRows("defender_apps", userId);
  const validAppIds = Array.isArray(defender_app_ids)
    ? defender_app_ids.filter((id: string) =>
        userDefenderApps.some((a: any) => a.id === id),
      )
    : [];

  const now = new Date().toISOString();
  const newProject: ProjectRecord = {
    id: randomUUID(),
    user_id: userId,
    name: name.trim(),
    description: typeof description === "string" ? description.trim() : "",
    defender_app_ids: validAppIds,
    resources: Array.isArray(resources) ? resources : [],
    tags: Array.isArray(tags) ? tags.map(String) : [],
    settings: {},
    created_at: now,
    updated_at: now,
  };

  insertTable("projects", newProject, userId);
  return c.json(newProject, 201);
});

// 3. GET /api/projects/:id - Get project details
projectsRouter.get("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const projects = getTableRows("projects", userId) as ProjectRecord[];
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const userDefenderApps = getTableRows("defender_apps", userId);
  const attachedAppIds = Array.isArray(project.defender_app_ids)
    ? project.defender_app_ids
    : [];

  const attachedApps = userDefenderApps
    .filter((app: any) => attachedAppIds.includes(app.id))
    .map((app: any) => {
      const { api_key: _k, api_key_hash: _h, abuseipdb_api_key: _a, ...safe } = app;
      return {
        ...safe,
        abuseipdb_configured: Boolean(_a),
      };
    });

  return c.json({
    ...project,
    attached_apps: attachedApps,
  });
});

// 4. PUT /api/projects/:id - Update project
projectsRouter.put("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));

  const projects = getTableRows("projects", userId) as ProjectRecord[];
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const userDefenderApps = getTableRows("defender_apps", userId);

  let updatedAppIds = project.defender_app_ids;
  if (Array.isArray(body.defender_app_ids)) {
    updatedAppIds = body.defender_app_ids.filter((id: string) =>
      userDefenderApps.some((a: any) => a.id === id),
    );
  }

  const updatedProject: ProjectRecord = {
    ...project,
    name:
      typeof body.name === "string" && body.name.trim().length > 0
        ? body.name.trim().slice(0, 100)
        : project.name,
    description:
      typeof body.description === "string"
        ? body.description.trim()
        : project.description,
    defender_app_ids: updatedAppIds,
    resources: Array.isArray(body.resources) ? body.resources : project.resources,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : project.tags,
    settings: body.settings && typeof body.settings === "object" ? body.settings : project.settings,
    updated_at: new Date().toISOString(),
  };

  updateTable(
    "projects",
    [{ field: "id", operator: "eq", value: projectId }],
    updatedProject,
    userId,
  );

  return c.json(updatedProject);
});

// 5. DELETE /api/projects/:id - Delete project
projectsRouter.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const projects = getTableRows("projects", userId) as ProjectRecord[];
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  deleteTable(
    "projects",
    [{ field: "id", operator: "eq", value: projectId }],
    userId,
  );

  // Delete associated custom issues
  deleteTable(
    "project_issues",
    [{ field: "project_id", operator: "eq", value: projectId }],
    userId,
  );

  return c.json({ success: true, message: "Project deleted successfully" });
});

// 6. GET /api/projects/:id/threats - Aggregated recent threats across attached WebDefender apps
projectsRouter.get("/:id/threats", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const projects = getTableRows("projects", userId) as ProjectRecord[];
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const attachedAppIds = Array.isArray(project.defender_app_ids)
    ? project.defender_app_ids
    : [];

  const userDefenderApps = getTableRows("defender_apps", userId);
  const appMap = new Map<string, string>();
  for (const app of userDefenderApps) {
    appMap.set(app.id, app.name);
  }

  const userEvents = getTableRows("defender_events", userId);
  const filteredEvents = userEvents
    .filter((evt: any) => attachedAppIds.includes(evt.app_id))
    .map((evt: any) => ({
      ...evt,
      app_name: appMap.get(evt.app_id) || "WebDefender App",
    }))
    .sort(
      (a: any, b: any) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime(),
    );

  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 50)));
  const offset = Math.max(0, Number(c.req.query("offset") || 0));

  const paginated = filteredEvents.slice(offset, offset + limit);

  return c.json({
    threats: paginated,
    total: filteredEvents.length,
    limit,
    offset,
  });
});

// 7. GET /api/projects/:id/issues - Aggregated automated security findings + custom issues
projectsRouter.get("/:id/issues", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");

  const projects = getTableRows("projects", userId) as ProjectRecord[];
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  const attachedAppIds = Array.isArray(project.defender_app_ids)
    ? project.defender_app_ids
    : [];

  const userDefenderApps = getTableRows("defender_apps", userId);
  const attachedApps = userDefenderApps.filter((app: any) =>
    attachedAppIds.includes(app.id),
  );

  const userConfigs = getTableRows("defender_config", userId);
  const userEvents = getTableRows("defender_events", userId);
  const customIssues = (getTableRows("project_issues", userId) as ProjectIssueRecord[])
    .filter((iss) => iss.project_id === projectId);

  const automatedIssues: any[] = [];

  // Finding: No apps attached
  if (attachedApps.length === 0) {
    automatedIssues.push({
      id: `auto_no_apps_${project.id}`,
      project_id: project.id,
      title: "No WebDefender apps attached to project",
      description: "Attach or create a WebDefender app to monitor active traffic and block cyber threats in this project.",
      severity: "low",
      status: "open",
      category: "security",
      is_automated: true,
      quick_fix_type: "attach_app",
      created_at: project.created_at,
    });
  }

  // Check each attached app
  for (const app of attachedApps) {
    const config = userConfigs.find((cfg: any) => cfg.app_id === app.id) || {};
    const appEvents = userEvents.filter((e: any) => e.app_id === app.id);

    // 1. Block Mode Disabled
    if (!app.block_mode_enabled) {
      automatedIssues.push({
        id: `auto_block_mode_${app.id}`,
        project_id: project.id,
        target_app_id: app.id,
        target_app_name: app.name,
        title: `Block Mode Disabled for "${app.name}"`,
        description: `"${app.name}" is currently operating in detection-only mode. Threats are logged but malicious traffic is NOT blocked.`,
        severity: "high",
        status: "open",
        category: "security",
        is_automated: true,
        quick_fix_type: "enable_block_mode",
        created_at: app.created_at || project.created_at,
      });
    }

    // 2. AbuseIPDB Missing
    if (!app.abuseipdb_api_key) {
      automatedIssues.push({
        id: `auto_abuseipdb_${app.id}`,
        project_id: project.id,
        target_app_id: app.id,
        target_app_name: app.name,
        title: `AbuseIPDB Reputation Key Missing for "${app.name}"`,
        description: "Configure an AbuseIPDB API key to enable automatic IP reputation checks and real-time blacklisting of known threat actors.",
        severity: "medium",
        status: "open",
        category: "config",
        is_automated: true,
        quick_fix_type: "configure_abuseipdb",
        created_at: app.created_at || project.created_at,
      });
    }

    // 3. Rate Limiting Disabled
    if (config.rate_limit_enabled === false) {
      automatedIssues.push({
        id: `auto_ratelimit_${app.id}`,
        project_id: project.id,
        target_app_id: app.id,
        target_app_name: app.name,
        title: `Rate Limiting Disabled for "${app.name}"`,
        description: "Rate limiting is disabled, leaving endpoints vulnerable to denial-of-service and credential stuffing attacks.",
        severity: "high",
        status: "open",
        category: "security",
        is_automated: true,
        quick_fix_type: "enable_rate_limit",
        created_at: app.created_at || project.created_at,
      });
    }

    // 4. Repeated Attack IPs that are not yet blocked
    const ipCounts: Record<string, { count: number; lastSeen: string; type: string }> = {};
    for (const evt of appEvents) {
      if (evt.ip && evt.blocked !== true) {
        if (!ipCounts[evt.ip]) {
          ipCounts[evt.ip] = { count: 0, lastSeen: evt.created_at, type: evt.type || "Threat" };
        }
        ipCounts[evt.ip].count += 1;
      }
    }

    const currentBlockedIps = Array.isArray(config.block_ips) ? config.block_ips : [];
    for (const [ip, info] of Object.entries(ipCounts)) {
      if (info.count >= 3 && !currentBlockedIps.includes(ip)) {
        automatedIssues.push({
          id: `auto_unblocked_ip_${app.id}_${ip.replace(/[^a-zA-Z0-9]/g, "_")}`,
          project_id: project.id,
          target_app_id: app.id,
          target_app_name: app.name,
          title: `Unblocked Offender IP ${ip} Detected on "${app.name}"`,
          description: `IP address ${ip} has generated ${info.count} unblocked threat events (${info.type}). Consider immediately blocking this IP address.`,
          severity: "critical",
          status: "open",
          category: "security",
          is_automated: true,
          quick_fix_type: "block_ip",
          quick_fix_payload: { ip, appId: app.id },
          created_at: info.lastSeen || new Date().toISOString(),
        });
      }
    }
  }

  // Combine automated issues and custom issues
  const allIssues = [...automatedIssues, ...customIssues];

  // Sort by severity (highest first: critical > high > medium > low > info), then unresolved first
  allIssues.sort((a, b) => {
    if (a.status === "resolved" && b.status !== "resolved") return 1;
    if (a.status !== "resolved" && b.status === "resolved") return -1;
    const weightA = SEVERITY_WEIGHTS[a.severity] ?? 0;
    const weightB = SEVERITY_WEIGHTS[b.severity] ?? 0;
    if (weightB !== weightA) return weightB - weightA;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  return c.json(allIssues);
});

// 8. POST /api/projects/:id/issues - Create custom project issue / task
projectsRouter.post("/:id/issues", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { title, description = "", severity = "medium", category = "task", target_app_id = null } = body;

  const projects = getTableRows("projects", userId) as ProjectRecord[];
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return c.json({ error: "Issue title is required" }, 400);
  }

  const validSeverities = ["critical", "high", "medium", "low", "info"];
  const validCategories = ["security", "config", "task", "bug", "enhancement"];

  const now = new Date().toISOString();
  const newIssue: ProjectIssueRecord = {
    id: randomUUID(),
    project_id: projectId,
    user_id: userId,
    title: title.trim().slice(0, 200),
    description: typeof description === "string" ? description.trim() : "",
    severity: validSeverities.includes(severity) ? (severity as any) : "medium",
    status: "open",
    category: validCategories.includes(category) ? (category as any) : "task",
    target_app_id: target_app_id || null,
    created_at: now,
    updated_at: now,
  };

  insertTable("project_issues", newIssue, userId);
  return c.json(newIssue, 201);
});

// 9. PUT /api/projects/:id/issues/:issueId - Update issue status/details
projectsRouter.put("/:id/issues/:issueId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const issueId = c.req.param("issueId");
  const body = await c.req.json().catch(() => ({}));

  const customIssues = getTableRows("project_issues", userId) as ProjectIssueRecord[];
  const issue = customIssues.find(
    (i) => i.id === issueId && i.project_id === projectId,
  );

  if (!issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  const validStatuses = ["open", "in_progress", "resolved"];
  const validSeverities = ["critical", "high", "medium", "low", "info"];

  const updatedIssue: ProjectIssueRecord = {
    ...issue,
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : issue.title,
    description: typeof body.description === "string" ? body.description.trim() : issue.description,
    status: validStatuses.includes(body.status) ? body.status : issue.status,
    severity: validSeverities.includes(body.severity) ? body.severity : issue.severity,
    updated_at: new Date().toISOString(),
  };

  updateTable(
    "project_issues",
    [{ field: "id", operator: "eq", value: issueId }],
    updatedIssue,
    userId,
  );

  return c.json(updatedIssue);
});

// 10. DELETE /api/projects/:id/issues/:issueId - Delete custom issue
projectsRouter.delete("/:id/issues/:issueId", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const issueId = c.req.param("issueId");

  const customIssues = getTableRows("project_issues", userId) as ProjectIssueRecord[];
  const issue = customIssues.find(
    (i) => i.id === issueId && i.project_id === projectId,
  );

  if (!issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  deleteTable(
    "project_issues",
    [{ field: "id", operator: "eq", value: issueId }],
    userId,
  );

  return c.json({ success: true, message: "Issue deleted successfully" });
});

// 11. POST /api/projects/:id/issues/quick-fix - 1-Click automatic remediation
projectsRouter.post("/:id/issues/quick-fix", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const body = await c.req.json().catch(() => ({}));
  const { fixType, targetAppId, ip, issueId } = body;

  const projects = getTableRows("projects", userId) as ProjectRecord[];
  const project = projects.find((p) => p.id === projectId);

  if (!project) {
    return c.json({ error: "Project not found" }, 404);
  }

  if (fixType === "enable_block_mode" && targetAppId) {
    const userDefenderApps = getTableRows("defender_apps", userId);
    const app = userDefenderApps.find((a: any) => a.id === targetAppId);
    if (!app) return c.json({ error: "App not found" }, 404);

    const updatedApp = { ...app, block_mode_enabled: true };
    updateTable(
      "defender_apps",
      [{ field: "id", operator: "eq", value: targetAppId }],
      updatedApp,
      userId,
    );
    await broadcastConfigUpdate(targetAppId).catch(() => {});
    return c.json({ success: true, message: `Block mode enabled for ${app.name}` });
  }

  if (fixType === "enable_rate_limit" && targetAppId) {
    const userConfigs = getTableRows("defender_config", userId);
    const config = userConfigs.find((cfg: any) => cfg.app_id === targetAppId) || {
      app_id: targetAppId,
      user_id: userId,
    };
    const updatedConfig = { ...config, rate_limit_enabled: true };
    upsertTable("defender_config", updatedConfig, userId, "app_id");
    await broadcastConfigUpdate(targetAppId).catch(() => {});
    return c.json({ success: true, message: "Rate limiting enabled" });
  }

  if (fixType === "block_ip" && targetAppId && ip) {
    const userConfigs = getTableRows("defender_config", userId);
    const config = userConfigs.find((cfg: any) => cfg.app_id === targetAppId) || {
      app_id: targetAppId,
      user_id: userId,
      block_ips: [],
    };
    const blockIps = Array.isArray(config.block_ips) ? [...config.block_ips] : [];
    if (!blockIps.includes(ip)) {
      blockIps.push(ip);
      const updatedConfig = { ...config, block_ips: blockIps };
      upsertTable("defender_config", updatedConfig, userId, "app_id");
      await broadcastConfigUpdate(targetAppId).catch(() => {});
    }
    return c.json({ success: true, message: `IP ${ip} has been blocked` });
  }

  if (fixType === "resolve_custom_issue" && issueId) {
    const customIssues = getTableRows("project_issues", userId) as ProjectIssueRecord[];
    const issue = customIssues.find((i) => i.id === issueId);
    if (issue) {
      updateTable(
        "project_issues",
        [{ field: "id", operator: "eq", value: issueId }],
        { ...issue, status: "resolved", updated_at: new Date().toISOString() },
        userId,
      );
      return c.json({ success: true, message: "Issue marked as resolved" });
    }
  }

  return c.json({ error: "Invalid fixType or parameters" }, 400);
});
