import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { projectsRouter } from "./projects";

const app = new Hono();
app.route("/api/projects", projectsRouter);

const mockStore: Record<string, any[]> = {
  projects: [],
  project_issues: [],
  defender_apps: [],
  defender_config: [],
  defender_events: [],
};

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async (token: string) => {
    if (token === "valid-user-token") {
      return {
        id: "user-123",
        email: "user@example.com",
        username: "testuser",
        role: "user",
      };
    }
    if (token === "other-user-token") {
      return {
        id: "user-999",
        email: "other@example.com",
        username: "otheruser",
        role: "user",
      };
    }
    return null;
  }),
}));

vi.mock("../lib/dataStore.ts", () => ({
  getTableRows: vi.fn((table: string, userId?: string) => {
    const rows = mockStore[table] || [];
    if (userId) {
      return rows.filter((r) => r.user_id === userId);
    }
    return rows;
  }),
  insertTable: vi.fn((table: string, row: any, userId?: string) => {
    if (!mockStore[table]) mockStore[table] = [];
    mockStore[table].push(row);
    return row;
  }),
  updateTable: vi.fn((table: string, filters: any[], updatedRow: any, userId?: string) => {
    if (!mockStore[table]) return;
    const filter = filters[0];
    const index = mockStore[table].findIndex((r) => r[filter.field] === filter.value);
    if (index !== -1) {
      mockStore[table][index] = { ...mockStore[table][index], ...updatedRow };
    }
  }),
  deleteTable: vi.fn((table: string, filters: any[], userId?: string) => {
    if (!mockStore[table]) return;
    const filter = filters[0];
    mockStore[table] = mockStore[table].filter((r) => r[filter.field] !== filter.value);
  }),
  upsertTable: vi.fn((table: string, row: any, userId?: string, onConflictField = "id") => {
    if (!mockStore[table]) mockStore[table] = [];
    const index = mockStore[table].findIndex(
      (r) => r[onConflictField] === row[onConflictField],
    );
    if (index !== -1) {
      mockStore[table][index] = { ...mockStore[table][index], ...row };
    } else {
      mockStore[table].push(row);
    }
  }),
}));

vi.mock("./webdefender.ts", () => ({
  broadcastConfigUpdate: vi.fn(async () => {}),
}));

describe("Projects API Routes", () => {
  beforeEach(() => {
    mockStore.projects = [
      {
        id: "proj-1",
        user_id: "user-123",
        name: "Test Project",
        description: "A test project description",
        defender_app_ids: ["app-1"],
        resources: [],
        tags: ["prod", "web"],
        settings: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    mockStore.project_issues = [
      {
        id: "issue-1",
        project_id: "proj-1",
        user_id: "user-123",
        title: "Test Custom Issue",
        description: "Review rate limits",
        severity: "high",
        status: "open",
        category: "security",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];
    mockStore.defender_apps = [
      {
        id: "app-1",
        user_id: "user-123",
        name: "Main Web App",
        block_mode_enabled: false,
        abuseipdb_api_key: "",
        created_at: new Date().toISOString(),
      },
    ];
    mockStore.defender_config = [
      {
        app_id: "app-1",
        user_id: "user-123",
        rate_limit_enabled: false,
        block_ips: [],
      },
    ];
    mockStore.defender_events = [
      {
        id: "evt-1",
        app_id: "app-1",
        user_id: "user-123",
        ip: "1.2.3.4",
        type: "SQL Injection",
        path: "/api/login",
        blocked: false,
        country: "US",
        created_at: new Date().toISOString(),
      },
      {
        id: "evt-2",
        app_id: "app-1",
        user_id: "user-123",
        ip: "1.2.3.4",
        type: "SQL Injection",
        path: "/api/login",
        blocked: false,
        country: "US",
        created_at: new Date().toISOString(),
      },
      {
        id: "evt-3",
        app_id: "app-1",
        user_id: "user-123",
        ip: "1.2.3.4",
        type: "SQL Injection",
        path: "/api/login",
        blocked: false,
        country: "US",
        created_at: new Date().toISOString(),
      },
    ];
  });

  it("rejects unauthorized access without bearer token", async () => {
    const res = await app.request("/api/projects");
    expect(res.status).toBe(401);
  });

  it("lists all projects with summary stats for authenticated user", async () => {
    const res = await app.request("/api/projects", {
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].name).toBe("Test Project");
    expect(data[0].attached_apps_count).toBe(1);
    expect(data[0].threat_count).toBe(3);
    expect(data[0].open_issues_count).toBeGreaterThan(0);
  });

  it("creates a new project with validation", async () => {
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "New Cyber Project",
        description: "Shielding core APIs",
        tags: ["api", "shield"],
        defender_app_ids: ["app-1"],
      }),
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe("New Cyber Project");
    expect(data.tags).toContain("api");
    expect(data.defender_app_ids).toContain("app-1");
  });

  it("returns 400 when creating a project without name", async () => {
    const res = await app.request("/api/projects", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("gets project details by ID with populated attached apps", async () => {
    const res = await app.request("/api/projects/proj-1", {
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("proj-1");
    expect(data.attached_apps).toBeDefined();
    expect(data.attached_apps.length).toBe(1);
    expect(data.attached_apps[0].name).toBe("Main Web App");
  });

  it("updates project metadata and attached apps", async () => {
    const res = await app.request("/api/projects/proj-1", {
      method: "PUT",
      headers: {
        Authorization: "Bearer valid-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Renamed Project",
        description: "Updated description",
        tags: ["updated"],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Renamed Project");
    expect(data.tags).toContain("updated");
  });

  it("computes automated issues (block mode, rate limit, repeat offender) and returns custom issues", async () => {
    const res = await app.request("/api/projects/proj-1/issues", {
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(res.status).toBe(200);
    const issues = await res.json();
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);

    // Should detect critical unblocked IP (1.2.3.4 has 3 events)
    const unblockedIpIssue = issues.find((i: any) => i.quick_fix_type === "block_ip");
    expect(unblockedIpIssue).toBeDefined();
    expect(unblockedIpIssue.severity).toBe("critical");

    // Should detect block mode disabled
    const blockModeIssue = issues.find((i: any) => i.quick_fix_type === "enable_block_mode");
    expect(blockModeIssue).toBeDefined();
    expect(blockModeIssue.severity).toBe("high");

    // Should include custom issue
    const custom = issues.find((i: any) => i.id === "issue-1");
    expect(custom).toBeDefined();
  });

  it("creates, updates, and deletes custom issues", async () => {
    // Create
    const createRes = await app.request("/api/projects/proj-1/issues", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "Audit SSH keys",
        description: "Rotate old dev keys",
        severity: "medium",
        category: "task",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.title).toBe("Audit SSH keys");

    // Update
    const updateRes = await app.request(`/api/projects/proj-1/issues/${created.id}`, {
      method: "PUT",
      headers: {
        Authorization: "Bearer valid-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(updateRes.status).toBe(200);
    const updated = await updateRes.json();
    expect(updated.status).toBe("resolved");

    // Delete
    const delRes = await app.request(`/api/projects/proj-1/issues/${created.id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(delRes.status).toBe(200);
  });

  it("applies 1-click quick-fix remediation", async () => {
    // Quick-fix 1: Enable block mode
    const fixBlockModeRes = await app.request("/api/projects/proj-1/issues/quick-fix", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fixType: "enable_block_mode",
        targetAppId: "app-1",
      }),
    });
    expect(fixBlockModeRes.status).toBe(200);
    expect(mockStore.defender_apps[0].block_mode_enabled).toBe(true);

    // Quick-fix 2: Block offending IP
    const fixBlockIpRes = await app.request("/api/projects/proj-1/issues/quick-fix", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fixType: "block_ip",
        targetAppId: "app-1",
        ip: "1.2.3.4",
      }),
    });
    expect(fixBlockIpRes.status).toBe(200);
    expect(mockStore.defender_config[0].block_ips).toContain("1.2.3.4");
  });

  it("fetches aggregated threats feed for attached apps", async () => {
    const res = await app.request("/api/projects/proj-1/threats", {
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.threats).toBeDefined();
    expect(data.threats.length).toBe(3);
    expect(data.threats[0].app_name).toBe("Main Web App");
  });

  it("deletes a project", async () => {
    const res = await app.request("/api/projects/proj-1", {
      method: "DELETE",
      headers: { Authorization: "Bearer valid-user-token" },
    });
    expect(res.status).toBe(200);
    expect(mockStore.projects.length).toBe(0);
  });
});
