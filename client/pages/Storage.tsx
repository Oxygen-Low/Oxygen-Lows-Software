import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import {
  Cloud,
  {t('storage.upload')},
  Trash2,
  FileText,
  Image as ImageIcon,
  Music,
  Database,
  ExternalLink,
  Loader2,
  Link as LinkIcon
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function Storage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [cloudFileSignedUrls, setCloudFileSignedUrls] = useState<Record<string, string>>({});
  const [uploading, set{t('storage.upload')}ing] = useState(false);
  const [totalSize, setTotalSize] = useState(0);
  const [dbStats, setDbStats] = useState<any[]>([]);
  const cloudInputRef = useRef<HTMLInputElement>(null);

  const fetchCloudFiles = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase.storage.from("Storage").list(session.user.id);
      if (error) throw error;

      const files = data || [];
      setCloudFiles(files);

      const size = files.reduce((acc, f) => acc + (f.metadata?.size || 0), 0);
      setTotalSize(size);

      // Get signed URLs for images
      const imageFiles = files.filter(f => f.metadata?.mimetype?.startsWith("image/"));
      if (imageFiles.length > 0) {
        const { data: signedData, error: signedError } = await supabase.storage
          .from("Storage")
          .createSignedUrls(imageFiles.map(f => `${session.user.id}/${f.name}`), 3600);

        if (!signedError && signedData) {
          const urlMap: Record<string, string> = {};
          imageFiles.forEach((f, i) => {
            if (signedData[i]?.signedUrl) urlMap[f.id] = signedData[i].signedUrl;
          });
          setCloudFileSignedUrls(urlMap);
        }
      }
    } catch (error: any) {
      console.error("Storage error:", error);
    }
  };

  const fetchDbStats = async () => {
    try {
      const { data, error } = await supabase.rpc("get_user_storage_stats");
      if (!error && data) setDbStats(data);
    } catch (e) {
      console.error("DB stats error", e);
    }
  };

  useEffect(() => {
    fetchCloudFiles();
    fetchDbStats();
  }, [session]);

  const handleCloud{t('storage.upload')} = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !session?.user?.id) return;
    const file = e.target.files[0];

    // Check 30MB limit
    if (totalSize + file.size > 30 * 1024 * 1024) {
      toast.error("Storage limit exceeded (30MB)");
      return;
    }

    try {
      set{t('storage.upload')}ing(true);
      const { error } = await supabase.storage
        .from("Storage")
        .upload(`${session.user.id}/${Date.now()}_${file.name}`, file);

      if (error) throw error;
      toast.success("File uploaded successfully");
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      set{t('storage.upload')}ing(false);
    }
  };

  const deleteCloudFile = async (name: string) => {
    try {
      const { error } = await supabase.storage.from("Storage").remove([`${session?.user.id}/${name}`]);
      if (error) throw error;
      toast.success("File deleted");
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const categories = {
    text: { color: "bg-white", label: t('storage.categories.text'), icon: FileText, files: [] as any[], size: 0 },
    image: { color: "bg-orange-500", label: t('storage.categories.image'), icon: ImageIcon, files: [] as any[], size: 0 },
    audio: { color: "bg-blue-500", label: t('storage.categories.audio'), icon: Music, files: [] as any[], size: 0 },
    data: { color: "bg-black", label: t('storage.categories.data'), icon: Database, files: [] as any[], size: 0 },
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
          <h2 className="text-3xl font-bold tracking-tight text-white">{t('nav.storage')}</h2>
          <p className="text-slate-400">{t('storage.manage')}</p>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">{t('storage.overallUsage')}</CardTitle>
            <CardDescription className="text-slate-400">
              {t('storage.overallUsageDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-slate-400">
                <span>{formatSize(totalAll)} {t('storage.used')}</span>
                <span>{t('storage.limit', { limit: '30MB' })}</span>
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
                             {cat.files.length === 0 && <p className="p-4 text-center text-xs text-slate-500 italic">{t('common.noItems')}</p>}
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
              {t('storage.tabs.cloudStorage')}
            </TabsTrigger>
            <TabsTrigger value="links" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <LinkIcon className="w-4 h-4 mr-2" />
              {t('storage.tabs.linkedImages')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cloud" className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-medium text-white">{t('storage.files.title')}</h3>
                <p className="text-sm text-slate-400">{t('storage.files.description')}</p>
              </div>
              <Button
                onClick={() => cloudInputRef.current?.click()}
                disabled={uploading}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <{t('storage.upload')} className="w-4 h-4 mr-2" />}
                {t('storage.upload')}
              </Button>
              <input type="file" className="hidden" ref={cloudInputRef} onChange={handleCloud{t('storage.upload')}} />
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
                          {t('common.view')}
                        </a>
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" className="flex-1 bg-slate-800 text-white opacity-50 cursor-not-allowed" disabled>
                        <ExternalLink className="w-4 h-4 mr-2" />
                        {t('common.view')}
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
                <h3 className="text-lg font-medium text-white mb-2">{t('storage.tabs.linkedImages')} Coming Soon</h3>
                <p className="text-slate-500 max-w-sm mx-auto text-sm">
                  {t('storage.linkedImages.comingSoon.description')}
                </p>
             </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
