import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  Upload,
  File,
  Image as ImageIcon,
  Link as LinkIcon,
  Trash2,
  ExternalLink,
  Plus,
  Loader2,
  HardDrive,
  Cloud
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { LocalFile } from "@shared/api";

const MAX_CLOUD_SIZE = 10 * 1024 * 1024; // 10MB

export default function Storage() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [localFiles, setLocalFiles] = useState<LocalFile[]>([]);
  const [linkedImages, setLinkedImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [totalCloudSize, setTotalCloudSize] = useState(0);
  const [newLinkUrl, setNewLinkUrl] = useState("");

  const cloudInputRef = useRef<HTMLInputElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);

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

  const fetchCloudFiles = async () => {
    const { data, error } = await supabase.storage.from("Storage").list("", {
      sortBy: { column: "created_at", order: "desc" }
    });

    if (error) {
      console.error("Cloud storage error:", error);
      return;
    }

    setCloudFiles(data || []);
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

    // Client-side validation (matching server-side enforcement)
    const allowedTypes = ["text/plain", "text/markdown", "image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Only .txt, .md, .png, and .jpg are allowed on cloud storage.",
        variant: "destructive"
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB.",
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
    try {
      const response = await fetch(`/api/storage/files/${name}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });
      if (response.ok) {
        fetchLocalFiles();
      } else {
        toast({ title: "Delete failed", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Delete failed", variant: "destructive" });
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
    return supabase.storage.from("Storage").getPublicUrl(name).data.publicUrl;
  };

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
                      Maximum total storage: 10MB (.txt, .md, .png, .jpg)
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
                    accept=".txt,.md,.png,.jpg,.jpeg"
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">{formatSize(totalCloudSize)} used</span>
                    <span className="text-slate-400">10MB limit</span>
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
                        ) : (
                          <File className="w-12 h-12 text-slate-700" />
                        )}
                      </div>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm text-white truncate">{file.name}</CardTitle>
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
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteCloudFile(file.name)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                  {cloudFiles.length === 0 && !loading && (
                    <div className="col-span-full text-center py-12 text-slate-500">
                      No files uploaded to cloud storage yet.
                    </div>
                  )}
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
                        <File className="w-12 h-12 text-slate-700" />
                      </div>
                      <CardHeader className="p-4">
                        <CardTitle className="text-sm text-white truncate" title={file.name}>
                          {file.name}
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
                          onClick={() => {
                            fetch(file.url, {
                              headers: { Authorization: `Bearer ${session?.access_token}` }
                            }).then(res => res.blob()).then(blob => {
                              const url = window.URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = file.name;
                              a.click();
                            });
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
                  {localFiles.length === 0 && !loading && (
                    <div className="col-span-full text-center py-12 text-slate-500">
                      No files in local storage yet.
                    </div>
                  )}
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
                  {linkedImages.length === 0 && !loading && (
                    <div className="col-span-full text-center py-12 text-slate-500">
                      No linked images yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
