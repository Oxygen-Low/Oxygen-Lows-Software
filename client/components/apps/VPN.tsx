import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Globe, Shield, ShieldAlert, ShieldCheck, MapPin, Info, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

interface VPNServer {
  id: string;
  name: string;
  baseUrl: string;
  lat: number;
  lng: number;
}

const VPN_SERVERS: VPNServer[] = [
  { id: "va", name: "🇺🇸 US East (Virginia)", baseUrl: "https://oxygen-lows-software-vpn-virginia.onrender.com", lat: 37.4316, lng: -78.6569 },
  { id: "sg", name: "🇸🇬 Singapore", baseUrl: "https://oxygen-lows-software-vpn-singapore.onrender.com", lat: 1.3521, lng: 103.8198 },
  { id: "oh", name: "🇺🇸 US East (Ohio)", baseUrl: "https://oxygen-lows-software-vpn-ohio.onrender.com", lat: 40.4173, lng: -82.9071 },
  { id: "or", name: "🇺🇸 US West (Oregon)", baseUrl: "https://oxygen-lows-software-vpn-oregon.onrender.com", lat: 43.8041, lng: -120.5542 },
  { id: "fr", name: "🇩🇪 Germany (Frankfurt)", baseUrl: "https://oxygen-lows-software-vpn-frankfurt.onrender.com", lat: 50.1109, lng: 8.6821 }
];

export function VPNApp() {
  const [selectedServer, setSelectedServer] = useState<VPNServer | null>(null);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Listen for messages from C# wrapper
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data && data.type === "vpn_status") {
          if (data.status === "connected") {
            setStatus("connected");
            setErrorMessage("");
          } else if (data.status === "disconnected") {
            setStatus("disconnected");
            setErrorMessage("");
          } else if (data.status === "error") {
            setStatus("disconnected");
            setErrorMessage(data.error || "Failed to connect");
          }
        }
      } catch (e) {
        // Parse error, ignore
      }
    };

    // Edge/WebView2 specific event listener
    if (window.chrome && window.chrome.webview) {
      window.chrome.webview.addEventListener('message', handleMessage);
    } else {
      window.addEventListener('message', handleMessage);
    }

    return () => {
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.removeEventListener('message', handleMessage);
      } else {
        window.removeEventListener('message', handleMessage);
      }
    };
  }, []);

  const toggleConnection = async () => {
    if (status === "connected" || status === "connecting") {
      setStatus("disconnected");
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(JSON.stringify({
          command: "vpn_disconnect",
          serverName: selectedServer?.name
        }));
      }
    } else {
      if (!selectedServer) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setErrorMessage("Please sign in to use the VPN.");
        setStatus("disconnected");
        return;
      }

      setStatus("connecting");
      setErrorMessage("");
      if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(JSON.stringify({
          command: "vpn_connect",
          serverName: selectedServer.name,
          baseUrl: selectedServer.baseUrl,
          userId: session.user.id,
          accessToken: session.access_token
        }));
      } else {
        // Fallback for debugging in browser
        setTimeout(() => setStatus("connected"), 2000);
      }
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-500" />
              Locations
            </CardTitle>
            <CardDescription>Select a VPN server location</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {VPN_SERVERS.map(server => (
              <button
                key={server.id}
                disabled={status === "connecting" || status === "connected"}
                onClick={() => setSelectedServer(server)}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-xl border transition-all",
                  selectedServer?.id === server.id
                    ? "bg-cyan-500/10 border-cyan-500/50 text-cyan-400"
                    : "bg-slate-800/50 border-transparent hover:bg-slate-800 text-slate-300",
                  (status === "connecting" || status === "connected") && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-4 h-4" />
                  <span className="font-medium">{server.name}</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800 flex flex-col justify-center items-center p-8">
          <div className="text-center space-y-6 w-full">
            <div className="flex justify-center mb-8">
              {status === "connected" ? (
                <div className="w-32 h-32 rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-500 animate-pulse">
                  <ShieldCheck className="w-16 h-16 text-emerald-500" />
                </div>
              ) : status === "connecting" ? (
                <div className="w-32 h-32 rounded-full bg-amber-500/20 flex items-center justify-center border-2 border-amber-500 animate-pulse">
                  <Shield className="w-16 h-16 text-amber-500" />
                </div>
              ) : (
                <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center">
                  <ShieldAlert className="w-16 h-16 text-slate-500" />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-white">
                {status === "connected" ? "Protected" : status === "connecting" ? "Connecting..." : "Not Protected"}
              </h3>
              <p className="text-slate-400">
                {selectedServer ? `Selected: ${selectedServer.name}` : "Please select a server"}
              </p>
              {errorMessage && (
                <p className="text-red-400 text-sm">{errorMessage}</p>
              )}
            </div>

            <Button
              disabled={!selectedServer || status === "connecting"}
              onClick={toggleConnection}
              size="lg"
              className={cn(
                "w-full text-lg font-bold py-6 rounded-full transition-all",
                status === "connected"
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-cyan-500 hover:bg-cyan-600 text-white"
              )}
            >
              {status === "connected" ? "DISCONNECT" : "CONNECT"}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Info className="w-5 h-5 text-cyan-500" />
            What's Covered
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-300 mb-2">Supported</h4>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-emerald-400">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>Web browsing & privacy</span>
                </li>
                <li className="flex items-center gap-2 text-emerald-400">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>Geo-blocked websites</span>
                </li>
                <li className="flex items-center gap-2 text-emerald-400">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>Streaming services</span>
                </li>
                <li className="flex items-center gap-2 text-emerald-400">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>Secure public WiFi</span>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-300 mb-2">Not Supported</h4>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-amber-400">
                  <X className="w-4 h-4 flex-shrink-0" />
                  <span>Online gaming</span>
                </li>
                <li className="flex items-center gap-2 text-amber-400">
                  <X className="w-4 h-4 flex-shrink-0" />
                  <span>VoIP / video calls</span>
                </li>
                <li className="flex items-center gap-2 text-amber-400">
                  <X className="w-4 h-4 flex-shrink-0" />
                  <span>Torrenting</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
