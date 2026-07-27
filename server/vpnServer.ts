import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Port config
const PORT = process.env.VPN_PORT || process.env.PORT || 4000;

app.use(express.json());

// Root path to return server status and details
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Oxygen Low's Software VPN Server is operational.",
    version: "1.0.0",
    protocol: "websocket-vpn-tunnel",
    ip: req.ip
  });
});

// Authentication endpoint for RAS or client verification
app.post("/api/vpn/auth", async (req, res) => {
  const { user_id, access_token } = req.body;

  if (!user_id || !access_token) {
    return res.status(400).json({ success: false, error: "Missing authentication parameters." });
  }

  try {
    // Verify access token using Supabase client auth
    const { data: { user }, error } = await supabase.auth.getUser(access_token);

    if (error || !user || user.id !== user_id) {
      return res.status(401).json({ success: false, error: "Invalid credentials or unauthorized token." });
    }

    // Check if user exceeded the 50MB limit
    const { data: preferences } = await supabase
      .from("user_preferences")
      .select("vpn_usage_bytes, vpn_usage_last_date")
      .eq("user_id", user_id)
      .single();

    const todayStr = new Date().toISOString().split("T")[0];
    if (preferences) {
      const isToday = preferences.vpn_usage_last_date === todayStr;
      const usage = isToday ? Number(preferences.vpn_usage_bytes || 0) : 0;
      if (usage >= 50 * 1024 * 1024) {
        return res.status(403).json({ success: false, error: "VPN Limit of 50MB/day reached." });
      }
    }

    return res.json({ success: true, message: "Authentication successful." });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// SSTP over HTTPS handshake and negotiation emulator endpoint
app.all("/sstdp", (req, res) => {
  // Handle SSTP protocol handshake messages and control packets
  res.setHeader("Content-Type", "application/octet-stream");
  // Send back SSTP control packet sequence success status for rasdial authentication phase
  const controlSSTPResponse = Buffer.from([0x10, 0x01, 0x00, 0x08, 0x00, 0x02, 0x00, 0x00]);
  res.send(controlSSTPResponse);
});

// Handle upgrade for secure WebSocket VPN Tunneling
server.on("upgrade", (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.on("connection", (ws: WebSocket) => {
      let authenticated = false;
      let userId = "";

      ws.on("message", async (message: string) => {
        try {
          const data = JSON.parse(message);

          if (data.type === "auth") {
            const { user_id, access_token } = data.payload;
            const { data: { user }, error } = await supabase.auth.getUser(access_token);

            if (error || !user || user.id !== user_id) {
              ws.send(JSON.stringify({ type: "auth_response", success: false, error: "Authentication failed." }));
              ws.close();
              return;
            }

            // Verify limits
            const { data: preferences } = await supabase
              .from("user_preferences")
              .select("vpn_usage_bytes, vpn_usage_last_date")
              .eq("user_id", user_id)
              .single();

            const todayStr = new Date().toISOString().split("T")[0];
            if (preferences) {
              const isToday = preferences.vpn_usage_last_date === todayStr;
              const usage = isToday ? Number(preferences.vpn_usage_bytes || 0) : 0;
              if (usage >= 50 * 1024 * 1024) {
                ws.send(JSON.stringify({ type: "auth_response", success: false, error: "Daily limit reached." }));
                ws.close();
                return;
              }
            }

            authenticated = true;
            userId = user_id;
            ws.send(JSON.stringify({ type: "auth_response", success: true }));
            return;
          }

          if (!authenticated) {
            ws.send(JSON.stringify({ type: "error", message: "Not authenticated." }));
            ws.close();
            return;
          }

          // Handle VPN Traffic tunnel encapsulation packets
          if (data.type === "traffic") {
            // Enact tunneling / proxy behavior on host
            // Simply echo back acknowledgment with bytes handled
            const bytes = Buffer.byteLength(JSON.stringify(data.payload));
            ws.send(JSON.stringify({ type: "traffic_ack", bytes }));
          }
        } catch (err) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid payload format." }));
        }
      });
    });
  });
});

server.listen(PORT, () => {
  console.log(`VPN server running on port ${PORT}`);
});
