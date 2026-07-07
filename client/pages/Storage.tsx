import { useState, useEffect, useRef } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import {
  Upload,
  Trash2,
  FileText,
  Image as ImageIcon,
  Music,
  Database,
  ExternalLink,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Zap } from "lucide-react";

export default function Storage() {
  const { session } = useAuth();
  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [cloudFileSignedUrls, setCloudFileSignedUrls] = useState<
    Record<string, string>
  >({});
  const [uploading, setUploading] = useState(false);
  const [totalSize, setTotalSize] = useState(0);
  const [dbStats, setDbStats] = useState<any[]>([]);
  const cloudInputRef = useRef<HTMLInputElement>(null);
  const [isReactiveDialogOpen, setIsReactiveDialogOpen] = useState(false);
  const [reactiveSongName, setReactiveSongName] = useState("");
  const [selectedAudioFiles, setSelectedAudioFiles] = useState<string[]>([]);
  const [layerLevels, setLayerLevels] = useState<Record<string, number[]>>({});

  const fetchCloudFiles = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase.storage
        .from("Storage")
        .list(session.user.id);
      if (error) throw error;

      const files = data || [];
      setCloudFiles(files);

      const size = files.reduce((acc, f) => acc + (f.metadata?.size || 0), 0);
      setTotalSize(size);

      // Get signed URLs for all files
      if (files.length > 0) {
        const { data: signedData, error: signedError } = await supabase.storage
          .from("Storage")
          .createSignedUrls(
            files.map((f) => `${session.user.id}/${f.name}`),
            3600,
          );

        if (signedError) throw signedError;

        const urls: Record<string, string> = {};
        files.forEach((f, i) => {
          if (signedData[i]) {
            urls[f.id] = signedData[i].signedUrl;
          }
        });
        setCloudFileSignedUrls(urls);
      }
    } catch (error: any) {
      console.error("Error fetching files:", error);
    }
  };

  const fetchDbStats = async () => {
    try {
      const tables = [
        "characters",
        "chats",
        "chat_messages",
        "user_preferences",
      ];
      const stats = await Promise.all(
        tables.map(async (table) => {
          const { count, error } = await supabase
            .from(table)
            .select("*", { count: "exact", head: true });
          return { name: table, size: (count || 0) * 1024 }; // Estimate 1KB per row
        }),
      );
      setDbStats(stats);
    } catch (error) {
      console.error("Error fetching DB stats:", error);
    }
  };

  useEffect(() => {
    fetchCloudFiles();
    fetchDbStats();
  }, [session]);

  const handleCloudUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;

    if (totalSize + file.size > 30 * 1024 * 1024) {
      toast.error("Storage limit reached (30MB)");
      return;
    }

    setUploading(true);
    try {
      if (file.name.includes("..")) throw new Error("Invalid file name");
      const { error } = await supabase.storage
        .from("Storage")
        .upload(`${session.user.id}/${file.name}`, file, { upsert: false });

      if (error) throw error;
      toast.success("File uploaded successfully");
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateReactiveSong = async () => {
    if (!reactiveSongName || selectedAudioFiles.length < 2) {
      toast.error("Please provide a name and select at least 2 audio files");
      return;
    }

    const reactiveData = {
      name: reactiveSongName,
      isReactive: true,
      layers: selectedAudioFiles.map((fileName) => ({
        fileName,
        levels: layerLevels[fileName] || [1],
      })),
    };

    const blob = new Blob([JSON.stringify(reactiveData)], {
      type: "application/json",
    });
    const file = new File([blob], `${reactiveSongName}.reactive`, {
      type: "application/json",
    });

    try {
      const { error } = await supabase.storage
        .from("Storage")
        .upload(`${session?.user?.id}/${file.name}`, file, { upsert: true });

      if (error) throw error;
      toast.success("Reactive song created!");
      setIsReactiveDialogOpen(false);
      setReactiveSongName("");
      setSelectedAudioFiles([]);
      setLayerLevels({});
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const toggleLevel = (fileName: string, level: number) => {
    setLayerLevels((prev) => {
      const levels = prev[fileName] || [];
      if (levels.includes(level)) {
        return { ...prev, [fileName]: levels.filter((l) => l !== level) };
      } else {
        return { ...prev, [fileName]: [...levels, level].sort() };
      }
    });
  };

  const deleteCloudFile = async (name: string) => {
    try {
      if (name.includes("..")) throw new Error("Invalid file name");
      const { error } = await supabase.storage
        .from("Storage")
        .remove([`${session?.user.id}/${name}`]);
      if (error) throw error;
      toast.success("File deleted");
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const categories = {
    text: {
      color: "bg-white",
      label: "Text/Artifacts",
      icon: FileText,
      files: [] as any[],
      size: 0,
    },
    image: {
      color: "bg-orange-500",
      label: "Images",
      icon: ImageIcon,
      files: [] as any[],
      size: 0,
    },
    audio: {
      color: "bg-blue-500",
      label: "Sounds",
      icon: Music,
      files: [] as any[],
      size: 0,
    },
    reactive: {
      color: "bg-purple-500",
      label: "Reactive",
      icon: Zap,
      files: [] as any[],
      size: 0,
    },
    data: {
      color: "bg-black",
      label: "Data",
      icon: Database,
      files: [] as any[],
      size: 0,
    },
  };

  cloudFiles.forEach((f) => {
    const type = f.metadata?.mimetype || "";
    const size = f.metadata?.size || 0;
    if (f.name.endsWith(".reactive")) {
      categories.reactive.files.push(f);
      categories.reactive.size += size;
    } else if (type.startsWith("image/")) {
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
  categories.data.files = dbStats.map((s) => ({ name: s.name, size: s.size }));

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
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Storage
          </h2>
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
                <span>{`Limit: ${"30MB"} (Files)`}</span>
              </div>
              <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden flex">
                {Object.entries(categories).map(([key, cat]) => {
                  const width = (cat.size / (30 * 1024 * 1024)) * 100;
                  if (width === 0) return null;
                  return (
                    <HoverCard key={key}>
                      <HoverCardTrigger asChild>
                        <div
                          className={cn(
                            "h-full cursor-pointer transition-opacity hover:opacity-80",
                            cat.color,
                          )}
                          style={{ width: `${Math.max(width, 1)}%` }}
                        />
                      </HoverCardTrigger>
                      <HoverCardContent className="w-64 bg-slate-900 border-slate-800 p-0 overflow-hidden">
                        <div className="p-3 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <cat.icon
                              className={cn(
                                "w-4 h-4",
                                key === "text"
                                  ? "text-slate-400"
                                  : cat.color.replace("bg-", "text-"),
                              )}
                            />
                            <span className="text-sm font-bold text-white">
                              {cat.label}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400">
                            {formatSize(cat.size)}
                          </span>
                        </div>
                        <ScrollArea className="h-48">
                          <div className="p-2 space-y-1">
                            {cat.files
                              .sort(
                                (a, b) =>
                                  (b.metadata?.size || b.size) -
                                  (a.metadata?.size || a.size),
                              )
                              .map((f, i) => (
                                <div
                                  key={i}
                                  className="flex justify-between items-center p-2 rounded hover:bg-slate-800"
                                >
                                  <span className="text-[11px] text-slate-300 truncate mr-2">
                                    {f.name}
                                  </span>
                                  <span className="text-[10px] text-slate-500 whitespace-nowrap">
                                    {formatSize(f.metadata?.size || f.size)}
                                  </span>
                                </div>
                              ))}
                            {cat.files.length === 0 && (
                              <p className="p-4 text-center text-xs text-slate-500 italic">
                                No items
                              </p>
                            )}
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

        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium text-white">Files</h3>
              <p className="text-sm text-slate-400">
                Your uploaded files and artifacts.
              </p>
            </div>
            <div className="flex gap-2">
              <Dialog
                open={isReactiveDialogOpen}
                onOpenChange={setIsReactiveDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-purple-500 text-purple-500 hover:bg-purple-500/10"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Create Reactive
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Reactive Song</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      Select 2-5 audio files and assign them to threat levels
                      (1-5).
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Song Name</Label>
                      <Input
                        id="name"
                        placeholder="My Epic Reactive Song"
                        value={reactiveSongName}
                        onChange={(e) => setReactiveSongName(e.target.value)}
                        className="bg-slate-950 border-slate-800"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Select Audio Files (2-5)</Label>
                      <div className="grid grid-cols-1 gap-2">
                        {categories.audio.files.map((f) => (
                          <div
                            key={f.id}
                            className="flex flex-col p-3 bg-slate-950 border border-slate-800 rounded-lg"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id={f.id}
                                  checked={selectedAudioFiles.includes(f.name)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      if (selectedAudioFiles.length < 5) {
                                        setSelectedAudioFiles([
                                          ...selectedAudioFiles,
                                          f.name,
                                        ]);
                                      } else {
                                        toast.error("Max 5 layers allowed");
                                      }
                                    } else {
                                      setSelectedAudioFiles(
                                        selectedAudioFiles.filter(
                                          (name) => name !== f.name,
                                        ),
                                      );
                                    }
                                  }}
                                />
                                <Label
                                  htmlFor={f.id}
                                  className="cursor-pointer truncate max-w-[200px]"
                                >
                                  {f.name}
                                </Label>
                              </div>
                            </div>
                            {selectedAudioFiles.includes(f.name) && (
                              <div className="flex items-center gap-4 ml-6 pt-2 border-t border-slate-800">
                                <span className="text-xs text-slate-500 whitespace-nowrap">
                                  Threat Levels:
                                </span>
                                <div className="flex gap-2">
                                  {[1, 2, 3, 4, 5].map((level) => (
                                    <button
                                      key={level}
                                      onClick={() => toggleLevel(f.name, level)}
                                      className={cn(
                                        "w-6 h-6 rounded text-[10px] flex items-center justify-center transition-colors",
                                        (layerLevels[f.name] || []).includes(
                                          level,
                                        )
                                          ? "bg-purple-600 text-white"
                                          : "bg-slate-800 text-slate-400 hover:bg-slate-700",
                                      )}
                                    >
                                      {level}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="ghost"
                      onClick={() => setIsReactiveDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateReactiveSong}
                      className="bg-purple-600 hover:bg-purple-700"
                    >
                      Create
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button
                onClick={() => cloudInputRef.current?.click()}
                disabled={uploading}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Upload
              </Button>
            </div>
            <input
              type="file"
              className="hidden"
              ref={cloudInputRef}
              onChange={handleCloudUpload}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cloudFiles.map((file) => (
              <Card
                key={file.id}
                className="bg-slate-950 border-slate-800 overflow-hidden group"
              >
                <div className="aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
                  {file.name.endsWith(".reactive") ? (
                    <div className="flex flex-col items-center gap-2 p-4">
                      <Zap className="w-12 h-12 text-purple-500" />
                      <span className="text-xs text-slate-400">
                        Reactive Song
                      </span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((l) => (
                          <div
                            key={l}
                            className="w-4 h-4 rounded-full bg-slate-800 flex items-center justify-center text-[8px] text-slate-500"
                          >
                            {l}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : file.metadata?.mimetype?.startsWith("image/") &&
                    cloudFileSignedUrls[file.id] ? (
                    <img
                      src={cloudFileSignedUrls[file.id]}
                      alt={file.name}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : file.metadata?.mimetype?.startsWith("audio/") &&
                    cloudFileSignedUrls[file.id] ? (
                    <div className="flex flex-col items-center gap-4 w-full p-4">
                      <Music className="w-12 h-12 text-blue-500" />
                      <audio controls className="w-full h-8">
                        <source
                          src={cloudFileSignedUrls[file.id]}
                          type={file.metadata.mimetype}
                        />
                      </audio>
                    </div>
                  ) : (
                    <FileText className="w-12 h-12 text-slate-700" />
                  )}
                </div>
                <CardHeader className="p-4">
                  <CardTitle className="text-sm text-white truncate">
                    {file.name}
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {formatSize(file.metadata?.size || 0)} •{" "}
                    {new Date(file.created_at).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 flex gap-2">
                  {cloudFileSignedUrls[file.id] ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                      asChild
                    >
                      <a
                        href={cloudFileSignedUrls[file.id]}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" /> View
                      </a>
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1 bg-slate-800 text-white opacity-50 cursor-not-allowed"
                      disabled
                    >
                      <ExternalLink className="w-4 h-4 mr-2" /> View
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => deleteCloudFile(file.name)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
