import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Code,
  Plus,
  Trash2,
  Copy,
  Key
} from "lucide-react";
import { format } from "date-fns";

type OAuthClient = {
  id: string;
  client_name: string;
  redirect_uris: string;
  client_type: "public" | "confidential";
  created_at: string;
};

type OAuthGrant = {
  id: string;
  client_id: string;
  client_name: string;
  scopes: string;
  granted_at: string;
};

export function OauthApp() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState("developer");
  const [clients, setClients] = useState<OAuthClient[]>([]);
  const [grants, setGrants] = useState<OAuthGrant[]>([]);
  const [loading, setLoading] = useState(true);

  // New client form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRedirectUris, setNewRedirectUris] = useState("");
  const [newType, setNewType] = useState<"public" | "confidential">("confidential");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === "developer") {
        const { data, error } = await supabase.rpc("get_my_oauth_clients");
        if (error) throw error;
        setClients(data || []);
      } else {
        const { data, error } = await supabase.rpc("get_my_oauth_grants");
        if (error) throw error;
        setGrants(data || []);
      }
    } catch (error: any) {
      toast({
        title: "Error fetching data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    try {
      const { data, error } = await supabase.rpc("create_oauth_client", {
        p_name: newName,
        p_redirect_uris: newRedirectUris,
        p_client_type: newType,
      });

      if (error) throw error;

      toast({
        title: "Client created successfully",
        description: "Please save your client secret if applicable.",
      });

      setCreatedSecret(data.client_secret);
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error creating client",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm("Are you sure you want to delete this OAuth client? This action cannot be undone.")) return;
    try {
      const { error } = await supabase.rpc("delete_oauth_client", { p_client_id: id });
      if (error) throw error;
      toast({ title: "Client deleted" });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error deleting client",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleRevokeGrant = async (id: string) => {
    try {
      const { error } = await supabase.rpc("revoke_oauth_grant", { p_grant_id: id });
      if (error) throw error;
      toast({ title: "Access revoked" });
      fetchData();
    } catch (error: any) {
      toast({
        title: "Error revoking access",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `Copied ${label}` });
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-950 border border-slate-800 w-full justify-start overflow-x-auto">
          <TabsTrigger value="developer" className="flex gap-2">
            <Code className="w-4 h-4" /> My Apps
          </TabsTrigger>
          <TabsTrigger value="authorized" className="flex gap-2">
            <ShieldCheck className="w-4 h-4" /> Authorized
          </TabsTrigger>
        </TabsList>

        <TabsContent value="developer" className="mt-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-white">Developer Applications</h3>
              <p className="text-sm text-slate-400">Manage OAuth clients for your external applications.</p>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={(open) => {
              setIsCreateOpen(open);
              if (!open) {
                setCreatedSecret(null);
                setNewName("");
                setNewRedirectUris("");
              }
            }}>
              <DialogTrigger asChild>
                <Button className="bg-cyan-600 hover:bg-cyan-700">
                  <Plus className="w-4 h-4 mr-2" /> Create Client
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create New OAuth Client</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Register a new application to use Oxygen Low's Software Accounts for authentication.
                  </DialogDescription>
                </DialogHeader>

                {!createdSecret ? (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Application Name</Label>
                      <Input
                        id="name"
                        placeholder="My Awesome App"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="bg-slate-900 border-slate-800"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="redirect_uris">Redirect URIs (comma separated)</Label>
                      <Input
                        id="redirect_uris"
                        placeholder="https://myapp.com/callback"
                        value={newRedirectUris}
                        onChange={(e) => setNewRedirectUris(e.target.value)}
                        className="bg-slate-900 border-slate-800"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Client Type</Label>
                      <Select value={newType} onValueChange={(v: any) => setNewType(v)}>
                        <SelectTrigger className="bg-slate-900 border-slate-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="confidential">Confidential (Server-side)</SelectItem>
                          <SelectItem value="public">Public (SPA / Mobile)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        {newType === "confidential"
                          ? "Requires a client secret. Best for secure server-side apps."
                          : "No client secret required. Best for Single Page Apps or Mobile apps."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <p className="text-yellow-500 text-sm font-medium flex items-center gap-2">
                        <Key className="w-4 h-4" /> IMPORTANT: Store your client secret!
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        It will not be shown again. You can rotate it later if lost.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Client Secret</Label>
                      <div className="flex gap-2">
                        <Input
                          readOnly
                          value={createdSecret}
                          className="bg-slate-900 border-slate-800 font-mono"
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={() => copyToClipboard(createdSecret, "Client Secret")}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <DialogFooter>
                  {!createdSecret ? (
                    <Button
                      onClick={handleCreateClient}
                      disabled={!newName || !newRedirectUris}
                      className="bg-cyan-600 hover:bg-cyan-700"
                    >
                      Create
                    </Button>
                  ) : (
                    <Button onClick={() => setIsCreateOpen(false)}>Done</Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {loading ? (
              <div className="py-12 text-center text-slate-500">Loading clients...</div>
            ) : clients.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                <Code className="w-12 h-12 text-slate-700 mb-4" />
                <p className="text-slate-500 text-lg">You haven't created any OAuth apps yet.</p>
              </div>
            ) : (
              clients.map((client) => (
                <Card key={client.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                  <CardHeader className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-cyan-500/10 rounded-xl">
                          <Code className="w-6 h-6 text-cyan-500" />
                        </div>
                        <div>
                          <CardTitle className="text-xl text-white">{client.client_name}</CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              client.client_type === "confidential" ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                            }`}>
                              {client.client_type}
                            </span>
                            <span className="text-slate-500 text-xs">Created {format(new Date(client.created_at), "MMM d, yyyy")}</span>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                          onClick={() => handleDeleteClient(client.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 pt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-xs uppercase tracking-wider">Client ID</Label>
                        <div className="flex gap-2">
                          <code className="flex-1 p-2 bg-slate-950 rounded border border-slate-800 text-xs text-slate-300 font-mono break-all">
                            {client.id}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-white"
                            onClick={() => copyToClipboard(client.id, "Client ID")}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-xs uppercase tracking-wider">Redirect URIs</Label>
                        <div className="flex gap-2">
                          <code className="flex-1 p-2 bg-slate-950 rounded border border-slate-800 text-xs text-slate-300 font-mono truncate">
                            {client.redirect_uris}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-white"
                            onClick={() => copyToClipboard(client.redirect_uris, "Redirect URIs")}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="authorized" className="mt-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-white">Authorized Applications</h3>
            <p className="text-sm text-slate-400">Applications that have access to your account.</p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {loading ? (
              <div className="py-12 text-center text-slate-500">Loading authorized apps...</div>
            ) : grants.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                <ShieldCheck className="w-12 h-12 text-slate-700 mb-4" />
                <p className="text-slate-500 text-lg">You haven't authorized any apps yet.</p>
              </div>
            ) : (
              grants.map((grant) => (
                <Card key={grant.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">{grant.client_name}</CardTitle>
                        <CardDescription className="text-xs">
                          Authorized on {format(new Date(grant.granted_at), "MMM d, yyyy")}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-400 border-red-400/20 hover:bg-red-400/10"
                      onClick={() => handleRevokeGrant(grant.id)}
                    >
                      Revoke
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex flex-wrap gap-2 mt-2">
                      {grant.scopes.split(" ").map((scope) => (
                        <span key={scope} className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] text-slate-400 font-mono">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
