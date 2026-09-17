import { describe, it, expect, beforeEach, vi } from "vitest";
import { Hono } from "hono";
import {
  modelsRouter,
  _resetModelsState,
  checkIsFriend,
  getHostConfig,
  saveHostConfig,
  getPinnedModels,
  savePinnedModels,
} from "./models";
import * as auth from "../lib/auth";
import * as dataStore from "../lib/dataStore";

describe("Models Server Relay Routes", () => {
  let app: Hono;

  beforeEach(() => {
    _resetModelsState();
    app = new Hono();
    app.route("/api/models", modelsRouter);
    vi.restoreAllMocks();
  });

  it("should reject non-desktop host registration with 403", async () => {
    const res = await app.request("/api/models/relay/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models: [] }),
    });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain("desktop app");
  });

  it("should reject unauthorized host registration when on desktop", async () => {
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue(null as any);
    const res = await app.request("/api/models/relay/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-oxygen-client": "desktop",
      },
      body: JSON.stringify({ models: [] }),
    });
    expect(res.status).toBe(401);
  });

  it("should register active host and declare shared models", async () => {
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "100",
      username: "AlphaHost",
      role: "user",
    } as any);

    const res = await app.request("/api/models/relay/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-token-100",
        "x-oxygen-client": "desktop",
      },
      body: JSON.stringify({
        models: [
          {
            id: "100_llama3",
            name: "Llama 3.2",
            model_id: "llama3.2:latest",
            provider: "ollama",
            modality: "text",
            sharing_mode: "public",
            max_tokens: 2048,
            max_concurrent: 2,
          },
          {
            id: "100_private_model",
            name: "Private Model",
            model_id: "secret:latest",
            provider: "lmstudio",
            modality: "text",
            sharing_mode: "private",
          },
        ],
        isGaming: false,
        masterPaused: false,
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.activeModelsCount).toBe(2);

    // Verify public directory listing
    const listRes = await app.request("/api/models/shared");
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    // Anon user sees public model, but NOT private model
    expect(listData.models.some((m: any) => m.id === "100_llama3")).toBe(true);
    expect(listData.models.some((m: any) => m.id === "100_private_model")).toBe(false);
  });

  it("should allow host to see their own private models in shared directory", async () => {
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "100",
      username: "AlphaHost",
      role: "user",
    } as any);

    await app.request("/api/models/relay/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-token-100",
        "x-oxygen-client": "desktop",
      },
      body: JSON.stringify({
        models: [
          {
            id: "100_private",
            name: "My Private LLM",
            model_id: "qwen:latest",
            provider: "ollama",
            sharing_mode: "private",
          },
        ],
      }),
    });

    // Owner checks directory
    const ownerRes = await app.request("/api/models/shared", {
      headers: { Authorization: "Bearer mock-token-100" },
    });
    const ownerData = await ownerRes.json();
    expect(ownerData.models.some((m: any) => m.id === "100_private")).toBe(true);

    // Different user checks directory
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "200",
      username: "BetaUser",
      role: "user",
    } as any);
    const otherRes = await app.request("/api/models/shared", {
      headers: { Authorization: "Bearer mock-token-200" },
    });
    const otherData = await otherRes.json();
    expect(otherData.models.some((m: any) => m.id === "100_private")).toBe(false);
  });

  it("should enforce friends-only sharing", async () => {
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "100",
      username: "AlphaHost",
      role: "user",
    } as any);

    await app.request("/api/models/relay/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer mock-token-100",
        "x-oxygen-client": "desktop",
      },
      body: JSON.stringify({
        models: [
          {
            id: "100_friend_model",
            name: "Friend LLM",
            model_id: "mistral:latest",
            provider: "ollama",
            sharing_mode: "friends",
          },
        ],
      }),
    });

    // Mock friendships: user 200 is a friend, user 300 is not
    vi.spyOn(dataStore, "getTableRows").mockImplementation((table, userId) => {
      if (table === "friendships" && String(userId) === "100") {
        return [
          { user_id: "100", friend_id: "200", status: "accepted" },
        ] as any;
      }
      return [];
    });

    // Friend (200) requests directory
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "200",
      username: "FriendUser",
    } as any);
    const friendRes = await app.request("/api/models/shared", {
      headers: { Authorization: "Bearer token-200" },
    });
    const friendData = await friendRes.json();
    expect(friendData.models.some((m: any) => m.id === "100_friend_model")).toBe(true);

    // Non-friend (300) requests directory
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "300",
      username: "Stranger",
    } as any);
    const strangerRes = await app.request("/api/models/shared", {
      headers: { Authorization: "Bearer token-300" },
    });
    const strangerData = await strangerRes.json();
    expect(strangerData.models.some((m: any) => m.id === "100_friend_model")).toBe(false);
  });

  it("should handle pin/unpin toggling correctly", async () => {
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "500",
      username: "TestUser",
    } as any);

    // Pin model
    const pinRes1 = await app.request("/api/models/pinned", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-500",
      },
      body: JSON.stringify({ modelId: "test_model_1" }),
    });
    const pinData1 = await pinRes1.json();
    expect(pinData1.success).toBe(true);
    expect(pinData1.pinned).toContain("test_model_1");
    expect(pinData1.isPinned).toBe(true);

    // Get pinned
    const getRes = await app.request("/api/models/pinned", {
      headers: { Authorization: "Bearer token-500" },
    });
    const getData = await getRes.json();
    expect(getData.pinned).toContain("test_model_1");

    // Unpin model
    const pinRes2 = await app.request("/api/models/pinned", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-500",
      },
      body: JSON.stringify({ modelId: "test_model_1" }),
    });
    const pinData2 = await pinRes2.json();
    expect(pinData2.pinned).not.toContain("test_model_1");
    expect(pinData2.isPinned).toBe(false);
  });

  it("should save and retrieve host configuration", async () => {
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "600",
      username: "HostConfigUser",
    } as any);

    const config = {
      enabled: true,
      masterPaused: false,
      autoPauseGaming: true,
      models: [
        { id: "m1", name: "Custom Qwen", model_id: "qwen2.5:7b" },
      ],
      customEndpoints: ["http://localhost:8000/v1"],
    };

    const saveRes = await app.request("/api/models/host/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-600",
      },
      body: JSON.stringify(config),
    });
    expect(saveRes.status).toBe(200);

    const getRes = await app.request("/api/models/host/config", {
      headers: { Authorization: "Bearer token-600" },
    });
    expect(getRes.status).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.enabled).toBe(true);
    expect(fetched.customEndpoints).toEqual(["http://localhost:8000/v1"]);
  });

  it("should update host live status (e.g. isGaming or masterPaused)", async () => {
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "700",
      username: "GamerHost",
    } as any);

    await app.request("/api/models/relay/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-700",
        "x-oxygen-client": "desktop",
      },
      body: JSON.stringify({
        models: [
          {
            id: "700_model",
            name: "Game Model",
            model_id: "m:latest",
            auto_pause_gaming: true,
          },
        ],
      }),
    });

    const statusRes = await app.request("/api/models/relay/status", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-700",
      },
      body: JSON.stringify({ isGaming: true }),
    });
    expect(statusRes.status).toBe(200);
    const statusData = await statusRes.json();
    expect(statusData.isGaming).toBe(true);

    // Verify model reflects paused status
    const listRes = await app.request("/api/models/shared");
    const listData = await listRes.json();
    const target = listData.models.find((m: any) => m.id === "700_model");
    expect(target.status).toBe("paused");
  });

  it("should show status 'disabled' to owner when model has enabled: false and hide it from non-owners", async () => {
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "800",
      username: "Host800",
      role: "user",
    } as any);

    await app.request("/api/models/relay/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-800",
        "x-oxygen-client": "desktop",
      },
      body: JSON.stringify({
        models: [
          {
            id: "800_disabled_model",
            name: "Disabled Model",
            model_id: "llama3:latest",
            enabled: false,
          },
          {
            id: "800_enabled_model",
            name: "Enabled Model",
            model_id: "mistral:latest",
            enabled: true,
          },
        ],
      }),
    });

    // Owner checks directory: should see disabled model with status: "disabled"
    const ownerRes = await app.request("/api/models/shared", {
      headers: { Authorization: "Bearer token-800" },
    });
    const ownerData = await ownerRes.json();
    const disabledForOwner = ownerData.models.find(
      (m: any) => m.id === "800_disabled_model",
    );
    expect(disabledForOwner).toBeDefined();
    expect(disabledForOwner.status).toBe("disabled");

    // Non-owner checks directory: should NOT see disabled model at all
    vi.spyOn(auth, "resolveUserFromToken").mockResolvedValue({
      id: "900",
      username: "User900",
      role: "user",
    } as any);
    const nonOwnerRes = await app.request("/api/models/shared", {
      headers: { Authorization: "Bearer token-900" },
    });
    const nonOwnerData = await nonOwnerRes.json();
    expect(
      nonOwnerData.models.some((m: any) => m.id === "800_disabled_model"),
    ).toBe(false);
    expect(
      nonOwnerData.models.some((m: any) => m.id === "800_enabled_model"),
    ).toBe(true);

    // Chat request on disabled model should return 403
    const chatRes = await app.request(
      "/api/models/shared/800_disabled_model/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token-800",
        },
        body: JSON.stringify({ prompt: "Hello" }),
      },
    );
    expect(chatRes.status).toBe(403);
    const chatData = await chatRes.json();
    expect(chatData.error).toContain("disabled");
  });
});
