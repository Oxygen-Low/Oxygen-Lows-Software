import { randomUUID } from "node:crypto";
import { getTableRows, saveTableRows } from "./dataStore.ts";

/** A reserved datastore owner keeps platform bans separate from customer data. */
export const DEFENDER_BANS_OWNER_ID = "__system__";

export interface DefenderBannedIp {
  id: string;
  ip: string;
  reason: string;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  revoked_at?: string | null;
  revoked_by?: string | null;
}

export function getActiveDefenderBannedIps(): DefenderBannedIp[] {
  return getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID)
    .filter((record: DefenderBannedIp) => record.active !== false)
    .sort(
      (a: DefenderBannedIp, b: DefenderBannedIp) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
}

export function publicDefenderBannedIp(record: DefenderBannedIp) {
  return {
    ip: record.ip,
    reason: record.reason,
    banned_at: record.created_at,
  };
}

export function addDefenderBannedIp(
  ip: string,
  reason: string,
  createdBy: string = "__system__",
): DefenderBannedIp {
  const records = getTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID);
  const cleanIp = (ip || "").trim().toLowerCase();
  const existing = records.find(
    (record: DefenderBannedIp) =>
      record.active !== false && record.ip.toLowerCase() === cleanIp,
  );
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const newBan: DefenderBannedIp = {
    id: randomUUID(),
    ip: cleanIp,
    reason: reason.trim(),
    active: true,
    created_by: createdBy,
    created_at: now,
    updated_at: now,
    revoked_at: null,
    revoked_by: null,
  };

  saveTableRows("defender_banned_ips", DEFENDER_BANS_OWNER_ID, [newBan, ...records]);
  return newBan;
}
