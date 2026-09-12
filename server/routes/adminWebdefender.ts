import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { resolveUserFromToken } from "../lib/auth.ts";
import { getTableRows, saveTableRows } from "../lib/dataStore.ts";
import {
  DEFENDER_BANS_OWNER_ID,
  type DefenderBannedIp,
} from "../lib/defenderBannedIps.ts";
import { broadcastAllDefenderConfigUpdates } from "./webdefender.ts";

export const adminWebdefenderRouter = new Hono();

adminWebdefenderRouter.use("*", async (c, next) => {
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const user = token ? await resolveUserFromToken(token) : null;
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  if (user.role !== "admin" && String(user.id) !== "1") {
    return c.json({ error: "Forbidden: Admin access required" }, 403);
  }
  c.set("user" as any, user);
  await next();
});

function parseBan(body: any) {
  const ip = typeof body.ip === "string" ? body.ip.trim().toLowerCase() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!ip || !isIP(ip)) return { error: "A valid IPv4 or IPv6 address is required" };
  if (!reason) return { error: "A ban reason is required" };
  if (reason.length > 500) return { error: "Ban reason must be 500 characters or fewer" };
  return { ip, reason };
}

adminWebdefenderRouter.get("/banned-ips", (c) => {
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID)
    .sort((a: DefenderBannedIp, b: DefenderBannedIp) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return c.json({ banned_ips: records, total: records.length });
});

adminWebdefenderRouter.post("/banned-ips", async (c) => {
  const parsed = parseBan(await c.req.json().catch(() => ({})));
  if ("error" in parsed) return c.json(parsed, 400);
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID);
  if (records.some((record: DefenderBannedIp) => record.active !== false && record.ip === parsed.ip)) {
    return c.json({ error: "This IP address is already actively banned" }, 409);
  }
  const now = new Date().toISOString();
  const user: any = (c as any).get("user");
  const ban: DefenderBannedIp = {
    id: randomUUID(), ip: parsed.ip, reason: parsed.reason, active: true,
    created_by: String(user.id), created_at: now, updated_at: now,
    revoked_at: null, revoked_by: null,
  };
  saveTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID, [ban, ...records]);
  broadcastAllDefenderConfigUpdates().catch(() => {});
  return c.json({ banned_ip: ban }, 201);
});

adminWebdefenderRouter.patch("/banned-ips/:id", async (c) => {
  const parsed = parseBan(await c.req.json().catch(() => ({})));
  if ("error" in parsed) return c.json(parsed, 400);
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID);
  const record = records.find((item: DefenderBannedIp) => item.id === c.req.param("id"));
  if (!record) return c.json({ error: "Banned IP not found" }, 404);
  if (records.some((item: DefenderBannedIp) => item.id !== record.id && item.active !== false && item.ip === parsed.ip)) {
    return c.json({ error: "This IP address is already actively banned" }, 409);
  }
  Object.assign(record, { ...parsed, updated_at: new Date().toISOString() });
  saveTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID, records);
  broadcastAllDefenderConfigUpdates().catch(() => {});
  return c.json({ banned_ip: record });
});

adminWebdefenderRouter.delete("/banned-ips/:id", (c) => {
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID);
  const record = records.find((item: DefenderBannedIp) => item.id === c.req.param("id"));
  if (!record) return c.json({ error: "Banned IP not found" }, 404);
  const user: any = (c as any).get("user");
  Object.assign(record, { active: false, revoked_at: new Date().toISOString(), revoked_by: String(user.id), updated_at: new Date().toISOString() });
  saveTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID, records);
  broadcastAllDefenderConfigUpdates().catch(() => {});
  return c.json({ banned_ip: record });
});
