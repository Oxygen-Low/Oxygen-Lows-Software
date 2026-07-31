import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import axios from "axios";
import helmet from "helmet";

config();

// Polyfill native WebSocket constructor for Supabase realtime-js client under Node < 22 (e.g. CI Node 20)
if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

app.use(helmet());
app.use(express.json());

// Root path to return server status and details
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Oxygen Low's Software VPN Server is operational.",
    version: "1.0.0",
    protocol: "websocket-vpn-tunnel",
    ip: req.ip,
  });
});

// Authentication endpoint for RAS or client verification
app.post("/api/vpn/auth", async (req, res) => {
  const { user_id, access_token } = req.body;

  if (!user_id || !access_token) {
    return res
      .status(400)
      .json({ success: false, error: "Missing authentication parameters." });
  }

  try {
    const {
      data: { user },
      error,
    } = await anonClient.auth.getUser(access_token);

    if (error || !user || user.id !== user_id) {
      return res.status(401).json({
        success: false,
        error: "Invalid credentials or unauthorized token.",
      });
    }

    const resp = await axios.get(
      `${SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${user_id}&select=vpn_usage_bytes,vpn_usage_last_date`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${access_token}`,
        },
      },
    );

    const todayStr = new Date().toISOString().split("T")[0];
    if (resp.data && resp.data.length > 0) {
      const preferences = resp.data[0];
      const isToday = preferences.vpn_usage_last_date === todayStr;
      const usage = isToday ? Number(preferences.vpn_usage_bytes || 0) : 0;
      if (usage >= 50 * 1024 * 1024) {
        return res
          .status(403)
          .json({ success: false, error: "VPN Limit of 50MB/day reached." });
      }
    }

    return res.json({ success: true, message: "Authentication successful." });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// SSTP over HTTPS handshake and negotiation emulator endpoint with authentication check
app.all("/sstdp", async (req, res) => {
  const authHeader = req.headers.authorization;
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : undefined;
  const userId = req.headers["x-user-id"] as string;

  if (!token || !userId) {
    return res
      .status(401)
      .json({ success: false, error: "Unauthorized SSTP connection request." });
  }

  try {
    const {
      data: { user },
      error,
    } = await anonClient.auth.getUser(token);

    if (error || !user || user.id !== userId) {
      return res
        .status(401)
        .json({ success: false, error: "Authentication failed." });
    }

    const resp = await axios.get(
      `${SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${userId}&select=vpn_usage_bytes,vpn_usage_last_date`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`,
        },
      },
    );

    const todayStr = new Date().toISOString().split("T")[0];
    if (resp.data && resp.data.length > 0) {
      const preferences = resp.data[0];
      const isToday = preferences.vpn_usage_last_date === todayStr;
      const usage = isToday ? Number(preferences.vpn_usage_bytes || 0) : 0;
      if (usage >= 50 * 1024 * 1024) {
        return res
          .status(403)
          .json({ success: false, error: "VPN limit reached." });
      }
    }

    res.setHeader("Content-Type", "application/octet-stream");
    const controlSSTPResponse = Buffer.from([
      0x10, 0x01, 0x00, 0x08, 0x00, 0x02, 0x00, 0x00,
    ]);
    res.send(controlSSTPResponse);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Set up directly to avoid upgrade listener accumulation
wss.on("connection", (ws: WebSocket) => {
  let authenticated = false;
  let userId = "";
  let accessToken = "";
  let accumulatedBytes = 0;
  let intervalId: any = null;

  async function flushUsage() {
    if (accumulatedBytes > 0 && userId && accessToken) {
      const bytesToSave = accumulatedBytes;
      accumulatedBytes = 0;

      try {
        const todayStr = new Date().toISOString().split("T")[0];

        const getUrl = `${SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${userId}&select=vpn_usage_bytes`;
        const resp = await axios.get(getUrl, {
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${accessToken}`,
          },
        });

        let currentUsage = 0;
        if (resp.data && resp.data.length > 0) {
          currentUsage = Number(resp.data[0].vpn_usage_bytes || 0);
        }

        const newTotal = currentUsage + bytesToSave;

        const fullPayload = {
          p_user_id: userId,
          p_vpn_usage_bytes: newTotal,
          p_vpn_usage_last_date: todayStr,
        };

        await axios.post(
          `${SUPABASE_URL}/rest/v1/rpc/upsert_user_preferences`,
          fullPayload,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (err: any) {
        console.error(`Error flushing usage: ${err.message}`);
        accumulatedBytes += bytesToSave;
      }
    }
  }

  intervalId = setInterval(flushUsage, 15000);

  ws.on("close", async () => {
    clearInterval(intervalId);
    await flushUsage();
  });

  ws.on("message", async (message: string) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "auth") {
        const { user_id, access_token } = data.payload;
        const {
          data: { user },
          error,
        } = await anonClient.auth.getUser(access_token);

        if (error || !user || user.id !== user_id) {
          ws.send(
            JSON.stringify({
              type: "auth_response",
              success: false,
              error: "Authentication failed.",
            }),
          );
          ws.close();
          return;
        }

        const resp = await axios.get(
          `${SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${user_id}&select=vpn_usage_bytes,vpn_usage_last_date`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${access_token}`,
            },
          },
        );

        const todayStr = new Date().toISOString().split("T")[0];
        if (resp.data && resp.data.length > 0) {
          const preferences = resp.data[0];
          const isToday = preferences.vpn_usage_last_date === todayStr;
          const usage = isToday ? Number(preferences.vpn_usage_bytes || 0) : 0;
          if (usage >= 50 * 1024 * 1024) {
            ws.send(
              JSON.stringify({
                type: "auth_response",
                success: false,
                error: "Daily limit reached.",
              }),
            );
            ws.close();
            return;
          }
        }

        authenticated = true;
        userId = user_id;
        accessToken = access_token;
        ws.send(JSON.stringify({ type: "auth_response", success: true }));
        return;
      }

      if (!authenticated) {
        ws.send(
          JSON.stringify({ type: "error", message: "Not authenticated." }),
        );
        ws.close();
        return;
      }

      if (data.type === "traffic") {
        const bytes = Buffer.byteLength(JSON.stringify(data.payload));
        accumulatedBytes += bytes;
        ws.send(JSON.stringify({ type: "traffic_ack", bytes }));
      }
    } catch (err) {
      ws.send(
        JSON.stringify({ type: "error", message: "Invalid payload format." }),
      );
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

// Guard server.listen behind module entrypoint checks for clean testing
if (
  process.argv[1] === import.meta.filename ||
  process.argv[1]?.endsWith("vpnServer.ts")
) {
  const PORT = process.env.VPN_PORT || process.env.PORT || 4000;
  server.listen(PORT, () => {
    console.log(`VPN server running on port ${PORT}`);
  });
}

export { app, server };
