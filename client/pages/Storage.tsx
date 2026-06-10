import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Layout } from "@/components/Layout";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Cloud, Upload, Trash2, Download, ExternalLink, Loader2, FileText, ImageIcon, Music, Database, Plus, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";

const MAX_CLOUD_SIZE = 30 * 1024 * 1024; // 30MB

interface StorageFile {
  id: string;
  name: string;
  created_at: string;
  metadata: {
    size: number;
    mimetype: string;
  };
}

export default function Storage() {
  const { session } = useAuth();
  const [cloudFiles, setCloudFiles] = useState<StorageFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [totalSize, setTotalSize] = useState(0);
  const [cloudFileSignedUrls, setCloudFileSignedUrls] = useState<Record<string, string>>({});
  const [linkedImages, setLinkedImages] = useState<any[]>([]);
  const [dbStats, setDbStats] = useState<any[]>([]);
  const cloudInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session?.user) {
      fetchCloudFiles();
      fetchLinkedImages();
      fetchDbStats();
    }
  }, [session]);

  const fetchCloudFiles = async () => {
    try {
      const { data, error } = await supabase.storage.from("Storage").list(session?.user.id, {
        limit: 100,
        offset: 0,
        sortBy: { column: "created_at", order: "desc" },
      });

      if (error) throw error;

      const filesWithIds = data.map(f => ({ ...f, id: f.id || Math.random().toString() })) as any[];
      setCloudFiles(filesWithIds);
      const total = data.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
      setTotalSize(total);

      const urls: Record<string, string> = {};
      for (const file of filesWithIds) {
        const { data: signedData } = await supabase.storage
          .from("Storage")
          .createSignedUrl(`${session?.user.id}/${file.name}`, 3600);
        if (signedData) urls[file.id] = signedData.signedUrl;
      }
      setCloudFileSignedUrls(urls);
    } catch (error: any) {
      console.error("Storage load failed:", error);
      toast.error("Failed to fetch cloud files");
    }
  };

  const fetchLinkedImages = async () => {
    const { data } = await supabase.from("image_links").select("*").eq("user_id", session?.user.id);
    if (data) setLinkedImages(data);
  };

  const fetchDbStats = async () => {
    const stats = [
      { name: "Chatbot Chats", count: 0, size: 0, tables: ["chats", "chat_messages"] },
      { name: "User Profiles", count: 1, size: 1024, tables: ["profiles"] },
      { name: "OAuth & Integrations", count: 0, size: 0, tables: ["user_integrations"] },
      { name: "Settings", count: 1, size: 512, tables: ["user_preferences"] } ,
      { name: "Characters", count: 0, size: 0, tables: ["characters"] }
    ];

    try {
      const { data: userChats } = await supabase.from("chats").select("id").eq("user_id", session?.user.id);
      const chatIds = userChats?.map(c => c.id) || [];

      const { count: chatsCount } = await supabase.from("chats").select("*", { count: "exact", head: true }).eq("user_id", session?.user.id);

      let msgsCount = 0;
      if (chatIds.length > 0) {
        const { count } = await supabase.from("chat_messages").select("*", { count: "exact", head: true }).in("chat_id", chatIds);
        msgsCount = count || 0;
      }

      const { count: integCount } = await supabase.from("user_integrations").select("*", { count: "exact", head: true }).eq("user_id", session?.user.id);
      const { count: charCount } = await supabase.from("characters").select("*", { count: "exact", head: true }).eq("user_id", session?.user.id);

      stats[0].count = (chatsCount || 0) + msgsCount;
      stats[4].count = charCount || 0;
      stats[4].size = (charCount || 0) * 2048;
      stats[0].size = stats[0].count * 500;
      stats[2].count = integCount || 0;
      stats[2].size = (integCount || 0) * 256;

      setDbStats(stats);
    } catch (e) {
      console.error("Failed to fetch DB stats:", e);
    }
  };

  const handleCloudUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const charCount = dbStats.find(s => s.name === "Characters")?.count || 0;
    const currentStorage = totalSize + (charCount * 2048);
    if (currentStorage + file.size > MAX_CLOUD_SIZE) {
      toast.error("Storage limit exceeded");
      return;
    }

    setUploading(true);
    try {
      const filePath = `${session?.user.id}/${Date.now()}_${file.name}`;
      if (filePath.includes('..')) throw new Error("Invalid file path");
      const { error } = await supabase.storage.from("Storage").upload(filePath, file);
      if (error) throw error;
      toast.success("File uploaded");
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteCloudFile = async (name: string) => {
    try {
      if (name.includes('..')) throw new Error('Invalid file name');
      const { error } = await supabase.storage.from("Storage").remove([`${session?.user.id}/${name}`]);
      if (error) throw error;
      toast.success("File deleted");
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const categories = {
    text: { color: "bg-white", label: "Text/Artifacts", icon: FileText, files: [] as any[], size: 0 },
    image: { color: "bg-orange-500", label: "Images", icon: ImageIcon, files: [] as any[], size: 0 },
    audio: { color: "bg-blue-500", label: "Sounds", icon: Music, files: [] as any[], size: 0 },
    data: { color: "bg-black", label: "Data", icon: Database, files: [] as any[], size: 0 },
  };

  cloudFiles.forEach(f => {
    const type = f.metadata?.mimetype || "";
    const size = f.metadata?.size || 0;
    if (type.startsWith("image/")) {
      categories.image.files.push(f);
      categories.image.size += size;
    } else if (type.startsWith("audio/")) {
      categories.audio.files.push(f);
      categories.audio.size += size;
    } else {
      categories.text.files.push(f);
      categories.text.size += size;
    }
  });

  const totalDataSize = dbStats.reduce((acc, s) => acc + s.size, 0);
  categories.data.size = totalDataSize;
  categories.data.files = dbStats.map(s => ({ name: s.name, size: s.size }));

  const totalAll = totalSize + totalDataSize;
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-white">Storage</h2>
          <p className="text-slate-400">Manage your files and data usage.</p>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Overall Usage</CardTitle>
            <CardDescription className="text-slate-400">
              Total space used by files and application data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <span>{formatSize(totalAll)} used</span>
                <span>Limit: 30MB (Files)</span>
              </div>
              <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex">
                {Object.entries(categories).map(([key, cat]) => {
                   const width = (cat.size / (30 * 1024 * 1024)) * 100;
                   if (width === 0) return null;
                   return (
                     <HoverCard key={key}>
                       <HoverCardTrigger asChild>
                         <div
                           className={cn("h-full cursor-pointer transition-opacity hover:opacity-80", cat.color)}
                           style={{ width: `${Math.max(width, 1)}%` }}
                         />
                       </HoverCardTrigger>
                       <HoverCardContent className="w-64 bg-slate-900 border-slate-800 p-0 overflow-hidden">
                         <div className="p-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                           <div className="flex items-center gap-2">
                             <cat.icon className={cn("w-4 h-4", key === "text" ? "text-slate-400" : cat.color.replace("bg-", "text-"))} />
                             <span className="text-sm font-bold text-white">{cat.label}</span>
                           </div>
                           <span className="text-xs text-slate-400">{formatSize(cat.size)}</span>
                         </div>
                         <ScrollArea className="h-48">
                           <div className="p-2 space-y-1">
                             {cat.files.sort((a, b) => (b.metadata?.size || b.size) - (a.metadata?.size || a.size)).map((f, i) => (
                               <div key={i} className="flex justify-between items-center p-2 rounded hover:bg-slate-800">
                                 <span className="text-[11px] text-slate-300 truncate mr-2">{f.name}</span>
                                 <span className="text-[10px] text-slate-500 whitespace-nowrap">{formatSize(f.metadata?.size || f.size)}</span>
                               </div>
                             ))}
                             {cat.files.length === 0 && <p className="p-4 text-center text-xs text-slate-500 italic">No items</p>}
                           </div>
                         </ScrollArea>
                       </HoverCardContent>
                     </HoverCard>
                   );
                })}
              </div>
              <div className="flex flex-wrap gap-4 pt-2">
                {Object.entries(categories).map(([key, cat]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div className={cn("w-3 h-3 rounded-full", cat.color)} />
                    <span className="text-xs text-slate-400">{cat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="cloud" className="w-full">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="cloud" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <Cloud className="w-4 h-4 mr-2" />
              Cloud Storage
            </TabsTrigger>
            <TabsTrigger value="links" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <LinkIcon className="w-4 h-4 mr-2" />
              Linked Images
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cloud" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-white">Files</h3>
                <p className="text-sm text-slate-400">Your uploaded files and artifacts.</p>
              </div>
              <Button
                onClick={() => cloudInputRef.current?.click()}
                disabled={uploading}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                Upload
              </Button>
              <input type="file" className="hidden" ref={cloudInputRef} onChange={handleCloudUpload} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cloudFiles.map((file) => (
                <Card key={file.id} className="bg-slate-950 border-slate-800 overflow-hidden group">
                  <div className="aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
                    {file.metadata?.mimetype?.startsWith("image/") && cloudFileSignedUrls[file.id] ? (
                      <img src={cloudFileSignedUrls[file.id]} alt={file.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    ) : file.metadata?.mimetype?.startsWith("audio/") ? (
                      <Music className="w-12 h-12 text-blue-500" />
                    ) : (
                      <FileText className="w-12 h-12 text-slate-700" />
                    )}
                  </div>
                  <CardHeader className="p-4">
                    <CardTitle className="text-sm text-white truncate">{file.name}</CardTitle>
                    <CardDescription className="text-xs text-slate-500">
                      {formatSize(file.metadata?.size || 0)} • {new Date(file.created_at).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 flex gap-2">
                    {cloudFileSignedUrls[file.id] ? (
                      <Button variant="secondary" size="sm" className="flex-1 bg-slate-800 hover:bg-slate-700 text-white" asChild>
                        <a href={cloudFileSignedUrls[file.id]} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          View
                        </a>
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" className="flex-1 bg-slate-800 text-white opacity-50 cursor-not-allowed" disabled>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View
                      </Button>
                    )}
                    <Button variant="destructive" size="icon" onClick={() => deleteCloudFile(file.name)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="links" className="space-y-6">
             <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                <LinkIcon className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Linked Images Coming Soon</h3>
                <p className="text-slate-500 max-w-sm mx-auto text-sm">
                  We are working on a way to let you manage external image links directly from this tab. Stay tuned!
                </p>
             </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
