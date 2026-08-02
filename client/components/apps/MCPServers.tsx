import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Server, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchAllMCPServers, MCPServer, builtinFetchServer } from "@/lib/mcp";

export function MCPServersApp() {
  const { session } = useAuth();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloading, setDownloading] = useState(false);

  const loadServers = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const s = await fetchAllMCPServers(session.user.id);
      setServers(s);
    } catch (e: any) {
      toast.error("Failed to load servers: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, [session?.user?.id]);

  const handleDownload = async () => {
    if (!downloadUrl || !session?.user?.id) return;
    setDownloading(true);
    try {
      const res = await fetch(downloadUrl);
      if (!res.ok) throw new Error("Failed to fetch script");
      const code = await res.text();
      
      const filename = downloadUrl.split('/').pop() || "server.mcp.js";
      let finalName = filename;
      if (!finalName.endsWith(".mcp.js")) finalName += ".mcp.js";

      const { error } = await supabase.storage
        .from("Storage")
        .upload(`${session.user.id}/${finalName}`, code, { upsert: true });

      if (error) throw error;
      toast.success("MCP Server downloaded and saved to Storage!");
      setDownloadUrl("");
      loadServers();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!session?.user?.id) return;
    try {
      const { error } = await supabase.storage
        .from("Storage")
        .remove([`${session.user.id}/${filename}`]);
      if (error) throw error;
      toast.success("Server deleted");
      loadServers();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Download MCP Server</CardTitle>
          <CardDescription className="text-slate-400">
            Enter a URL to a raw JavaScript file (.mcp.js) to download it into your storage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com/my-server.mcp.js"
              value={downloadUrl}
              onChange={(e) => setDownloadUrl(e.target.value)}
              className="bg-slate-950 border-slate-800 text-white"
            />
            <Button
              onClick={handleDownload}
              disabled={downloading || !downloadUrl}
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Download
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : (
          servers.map((server) => (
            <Card key={server.id} className="bg-slate-950 border-slate-800">
              <CardHeader className="flex flex-row justify-between items-start">
                <div>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-cyan-500" />
                    {server.name}
                  </CardTitle>
                  <CardDescription className="text-slate-500 mt-1">
                    {server.tools.length} tool(s) available
                  </CardDescription>
                </div>
                {server.id !== builtinFetchServer.id && (
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleDelete(server.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {server.tools.map((tool) => (
                    <div key={tool.name} className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                      <div className="font-mono text-sm text-cyan-400 font-bold mb-1">{tool.name}</div>
                      <div className="text-xs text-slate-400">{tool.description}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

export default MCPServersApp;
