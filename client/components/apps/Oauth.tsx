import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import {
  Code,
  Plus,
  Trash2,
  Copy,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Key,
  Globe,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export function OauthApp() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"confidential" | "public">(
    "confidential",
  );
  const [newRedirectUris, setNewRedirectUris] = useState("");
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // @ts-ignore
      const { data: clientsData, error: clientsError } = await (
        supabase.auth as any
      ).oauth.listClients();
      if (clientsError) throw clientsError;
      setClients(clientsData || []);

      // @ts-ignore
      const { data: grantsData, error: grantsError } = await (
        supabase.auth as any
      ).oauth.listAuthorizedApps();
      if (grantsError) throw grantsError;
      setGrants(grantsData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async () => {
    setIsSubmitting(true);
    try {
      // @ts-ignore
      const { data, error } = await supabase.auth.oauth.createClient({
        name: newName,
        type: newType,
        redirect_uris: newRedirectUris.split(",").map((uri) => uri.trim()),
      });

      if (error) throw error;

      setCreatedSecret(data.client_secret);
      fetchData();
      toast({
        title: "Success",
        description: "Application registered successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm("Are you sure you want to delete this item?")) return;
    setIsSubmitting(true);
    try {
      // @ts-ignore
      const { error } = await supabase.auth.oauth.deleteClient(id);
      if (error) throw error;

      fetchData();
      toast({
        title: "Success",
        description: "Application deleted",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeGrant = async (id: string) => {
    setIsSubmitting(true);
    try {
      // @ts-ignore
      const { error } = await supabase.auth.oauth.revokeAuthorization(id);
      if (error) throw error;

      fetchData();
      toast({
        title: "Success",
        description: "Authorization revoked",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: `${label} copied to clipboard`,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">
          OAuth Applications
        </h2>
        <p className="text-slate-400">
          Manage your OAuth clients and authorized applications.
        </p>
      </div>

      <Tabs defaultValue="clients" className="w-full">
        <TabsList className="bg-slate-900 border-slate-800">
          <TabsTrigger value="clients">My Clients</TabsTrigger>
          <TabsTrigger value="authorized">Authorized Apps</TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-6 space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">My Clients</h3>
            <Dialog
              open={isCreateOpen}
              onOpenChange={(open) => {
                setIsCreateOpen(open);
                if (!open) {
                  setNewName("");
                  setNewRedirectUris("");
                  setCreatedSecret(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button className="bg-cyan-600 hover:bg-cyan-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Register New App
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-900 border-slate-800 text-white">
                <DialogHeader>
                  <DialogTitle>Register New App</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Create a new OAuth application to integrate with Oxygen Low.
                  </DialogDescription>
                </DialogHeader>

                {!createdSecret ? (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Application Name</Label>
                      <Input
                        id="name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="My Awesome App"
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="uris">
                        Redirect URIs (comma separated)
                      </Label>
                      <Input
                        id="uris"
                        value={newRedirectUris}
                        onChange={(e) => setNewRedirectUris(e.target.value)}
                        placeholder="http://localhost:3000/callback"
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Application Type</Label>
                      <Select
                        value={newType}
                        onValueChange={(val: any) => setNewType(val)}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="confidential">
                            Confidential (Server-side)
                          </SelectItem>
                          <SelectItem value="public">
                            Public (SPA / Mobile)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-slate-500">
                        {newType === "confidential"
                          ? "Requires a client secret. Best for secure server apps."
                          : "No client secret required. Best for SPAs or mobile apps."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <p className="text-yellow-500 text-sm font-medium flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        IMPORTANT: Store your client secret!
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        It won't be shown again. You can reset it later if lost.
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
                          onClick={() =>
                            copyToClipboard(createdSecret, "Client Secret")
                          }
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
                      disabled={!newName || !newRedirectUris || isSubmitting}
                      className="bg-cyan-600 hover:bg-cyan-700"
                    >
                      Add
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
              <div className="py-12 text-center text-slate-500">Loading...</div>
            ) : clients.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                <Code className="w-12 h-12 text-slate-700 mb-4" />
                <p className="text-slate-500 text-lg">
                  You haven't created any OAuth applications yet.
                </p>
              </div>
            ) : (
              clients.map((client) => (
                <Card
                  key={client.id}
                  className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <CardHeader className="p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-cyan-500/10 rounded-xl">
                          <Code className="w-6 h-6 text-cyan-500" />
                        </div>
                        <div>
                          <CardTitle className="text-xl text-white">
                            {client.client_name}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2 mt-1">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                client.client_type === "confidential"
                                  ? "bg-purple-500/10 text-purple-400"
                                  : "bg-blue-500/10 text-blue-400"
                              }`}
                            >
                              {client.client_type}
                            </span>
                            <span className="text-slate-500 text-xs">
                              Created{" "}
                              {format(
                                new Date(client.created_at),
                                "MMM d, yyyy",
                              )}
                            </span>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-slate-400 hover:text-red-400 hover:bg-red-400/10"
                          onClick={() => handleDeleteClient(client.id)}
                          disabled={isSubmitting}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 pt-0 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-xs uppercase tracking-wider">
                          Client ID
                        </Label>
                        <div className="flex gap-2">
                          <code className="flex-1 p-2 bg-slate-950 rounded border border-slate-800 text-xs text-slate-300 font-mono break-all">
                            {client.id}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-white"
                            onClick={() =>
                              copyToClipboard(client.id, "Client ID")
                            }
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-slate-500 text-xs uppercase tracking-wider">
                          Redirect URIs
                        </Label>
                        <div className="flex gap-2">
                          <code className="flex-1 p-2 bg-slate-950 rounded border border-slate-800 text-xs text-slate-300 font-mono truncate">
                            {client.redirect_uris}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-white"
                            onClick={() =>
                              copyToClipboard(
                                client.redirect_uris,
                                "Redirect URIs",
                              )
                            }
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
            <h3 className="text-lg font-semibold text-white">
              Authorized Apps
            </h3>
            <p className="text-sm text-slate-400">
              Applications that have access to your account.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {loading ? (
              <div className="py-12 text-center text-slate-500">Loading...</div>
            ) : grants.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center bg-slate-900/30 rounded-xl border border-dashed border-slate-800">
                <ShieldCheck className="w-12 h-12 text-slate-700 mb-4" />
                <p className="text-slate-500 text-lg">
                  You haven't authorized any applications yet.
                </p>
              </div>
            ) : (
              grants.map((grant) => (
                <Card
                  key={grant.id}
                  className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-white">
                          {grant.client_name}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          Authorized on{" "}
                          {format(new Date(grant.granted_at), "MMM d, yyyy")}
                        </CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-400 border-red-400/20 hover:bg-red-400/10"
                      onClick={() => handleRevokeGrant(grant.id)}
                      disabled={isSubmitting}
                    >
                      Revoke
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="flex flex-wrap gap-2 mt-2">
                      {grant.scopes.split(" ").map((scope: string) => (
                        <span
                          key={scope}
                          className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-[10px] text-slate-400 font-mono"
                        >
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
