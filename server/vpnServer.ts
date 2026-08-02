import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import axios from "axios";
import helmet from "helmet";
import net from "net";

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
  res.header("Access-Control-Allow-Origin", "*");
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

// Set up directly to avoid upgrade listener accumulation
wss.on("connection", (ws: WebSocket) => {
  let authenticated = false;
  let userId = "";
  let accessToken = "";
  let accumulatedBytes = 0;
  let intervalId: any = null;
  let proxyRequestCount = 0;
  const tunnels = new Map<string, net.Socket>();

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

    // Destroy all active tunnels
    for (const [id, socket] of tunnels.entries()) {
      socket.destroy();
    }
    tunnels.clear();

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

      if (data.type === "proxy_request") {
        if (proxyRequestCount >= 20) {
          ws.send(
            JSON.stringify({
              type: "proxy_error",
              id: data.id,
              error: "Too many concurrent proxy requests.",
            }),
          );
          return;
        }
        proxyRequestCount++;

        const requestHeaders = { ...data.headers };
        delete requestHeaders.host;

        const clientIp = (ws as any)._clientIp;
        if (clientIp) {
          requestHeaders["X-Forwarded-For"] = clientIp;
        }

        const requestData = data.body
          ? Buffer.from(data.body, "base64")
          : undefined;

        axios({
          method: data.method,
          url: data.url,
          headers: requestHeaders,
          data: requestData,
          responseType: "arraybuffer",
          timeout: 30000,
          validateStatus: () => true,
        })
          .then((resp) => {
            const respBuffer = Buffer.from(resp.data);
            const reqBytes = requestData ? requestData.byteLength : 0;
            accumulatedBytes += respBuffer.byteLength + reqBytes;

            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "proxy_response",
                  id: data.id,
                  status: resp.status,
                  statusText: resp.statusText,
                  headers: resp.headers,
                  body: respBuffer.toString("base64"),
                }),
              );
            }
          })
          .catch((err) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(
                JSON.stringify({
                  type: "proxy_error",
                  id: data.id,
                  error: err.message,
                }),
              );
            }
          })
          .finally(() => {
            proxyRequestCount--;
          });
        return;
      }

      if (data.type === "tunnel_open") {
        if (tunnels.size >= 10) {
          ws.send(
            JSON.stringify({
              type: "tunnel_error",
              id: data.id,
              error: "Too many concurrent tunnels.",
            }),
          );
          return;
        }
        const port = Number(data.port);
        if (isNaN(port) || port < 1 || port > 65535 || !data.host) {
          ws.send(
            JSON.stringify({
              type: "tunnel_error",
              id: data.id,
              error: "Invalid host or port.",
            }),
          );
          return;
        }

        const socket = net.createConnection({ host: data.host, port }, () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "tunnel_opened", id: data.id }));
          }
        });

        tunnels.set(data.id, socket);

        socket.on("data", (socketData) => {
          accumulatedBytes += socketData.byteLength;
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "tunnel_data",
                id: data.id,
                data: socketData.toString("base64"),
              }),
            );
          }
        });

        socket.on("error", (err) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "tunnel_error",
                id: data.id,
                error: err.message,
              }),
            );
          }
          tunnels.delete(data.id);
        });

        socket.on("close", () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "tunnel_close", id: data.id }));
          }
          tunnels.delete(data.id);
        });

        return;
      }

      if (data.type === "tunnel_data") {
        const socket = tunnels.get(data.id);
        if (socket && !socket.destroyed) {
          const buf = Buffer.from(data.data, "base64");
          accumulatedBytes += buf.byteLength;
          socket.write(buf);
        }
        return;
      }

      if (data.type === "tunnel_close") {
        const socket = tunnels.get(data.id);
        if (socket) {
          socket.destroy();
          tunnels.delete(data.id);
        }
        return;
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
    (ws as any)._clientIp = request.socket.remoteAddress;
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
