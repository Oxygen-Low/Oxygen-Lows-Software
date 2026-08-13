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

vpnRouter.get("/geocode", async (c) => {
  const ip = c.req.query("ip");
  
  if (!ip) {
    return c.json({ error: "IP parameter is required" }, 400);
  }

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}`);
    const data = await res.json();
    return c.json(data);
  } catch (error) {
    console.error("Geocode error:", error);
    return c.json({ error: "Failed to geocode IP" }, 500);
  }
});
