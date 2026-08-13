import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Shield, Loader2, Server, Clock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function VPNApp() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [configContent, setConfigContent] = useState("");
  const [vpnType, setVpnType] = useState("WireGuard");
  const [expiration, setExpiration] = useState("never");
  const [customDate, setCustomDate] = useState("");

  const { data: configs, isLoading } = useQuery({
    queryKey: ["vpnConfigs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vpn_configs")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;

      // Lazy deletion of expired configs
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
        // Fire and forget deletion
        supabase.from("vpn_configs").delete().in("id", expiredIds).then(({ error }) => {
          if (error) console.error("Failed to delete expired configs:", error);
        });
      }

      return validConfigs;
    },
    enabled: !!session?.user?.id,
  });

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full p-4 lg:p-6 pb-20">
      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-500" />
              Add New Config
            </CardTitle>
            <CardDescription className="text-slate-400">
              <div className="flex flex-col gap-2 items-start">
                <p>Paste your VPN configuration file contents here.</p>
                <Button variant="outline" size="sm" className="bg-slate-900 border-slate-700 text-slate-300 hover:text-white" asChild>
                  <a href="https://www.vpnbook.com" target="_blank" rel="noreferrer">
                    Get Free Config from VPNBook
                  </a>
                </Button>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
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
                  className="font-mono bg-slate-950 border-slate-800 text-white min-h-[200px] text-sm"
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

              <Button 
                type="submit" 
                disabled={saveMutation.isPending || !name.trim() || !configContent.trim()}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white mt-4"
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
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800 h-full flex flex-col">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-cyan-500" />
              Your Configurations
            </CardTitle>
            <CardDescription className="text-slate-400">
              Manage your saved VPN configs here. Connecting is currently unsupported.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-cyan-500" />
                Loading configs...
              </div>
            ) : !configs || configs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <Server className="w-12 h-12 opacity-20 mb-4" />
                <p>No configurations found.</p>
              </div>
            ) : (
              <ScrollArea className="h-[550px] px-6 pb-6">
                <div className="space-y-4">
                  {configs.map((config) => (
                    <div
                      key={config.id}
                      className="p-4 bg-slate-950 rounded-xl border border-slate-800 group relative"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex flex-col gap-1.5">
                          <h4 className="font-medium text-white flex items-center gap-2 truncate text-lg">
                            {config.name}
                          </h4>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="secondary" className="bg-slate-800 text-cyan-400 hover:bg-slate-700 text-xs font-normal">
                              {config.type || 'WireGuard'}
                            </Badge>
                            {config.expires_at && (
                              <Badge variant="secondary" className="bg-slate-800/80 text-orange-400/90 hover:bg-slate-700/80 text-[10px] font-normal flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Expires: {new Date(config.expires_at).toLocaleDateString()}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                          onClick={() => handleDelete(config.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="bg-slate-900 rounded-md p-3 mt-3">
                        <pre className="text-xs text-slate-400 font-mono whitespace-pre-wrap break-all max-h-32 overflow-hidden overflow-y-auto">
                          {config.config_content}
                        </pre>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
