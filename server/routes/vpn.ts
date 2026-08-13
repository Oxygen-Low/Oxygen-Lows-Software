import { Hono } from "hono";
import ping from "ping";

export const vpnRouter = new Hono();

vpnRouter.get("/ping", async (c) => {
  const host = c.req.query("host");

  if (!host) {
    return c.json({ error: "Host parameter is required" }, 400);
  }

  try {
    // Ping the host. We use timeout of 2 seconds to not block too long.
    const res = await ping.promise.probe(host, {
      timeout: 2,
    });

    return c.json({
      host: res.host,
      alive: res.alive,
      time: res.time, // Time in ms, or "unknown"
    });
  } catch (error) {
    console.error("Ping error:", error);
    return c.json({ error: "Failed to ping host" }, 500);
  }
});
