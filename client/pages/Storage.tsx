import { useState, useEffect, useRef, useMemo } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  Upload,
  Trash2,
  FileText,
  Image as ImageIcon,
  Music,
  Database,
  ExternalLink,
  Loader2,
  Globe,
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  Lock,
  ListOrdered,
  Layers,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AudioPlayerPreview } from "@/components/AudioPlayerPreview";

interface FileVerificationInfo {
  id: string;
  status: "pending" | "approved" | "rejected";
  target_type: "public_asset" | "public_usage";
  title: string;
  description: string | null;
  rejection_reason: string | null;
  created_at: string;
  original_file_path: string | null;
}

export default function Storage() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [activeMainTab, setActiveMainTab] = useState<"files" | "submissions">("files");

  const [cloudFiles, setCloudFiles] = useState<any[]>([]);
  const [cloudFileSignedUrls, setCloudFileSignedUrls] = useState<
    Record<string, string>
  >({});
  const [uploading, setUploading] = useState(false);
  const [totalSize, setTotalSize] = useState(0);
  const [dbStats, setDbStats] = useState<any[]>([]);
  const cloudInputRef = useRef<HTMLInputElement>(null);

  // Published public assets and verifications lists
  const [publicAssetsMap, setPublicAssetsMap] = useState<Record<string, any>>({});
  const [verificationsList, setVerificationsList] = useState<FileVerificationInfo[]>([]);
  const [verificationsMap, setVerificationsMap] = useState<Record<string, FileVerificationInfo[]>>({});

  // Submission Dialog State
  const [selectedFileForAction, setSelectedFileForAction] = useState<any | null>(null);
  const [actionType, setActionType] = useState<"publish" | "verify_multiplayer" | null>(null);
  const [submitTitle, setSubmitTitle] = useState("");
  const [submitDesc, setSubmitDesc] = useState("");
  const [submitCategory, setSubmitCategory] = useState("other");
  const [submittingAction, setSubmittingAction] = useState(false);

  // Denial Reason Dialog State
  const [selectedDenialReason, setSelectedDenialReason] = useState<string | null>(null);
  const [deletingVerifId, setDeletingVerifId] = useState<string | null>(null);

  const fetchCloudFiles = async () => {
    if (!session?.user?.id) return;
    try {
      // 1. Fetch private storage files
      const { data: privData, error: privError } = await supabase.storage
        .from("Storage")
        .list(session.user.id);
      if (privError) throw privError;

      // 2. Fetch public-assets storage files for this user
      const { data: pubData } = await supabase.storage
        .from("public-assets")
        .list(session.user.id);
        
      const files = privData || [];
      const publicFiles = pubData || [];
      
      // Mark bucket for rendering and deletion
      files.forEach(f => { (f as any).bucket = "Storage"; });
      publicFiles.forEach(f => { (f as any).bucket = "public-assets"; });

      const allFiles = [...files, ...publicFiles];
      setCloudFiles(allFiles);

      // Aggregate total size
      const privateSize = files.reduce((acc, f) => acc + (f.metadata?.size || 0), 0);
      const pubSize = publicFiles.reduce((acc, f) => acc + (f.metadata?.size || 0), 0);
      setTotalSize(privateSize + pubSize);

      // Get signed URLs for private files
      if (files.length > 0) {
        const filePaths = files.map((f) => `${session.user.id}/${f.name}`);
        const { data: signedData, error: signedError } = await supabase.storage
          .from("Storage")
          .createSignedUrls(filePaths, 3600);

        const urls: Record<string, string> = {};
        if (!signedError && signedData) {
          signedData.forEach((s: any, i: number) => {
            const file = files[i];
            if (s?.signedUrl) {
              if (file?.id) urls[file.id] = s.signedUrl;
              if (file?.name) urls[file.name] = s.signedUrl;
              const cleanPath = s.path?.split("/").pop();
              if (cleanPath) urls[cleanPath] = s.signedUrl;
            }
          });
        }

        // Fallback for any file without a signed URL
        for (const file of files) {
          if (!urls[file.id] && !urls[file.name]) {
            const { data } = await supabase.storage
              .from("Storage")
              .createSignedUrl(`${session.user.id}/${file.name}`, 3600)
              .catch(() => ({ data: null }));
            if (data?.signedUrl) {
              if (file.id) urls[file.id] = data.signedUrl;
              urls[file.name] = data.signedUrl;
            }
          }
        }
        setCloudFileSignedUrls(urls);
      }

      // 3. Fetch published public_assets for user
      const { data: pubAssets } = await supabase
        .from("public_assets")
        .select("*")
        .eq("uploader_id", session.user.id);

      const pMap: Record<string, any> = {};
      (pubAssets || []).forEach((pa: any) => {
        const fname = pa.file_path.split("/").pop() || pa.name;
        pMap[fname] = pa;
        pMap[pa.file_path] = pa;
      });
      setPublicAssetsMap(pMap);

      // 4. Fetch verifications for user
      const { data: verifs } = await supabase
        .from("asset_verifications")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("asset_type", "file")
        .order("created_at", { ascending: false });

      const list = (verifs || []) as FileVerificationInfo[];
      setVerificationsList(list);

      const vMap: Record<string, FileVerificationInfo[]> = {};
      list.forEach((v: any) => {
        const fname = v.original_file_path?.split("/").pop() || v.title;
        if (!vMap[fname]) vMap[fname] = [];
        vMap[fname].push(v);
      });
      setVerificationsMap(vMap);
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
        "data_saves",
        "data_save_categories",
        "defender_routes",
        "defender_events",
        "defender_outbound",
      ];
      const stats = await Promise.all(
        tables.map(async (table) => {
          const { count } = await supabase
            .from(table)
            .select("*", { count: "exact", head: true });
          return { name: table, size: (count || 0) * 1024 };
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

      // Check if file previously had approved verification -> invalidate it because it changed
      const filePath = `${session.user.id}/${file.name}`;
      const existingVerif = (verificationsMap[file.name] || []).find((v) => v.status === "approved");

      if (existingVerif && session.access_token) {
        await fetch("/api/assets/verifications/invalidate", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asset_type: "file",
            original_file_path: filePath,
          }),
        }).catch(() => {});
        toast.info(t("storage.reverificationRequired", undefined, "File modified. Previous verification has been reset and requires re-verification."));
      }

      const { error } = await supabase.storage
        .from("Storage")
        .upload(filePath, file, { upsert: true });

      if (error) throw error;
      toast.success(t("storage.fileUploaded", undefined, "File uploaded successfully"));
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteCloudFile = async (name: string, bucket = "Storage") => {
    try {
      if (name.includes("..")) throw new Error("Invalid file name");
      const filePath = `${session?.user?.id}/${name}`;

      // Invalidate verifications if deleted
      if (session?.access_token) {
        await fetch("/api/assets/verifications/invalidate", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asset_type: "file",
            original_file_path: filePath,
          }),
        }).catch(() => {});
      }

      const { error } = await supabase.storage
        .from(bucket)
        .remove([filePath]);
      if (error) throw error;
      toast.success(t("storage.fileDeleted", undefined, "File deleted successfully"));
      fetchCloudFiles();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUnpublishFile = async (file: any) => {
    if (!session?.access_token) return;
    const pubAsset = publicAssetsMap[file.name];
    if (!pubAsset) return;

    try {
      const res = await fetch("/api/assets/unpublish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "file", id: pubAsset.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to unpublish file");
      }

      toast.success(t("publicAssets.unpublishSuccess", undefined, "Asset unpublished successfully."));
      fetchCloudFiles();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleOpenPublishModal = (file: any) => {
    setSelectedFileForAction(file);
    setActionType("publish");
    setSubmitTitle(file.name.replace(/\.[^/.]+$/, ""));
    setSubmitDesc("");
    const mime = file.metadata?.mimetype || "";
    if (mime.startsWith("image/")) setSubmitCategory("image");
    else if (mime.startsWith("audio/")) setSubmitCategory("audio");
    else if (mime.startsWith("application/json")) setSubmitCategory("data");
    else setSubmitCategory("other");
  };

  const handleOpenVerifyMultiplayerModal = (file: any) => {
    setSelectedFileForAction(file);
    setActionType("verify_multiplayer");
    setSubmitTitle(file.name);
    setSubmitDesc("");
  };

  const handleVerificationSubmit = async () => {
    if (!session?.access_token || !selectedFileForAction || !actionType) return;

    setSubmittingAction(true);
    try {
      const fullPath = `${session.user.id}/${selectedFileForAction.name}`;
      const res = await fetch("/api/assets/verifications/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset_type: "file",
          target_type: actionType === "publish" ? "public_asset" : "public_usage",
          title: submitTitle || selectedFileForAction.name,
          description: submitDesc,
          original_file_path: fullPath,
          file_size: selectedFileForAction.metadata?.size || 0,
          mime_type: selectedFileForAction.metadata?.mimetype || "application/octet-stream",
          metadata: {
            category: submitCategory,
            fileName: selectedFileForAction.name,
            display_name: submitTitle || selectedFileForAction.name,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit verification request");
      }

      toast.success(t("verification.requestSubmitted", undefined, "Verification request submitted successfully!"));
      setSelectedFileForAction(null);
      setActionType(null);
      fetchCloudFiles();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDeleteVerification = async (id: string) => {
    if (
      !window.confirm(
        t(
          "verification.deleteSubmissionConfirm",
          undefined,
          "Are you sure you want to delete this verification request?",
        ),
      )
    ) {
      return;
    }
    setDeletingVerifId(id);
    try {
      if (!session?.access_token) throw new Error("Not authenticated");
      const res = await fetch(`/api/assets/verifications/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to delete verification request");
      }
      toast.success(
        t(
          "verification.submissionDeleted",
          undefined,
          "Verification request deleted successfully",
        ),
      );
      await fetchCloudFiles();
    } catch (err: any) {
      console.error("Error deleting verification:", err);
      toast.error(err.message || "Failed to delete verification request");
    } finally {
      setDeletingVerifId(null);
    }
  };

  const categories = useMemo(() => {
    const cats = {
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
      if (type.startsWith("image/")) {
        cats.image.files.push(f);
        cats.image.size += size;
      } else if (type.startsWith("audio/")) {
        cats.audio.files.push(f);
        cats.audio.size += size;
      } else {
        cats.text.files.push(f);
        cats.text.size += size;
      }
    });

    const totalDataSize = dbStats.reduce((acc, s) => acc + s.size, 0);
    cats.data.size = totalDataSize;

    const tableNames: Record<string, string> = {
      characters: "Characters",
      chats: "Chats",
      chat_messages: "Chat Messages",
      user_preferences: "Preferences",
      data_saves: "Data Saves",
      data_save_categories: "Data Save Categories",
      defender_routes: "Web Defender (Routes)",
      defender_events: "Web Defender (Events)",
      defender_outbound: "Web Defender (Outbounds)",
    };

    cats.data.files = dbStats.map((s) => ({
      name: tableNames[s.name] || s.name,
      rawName: s.name,
      size: s.size,
    }));

    return cats;
  }, [cloudFiles, dbStats]);

  const totalAll = totalSize + categories.data.size;
  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Layout>
      <Tabs
        value={activeMainTab}
        onValueChange={(val) => setActiveMainTab(val as any)}
        className="space-y-8 animate-in fade-in duration-500 pb-16"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {t("storage.title", undefined, "Storage")}
            </h2>
            <p className="text-sm sm:text-base text-slate-400">
              {t("storage.subtitle", undefined, "Upload, manage, and share your files securely in the cloud.")}
            </p>
          </div>

          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger value="files" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-xs">
              <Layers className="w-3.5 h-3.5 mr-1.5" />
              {t("storage.filesTab", undefined, "Files")}
            </TabsTrigger>
            <TabsTrigger value="submissions" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white text-xs">
              <ListOrdered className="w-3.5 h-3.5 mr-1.5" />
              {t("storage.submissionsTab", undefined, "Verification Submissions")}
              {verificationsList.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-300">
                  {verificationsList.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="files" className="space-y-8 mt-0 border-0 p-0">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl text-white">{t("storage.storageUsed", undefined, "Overall Usage")}</CardTitle>
                <CardDescription className="text-xs sm:text-sm text-slate-400">
                  Total space used by private files, published public assets, and application data
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs sm:text-sm text-slate-400">
                    <span>{formatSize(totalAll)} used</span>
                    <span>Limit: 30MB (Files & Public Assets)</span>
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
                                    {t("common.noData", undefined, "No items")}
                                  </p>
                                )}
                              </div>
                            </ScrollArea>
                          </HoverCardContent>
                        </HoverCard>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3 sm:gap-4 pt-2">
                    {Object.entries(categories).map(([key, cat]) => (
                      <div key={key} className="flex items-center gap-1.5 sm:gap-2">
                        <div className={cn("w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full", cat.color)} />
                        <span className="text-xs text-slate-400">{cat.label}</span>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800 text-xs text-slate-400 leading-relaxed">
                    <span className="text-cyan-400 font-semibold mr-1">{t("storage.webDefenderAdviceTitle", undefined, "Web Defender Storage:")}</span>
                    {t("storage.webDefenderAdviceDesc", undefined, "Stored data (routes, event log, outbounds) from Web Defender counts towards your storage usage. You are advised to keep event limits low if multiple Web Defender apps are enabled.")}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4 sm:space-y-6">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <div>
                  <h3 className="text-lg font-medium text-white">Files</h3>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Your uploaded files, published assets, and saved artifacts.
                  </p>
                </div>
                <div className="flex gap-2">
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
                    {t("storage.uploadFile", undefined, "Upload File")}
                  </Button>
                </div>
                <input
                  type="file"
                  className="hidden"
                  ref={cloudInputRef}
                  onChange={handleCloudUpload}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cloudFiles.map((file) => {
                  const pubAsset = publicAssetsMap[file.name];
                  const fileVerifs = verificationsMap[file.name] || [];
                  const pendingVerif = fileVerifs.find((v) => v.status === "pending");
                  const rejectedVerif = fileVerifs.find((v) => v.status === "rejected");
                  const usageApproved = fileVerifs.find((v) => v.target_type === "public_usage" && v.status === "approved");
                  const isAudio =
                    file.metadata?.mimetype?.startsWith("audio/") ||
                    /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus|wma)$/i.test(file.name);
                  const isImage =
                    file.metadata?.mimetype?.startsWith("image/") ||
                    /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name);

                  const signedUrl = cloudFileSignedUrls[file.id] || cloudFileSignedUrls[file.name];

                  return (
                    <Card
                      key={file.id}
                      className="bg-slate-950 border-slate-800 overflow-hidden group flex flex-col justify-between"
                    >
                      <div>
                        <div className="aspect-video bg-slate-900 relative flex items-center justify-center overflow-hidden">
                          {isImage && signedUrl ? (
                            <img
                              src={signedUrl}
                              alt={file.name}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : isAudio ? (
                            <div className="flex flex-col items-center justify-center gap-1.5 w-full p-3 bg-slate-950/40">
                              <Music className="w-8 h-8 text-cyan-400 shrink-0 mb-1" />
                              <AudioPlayerPreview
                                src={signedUrl}
                                filePath={`${session?.user?.id}/${file.name}`}
                                fileName={file.name}
                                bucket={file.bucket || "Storage"}
                                className="w-full"
                              />
                            </div>
                          ) : isImage ? (
                            <ImageIcon className="w-12 h-12 text-orange-500/70" />
                          ) : (
                            <FileText className="w-12 h-12 text-slate-700" />
                          )}

                          {/* Top Badges */}
                          <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                            {pubAsset && (
                              <Badge className="bg-emerald-500/80 text-white text-[10px] backdrop-blur-sm">
                                <Globe className="w-3 h-3 mr-1" />
                                {t("verification.publicBadge", undefined, "Public Asset")}
                              </Badge>
                            )}
                            {usageApproved && !pubAsset && (
                              <Badge className="bg-cyan-500/90 text-white text-[10px] backdrop-blur-sm border border-cyan-400/40">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                {t("storage.verifiedBadge", undefined, "Verified")}
                              </Badge>
                            )}
                            {pendingVerif && (
                              <Badge className="bg-amber-500/80 text-white text-[10px] backdrop-blur-sm">
                                <Clock className="w-3 h-3 mr-1" />
                                {t("verification.pendingReviewBadge", undefined, "Pending Review")}
                              </Badge>
                            )}
                            {rejectedVerif && (
                              <button
                                type="button"
                                onClick={() => setSelectedDenialReason(rejectedVerif.rejection_reason || "No reason provided.")}
                                className="text-left"
                              >
                                <Badge className="bg-rose-500/80 hover:bg-rose-600 text-white text-[10px] backdrop-blur-sm cursor-pointer">
                                  <XCircle className="w-3 h-3 mr-1" />
                                  {t("verification.rejectedBadge", undefined, "Verification Denied")}
                                </Badge>
                              </button>
                            )}
                          </div>
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
                      </div>

                      <CardContent className="p-4 pt-0 space-y-2">
                        <div className="flex gap-2">
                          {signedUrl ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white text-xs"
                              asChild
                            >
                              <a
                                href={signedUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> {t("common.view", undefined, "View")}
                              </a>
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 bg-slate-800 text-white opacity-50 cursor-not-allowed text-xs"
                              disabled
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> {t("common.view", undefined, "View")}
                            </Button>
                          )}

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="destructive"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Delete ${file.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  {t("storage.deleteConfirmTitle", undefined, "Are you sure you want to delete this file?")}
                                  <span className="sr-only"> Delete {file.name}</span>
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-slate-400">
                                  {t("storage.deleteConfirmDesc", undefined, "This action cannot be undone. This will permanently delete your file from cloud storage.")}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
                                  {t("common.cancel", undefined, "Cancel")}
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteCloudFile(file.name, file.bucket || "Storage")}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t("common.delete", undefined, "Delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>

                        {/* Actions */}
                        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                          {pubAsset ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-xs border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-rose-400"
                                >
                                  <Lock className="w-3 h-3 mr-1" />
                                  {t("publicAssets.makePrivate", undefined, "Make Private / Unpublish")}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t("publicAssets.makePrivate", undefined, "Unpublish Asset?")}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-slate-400">
                                    {t("publicAssets.makePrivateConfirm", undefined, "Are you sure you want to unpublish this asset? It will be removed from the public hub and reverted to private.")}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
                                    {t("common.cancel", undefined, "Cancel")}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleUnpublishFile(file)}
                                    className="bg-destructive text-destructive-foreground"
                                  >
                                    {t("common.delete", undefined, "Unpublish")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenPublishModal(file)}
                                className="flex-1 text-[11px] h-7 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                              >
                                <Globe className="w-3 h-3 mr-1 text-cyan-400" />
                                {t("verification.publishToPublicAssets", undefined, "Publish")}
                              </Button>

                              {!usageApproved && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleOpenVerifyMultiplayerModal(file)}
                                  className="flex-1 text-[11px] h-7 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                                >
                                  <ShieldCheck className="w-3 h-3 mr-1 text-emerald-400" />
                                  {t("storage.verifyForMultiplayer", undefined, "Verify")}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
        </TabsContent>

        <TabsContent value="submissions" className="space-y-4 mt-0 border-0 p-0">
            <div>
              <h3 className="text-lg font-medium text-white">
                {t("storage.submissionsTab", undefined, "Storage Verification Submissions")}
              </h3>
              <p className="text-xs sm:text-sm text-slate-400">
                Track status of your private and public storage asset verification requests.
              </p>
            </div>

            {verificationsList.length === 0 ? (
              <Card className="bg-slate-900 border-slate-800 text-center py-16">
                <CardContent>
                  <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <h3 className="text-base font-medium text-white">
                    {t("storage.noSubmissions", undefined, "No verification submissions for storage files yet.")}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Select a file in the Files tab to submit for multiplayer or public verification.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {verificationsList.map((sub) => (
                  <Card key={sub.id} className="bg-slate-900 border-slate-800 text-white p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-slate-800 text-cyan-400">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-sm text-white">{sub.title}</h4>
                            <Badge variant="outline" className="text-[10px] border-slate-700 bg-slate-800 text-slate-300">
                              {sub.target_type === "public_asset" ? "Public Asset Hub" : "Private (Multiplayer)"}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {sub.original_file_path?.split("/").pop() || "File"} • Submitted {new Date(sub.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {sub.status === "pending" && (
                          <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            {t("publicAssets.statusPending", undefined, "Pending Review")}
                          </Badge>
                        )}
                        {sub.status === "approved" && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            {sub.target_type === "public_asset" ? "Approved & Public" : t("verification.verifiedForMultiplayerBadge", undefined, "Verified")}
                          </Badge>
                        )}
                        {sub.status === "rejected" && (
                          <div className="flex items-center gap-2">
                            <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-xs">
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              {t("publicAssets.statusRejected", undefined, "Denied")}
                            </Badge>
                            {sub.rejection_reason && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedDenialReason(sub.rejection_reason)}
                                className="text-xs text-rose-400 hover:bg-rose-950/50 h-7 px-2"
                              >
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {t("verification.viewDenialReason", undefined, "Reason")}
                              </Button>
                            )}
                          </div>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deletingVerifId === sub.id}
                          onClick={() => handleDeleteVerification(sub.id)}
                          className="text-xs text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 h-7 px-2"
                          title={t("verification.deleteTooltip", undefined, "Delete verification")}
                        >
                          {deletingVerifId === sub.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {sub.status === "rejected" && sub.rejection_reason && (
                      <div className="mt-3 p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs space-y-1">
                        <span className="font-semibold text-rose-300">
                          {t("publicAssets.rejectionReason", undefined, "Denial Reason:")}
                        </span>
                        <p className="text-rose-200">{sub.rejection_reason}</p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
        </TabsContent>
      </Tabs>

      {/* Verification Submission Dialog */}
      <Dialog
        open={Boolean(selectedFileForAction)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedFileForAction(null);
            setActionType(null);
          }
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionType === "publish"
                ? t("publicAssets.publishTitle", undefined, "Publish to Public Assets")
                : t("verification.verifyForMultiplayerTitle", undefined, "Verify Asset")}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {actionType === "publish"
                ? t("publicAssets.verificationNotice", undefined, "Submissions must be verified by an administrator before appearing publicly.")
                : t("verification.verifyForMultiplayerDesc", undefined, "Submit this private asset for verification to use in multiplayer games and other settings without publishing it publicly.")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                {t("publicAssets.assetName", undefined, "Asset Title")}
              </label>
              <Input
                value={submitTitle}
                onChange={(e) => setSubmitTitle(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            {actionType === "publish" && (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  {t("publicAssets.assetCategory", undefined, "Category")}
                </label>
                <Select value={submitCategory} onValueChange={setSubmitCategory}>
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="audio">Audio / Sound</SelectItem>
                    <SelectItem value="model">3D Model / Asset</SelectItem>
                    <SelectItem value="data">Data / JSON</SelectItem>
                    <SelectItem value="text">Text / Document</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                {t("publicAssets.assetDescription", undefined, "Description")}
              </label>
              <Textarea
                value={submitDesc}
                onChange={(e) => setSubmitDesc(e.target.value)}
                placeholder="Optional description or usage notes..."
                className="bg-slate-800 border-slate-700 text-white h-20"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedFileForAction(null);
                setActionType(null);
              }}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {t("common.cancel", undefined, "Cancel")}
            </Button>
            <Button
              onClick={handleVerificationSubmit}
              disabled={submittingAction || !submitTitle.trim()}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {submittingAction ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {t("publicAssets.submitForVerification", undefined, "Submit for Review")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Denial Reason Dialog */}
      <Dialog
        open={Boolean(selectedDenialReason)}
        onOpenChange={(open) => {
          if (!open) setSelectedDenialReason(null);
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5" />
              {t("verification.rejectionReasonDialogTitle", undefined, "Verification Denial Reason")}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t(
                "verification.rejectionReasonDialogDesc",
                undefined,
                "Your submission was reviewed and denied with the following reason:",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-rose-950/40 border border-rose-800/60 rounded-lg text-sm text-rose-200 leading-relaxed whitespace-pre-wrap">
            {selectedDenialReason}
          </div>

          <DialogFooter>
            <Button
              onClick={() => setSelectedDenialReason(null)}
              className="bg-slate-800 hover:bg-slate-700 text-white"
            >
              {t("common.close", undefined, "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
