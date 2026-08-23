import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/contexts/LanguageContext";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/storage";
import {
  getActiveMasterKey,
  isCategoryEncryptionEnabled,
  encryptCharacterData,
  decryptCharacterData,
} from "@/lib/crypto";
import {
  Loader2,
  Download,
  Upload,
  Heart,
  Globe,
  User,
  Search,
  ArrowUpDown,
  FileText,
  Image as ImageIcon,
  Music,
  Database,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AudioPlayerPreview } from "@/components/AudioPlayerPreview";

interface PublicCharacter {
  id: string;
  uploader_id: string;
  original_character_id: string | null;
  name: string;
  display_name: string | null;
  image_url: string | null;
  image_path: string | null;
  short_description: string | null;
  appearance: string | null;
  personality: string | null;
  hidden_description: string | null;
  backstory: string | null;
  is_universe: boolean;
  downloads: number;
  created_at: string;
  author_username?: string;
  likes_count: number;
  is_liked_by_user: boolean;
  item_type: "character" | "universe";
}

interface PublicFileAsset {
  id: string;
  uploader_id: string;
  name: string;
  display_name: string | null;
  category: string;
  description: string | null;
  file_path: string;
  file_size: number;
  mime_type: string | null;
  downloads: number;
  created_at: string;
  author_username?: string;
  likes_count: number;
  is_liked_by_user: boolean;
  public_url?: string;
  item_type: "file";
}

interface LocalCharacter {
  id: string;
  name: string;
  display_name: string | null;
  is_universe: boolean;
  short_description: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  hidden_description: string | null;
  image_path: string | null;
}

interface VerificationSubmission {
  id: string;
  user_id: string;
  asset_type: "file" | "character" | "universe";
  target_type: "public_asset" | "public_usage";
  status: "pending" | "approved" | "rejected";
  title: string;
  description: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  original_file_path: string | null;
  metadata: any;
}

type TabType = "characters" | "universes" | "files" | "submissions";
type SortOption = "most_liked" | "most_recent" | "most_downloaded";

export function PublicAssetsApp() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<TabType>("characters");
  const [sortBy, setSortBy] = useState<SortOption>("most_recent");
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<PublicCharacter[]>([]);
  const [fileAssets, setFileAssets] = useState<PublicFileAsset[]>([]);
  const [mySubmissions, setMySubmissions] = useState<VerificationSubmission[]>([]);

  const [localCharacters, setLocalCharacters] = useState<LocalCharacter[]>([]);
  const [storageFiles, setStorageFiles] = useState<any[]>([]);

  // Publish / Submission Dialog State
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishAssetType, setPublishAssetType] = useState<"character" | "universe" | "file">("character");
  const [selectedCharId, setSelectedCharId] = useState<string>("");
  const [selectedStorageFileName, setSelectedStorageFileName] = useState<string>("");
  const [publishTitle, setPublishTitle] = useState("");
  const [publishDescription, setPublishDescription] = useState("");
  const [publishCategory, setPublishCategory] = useState("other");
  const [submitting, setSubmitting] = useState(false);

  // Details Dialog State
  const [selectedChar, setSelectedChar] = useState<PublicCharacter | null>(null);
  const [selectedFile, setSelectedFile] = useState<PublicFileAsset | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

  // Selected rejection reason modal
  const [viewReasonSub, setViewReasonSub] = useState<VerificationSubmission | null>(null);

  useEffect(() => {
    fetchData();
  }, [session?.user?.id]);

  const fetchData = async () => {
    if (!session?.user?.id) return;
    try {
      setLoading(true);

      // 1. Fetch Public Characters
      const { data: pubCharsData } = await supabase
        .from("public_characters")
        .select("*");

      // 2. Fetch Public Assets (files)
      const { data: pubFilesData } = await supabase
        .from("public_assets")
        .select("*");

      // 3. Fetch Likes for both
      const { data: charLikesData } = await supabase
        .from("public_character_likes")
        .select("public_character_id, user_id");

      const { data: fileLikesData } = await supabase
        .from("public_asset_likes")
        .select("public_asset_id, user_id");

      // Collect user IDs for profile lookup
      const allUploaderIds = [
        ...new Set([
          ...(pubCharsData || []).map((c: any) => c.uploader_id),
          ...(pubFilesData || []).map((f: any) => f.uploader_id),
        ]),
      ].filter(Boolean);

      let profilesData: any[] = [];
      if (allUploaderIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, username")
          .in("user_id", allUploaderIds);
        if (profs) profilesData = profs;
      }

      // Process characters
      const processedChars: PublicCharacter[] = (pubCharsData || []).map((item: any) => {
        const likes = (charLikesData || []).filter((l: any) => l.public_character_id === item.id);
        const isLiked = likes.some((l: any) => l.user_id === session.user.id);
        const profile = profilesData.find((p: any) => p.user_id === item.uploader_id);
        return {
          ...item,
          author_username: profile?.username || "Unknown",
          likes_count: likes.length,
          is_liked_by_user: isLiked,
          item_type: item.is_universe ? "universe" : "character",
        };
      });

      const charsWithUrls = await attachSignedImageUrls(processedChars);
      setCharacters(charsWithUrls);

      // Process files
      const processedFiles: PublicFileAsset[] = (pubFilesData || []).map((item: any) => {
        const likes = (fileLikesData || []).filter((l: any) => l.public_asset_id === item.id);
        const isLiked = likes.some((l: any) => l.user_id === session.user.id);
        const profile = profilesData.find((p: any) => p.user_id === item.uploader_id);

        const cleanPath = (item.file_path || "").replace(/^\/+/, "");
        const { data: pubUrlData } = storage
          .from("public-assets")
          .getPublicUrl(cleanPath);

        return {
          ...item,
          author_username: profile?.username || "Unknown",
          likes_count: likes.length,
          is_liked_by_user: isLiked,
          public_url: pubUrlData?.publicUrl || "",
          item_type: "file",
        };
      });
      setFileAssets(processedFiles);

      // Fetch user's verifications & local resources
      fetchUserSubmissions();
      fetchLocalCharacters();
      fetchStorageFiles();
    } catch (err: any) {
      console.error("Error fetching public assets:", err);
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserSubmissions = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/assets/verifications/my", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMySubmissions(data.verifications || []);
      }
    } catch (err) {
      console.error("Error fetching user submissions:", err);
    }
  };

  const fetchLocalCharacters = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const key = getActiveMasterKey();
      const decrypted = await Promise.all(
        (data || []).map((c: any) => decryptCharacterData(c, key)),
      );
      setLocalCharacters(decrypted);
    } catch (err) {
      console.error("Error fetching local characters:", err);
    }
  };

  const fetchStorageFiles = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await storage
        .from("Storage")
        .list(session.user.id);
      if (!error && data) {
        setStorageFiles(data);
      }
    } catch (err) {
      console.error("Error fetching storage files:", err);
    }
  };

  const attachSignedImageUrls = async (chars: any[]) => {
    return Promise.all(
      (chars || []).map(async (char) => {
        if (char.image_path) {
          if (char.image_path.includes("..")) return { ...char, image_url: "" };
          const { data: urlData } = await storage
            .from("Storage")
            .createSignedUrl(char.image_path, 3600)
            .catch(() => ({ data: null }));
          if (urlData?.signedUrl) return { ...char, image_url: urlData.signedUrl };
          return { ...char, image_url: "" };
        }
        return char;
      }),
    );
  };

  const handleLikeCharacter = async (item: PublicCharacter, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session?.user?.id) return;

    const isLiking = !item.is_liked_by_user;
    setCharacters((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              is_liked_by_user: isLiking,
              likes_count: i.likes_count + (isLiking ? 1 : -1),
            }
          : i,
      ),
    );

    try {
      if (isLiking) {
        await supabase.from("public_character_likes").insert({
          user_id: session.user.id,
          public_character_id: item.id,
        });
      } else {
        await supabase
          .from("public_character_likes")
          .delete()
          .match({ user_id: session.user.id, public_character_id: item.id });
      }
    } catch (err) {
      console.error(err);
      fetchData();
    }
  };

  const handleLikeFile = async (item: PublicFileAsset, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session?.user?.id) return;

    const isLiking = !item.is_liked_by_user;
    setFileAssets((prev) =>
      prev.map((i) =>
        i.id === item.id
          ? {
              ...i,
              is_liked_by_user: isLiking,
              likes_count: i.likes_count + (isLiking ? 1 : -1),
            }
          : i,
      ),
    );

    try {
      if (isLiking) {
        await supabase.from("public_asset_likes").insert({
          user_id: session.user.id,
          public_asset_id: item.id,
        });
      } else {
        await supabase
          .from("public_asset_likes")
          .delete()
          .match({ user_id: session.user.id, public_asset_id: item.id });
      }
    } catch (err) {
      console.error(err);
      fetchData();
    }
  };

  const handleDownloadCharacter = async (item: PublicCharacter) => {
    if (!session?.user?.id) return;
    try {
      let payload: any = {
        user_id: session.user.id,
        name: item.name,
        short_description: item.short_description,
        display_name: item.display_name,
        appearance: item.appearance,
        personality: item.personality,
        backstory: item.backstory,
        hidden_description: item.hidden_description,
        image_path: item.image_path,
        is_universe: item.is_universe,
      };

      if (isCategoryEncryptionEnabled("characters")) {
        const key = getActiveMasterKey();
        if (key) {
          payload = await encryptCharacterData(payload, key);
        }
      }

      const { error } = await supabase.from("characters").insert(payload);
      if (error) throw error;

      await supabase.rpc("increment_public_character_downloads", {
        character_id: item.id,
      });

      toast({
        title: t("common.success", undefined, "Success"),
        description: t("publicAssets.downloadToCollection", undefined, "Added to your collection!"),
      });
      setDetailsDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleSaveFileToStorage = async (item: PublicFileAsset) => {
    if (!session?.user?.id) return;
    try {
      const response = await fetch(item.public_url || "");
      if (!response.ok) throw new Error("Failed to download file from public hub");
      const blob = await response.blob();

      const fileName = item.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const targetPath = `${session.user.id}/${fileName}`;

      const { error: uploadError } = await storage
        .from("Storage")
        .upload(targetPath, blob, { upsert: true });

      if (uploadError) throw uploadError;

      await supabase.rpc("increment_public_asset_downloads", {
        asset_id: item.id,
      });

      toast({
        title: t("common.success", undefined, "Success"),
        description: t("publicAssets.saveToStorage", undefined, "Saved to your Storage!"),
      });
      setDetailsDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleUnpublish = async (type: "file" | "character", id: string) => {
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/assets/unpublish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type, id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to unpublish asset");
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: t("publicAssets.unpublishSuccess", undefined, "Asset unpublished successfully."),
      });
      setDetailsDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmitForVerification = async () => {
    if (!session?.access_token) return;

    if (publishAssetType === "character" || publishAssetType === "universe") {
      let char, metadata;
      
      char = localCharacters.find((c) => c.id === selectedCharId);
      if (!char) return;

          if (char.name === "[Encrypted]") {
            toast({
              title: t("common.error", undefined, "Error"),
              description: t("publicAssets.unauthorizedEncrypted", undefined, "Cannot upload an encrypted character. Please unlock first."),
              variant: "destructive",
            });
            return;
          }
          metadata = {
              name: char.name,
              display_name: char.display_name,
              short_description: char.short_description,
              appearance: char.appearance,
              personality: char.personality,
              backstory: char.backstory,
              hidden_description: char.hidden_description,
              image_path: char.image_path,
              is_universe: publishAssetType === "universe",
          };

      setSubmitting(true);
      try {
        const res = await fetch("/api/assets/verifications/submit", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asset_type: publishAssetType,
            target_type: "public_asset",
            title: char.display_name || char.name,
            description: char.short_description || "",
            original_id: char.id,
            metadata: metadata,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to submit verification request");
        }

        toast({
          title: t("common.success", undefined, "Success"),
          description: t("verification.requestSubmitted", undefined, "Verification request submitted successfully!"),
        });
        setPublishDialogOpen(false);
        fetchUserSubmissions();
      } catch (err: any) {
        toast({
          title: t("common.error", undefined, "Error"),
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    } else {
      // Storage File
      const file = storageFiles.find((f) => f.name === selectedStorageFileName);
      if (!file) return;

      setSubmitting(true);
      try {
        const fullPath = `${session.user.id}/${file.name}`;
        const res = await fetch("/api/assets/verifications/submit", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asset_type: "file",
            target_type: "public_asset",
            title: publishTitle || file.name,
            description: publishDescription,
            original_file_path: fullPath,
            file_size: file.metadata?.size || 0,
            mime_type: file.metadata?.mimetype || "application/octet-stream",
            metadata: {
              category: publishCategory,
              fileName: file.name,
              display_name: publishTitle || file.name,
            },
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to submit verification request");
        }

        toast({
          title: t("common.success", undefined, "Success"),
          description: t("verification.requestSubmitted", undefined, "Verification request submitted successfully!"),
        });
        setPublishDialogOpen(false);
        fetchUserSubmissions();
      } catch (err: any) {
        toast({
          title: t("common.error", undefined, "Error"),
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setSubmitting(false);
      }
    }
  };

  const filteredCharacters = useMemo(() => {
    let filtered = characters.filter((item) => {
      const matchesTab =
        activeTab === "characters" ? !item.is_universe : item.is_universe;
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        item.name.toLowerCase().includes(q) ||
        (item.display_name && item.display_name.toLowerCase().includes(q)) ||
        (item.author_username && item.author_username.toLowerCase().includes(q));
      return matchesTab && matchesSearch;
    });

    switch (sortBy) {
      case "most_liked":
        filtered.sort((a, b) => b.likes_count - a.likes_count);
        break;
      case "most_downloaded":
        filtered.sort((a, b) => b.downloads - a.downloads);
        break;
      case "most_recent":
      default:
        filtered.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
    }
    return filtered;
  }, [characters, activeTab, sortBy, searchQuery]);

  const filteredFiles = useMemo(() => {
    let filtered = fileAssets.filter((item) => {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.display_name && item.display_name.toLowerCase().includes(q)) ||
        (item.description && item.description.toLowerCase().includes(q)) ||
        (item.author_username && item.author_username.toLowerCase().includes(q))
      );
    });

    switch (sortBy) {
      case "most_liked":
        filtered.sort((a, b) => b.likes_count - a.likes_count);
        break;
      case "most_downloaded":
        filtered.sort((a, b) => b.downloads - a.downloads);
        break;
      case "most_recent":
      default:
        filtered.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
    }
    return filtered;
  }, [fileAssets, sortBy, searchQuery]);

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileCategoryIcon = (category: string, mime?: string | null) => {
    if (category === "image" || mime?.startsWith("image/")) {
      return <ImageIcon className="w-10 h-10 text-orange-400" />;
    }
    if (category === "audio" || mime?.startsWith("audio/")) {
      return <Music className="w-10 h-10 text-blue-400" />;
    }
    if (category === "data" || mime?.startsWith("application/json")) {
      return <Database className="w-10 h-10 text-emerald-400" />;
    }
    return <FileText className="w-10 h-10 text-slate-400" />;
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
      {/* Top Header & Navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabType)}
          className="w-full md:w-auto"
        >
          <TabsList className="bg-slate-900 border border-slate-800 p-1">
            <TabsTrigger
              value="characters"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400"
            >
              {t("publicAssets.charactersTab", undefined, "Characters")}
            </TabsTrigger>
            <TabsTrigger
              value="universes"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400"
            >
              {t("publicAssets.universesTab", undefined, "Universes")}
            </TabsTrigger>
            <TabsTrigger
              value="files"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400"
            >
              {t("publicAssets.filesTab", undefined, "Files")}
            </TabsTrigger>

            <TabsTrigger
              value="submissions"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400"
            >
              {t("publicAssets.submissionsTab", undefined, "My Submissions")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {activeTab !== "submissions" && (
            <>
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder={t("publicAssets.searchPlaceholder", undefined, "Search public assets...")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-slate-900 border-slate-800 text-white"
                />
              </div>

              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as SortOption)}
              >
                <SelectTrigger className="w-[160px] bg-slate-900 border-slate-800 text-white">
                  <div className="flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4" />
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  <SelectItem value="most_recent">
                    {t("publicAssets.mostRecent", undefined, "Most Recent")}
                  </SelectItem>
                  <SelectItem value="most_liked">
                    {t("publicAssets.mostLiked", undefined, "Most Liked")}
                  </SelectItem>
                  <SelectItem value="most_downloaded">
                    {t("publicAssets.mostDownloaded", undefined, "Most Downloaded")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </>
          )}

          {/* Publish Button */}
          <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-cyan-600 hover:bg-cyan-700 text-white">
                <Upload className="w-4 h-4 mr-2" />
                {t("publicAssets.publishAsset", undefined, "Publish Asset")}
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {t("publicAssets.publishTitle", undefined, "Publish to Public Assets")}
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  {t("publicAssets.publishDesc", undefined, "Select an existing character, universe, or storage file to submit for verification.")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">
                    {t("publicAssets.assetType", undefined, "Asset Type")}
                  </label>
                  <Select
                    value={publishAssetType}
                    onValueChange={(v: any) => setPublishAssetType(v)}
                  >
                    <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700 text-white">
                      <SelectItem value="character">
                        {t("characters.charactersTab", undefined, "Character")}
                      </SelectItem>
                      <SelectItem value="universe">
                        {t("characters.universesTab", undefined, "Universe")}
                      </SelectItem>

                      <SelectItem value="file">
                        {t("publicAssets.filesTab", undefined, "Storage File")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {publishAssetType === "character" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">
                      {t("publicAssets.selectCharacter", undefined, "Select Character")}
                    </label>
                    <Select
                      value={selectedCharId}
                      onValueChange={setSelectedCharId}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Choose a character..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        {localCharacters
                          .filter((c) => !c.is_universe)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.display_name || c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {publishAssetType === "universe" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">
                      {t("publicAssets.selectUniverse", undefined, "Select Universe")}
                    </label>
                    <Select
                      value={selectedCharId}
                      onValueChange={setSelectedCharId}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                        <SelectValue placeholder="Choose a universe..." />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-800 border-slate-700 text-white">
                        {localCharacters
                          .filter((c) => c.is_universe)
                          .map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.display_name || c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                


                {publishAssetType === "file" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">
                        {t("publicAssets.selectFile", undefined, "Select Storage File")}
                      </label>
                      <Select
                        value={selectedStorageFileName}
                        onValueChange={(val) => {
                          setSelectedStorageFileName(val);
                          if (!publishTitle) setPublishTitle(val);
                        }}
                      >
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                          <SelectValue placeholder="Choose a storage file..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 text-white">
                          {storageFiles.map((f) => (
                            <SelectItem key={f.id} value={f.name}>
                              {f.name} ({formatSize(f.metadata?.size || 0)})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">
                        {t("publicAssets.assetName", undefined, "Asset Name / Title")}
                      </label>
                      <Input
                        value={publishTitle}
                        onChange={(e) => setPublishTitle(e.target.value)}
                        placeholder="e.g. Cyberpunk Background Music"
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">
                        {t("publicAssets.assetCategory", undefined, "Category")}
                      </label>
                      <Select
                        value={publishCategory}
                        onValueChange={setPublishCategory}
                      >
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

                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">
                        {t("publicAssets.assetDescription", undefined, "Description")}
                      </label>
                      <Textarea
                        value={publishDescription}
                        onChange={(e) => setPublishDescription(e.target.value)}
                        placeholder="Provide details about what this asset is and how to use it..."
                        className="bg-slate-800 border-slate-700 text-white h-20"
                      />
                    </div>
                  </>
                )}

                <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-lg text-xs text-cyan-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
                  <span>
                    {t(
                      "publicAssets.verificationNotice",
                      undefined,
                      "Submissions must be verified by an administrator before appearing publicly.",
                    )}
                  </span>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPublishDialogOpen(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  onClick={handleSubmitForVerification}
                  disabled={
                    submitting ||
                    (publishAssetType === "file" && !selectedStorageFileName) ||
                    (publishAssetType !== "file" && !selectedCharId)
                  }
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  {t("publicAssets.submitForVerification", undefined, "Submit for Review")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
      ) : activeTab === "submissions" ? (
        /* My Submissions Tab */
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-white">
              {t("publicAssets.submissionsTab", undefined, "My Submissions")}
            </h3>
            <span className="text-xs text-slate-400">
              {mySubmissions.length} submission(s)
            </span>
          </div>

          {mySubmissions.length === 0 ? (
            <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/30">
              <p className="text-slate-500">
                {t("publicAssets.noSubmissions", undefined, "You have not submitted any verification requests yet.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {mySubmissions.map((sub) => (
                <Card
                  key={sub.id}
                  className="bg-slate-900/60 border-slate-800 text-white overflow-hidden flex flex-col justify-between"
                >
                  <CardContent className="p-5 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="font-bold text-lg text-white">
                          {sub.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs capitalize border-slate-700 bg-slate-800 text-slate-300">
                            {sub.asset_type}
                          </Badge>
                          <Badge variant="outline" className="text-xs border-slate-700 bg-slate-800 text-cyan-300">
                            {sub.target_type === "public_usage"
                              ? t("verification.verifiedForPublicUsageBadge", undefined, "Public Usage")
                              : t("verification.publicBadge", undefined, "Public Asset")}
                          </Badge>
                        </div>
                      </div>

                      {/* Status Badge */}
                      {sub.status === "pending" && (
                        <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {t("publicAssets.statusPending", undefined, "Pending Review")}
                        </Badge>
                      )}
                      {sub.status === "approved" && (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {t("publicAssets.statusApproved", undefined, "Approved & Public")}
                        </Badge>
                      )}
                      {sub.status === "rejected" && (
                        <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          {t("publicAssets.statusRejected", undefined, "Denied")}
                        </Badge>
                      )}
                    </div>

                    {sub.description && (
                      <p className="text-sm text-slate-300 line-clamp-2">
                        {sub.description}
                      </p>
                    )}

                    {/* Rejection Alert Box */}
                    {sub.status === "rejected" && sub.rejection_reason && (
                      <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs space-y-1">
                        <div className="font-semibold text-rose-300 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {t("publicAssets.rejectionReason", undefined, "Denial Reason:")}
                        </div>
                        <p className="text-rose-200">{sub.rejection_reason}</p>
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
                      <span>
                        {t("publicAssets.submittedAt", undefined, "Submitted")}:{" "}
                        {new Date(sub.created_at).toLocaleDateString()}
                      </span>
                      {sub.reviewed_at && (
                        <span>
                          {t("publicAssets.reviewedAt", undefined, "Reviewed")}:{" "}
                          {new Date(sub.reviewed_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === "files" ? (
        /* Files Tab */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFiles.map((file) => (
            <Card
              key={file.id}
              className="bg-slate-900/50 border-slate-800 overflow-hidden hover:border-cyan-500/50 transition-colors cursor-pointer group flex flex-col justify-between"
              onClick={() => {
                setSelectedFile(file);
                setDetailsDialogOpen(true);
              }}
            >
              <div>
                <div className="aspect-video bg-slate-950 relative flex items-center justify-center overflow-hidden border-b border-slate-800">
                  {((file.category === "image" || file.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(file.name || file.file_path)) && file.public_url) ? (
                    <img
                      src={file.public_url}
                      alt={file.name}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (file.category === "audio" || file.mime_type?.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus|wma)$/i.test(file.name || file.file_path)) ? (
                    <div className="flex flex-col items-center justify-center gap-1.5 p-3 w-full bg-slate-950/40" onClick={(e) => e.stopPropagation()}>
                      <Music className="w-8 h-8 text-cyan-400 shrink-0 mb-1" />
                      <AudioPlayerPreview
                        src={file.public_url}
                        filePath={file.file_path}
                        fileName={file.name}
                        bucket="public-assets"
                        className="w-full"
                      />
                    </div>
                  ) : (
                    getFileCategoryIcon(file.category, file.mime_type)
                  )}

                  <div className="absolute top-3 right-3">
                    <button
                      onClick={(e) => handleLikeFile(file, e)}
                      className="p-2 rounded-full bg-slate-900/70 backdrop-blur-sm border border-slate-800 hover:bg-slate-800 transition-colors"
                      aria-label="Like asset"
                    >
                      <Heart
                        className={`w-4 h-4 ${file.is_liked_by_user ? "fill-pink-500 text-pink-500" : "text-white"}`}
                      />
                    </button>
                  </div>
                </div>

                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="text-base font-bold text-white truncate">
                      {file.display_name || file.name}
                    </h3>
                    <Badge variant="outline" className="text-[10px] uppercase border-slate-700 bg-slate-800 text-slate-300">
                      {file.category}
                    </Badge>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2">
                    {file.description || "No description provided."}
                  </p>
                </CardContent>
              </div>

              <div className="p-4 pt-0 flex justify-between items-center text-xs text-slate-400">
                <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">
                  @{file.author_username}
                </span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Download className="w-3 h-3" /> {file.downloads}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="w-3 h-3" /> {file.likes_count}
                  </span>
                </div>
              </div>
            </Card>
          ))}

          {filteredFiles.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500">
                {t("publicAssets.noAssetsFound", undefined, "No public assets found.")}
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Characters & Universes Tabs */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCharacters.map((item) => (
            <Card
              key={item.id}
              className="bg-slate-900/50 border-slate-800 overflow-hidden hover:border-cyan-500/50 transition-colors cursor-pointer group"
              onClick={() => {
                setSelectedChar(item);
                setDetailsDialogOpen(true);
              }}
            >
              <div className="aspect-video bg-slate-800 relative overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    {item.is_universe ? (
                      <Globe className="w-16 h-16" />
                    ) : (
                      <User className="w-16 h-16" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-transparent" />

                <div className="absolute top-3 right-3 flex flex-col gap-2">
                  <button
                    onClick={(e) => handleLikeCharacter(item, e)}
                    className="p-2 rounded-full bg-slate-900/60 backdrop-blur-sm border border-slate-800 hover:bg-slate-800 transition-colors flex flex-col items-center gap-1"
                    aria-label={`${item.is_liked_by_user ? "Unlike" : "Like"} ${item.is_universe ? "universe" : "character"}`}
                  >
                    <Heart
                      className={`w-5 h-5 ${item.is_liked_by_user ? "fill-pink-500 text-pink-500" : "text-white"}`}
                    />
                  </button>
                </div>

                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-xl font-bold text-white truncate">
                    {item.display_name || item.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                      @{item.author_username}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                      <Download className="w-3 h-3" /> {item.downloads}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                      <Heart className="w-3 h-3" /> {item.likes_count}
                    </span>
                  </div>
                </div>
              </div>
              <CardContent className="p-4">
                <p className="text-sm text-slate-300 line-clamp-2">
                  {item.short_description || "No description provided."}
                </p>
              </CardContent>
            </Card>
          ))}

          {filteredCharacters.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500">
                {t("publicAssets.noAssetsFound", undefined, "No public assets found.")}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog
        open={detailsDialogOpen}
        onOpenChange={(open) => {
          setDetailsDialogOpen(open);
          if (!open) {
            setSelectedChar(null);
            setSelectedFile(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border-slate-800 text-white p-0 overflow-hidden">
          {selectedChar && (
            <>
              <div className="h-48 relative bg-slate-800 shrink-0">
                {selectedChar.image_url ? (
                  <img
                    src={selectedChar.image_url}
                    alt={selectedChar.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    {selectedChar.is_universe ? (
                      <Globe className="w-16 h-16" />
                    ) : (
                      <User className="w-16 h-16" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <h2 className="text-3xl font-bold">
                    {selectedChar.display_name || selectedChar.name}
                  </h2>
                  <p className="text-slate-300 mt-1">
                    Uploaded by @{selectedChar.author_username}
                  </p>
                </div>
              </div>

              <ScrollArea className="flex-1 p-6">
                <div className="space-y-6">
                  {selectedChar.short_description && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-1">
                        Short Description
                      </h4>
                      <p className="text-slate-200">
                        {selectedChar.short_description}
                      </p>
                    </div>
                  )}
                  {selectedChar.appearance && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-1">
                        Appearance
                      </h4>
                      <p className="text-slate-200 whitespace-pre-wrap">
                        {selectedChar.appearance}
                      </p>
                    </div>
                  )}
                  {selectedChar.personality && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-1">
                        Personality
                      </h4>
                      <p className="text-slate-200 whitespace-pre-wrap">
                        {selectedChar.personality}
                      </p>
                    </div>
                  )}
                  {selectedChar.backstory && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-1">
                        Backstory
                      </h4>
                      <p className="text-slate-200 whitespace-pre-wrap">
                        {selectedChar.backstory}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
                <div className="flex gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Download className="w-4 h-4" /> {selectedChar.downloads} Downloads
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="w-4 h-4" /> {selectedChar.likes_count} Likes
                  </span>
                </div>
                <div className="flex gap-2">
                  {selectedChar.uploader_id === session?.user?.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4 mr-1.5" />
                          {t("publicAssets.makePrivate", undefined, "Make Private")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("publicAssets.makePrivate", undefined, "Unpublish Asset?")}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">
                            {t(
                              "publicAssets.makePrivateConfirm",
                              undefined,
                              "Are you sure you want to unpublish this asset? It will be removed from public view and reverted to private.",
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
                            {t("common.cancel", undefined, "Cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleUnpublish("character", selectedChar.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            {t("common.delete", undefined, "Unpublish")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => setDetailsDialogOpen(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    {t("common.cancel", undefined, "Cancel")}
                  </Button>
                  <Button
                    onClick={() => handleDownloadCharacter(selectedChar)}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t("publicAssets.downloadToCollection", undefined, "Add to Collection")}
                  </Button>
                </div>
              </div>
            </>
          )}

          {selectedFile && (
            <>
              <div className="h-48 relative bg-slate-950 shrink-0 flex items-center justify-center border-b border-slate-800">
                {((selectedFile.category === "image" || selectedFile.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(selectedFile.name || selectedFile.file_path)) && selectedFile.public_url) ? (
                  <img
                    src={selectedFile.public_url}
                    alt={selectedFile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (selectedFile.category === "audio" || selectedFile.mime_type?.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus|wma)$/i.test(selectedFile.name || selectedFile.file_path)) ? (
                  <div className="flex flex-col items-center gap-2 p-4 w-full">
                    <Music className="w-10 h-10 text-cyan-400" />
                    <AudioPlayerPreview
                      src={selectedFile.public_url}
                      filePath={selectedFile.file_path}
                      fileName={selectedFile.name}
                      bucket="public-assets"
                      className="w-full max-w-md"
                    />
                  </div>
                ) : (
                  getFileCategoryIcon(selectedFile.category, selectedFile.mime_type)
                )}
                <div className="absolute bottom-4 left-6 right-6">
                  <h2 className="text-2xl font-bold">
                    {selectedFile.display_name || selectedFile.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Uploaded by @{selectedFile.author_username} • {formatSize(selectedFile.file_size)}
                  </p>
                </div>
              </div>

              <ScrollArea className="flex-1 p-6">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Description
                    </h4>
                    <p className="text-slate-200 text-sm">
                      {selectedFile.description || "No description provided."}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 p-4 bg-slate-950/60 rounded-lg border border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-500">File Type:</span>
                      <p className="text-slate-300 font-mono">{selectedFile.mime_type || "N/A"}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Category:</span>
                      <p className="text-slate-300 capitalize">{selectedFile.category}</p>
                    </div>
                  </div>
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
                <div className="flex gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Download className="w-4 h-4" /> {selectedFile.downloads} Downloads
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="w-4 h-4" /> {selectedFile.likes_count} Likes
                  </span>
                </div>
                <div className="flex gap-2">
                  {selectedFile.uploader_id === session?.user?.id && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm">
                          <Trash2 className="w-4 h-4 mr-1.5" />
                          {t("publicAssets.makePrivate", undefined, "Make Private")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("publicAssets.makePrivate", undefined, "Unpublish Asset?")}
                          </AlertDialogTitle>
                          <AlertDialogDescription className="text-slate-400">
                            {t(
                              "publicAssets.makePrivateConfirm",
                              undefined,
                              "Are you sure you want to unpublish this asset? It will be removed from public view and reverted to private.",
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
                            {t("common.cancel", undefined, "Cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleUnpublish("file", selectedFile.id)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            {t("common.delete", undefined, "Unpublish")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => setDetailsDialogOpen(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    {t("common.cancel", undefined, "Cancel")}
                  </Button>
                  <Button
                    onClick={() => handleSaveFileToStorage(selectedFile)}
                    className="bg-cyan-600 hover:bg-cyan-700 text-white"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    {t("publicAssets.saveToStorage", undefined, "Save to Storage")}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Backward-compatible alias
export const PublicCharactersApp = PublicAssetsApp;
