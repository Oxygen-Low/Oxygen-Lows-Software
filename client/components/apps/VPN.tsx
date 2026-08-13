import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus, Shield, Loader2, Server } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

export function VPNApp() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [configContent, setConfigContent] = useState("");

  const { data: configs, isLoading } = useQuery({
    queryKey: ["vpnConfigs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vpn_configs")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!session?.user?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (newConfig: { name: string; config_content: string }) => {
      const { data, error } = await supabase
        .from("vpn_configs")
        .insert([
          {
            user_id: session?.user?.id,
            name: newConfig.name,
            config_content: newConfig.config_content,
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

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !configContent.trim()) {
      toast.error("Please fill in both name and config content");
      return;
    }
    saveMutation.mutate({ name, config_content: configContent });
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
              Paste your WireGuard configuration file contents here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
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
                <Label htmlFor="config" className="text-slate-300">WireGuard Config</Label>
                <Textarea
                  id="config"
                  placeholder="[Interface]&#10;PrivateKey = ...&#10;Address = ..."
                  value={configContent}
                  onChange={(e) => setConfigContent(e.target.value)}
                  className="font-mono bg-slate-950 border-slate-800 text-white min-h-[250px] text-sm"
                />
              </div>
              <Button 
                type="submit" 
                disabled={saveMutation.isPending || !name.trim() || !configContent.trim()}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
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
              <ScrollArea className="h-[450px] px-6 pb-6">
                <div className="space-y-4">
                  {configs.map((config) => (
                    <div
                      key={config.id}
                      className="p-4 bg-slate-950 rounded-xl border border-slate-800 group"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <h4 className="font-medium text-white flex items-center gap-2 truncate text-lg">
                          {config.name}
                        </h4>
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
                      <div className="bg-slate-900 rounded-md p-3">
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
