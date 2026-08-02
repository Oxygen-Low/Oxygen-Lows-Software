import { Request, Response, NextFunction } from "express";
import { getAnonClient } from "./supabase.ts";

export async function logAudit(
  eventType: string,
  details: Record<string, any>,
  userId?: string,
  ipAddress?: string,
) {
  try {
    const supabase = getAnonClient();
    const { error } = await supabase.from("audit_logs").insert({
      event_type: eventType,
      details,
      user_id: userId,
      ip_address: ipAddress,
    });
    if (error) {
      console.error("Failed to backup audit log to Supabase:", error);
    }
  } catch (err) {
    console.error("Failed to backup audit log to Supabase:", err);
  }
}

export function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const ipAddress = req.ip || req.socket.remoteAddress;
  const method = req.method;
  const url = req.url;

  // Track if request finished
  res.on("finish", () => {
    // Only log API requests or specific critical paths
    if (url.startsWith("/api/")) {
      const authHeader = req.headers.authorization;
      // We do not have user.id immediately available without parsing token,
      // but if the app sets it somewhere we could use it.
      // We will just log the event.
      logAudit(
        "api_request",
        {
          method,
          url,
          statusCode: res.statusCode,
          userAgent: req.get("user-agent"),
        },
        undefined,
        ipAddress,
      );
    }
  });

  next();
}
