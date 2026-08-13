import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Shield, Loader2, Server, Clock, Map as MapIcon, Activity } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

// Leaflet
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Leaflet icon fix for Vite
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const createPulsingIcon = (ping: number | "error" | "loading") => {
  let colorClass = "slate";
  if (typeof ping === "number") {
    if (ping <= 50) colorClass = "green";
    else if (ping <= 80) colorClass = "yellow";
    else if (ping <= 120) colorClass = "orange";
    else colorClass = "red";
  } else if (ping === "error") {
    colorClass = "red";
  }

  return L.divIcon({
    className: 'custom-pulsing-icon',
    html: `<div class="pulse-icon"><div class="pulse-ring pulse-ring-${colorClass}"></div><div class="pulse-dot pulse-dot-${colorClass}"></div></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12]
  });
};
const agentIcon = L.divIcon({
  className: 'agent-icon',
  html: `<div class="agent-wrapper"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>`,
  iconSize: [32, 32],
  iconAnchor: [16, 16]
});

function MapController({ center, locked }: { center: [number, number] | null; locked: boolean }) {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.flyTo(center, 5, { duration: 1.5 });
    }
  }, [center, map]);

  useEffect(() => {
    if (locked) {
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.keyboard.disable();
    } else {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      map.scrollWheelZoom.enable();
      map.keyboard.enable();
    }
  }, [locked, map]);
  
  return null;
}

interface ServerStat {
  ip: string;
  lat: number | null;
  lon: number | null;
  city: string;
  country: string;
  ping: number | "error" | "loading";
}

export function VPNApp() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  
  // Form State
  const [name, setName] = useState("");
  const [configContent, setConfigContent] = useState("");
  const [vpnType, setVpnType] = useState("WireGuard");
  const [expiration, setExpiration] = useState("never");
  const [customDate, setCustomDate] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Map & Stats State
  const [serverStats, setServerStats] = useState<Record<string, ServerStat>>({});
  const statsRef = useRef<Record<string, ServerStat>>({});
  const [selectedLocation, setSelectedLocation] = useState<[number, number] | null>(null);
  const markerRefs = useRef<Record<string, any>>({});
  
  // Connection State
  const [connectedConfigId, setConnectedConfigId] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [homeLocation, setHomeLocation] = useState<[number, number] | null>(null);
  const [agentLocation, setAgentLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    runIPCCommand("get_location")
      .then((data: any) => {
        if (data && data.lat && data.lon) {
          setHomeLocation([data.lat, data.lon]);
          setAgentLocation([data.lat, data.lon]);
        }
      })
      .catch(err => console.error("Home geocode error via IPC", err));
  }, []);

  // IPC Helpers for VPN
  const runIPCCommand = async (commandLine: string) => {
    return new Promise<any>((resolve, reject) => {
      const webview = (window as any).chrome?.webview;
      if (!webview) return reject(new Error("Not running in desktop app context"));
      
      const id = Date.now().toString() + Math.random().toString();
      const listener = (event: any) => {
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (data.id === id) {
            webview.removeEventListener("message", listener);
            if (data.success) resolve(data.data);
            else reject(new Error(data.error));
          }
        } catch {}
      };
      webview.addEventListener("message", listener);
      webview.postMessage(JSON.stringify({ command: commandLine === "get_location" ? "get_location" : "run_command", commandLine, id }));
    });
  };

  const writeIPCFile = async (path: string, content: string) => {
    return new Promise<void>((resolve, reject) => {
      const webview = (window as any).chrome?.webview;
      if (!webview) return reject(new Error("Not running in desktop app context"));
      
      const id = Date.now().toString() + Math.random().toString();
      const listener = (event: any) => {
        try {
          const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
          if (data.id === id) {
            webview.removeEventListener("message", listener);
            if (data.success) resolve();
            else reject(new Error(data.error));
          }
        } catch {}
      };
      webview.addEventListener("message", listener);
      webview.postMessage(JSON.stringify({ command: "write_file", path, content, id }));
    });
  };

  const { data: configs, isLoading } = useQuery({
    queryKey: ["vpnConfigs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vpn_configs")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;

      const now = new Date();
      const expiredIds: string[] = [];
      const validConfigs = data.filter((config) => {
        if (config.expires_at && new Date(config.expires_at) < now) {
          expiredIds.push(config.id);
          return false;
        }
        return true;
      });

      if (expiredIds.length > 0) {
        supabase.from("vpn_configs").delete().in("id", expiredIds).then(({ error }) => {
          if (error) console.error("Failed to delete expired configs:", error);
        });
      }

      return validConfigs;
    },
    enabled: !!session?.user?.id,
  });

  const extractIP = (content: string, type: string) => {
    if (type === "WireGuard") {
      const match = content.match(/Endpoint\s*=\s*([^:\s]+)/i);
      return match ? match[1].trim() : null;
    } else {
      const match = content.match(/remote\s+([^\s]+)/i);
      return match ? match[1].trim() : null;
    }
  };

  const updatePingAndGeo = async () => {
    if (!configs || configs.length === 0) return;

    const newStats = { ...statsRef.current };
    let hasChanges = false;

    for (const config of configs) {
      const ip = extractIP(config.config_content, config.type);
      if (!ip) continue;

      if (!newStats[config.id]) {
        newStats[config.id] = { ip, lat: null, lon: null, city: "", country: "", ping: "loading" };
        hasChanges = true;
      }
      
      // Geocode if missing
      if (newStats[config.id].lat === null) {
        try {
          const geoRes = await fetch(`/api/vpn/geocode?ip=${ip}`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData.status === "success") {
              newStats[config.id].lat = geoData.lat;
              newStats[config.id].lon = geoData.lon;
              newStats[config.id].city = geoData.city;
              newStats[config.id].country = geoData.country;
              hasChanges = true;
            }
          }
        } catch (e) {
          console.error("Geocoding error", e);
        }
      }

      // Ping
      try {
        const pingRes = await fetch(`/api/vpn/ping?host=${ip}`);
        if (pingRes.ok) {
          const pingData = await pingRes.json();
          if (pingData.alive && pingData.time !== "unknown") {
            newStats[config.id].ping = Math.round(Number(pingData.time));
          } else {
            newStats[config.id].ping = "error";
          }
        } else {
          newStats[config.id].ping = "error";
        }
        hasChanges = true;
      } catch (e) {
        newStats[config.id].ping = "error";
        hasChanges = true;
      }
    }

    if (hasChanges) {
      statsRef.current = newStats;
      setServerStats(newStats);
    }
  };

  useEffect(() => {
    updatePingAndGeo();
    const interval = setInterval(updatePingAndGeo, 10000);
    return () => clearInterval(interval);
  }, [configs]);

  const saveMutation = useMutation({
    mutationFn: async (newConfig: { name: string; config_content: string; type: string; expires_at: string | null }) => {
      const { data, error } = await supabase
        .from("vpn_configs")
        .insert([
          {
            user_id: session?.user?.id,
            name: newConfig.name,
            config_content: newConfig.config_content,
            type: newConfig.type,
            expires_at: newConfig.expires_at
          }
        ])
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vpnConfigs"] });
      setName("");
      setConfigContent("");
      setVpnType("WireGuard");
      setExpiration("never");
      setCustomDate("");
      setIsDialogOpen(false);
      toast.success("VPN config saved successfully");
    },
    onError: (error: any) => {
      toast.error(`Failed to save config: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vpn_configs")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vpnConfigs"] });
      toast.success("VPN config deleted");
    },
    onError: (error: any) => {
      toast.error(`Failed to delete config: ${error.message}`);
    },
  });

  const getExpirationDate = (value: string, custom?: string) => {
    if (value === "never") return null;
    if (value === "custom") {
      return custom ? new Date(custom).toISOString() : null;
    }
    
    const date = new Date();
    switch (value) {
      case "1 day": date.setDate(date.getDate() + 1); break;
      case "3 days": date.setDate(date.getDate() + 3); break;
      case "1 week": date.setDate(date.getDate() + 7); break;
      case "1 month": date.setMonth(date.getMonth() + 1); break;
      case "1 year": date.setFullYear(date.getFullYear() + 1); break;
    }
    return date.toISOString();
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !configContent.trim()) {
      toast.error("Please fill in both name and config content");
      return;
    }
    if (expiration === "custom" && !customDate) {
      toast.error("Please provide a custom expiration date");
      return;
    }

    const expires_at = getExpirationDate(expiration, customDate);

    saveMutation.mutate({ 
      name, 
      config_content: configContent, 
      type: vpnType,
      expires_at
    });
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this config?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleConfigClick = (configId: string) => {
    const stat = serverStats[configId];
    if (stat && stat.lat && stat.lon) {
      setSelectedLocation([stat.lat, stat.lon]);
      setTimeout(() => {
        if (markerRefs.current[configId]) {
          markerRefs.current[configId].openPopup();
        }
      }, 500); // Wait for flyTo animation slightly before opening to prevent glitchy behavior
    }
  };

  const animateAgentTo = async (start: [number, number], end: [number, number], durationMs: number) => {
    return new Promise<void>((resolve) => {
      const startTime = performance.now();
      const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / durationMs, 1);
        const ease = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        
        const lat = start[0] + (end[0] - start[0]) * ease;
        const lon = start[1] + (end[1] - start[1]) * ease;
        
        setAgentLocation([lat, lon]);
        
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  };

  const setAgentDiving = (diving: boolean) => {
    const els = document.querySelectorAll('.agent-icon');
    els.forEach(el => {
      if (diving) {
        el.classList.add('diving');
        el.classList.remove('emerging');
      } else {
        el.classList.remove('diving');
        el.classList.add('emerging');
      }
    });
  };

  const handleConnect = async (config: any) => {
    setIsConnecting(true);
    try {
      const serverStat = serverStats[config.id];
      if (serverStat && serverStat.lat && serverStat.lon && agentLocation) {
        // Dive
        setAgentDiving(true);
        await new Promise(r => setTimeout(r, 600));

        // Move across globe
        await animateAgentTo(agentLocation, [serverStat.lat, serverStat.lon], 1500);

        // Emerge
        setAgentDiving(false);
        await new Promise(r => setTimeout(r, 600));
      }

      if (config.type === "WireGuard") {
        await writeIPCFile(`vpn_temp.conf`, config.config_content);
        const res = await runIPCCommand(`""C:\\Program Files\\WireGuard\\wireguard.exe" /installtunnelservice "%TEMP%\\vpn_temp.conf""`);
        if (res.stderr && res.stderr.toLowerCase().includes("is not recognized")) {
            throw new Error("WireGuard is not installed. Please install it to C:\\Program Files\\WireGuard");
        }
      } else {
        await writeIPCFile(`vpn_temp.ovpn`, config.config_content);
        runIPCCommand(`openvpn --config "%TEMP%\\vpn_temp.ovpn"`); 
      }
      setConnectedConfigId(config.id);
      toast.success(`Connected to ${config.name}`);
    } catch (e: any) {
      toast.error(`Connection failed: ${e.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (config: any) => {
    setIsConnecting(true);
    try {
      if (config.type === "WireGuard") {
        await runIPCCommand(`""C:\\Program Files\\WireGuard\\wireguard.exe" /uninstalltunnelservice vpn_temp"`);
      } else {
        await runIPCCommand(`taskkill /F /IM openvpn.exe`);
      }
      setConnectedConfigId(null);
      
      // Reverse animation
      if (homeLocation && agentLocation) {
        setAgentDiving(true);
        await new Promise(r => setTimeout(r, 600));

        await animateAgentTo(agentLocation, homeLocation, 1500);

        setAgentDiving(false);
        await new Promise(r => setTimeout(r, 600));
      }

      toast.success(`Disconnected from ${config.name}`);
    } catch (e: any) {
      toast.error(`Disconnect failed: ${e.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <style>{`
        .leaflet-control-attribution {
          background-color: rgba(15, 23, 42, 0.8) !important;
          color: #94a3b8 !important;
        }
        .leaflet-control-attribution a {
          color: #06b6d4 !important;
        }
        .pulse-icon {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
        }
        .pulse-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          position: absolute;
        }
        .pulse-ring {
          width: 100%;
          height: 100%;
          background-color: transparent;
          border-width: 2px;
          border-style: solid;
          border-radius: 50%;
          position: absolute;
          animation: pulse 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
        }
        .pulse-dot-green { background-color: #10b981; box-shadow: 0 0 10px rgba(16, 185, 129, 0.8); }
        .pulse-ring-green { border-color: rgba(16, 185, 129, 0.8); }
        .pulse-dot-yellow { background-color: #eab308; box-shadow: 0 0 10px rgba(234, 179, 8, 0.8); }
        .pulse-ring-yellow { border-color: rgba(234, 179, 8, 0.8); }
        .pulse-dot-orange { background-color: #f97316; box-shadow: 0 0 10px rgba(249, 115, 22, 0.8); }
        .pulse-ring-orange { border-color: rgba(249, 115, 22, 0.8); }
        .pulse-dot-red { background-color: #ef4444; box-shadow: 0 0 10px rgba(239, 68, 68, 0.8); }
        .pulse-ring-red { border-color: rgba(239, 68, 68, 0.8); }
        .pulse-dot-slate { background-color: #94a3b8; box-shadow: 0 0 10px rgba(148, 163, 184, 0.8); }
        .pulse-ring-slate { border-color: rgba(148, 163, 184, 0.8); }

        @keyframes pulse {
          0% { transform: scale(0.5); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }

        .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
        }
        .leaflet-popup-tip-container {
          display: none !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
          width: 320px !important;
        }
        .leaflet-popup-close-button {
          display: none !important;
        }
        .agent-icon {
          z-index: 1000 !important;
        }
        .agent-wrapper {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          background-color: #0f172a;
          border: 2px solid #06b6d4;
          border-radius: 50%;
          box-shadow: 0 0 15px rgba(6, 182, 212, 0.5);
          color: #06b6d4;
          transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease-in-out, filter 0.5s ease-in-out;
        }
        .agent-icon.diving .agent-wrapper {
          transform: scale(0.3) translateY(40px);
          opacity: 0;
          filter: brightness(0.2);
        }
      `}</style>
      
      {/* Map Section - Left/Center */}
      <div className="flex-1 relative bg-slate-950">
        <MapContainer 
          center={[20, 0]} 
          zoom={3} 
          scrollWheelZoom={true} 
          className="h-full w-full z-0"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          <MapController center={selectedLocation} locked={connectedConfigId !== null} />
          
          {configs?.map(config => {
            const stat = serverStats[config.id];
            if (stat && stat.lat && stat.lon) {
              return (
                <Marker 
                  key={config.id} 
                  position={[stat.lat, stat.lon]} 
                  icon={createPulsingIcon(stat.ping)}
                  ref={(r) => { if (r) markerRefs.current[config.id] = r; }}
                >
                  <Popup 
                    closeOnClick={connectedConfigId !== config.id} 
                    autoClose={connectedConfigId !== config.id} 
                    closeButton={false}
                  >
                    <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl flex flex-col gap-4">
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col gap-1 overflow-hidden">
                          <h4 className="font-bold text-white flex items-center gap-2 truncate text-lg">
                            {config.name}
                          </h4>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="bg-slate-800 text-cyan-400 hover:bg-slate-700">
                              {config.type || 'WireGuard'}
                            </Badge>
                            {stat.ping !== 'error' && stat.ping !== 'loading' && (
                              <Badge variant="secondary" className="bg-slate-800 text-emerald-400 hover:bg-slate-700">
                                {stat.ping}ms
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {stat.city && (
                        <div className="text-sm text-slate-400 flex items-center gap-2">
                          <MapIcon className="w-4 h-4 opacity-50" />
                          {stat.city}, {stat.country}
                        </div>
                      )}
                      
                      <div className="mt-2">
                        {connectedConfigId === config.id ? (
                          <Button 
                            onClick={(e) => { e.stopPropagation(); handleDisconnect(config); }}
                            disabled={isConnecting}
                            className="w-full bg-red-600 hover:bg-red-500 text-white font-bold shadow-lg shadow-red-500/20"
                          >
                            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Disconnect VPN"}
                          </Button>
                        ) : (
                          <Button 
                            onClick={(e) => { e.stopPropagation(); handleConnect(config); }}
                            disabled={isConnecting || (connectedConfigId !== null)}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-500/20"
                          >
                            {isConnecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Connect VPN"}
                          </Button>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            }
            return null;
          })}

          {agentLocation && (
            <Marker 
              position={agentLocation} 
              icon={agentIcon} 
            />
          )}
        </MapContainer>
      </div>

      {/* Configurations Sidebar - Right */}
      <div className="w-full max-w-[400px] border-l border-slate-800 bg-slate-900/90 backdrop-blur-sm flex flex-col z-10 shadow-2xl relative">
        <div className="p-6 border-b border-slate-800 flex flex-col gap-4">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-500" />
              Your Configurations
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Manage and monitor your VPN profiles.
            </p>
          </div>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full bg-cyan-600 hover:bg-cyan-500 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Create New Config
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-white sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-cyan-500" />
                  Add New VPN Config
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  <div className="flex flex-col gap-2 items-start mt-2">
                    <p>Paste your VPN configuration file contents here.</p>
                    <Button variant="outline" size="sm" className="bg-slate-950 border-slate-700 text-slate-300 hover:text-white" asChild>
                      <a href="https://www.vpnbook.com" target="_blank" rel="noreferrer">
                        Get Free Config from VPNBook
                      </a>
                    </Button>
                  </div>
                </DialogDescription>
              </DialogHeader>
              
              <form onSubmit={handleSave} className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-slate-300">Config Name</Label>
                    <Input
                      id="name"
                      placeholder="e.g. My Home VPN"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vpnType" className="text-slate-300">VPN Type</Label>
                    <Select value={vpnType} onValueChange={setVpnType}>
                      <SelectTrigger className="bg-slate-950 border-slate-800 text-white text-left">
                        <SelectValue placeholder="Select VPN Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WireGuard">WireGuard (Recommended)</SelectItem>
                        <SelectItem value="OpenVPN">OpenVPN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="config" className="text-slate-300">Configuration Content</Label>
                  <Textarea
                    id="config"
                    placeholder={vpnType === "WireGuard" ? "[Interface]&#10;PrivateKey = ...&#10;Address = ..." : "client&#10;dev tun&#10;proto udp&#10;..."}
                    value={configContent}
                    onChange={(e) => setConfigContent(e.target.value)}
                    className="font-mono bg-slate-950 border-slate-800 text-white min-h-[180px] text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiration" className="text-slate-300">Auto Delete / Expiration</Label>
                  <div className="flex gap-4">
                    <Select value={expiration} onValueChange={setExpiration}>
                      <SelectTrigger className="bg-slate-950 border-slate-800 text-white flex-1 text-left">
                        <SelectValue placeholder="Select Expiration" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="never">Never (Keep Forever)</SelectItem>
                        <SelectItem value="1 day">1 Day</SelectItem>
                        <SelectItem value="3 days">3 Days</SelectItem>
                        <SelectItem value="1 week">1 Week</SelectItem>
                        <SelectItem value="1 month">1 Month</SelectItem>
                        <SelectItem value="1 year">1 Year</SelectItem>
                        <SelectItem value="custom">Custom Date</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    {expiration === "custom" && (
                      <Input
                        type="datetime-local"
                        value={customDate}
                        onChange={(e) => setCustomDate(e.target.value)}
                        className="bg-slate-950 border-slate-800 text-white flex-1"
                      />
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <Button 
                    type="submit" 
                    disabled={saveMutation.isPending || !name.trim() || !configContent.trim()}
                    className="w-full bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    {saveMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4 mr-2" />
                        Save Configuration
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="flex-1 overflow-hidden relative">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 absolute inset-0">
              <Loader2 className="w-8 h-8 animate-spin mb-4 text-cyan-500" />
              Loading configs...
            </div>
          ) : !configs || configs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 p-8 text-center absolute inset-0">
              <Server className="w-12 h-12 opacity-20 mb-4" />
              <p>No configurations found.</p>
              <p className="text-sm opacity-70 mt-2">Click "Create New Config" above to get started.</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="p-6 space-y-4">
                {configs.map((config) => {
                  const stat = serverStats[config.id];
                  return (
                    <div
                      key={config.id}
                      onClick={() => handleConfigClick(config.id)}
                      className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-slate-700 hover:bg-slate-950 transition-colors group relative cursor-pointer"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-col gap-1.5 overflow-hidden">
                          <h4 className="font-bold text-white flex items-center gap-2 truncate text-base">
                            {config.name}
                          </h4>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="bg-slate-800 text-cyan-400 hover:bg-slate-700 text-[10px] font-normal px-1.5 py-0">
                              {config.type || 'WireGuard'}
                            </Badge>
                            
                            {stat && (
                              <Badge 
                                variant="secondary" 
                                className={`bg-slate-800 hover:bg-slate-700 text-[10px] font-normal px-1.5 py-0 flex items-center gap-1 ${stat.ping === 'error' ? 'text-red-400' : stat.ping === 'loading' ? 'text-slate-400' : 'text-emerald-400'}`}
                              >
                                <Activity className="w-2.5 h-2.5" />
                                {stat.ping === 'loading' ? 'Pinging...' : stat.ping === 'error' ? 'Offline' : `${stat.ping}ms`}
                              </Badge>
                            )}

                            {config.expires_at && (
                              <Badge variant="secondary" className="bg-slate-800/80 text-orange-400/90 hover:bg-slate-700/80 text-[10px] font-normal px-1.5 py-0 flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                Expires: {new Date(config.expires_at).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-500 hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0 -mt-1 -mr-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(config.id);
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      
                      {stat && stat.city && (
                        <div className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                          <MapIcon className="w-3 h-3 opacity-50" />
                          {stat.city}, {stat.country}
                        </div>
                      )}

                      <div className="bg-slate-900 rounded-md p-2.5 mt-3 border border-slate-800/50">
                        <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap break-all max-h-24 overflow-hidden overflow-y-auto">
                          {config.config_content}
                        </pre>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
