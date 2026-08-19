import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldCheck,
  Check,
  X,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  Music,
  Database,
  Globe,
  User,
  Trash2,
  Loader2,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";

interface VerificationItem {
  id: string;
  user_id: string;
  asset_type: "file" | "character" | "universe";
  target_type: "public_asset" | "public_usage";
  status: "pending" | "approved" | "rejected";
  title: string;
  description: string | null;
  original_id: string | null;
  original_file_path: string | null;
  file_size: number;
  mime_type: string | null;
  public_asset_id: string | null;
  public_character_id: string | null;
  metadata: any;
  admin_notes: string | null;
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: {
    username: string;
    email: string;
    avatar_url: string | null;
  };
}

export default function AdminVerification() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [verifications, setVerifications] = useState<VerificationItem[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [targetFilter, setTargetFilter] = useState<string>("all");

  // Rejection modal state
  const [rejectItem, setRejectItem] = useState<VerificationItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  // Approval loading state
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.access_token) {
      fetchVerifications();
    }
  }, [session, statusFilter, typeFilter, targetFilter]);

  const fetchVerifications = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (typeFilter) params.append("asset_type", typeFilter);
      if (targetFilter) params.append("target_type", targetFilter);

      const response = await fetch(`/api/admin/verifications?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(
          errData.error || `Failed to fetch verifications (Status ${response.status})`,
        );
      }

      const data = await response.json();
      const list = data.verifications || [];
      setVerifications(list);

      // Load signed URLs for file previews
      const urls: Record<string, string> = {};
      await Promise.all(
        list.map(async (item: VerificationItem) => {
          if (item.asset_type === "file" && item.original_file_path) {
            const { data: urlData } = await supabase.storage
              .from("Storage")
              .createSignedUrl(item.original_file_path, 3600)
              .catch(() => ({ data: null }));
            if (urlData?.signedUrl) {
              urls[item.id] = urlData.signedUrl;
            }
          }
        }),
      );
      setPreviewUrls(urls);
    } catch (error: any) {
      toast({
        title: t("common.error", undefined, "Error fetching verifications"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (item: VerificationItem) => {
    setApprovingId(item.id);
    try {
      const response = await fetch(`/api/admin/verifications/${item.id}/approve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to approve verification request");
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: t("admin.approveSuccess", undefined, "Asset approved successfully."),
      });
      fetchVerifications();
    } catch (error: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectItem) return;
    if (!rejectReason.trim()) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: t("admin.reasonRequiredError", undefined, "A denial reason is required to reject a submission."),
        variant: "destructive",
      });
      return;
    }

    setRejecting(true);
    try {
      const response = await fetch(`/api/admin/verifications/${rejectItem.id}/reject`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to reject submission");
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: t("admin.rejectSuccess", undefined, "Asset rejected with reason."),
      });
      setRejectItem(null);
      setRejectReason("");
      fetchVerifications();
    } catch (error: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setRejecting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/verifications/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to delete record");
      toast({
        title: t("common.success", undefined, "Success"),
        description: "Verification entry deleted",
      });
      fetchVerifications();
    } catch (error: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate("/admin")}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
            title={t("common.back", undefined, "Back to Admin Panel")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
          </button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t("admin.verificationTitle", undefined, "Asset Verification")}
            </h1>
            <p className="text-sm text-slate-500">
              {t(
                "admin.verificationDesc",
                undefined,
                "Review, approve, or deny public assets and multiplayer verification requests.",
              )}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-xl text-white">
          <Tabs
            value={statusFilter}
            onValueChange={setStatusFilter}
            className="w-auto"
          >
            <TabsList className="bg-slate-800 border border-slate-700">
              <TabsTrigger value="pending" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                {t("admin.pendingTab", undefined, "Pending")}
              </TabsTrigger>
              <TabsTrigger value="approved" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                {t("admin.approvedTab", undefined, "Approved")}
              </TabsTrigger>
              <TabsTrigger value="rejected" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                {t("admin.rejectedTab", undefined, "Rejected")}
              </TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white">
                {t("admin.allSubmissions", undefined, "All")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Type:</span>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[140px] bg-slate-800 border-slate-700 text-white h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white text-xs">
                  <SelectItem value="all">{t("admin.allTypes", undefined, "All Types")}</SelectItem>
                  <SelectItem value="file">{t("admin.typeFile", undefined, "Storage File")}</SelectItem>
                  <SelectItem value="character">{t("admin.typeCharacter", undefined, "Character")}</SelectItem>
                  <SelectItem value="universe">{t("admin.typeUniverse", undefined, "Universe")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Target:</span>
              <Select value={targetFilter} onValueChange={setTargetFilter}>
                <SelectTrigger className="w-[160px] bg-slate-800 border-slate-700 text-white h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white text-xs">
                  <SelectItem value="all">{t("admin.allTargets", undefined, "All Targets")}</SelectItem>
                  <SelectItem value="public_asset">{t("admin.targetPublicAsset", undefined, "Public Hub")}</SelectItem>
                  <SelectItem value="public_usage">{t("admin.targetPublicUsage", undefined, "Public / Multiplayer")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Verification Items List */}
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : verifications.length === 0 ? (
          <Card className="bg-slate-900 border-slate-800 text-center py-16">
            <CardContent>
              <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-white">
                {t("admin.noPendingVerifications", undefined, "No submissions found.")}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Queue is clear for the selected filters.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {verifications.map((item) => {
              const meta = item.metadata || {};
              return (
                <Card
                  key={item.id}
                  className="bg-slate-900 border-slate-800 text-white overflow-hidden"
                >
                  <div className="p-6 space-y-4">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-lg bg-slate-800 border border-slate-700 text-cyan-400">
                          {item.asset_type === "character" ? (
                            <User className="w-5 h-5" />
                          ) : item.asset_type === "universe" ? (
                            <Globe className="w-5 h-5" />
                          ) : item.mime_type?.startsWith("image/") ? (
                            <ImageIcon className="w-5 h-5" />
                          ) : item.mime_type?.startsWith("audio/") ? (
                            <Music className="w-5 h-5" />
                          ) : (
                            <FileText className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-white">
                              {item.title}
                            </h3>
                            <Badge variant="outline" className="text-xs uppercase border-slate-700 bg-slate-800 text-slate-300">
                              {item.asset_type}
                            </Badge>
                            <Badge variant="outline" className="text-xs border-cyan-800 bg-cyan-950/60 text-cyan-300">
                              {item.target_type === "public_usage"
                                ? "Public / Multiplayer"
                                : "Public Hub"}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            By @{item.profiles?.username || "Unknown"} ({item.profiles?.email || item.user_id}) •{" "}
                            Submitted {new Date(item.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {item.status === "pending" && (
                          <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <Clock className="w-3.5 h-3.5 mr-1" />
                            Pending Review
                          </Badge>
                        )}
                        {item.status === "approved" && (
                          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            Approved
                          </Badge>
                        )}
                        {item.status === "rejected" && (
                          <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            <XCircle className="w-3.5 h-3.5 mr-1" />
                            Denied
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Content Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300">
                      <div className="space-y-2 bg-slate-950/60 p-4 rounded-lg border border-slate-800">
                        <span className="font-semibold text-slate-400 uppercase tracking-wider">
                          Details & Description
                        </span>
                        <p className="text-slate-200 text-sm">
                          {item.description || meta.short_description || "No description provided."}
                        </p>

                        {item.asset_type === "file" && (
                          <div className="space-y-2 pt-2 border-t border-slate-800/80">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-slate-500">File Path:</span>
                                <p className="font-mono text-slate-300 truncate">{item.original_file_path || "N/A"}</p>
                              </div>
                              <div>
                                <span className="text-slate-500">File Size:</span>
                                <p className="text-slate-300">{formatSize(item.file_size)}</p>
                              </div>
                            </div>

                            {previewUrls[item.id] && (
                              <div className="pt-2">
                                {(item.mime_type?.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac|webm|opus|wma)$/i.test(item.original_file_path || item.title)) ? (
                                  <div className="p-3 bg-slate-900 rounded border border-slate-800 space-y-2">
                                    <div className="flex items-center gap-2 text-cyan-400 font-semibold text-[11px]">
                                      <Music className="w-4 h-4" /> Audio Preview
                                    </div>
                                    <audio controls preload="metadata" src={previewUrls[item.id]} className="w-full h-8" />
                                  </div>
                                ) : (item.mime_type?.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(item.original_file_path || item.title)) ? (
                                  <div className="p-2 bg-slate-900 rounded border border-slate-800">
                                    <img src={previewUrls[item.id]} alt={item.title} className="max-h-48 rounded object-contain mx-auto" />
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Character/Lore or Extra Snapshot */}
                      {(item.asset_type === "character" || item.asset_type === "universe") && (
                        <div className="space-y-2 bg-slate-950/60 p-4 rounded-lg border border-slate-800 max-h-48 overflow-y-auto">
                          <span className="font-semibold text-slate-400 uppercase tracking-wider">
                            Character Lore & Attributes
                          </span>
                          {meta.appearance && (
                            <div>
                              <span className="text-slate-500">Appearance:</span>
                              <p className="text-slate-300 whitespace-pre-wrap">{meta.appearance}</p>
                            </div>
                          )}
                          {meta.personality && (
                            <div>
                              <span className="text-slate-500">Personality:</span>
                              <p className="text-slate-300 whitespace-pre-wrap">{meta.personality}</p>
                            </div>
                          )}
                          {meta.backstory && (
                            <div>
                              <span className="text-slate-500">Backstory:</span>
                              <p className="text-slate-300 whitespace-pre-wrap">{meta.backstory}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Rejection reason box if rejected */}
                    {item.status === "rejected" && item.rejection_reason && (
                      <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs space-y-1">
                        <span className="font-semibold text-rose-300 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Denial Reason Provided to User:
                        </span>
                        <p className="text-rose-200">{item.rejection_reason}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-between items-center pt-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="text-slate-500 hover:text-rose-400">
                            <Trash2 className="w-4 h-4 mr-1" />
                            Delete Log
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete verification entry?</AlertDialogTitle>
                            <AlertDialogDescription className="text-slate-400">
                              This will remove the verification log record.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
                              Cancel
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(item.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <div className="flex gap-2">
                        {item.status !== "rejected" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-rose-800/60 text-rose-400 hover:bg-rose-950/60"
                            onClick={() => {
                              setRejectItem(item);
                              setRejectReason("");
                            }}
                          >
                            <X className="w-4 h-4 mr-1" />
                            {t("admin.deny", undefined, "Deny")}
                          </Button>
                        )}

                        {item.status !== "approved" && (
                          <Button
                            size="sm"
                            disabled={approvingId === item.id}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleApprove(item)}
                          >
                            {approvingId === item.id ? (
                              <Loader2 className="w-4 h-4 animate-spin mr-1" />
                            ) : (
                              <Check className="w-4 h-4 mr-1" />
                            )}
                            {t("admin.approve", undefined, "Approve")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Denial Reason Modal (Mandatory Reason) */}
      <Dialog
        open={Boolean(rejectItem)}
        onOpenChange={(open) => {
          if (!open) {
            setRejectItem(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("admin.denyTitle", undefined, "Deny Verification Request")}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t(
                "admin.denyDesc",
                undefined,
                "Please provide a specific reason for denying this asset. This reason will be displayed to the user.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="p-3 bg-slate-950 rounded border border-slate-800 text-xs">
              <span className="text-slate-400 font-semibold">Submitting Asset:</span>{" "}
              <span className="text-white font-bold">{rejectItem?.title}</span>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                {t("publicAssets.rejectionReason", undefined, "Denial Reason")} <span className="text-rose-400">*</span>
              </label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t(
                  "admin.reasonPlaceholder",
                  undefined,
                  "Explain why this submission was rejected (required)...",
                )}
                className="bg-slate-800 border-slate-700 text-white h-28"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectItem(null);
                setRejectReason("");
              }}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {t("common.cancel", undefined, "Cancel")}
            </Button>
            <Button
              onClick={handleRejectSubmit}
              disabled={rejecting || !rejectReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rejecting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <X className="w-4 h-4 mr-2" />
              )}
              {t("admin.deny", undefined, "Deny with Reason")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
