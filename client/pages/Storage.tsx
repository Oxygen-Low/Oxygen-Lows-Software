import * as mmb from "music-metadata-browser";
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
  HardDrive, Music,
  Cloud,
  Link as LinkIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { LocalFile } from "@shared/api";

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
      ) : (
        <audio
          controls
          className="w-full h-8"
          src={url || ""}
          crossOrigin="anonymous"
        >
          Your browser does not support the audio element.
        </audio>
      )}
    </div>
  );
}

function StorageLocalAudioDisplay({ file, blobUrl, getBlobUrlForTrack }: { file: LocalFile; blobUrl?: string; getBlobUrlForTrack: (file: LocalFile) => Promise<string | null> }) {
  const [url, setUrl] = useState<string | null>(blobUrl || null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (blobUrl) {
      setUrl(blobUrl);
      return;
    }

    const resolveUrl = async () => {
      try {
        const resolvedUrl = await getBlobUrlForTrack(file);
        if (resolvedUrl) {
          setUrl(resolvedUrl);
          setError(null);
        } else {
          setError("Unable to load");
        }
      } catch (err) {
        console.error("Error resolving audio URL:", err);
        setError("Failed to load");
      }
    };

    resolveUrl();
  }, [file, blobUrl, getBlobUrlForTrack]);

  return (
    <div className="flex flex-col items-center gap-4 w-full p-4">
      <Music className="w-12 h-12 text-cyan-500" />
      {error ? (
        <p className="text-xs text-red-500 text-center">{error}</p>
      ) : (
        <audio
          controls
          className="w-full h-8"
          src={url || ""}
          crossOrigin="anonymous"
        >
          Your browser does not support the audio element.
        </audio>
      )}
    </div>
  );
}

export default function Storage() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [audioMetadata, setAudioMetadata] = useState<Record<string, { title?: string; artist?: string }>>({});
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [linkedImages, setLinkedImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [totalCloudSize, setTotalCloudSize] = useState(0);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [localBlobUrls, setLocalBlobUrls] = useState<Record<string, string>>({});
  const [cloudAudioUrls, setCloudAudioUrls] = useState<Record<string, string>>({});

  const localBlobUrlsRef = useRef<Record<string, string>>({});
  const cloudAudioUrlsRef = useRef<Record<string, string>>({});

  const cloudInputRef = useRef<HTMLInputElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localBlobUrlsRef.current = localBlobUrls;
  }, [localBlobUrls]);

  useEffect(() => {
    cloudAudioUrlsRef.current = cloudAudioUrls;
  }, [cloudAudioUrls]);

  const getBlobUrlForTrack = useCallback(async (file: LocalFile) => {
    if (localBlobUrls[file.name]) {
      return localBlobUrls[file.name];
    }

    try {
      const res = await fetch(file.url, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setLocalBlobUrls(prev => ({ ...prev, [file.name]: url }));
      return url;
    } catch (error) {
      console.error("Failed to fetch blob for track:", error);
      return null;
    }
  }, [session?.access_token, localBlobUrls]);

  useEffect(() => {
    return () => {
      Object.values(localBlobUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
      Object.values(cloudAudioUrlsRef.current).forEach(url => {
        if (url.startsWith("blob:")) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session]);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchCloudFiles(),
        fetchLocalFiles(),
        fetchLinkedImages()
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const extractAudioMetadata = async (blob: Blob, id: string) => {
    try {
      const metadata = await mmb.parseBlob(blob);
      setAudioMetadata(prev => ({
        ...prev,
        [id]: {
          title: metadata.common.title,
          artist: metadata.common.artist
        }
      }));
    } catch (error) {
      console.error("Error extracting metadata:", error);
    }
  };

  const fetchCloudFiles = async () => {
    const { data, error } = await supabase.storage.from("Storage").list("", {
      sortBy: { column: "created_at", order: "desc" }
    });

    if (error) {
      console.error("Cloud storage error:", error);
      return;
    }

    setCloudFiles(data || []);
    data?.forEach(file => {
      if (file.metadata?.mimetype?.startsWith("audio/")) {
        supabase.storage.from("Storage").download(file.name).then(({ data: blob }) => {
          if (blob) extractAudioMetadata(blob, file.id);
        });
      }
    });
    const total = data?.reduce((acc, file) => acc + (file.metadata?.size || 0), 0) || 0;
    setTotalCloudSize(total);
  };

  const fetchLocalFiles = async () => {
    try {
      const response = await fetch("/api/storage/files", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });
      const data = await response.json();
      setLocalFiles(data.files || []);

      data.files?.forEach((file: LocalFile) => {
        if (file.type?.startsWith("audio/") || file.name.match(/\.(mp3|wav|ogg)$/i)) {
          fetch(file.url, {
            headers: { Authorization: `Bearer ${session?.access_token}` }
          }).then(res => res.blob()).then(blob => {
            if (blob) {
              extractAudioMetadata(blob, file.name);
            }
          });
        }
      });
    } catch (error) {
      console.error("Local storage error:", error);
    }
  };

  const fetchLinkedImages = async () => {
    const { data, error } = await supabase
      .from("image_links")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Image links error:", error);
      return;
    }

    setLinkedImages(data || []);
  };

  const handleCloudUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["text/plain", "text/markdown", "image/png", "image/jpeg", "audio/mpeg", "audio/wav", "audio/ogg", "audio/x-wav", "audio/x-pn-wav"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only .txt, .md, .png, .jpg, .mp3, .wav, and .ogg are allowed on cloud storage.",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 30MB.",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);
    const fileName = `${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("Storage").upload(fileName, file);

    if (error) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({ title: "Success", description: "File uploaded to cloud storage." });
      fetchCloudFiles();
    }
    setUploading(false);
  };

  const handleLocalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/storage/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        },
        body: formData
      });

      if (response.ok) {
        toast({ title: "Success", description: "File uploaded to local storage." });
        fetchLocalFiles();
      } else {
        const errorData = await response.json();
        toast({
          title: "Upload failed",
          description: errorData.message,
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Server error occurred.",
        variant: "destructive"
      });
    }
    setUploading(false);
  };

  const handleCloudDownload = async (name: string) => {
    const { data, error } = await supabase.storage.from("Storage").download(name);
    if (error) {
      toast({ title: "Download failed", description: error.message, variant: "destructive" });
      return;
    }
    const url = window.URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleAddLink = async () => {
    if (!newLinkUrl) return;

    const { error } = await supabase
      .from("image_links")
      .insert([{ url: newLinkUrl, user_id: session?.user.id }]);

    if (error) {
      toast({
        title: "Failed to add link",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({ title: "Success", description: "Image link added." });
      setNewLinkUrl("");
      fetchLinkedImages();
    }
  };

  const deleteCloudFile = async (name: string) => {
    const { error } = await supabase.storage.from("Storage").remove([name]);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      fetchCloudFiles();
    }
  };

  const deleteLocalFile = async (name: string) => {
    const showFailToast = () => toast({
      title: "Delete failed",
      description: "Failed to delete local file.",
      variant: "destructive"
    });

    try {
      const response = await fetch(`/api/storage/files/${name}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });
      if (response.ok) {
        if (localBlobUrls[name]) {
          URL.revokeObjectURL(localBlobUrls[name]);
          setLocalBlobUrls(prev => {
            const next = { ...prev };
            delete next[name];
            return next;
          });
        }
        fetchLocalFiles();
      } else {
        showFailToast();
      }
    } catch (error) {
      console.error("Delete local file error:", error);
      showFailToast();
      fetchLocalFiles();
    }
  };

  const deleteLink = async (id: string) => {
    const { error } = await supabase.from("image_links").delete().eq("id", id);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    } else {
      fetchLinkedImages();
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
    return data?.publicUrl || "";
  };

  const getCloudAudioUrl = useCallback(async (file: any) => {
    if (cloudAudioUrls[file.id]) {
      return cloudAudioUrls[file.id];
    }

    try {
      const { data, error } = await supabase.storage
        .from("Storage")
        .download(file.name);

      if (error || !data) {
        console.error("Failed to download cloud audio:", error);
        const publicUrl = getCloudPublicUrl(file.name);
        setCloudAudioUrls(prev => ({ ...prev, [file.id]: publicUrl }));
        return publicUrl;
      }

      const blobUrl = URL.createObjectURL(data);
      setCloudAudioUrls(prev => ({ ...prev, [file.id]: blobUrl }));
      return blobUrl;
    } catch (error) {
      console.error("Error resolving cloud audio URL:", error);
      const publicUrl = getCloudPublicUrl(file.name);
      return publicUrl;
    }
  }, [cloudAudioUrls]);

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col gap-2">
          <h2 className="text-3xl font-bold tracking-tight text-white">Storage</h2>
          <p className="text-slate-400">Manage your files in cloud and local storage.</p>
        </div>

        <Tabs defaultValue="cloud" className="w-full">
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="cloud" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <Cloud className="w-4 h-4 mr-2" />
              Cloud Storage
            </TabsTrigger>
            <TabsTrigger value="local" className="data-[state=active]:bg-cyan-500/10 data-[state=active]:text-cyan-400">
              <HardDrive className="w-4 h-4 mr-2" />
              Local Storage
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
                    accept=".txt,.md,.png,.jpg,.jpeg,.mp3,.wav,.ogg"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{formatSize(totalCloudSize)} used</span>
                    <span className="text-slate-400">30MB limit</span>
                  </div>
                  <Progress value={(totalCloudSize / MAX_CLOUD_SIZE) * 100} className="h-2 bg-slate-800" />
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

          <TabsContent value="local" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle className="text-white">Local Storage</CardTitle>
                    <CardDescription className="text-slate-400">
                      No size limits, all file types accepted. Stored on the server.
                    </CardDescription>
                  </div>
                  <Button
                    onClick={() => localInputRef.current?.click()}
                    disabled={uploading}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white"
                  >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                    Upload Locally
                  </Button>
                  <input
                    type="file"
                    className="hidden"
                    ref={localInputRef}
                    onChange={handleLocalUpload}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {localFiles.map((file) => (
                    <Card key={file.name} className="bg-slate-950 border-slate-800 overflow-hidden group">
                      <div className="aspect-video bg-slate-900 flex items-center justify-center">
                        {file.type?.startsWith("audio/") || file.name.match(/\.(mp3|wav|ogg)$/i) ? (
                          <StorageLocalAudioDisplay file={file} blobUrl={localBlobUrls[file.name]} getBlobUrlForTrack={getBlobUrlForTrack} />
                        ) : (
                          <File className="w-12 h-12 text-slate-700" />
                        )}
                      </div>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm text-white truncate" title={file.name}>
                          {audioMetadata[file.name]
                            ? `${audioMetadata[file.name].title || 'Unknown Title'} - ${audioMetadata[file.name].artist || 'Unknown Artist'}`
                            : file.name}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500">
                          {formatSize(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                          onClick={async () => {
                            const url = await getBlobUrlForTrack(file);
                            if (url) {
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = file.name;
                              a.click();
                            }
                          }}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteLocalFile(file.name)}
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
