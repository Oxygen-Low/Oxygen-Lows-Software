import { Buffer } from "buffer";
import { useState, useEffect, useRef, useCallback } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  Upload,
  File,
  Trash2,
  ExternalLink, Download,
  Plus,
  Loader2,
  Music,
  Cloud,
  Link as LinkIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import * as mm from "music-metadata-browser";

if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}

const MAX_CLOUD_SIZE = 30 * 1024 * 1024;

function StorageCloudAudioDisplay({ file, audioUrl, getCloudAudioUrl }: { file: any; audioUrl?: string; getCloudAudioUrl: (file: any) => Promise<string> }) {
  const [url, setUrl] = useState<string | null>(audioUrl || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (audioUrl) {
      setUrl(audioUrl);
      return;
    }

    const resolveUrl = async () => {
      try {
        const resolvedUrl = await getCloudAudioUrl(file);
        if (resolvedUrl) {
          setUrl(resolvedUrl);
          setError(null);
        }
      } catch (err) {
        console.error("Error resolving cloud audio URL:", err);
        setError("Failed to load");
      }
    };

    resolveUrl();
  }, [file, audioUrl, getCloudAudioUrl]);

  return (
    <div className="flex flex-col items-center gap-4 w-full p-4">
      <Music className="w-12 h-12 text-cyan-500" />
      {error ? (
        <p className="text-xs text-red-500 text-center">{error}</p>
      ) : url ? (
        <audio
          controls
          className="w-full h-8"
          src={url}
          crossOrigin="anonymous"
        >
          Your browser does not support the audio element.
        </audio>
      ) : (
        <p className="text-xs text-slate-500 text-center">Preparing audio...</p>
      )}
    </div>
  );
}

export default function Storage() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [cloudAudioUrls, setCloudAudioUrls] = useState<Record<string, string>>({});
  const cloudAudioUrlsRef = useRef<Record<string, string>>({});
  const [totalSize, setTotalSize] = useState(0);
  const cloudInputRef = useRef<HTMLInputElement>(null);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [linkedImages, setLinkedImages] = useState<any[]>([]);
  const [audioMetadata, setAudioMetadata] = useState<Record<string, { title?: string; artist?: string }>>({});

  useEffect(() => {
    cloudAudioUrlsRef.current = cloudAudioUrls;
  }, [cloudAudioUrls]);

  const extractMetadata = useCallback(async (file: File | Blob, id: string) => {
    try {
      const metadata = await mm.parseBlob(file);
      if (metadata.common.title || metadata.common.artist) {
        setAudioMetadata(prev => ({
          ...prev,
          [id]: {
            title: metadata.common.title,
            artist: metadata.common.artist
          }
        }));
      }
    } catch (err) {
      console.warn("Failed to extract metadata:", err);
    }
  }, []);

  const getCloudAudioUrl = useCallback(async (file: any) => {
    if (cloudAudioUrls[file.id]) {
      return cloudAudioUrls[file.id];
    }

    try {
      const { data, error } = await supabase.storage
        .from("Storage")
        .createSignedUrl(file.name, 3600);

      if (error) throw error;
      if (data?.signedUrl) {
        setCloudAudioUrls(prev => ({ ...prev, [file.id]: data.signedUrl }));

        // Also extract metadata if we haven't yet
        if (!audioMetadata[file.id]) {
          const { data: blob } = await supabase.storage
            .from("Storage")
            .download(file.name);
          if (blob) extractMetadata(blob, file.id);
        }

        return data.signedUrl;
      }
    } catch (err) {
      console.error("Error getting cloud URL:", err);
    }
    return "";
  }, [cloudAudioUrls, audioMetadata, extractMetadata]);

  useEffect(() => {
    return () => {
      // No object URLs to revoke for cloud (they are signed URLs)
    };
  }, []);

  const fetchCloudFiles = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase.storage
        .from("Storage")
        .list("", {
          sortBy: { column: "created_at", order: "desc" },
        });

      if (error) throw error;

      // Filter for specific allowed file types as per memory
      const allowedExtensions = [".txt", ".md", ".png", ".jpg", ".mp3", ".wav", ".ogg"];
      const filteredFiles = (data || []).filter(file =>
        allowedExtensions.some(ext => file.name.toLowerCase().endsWith(ext))
      );

      setCloudFiles(filteredFiles);

      const total = filteredFiles.reduce((acc, file) => acc + (file.metadata?.size || 0), 0);
      setTotalSize(total);
    } catch (error) {
      console.error("Cloud storage error:", error);
    }
  }, [session?.user?.id]);

  const fetchLinkedImages = useCallback(async () => {
    if (!session?.user?.id) return;

    try {
      const { data, error } = await supabase
        .from("linked_images")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLinkedImages(data || []);
    } catch (error) {
      console.error("Linked images error:", error);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) {
      fetchCloudFiles();
      fetchLinkedImages();
    }
  }, [session?.user?.id, fetchCloudFiles, fetchLinkedImages]);

  const handleCloudUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user?.id) return;

    if (totalSize + file.size > MAX_CLOUD_SIZE) {
      toast({
        title: "Limit exceeded",
        description: "Cloud storage limit is 30MB.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("Storage")
        .upload(file.name, file, { upsert: true });

      if (error) throw error;

      toast({ title: "Success", description: "File uploaded to cloud storage." });
      fetchCloudFiles();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "An error occurred during upload.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (cloudInputRef.current) cloudInputRef.current.value = "";
    }
  };

  const deleteCloudFile = async (name: string) => {
    try {
      const { error } = await supabase.storage.from("Storage").remove([name]);
      if (error) throw error;
      toast({ title: "Success", description: "File deleted from cloud storage." });
      fetchCloudFiles();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete cloud file.",
        variant: "destructive",
      });
    }
  };

  const handleCloudDownload = async (name: string) => {
    try {
      const { data, error } = await supabase.storage
        .from("Storage")
        .download(name);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Download failed",
        description: "Failed to download cloud file.",
        variant: "destructive",
      });
    }
  };

  const handleAddLink = async () => {
    if (!newLinkUrl || !session?.user?.id) return;

    try {
      const { error } = await supabase
        .from("linked_images")
        .insert([{ url: newLinkUrl, user_id: session.user.id }]);

      if (error) throw error;

      toast({ title: "Success", description: "Link added." });
      setNewLinkUrl("");
      fetchLinkedImages();
    } catch (error: any) {
      toast({
        title: "Failed to add link",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteLink = async (id: string) => {
    try {
      const { error } = await supabase
        .from("linked_images")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Link removed." });
      fetchLinkedImages();
    } catch (error) {
      toast({
        title: "Delete failed",
        description: "Failed to delete link.",
        variant: "destructive",
      });
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getCloudPublicUrl = (name: string) => {
    const { data } = supabase.storage.from("Storage").getPublicUrl(name);
    return data.publicUrl;
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-white">Storage</h2>
          <p className="text-slate-400">Manage your files in cloud storage.</p>
        </div>

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
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-white">Cloud Storage Usage</CardTitle>
                    <CardDescription className="text-slate-400">
                      Maximum total storage: 30MB (.txt, .md, .png, .jpg, .mp3, .wav, .ogg)
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => cloudInputRef.current?.click()}
                    disabled={uploading}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    Upload to Cloud
                  </Button>
                  <input
                    type="file"
                    className="hidden"
                    ref={cloudInputRef}
                    onChange={handleCloudUpload}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-slate-400">
                    <span>{formatSize(totalSize)} of 30MB used</span>
                    <span>{Math.round((totalSize / MAX_CLOUD_SIZE) * 100)}%</span>
                  </div>
                  <Progress value={(totalSize / MAX_CLOUD_SIZE) * 100} className="bg-slate-800" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cloudFiles.map((file) => (
                    <Card key={file.id} className="bg-slate-950 border-slate-800 overflow-hidden group">
                      <div className="aspect-video bg-slate-900 flex items-center justify-center overflow-hidden">
                        {file.metadata?.mimetype?.startsWith("image/") ? (
                          <img
                            src={getCloudPublicUrl(file.name)}
                            alt={file.name}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : file.metadata?.mimetype?.startsWith("audio/") ? (
                          <StorageCloudAudioDisplay file={file} audioUrl={cloudAudioUrls[file.id]} getCloudAudioUrl={getCloudAudioUrl} />
                        ) : (
                          <File className="w-12 h-12 text-slate-700" />
                        )}
                      </div>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm text-white truncate" title={file.name}>
                          {audioMetadata[file.id]
                            ? `${audioMetadata[file.id].title || 'Unknown Title'} - ${audioMetadata[file.id].artist || 'Unknown Artist'}`
                            : file.name}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          {formatSize(file.metadata?.size || 0)} • {new Date(file.created_at).toLocaleDateString()}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                          asChild
                        >
                          <a href={getCloudPublicUrl(file.name)} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            View
                          </a>
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                          onClick={() => handleCloudDownload(file.name)}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteCloudFile(file.name)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="links" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Linked Images</CardTitle>
                <CardDescription className="text-slate-400">
                  Track up to 100 external image links ({linkedImages.length}/100)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex gap-2">
                  <Input
                    placeholder="https://example.com/image.png"
                    value={newLinkUrl}
                    onChange={(e) => setNewLinkUrl(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white"
                  />
                  <Button
                    onClick={handleAddLink}
                    disabled={linkedImages.length >= 100}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Link
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {linkedImages.map((link) => (
                    <Card key={link.id} className="bg-slate-950 border-slate-800 overflow-hidden group relative">
                      <div className="aspect-square bg-slate-900 overflow-hidden">
                        <img
                          src={link.url}
                          alt="Linked image"
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/placeholder.svg";
                          }}
                        />
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 bg-slate-900/80 backdrop-blur-sm"
                          asChild
                        >
                          <a href={link.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </Button>
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => deleteLink(link.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
