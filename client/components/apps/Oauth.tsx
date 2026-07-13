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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const clientsRes = await fetch("/api/oauth-admin/clients", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!clientsRes.ok) throw new Error(await clientsRes.text());
      const clientsData = await clientsRes.json();
      setClients(clientsData || []);

      const grantsRes = await fetch("/api/oauth-admin/authorized-apps", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!grantsRes.ok) throw new Error(await grantsRes.text());
      const grantsData = await grantsRes.json();
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch("/api/oauth-admin/clients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: newName,
          type: newType,
          redirect_uris: newRedirectUris.split(",").map((uri) => uri.trim()),
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(`/api/oauth-admin/clients/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());

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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(`/api/oauth-admin/revoke-authorization/${id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());

      fetchData();
      toast({
        title: "Success",
        description: "Access revoked",
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
      title: "Copied",
      description: `${label} copied to clipboard`,
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            OAuth Applications
          </h1>
          <p className="text-slate-400 mt-1">
            Manage your OAuth2 clients and authorized applications.
          </p>
        </div>
      </div>

      <Tabs defaultValue="clients" className="w-full">
        <TabsList className="bg-slate-900 border border-slate-800 p-1">
          <TabsTrigger value="clients" className="gap-2">
            <Key className="w-4 h-4" />
            Developer Clients
          </TabsTrigger>
          <TabsTrigger value="authorized" className="gap-2">
            <ShieldCheck className="w-4 h-4" />
            Authorized Apps
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-white">Your Clients</h3>
              <p className="text-sm text-slate-400">
                Register applications to use this platform as an OAuth2
                provider.
              </p>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-cyan-600 hover:bg-cyan-700 gap-2">
                  <Plus className="w-4 h-4" />
                  New Client
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-950 border-slate-800 text-white sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Register New Application</DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Create a new OAuth2 client to integrate with our platform.
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
                        className="bg-slate-900 border-slate-800 focus:ring-cyan-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="type">Client Type</Label>
                      <Select
                        value={newType}
                        onValueChange={(val: any) => setNewType(val)}
                      >
                        <SelectTrigger
                          id="type"
                          className="bg-slate-900 border-slate-800"
                        >
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white">
                          <SelectItem value="confidential">
                            <div className="flex items-center gap-2">
                              <Lock className="w-4 h-4" />
                              <div>
                                <p className="font-medium">Confidential</p>
                                <p className="text-[10px] text-slate-500">
                                  For server-side apps (Next.js, Express)
                                </p>
                              </div>
                            </div>
                          </SelectItem>
                          <SelectItem value="public">
                            <div className="flex items-center gap-2">
                              <Globe className="w-4 h-4" />
                              <div>
                                <p className="font-medium">Public</p>
                                <p className="text-[10px] text-slate-500">
                                  For SPAs or Mobile apps
                                </p>
                              </div>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="redirect_uris">
                        Redirect URIs (comma separated)
                      </Label>
                      <Input
                        id="redirect_uris"
                        placeholder="http://localhost:3000/api/auth/callback"
                        value={newRedirectUris}
                        onChange={(e) => setNewRedirectUris(e.target.value)}
                        className="bg-slate-900 border-slate-800 focus:ring-cyan-500"
                      />
                      <p className="text-[10px] text-slate-500">
                        The allowed callback URLs for your application.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6 py-4">
                    <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex gap-3">
                      <ShieldAlert className="w-5 h-5 text-yellow-500 shrink-0" />
                      <p className="text-xs text-yellow-500/80 leading-relaxed">
                        Store this client secret securely. It will never be
                        shown again. You can reset it later if lost.
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
                          aria-label="Copy Client Secret"
                          title="Copy Client Secret"
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
                            aria-label="Copy Client ID"
                            title="Copy Client ID"
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
