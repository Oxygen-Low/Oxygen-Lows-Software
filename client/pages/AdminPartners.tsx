import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Handshake,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  Building2,
  Sparkles,
  ArrowLeft,
  Gift,
  HelpCircle,
} from "lucide-react";

interface ExistingPartner {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  description: string;
  category: string;
  created_at: string;
  updated_at: string;
}

interface WantedPartner {
  id: string;
  category: string;
  target_companies: string;
  what_we_provide: string;
  what_is_requested: string;
  created_at: string;
  updated_at: string;
}

export default function AdminPartners() {
  const { session } = useAuth();
  const { t } = useTranslation();
  usePageTitle(t("titles.adminPartners", undefined, "Admin Partners Management"), {
    description: t(
      "admin.partnersSubtitle",
      undefined,
      "Manage existing partners and wanted partnership opportunities.",
    ),
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  const [existingPartners, setExistingPartners] = useState<ExistingPartner[]>([]);
  const [wantedPartners, setWantedPartners] = useState<WantedPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("existing");

  // Existing Partner Dialog state
  const [existingDialogOpen, setExistingDialogOpen] = useState(false);
  const [editingExistingId, setEditingExistingId] = useState<string | null>(null);
  const [existingName, setExistingName] = useState("");
  const [existingLogoUrl, setExistingLogoUrl] = useState("");
  const [existingWebsiteUrl, setExistingWebsiteUrl] = useState("");
  const [existingDescription, setExistingDescription] = useState("");
  const [existingCategory, setExistingCategory] = useState("General");
  const [submittingExisting, setSubmittingExisting] = useState(false);

  // Wanted Partner Dialog state
  const [wantedDialogOpen, setWantedDialogOpen] = useState(false);
  const [editingWantedId, setEditingWantedId] = useState<string | null>(null);
  const [wantedCategory, setWantedCategory] = useState("");
  const [wantedTargetCompanies, setWantedTargetCompanies] = useState("");
  const [wantedWhatWeProvide, setWantedWhatWeProvide] = useState("");
  const [wantedWhatIsRequested, setWantedWhatIsRequested] = useState("");
  const [submittingWanted, setSubmittingWanted] = useState(false);

  useEffect(() => {
    if (session?.access_token) {
      fetchPartners();
    }
  }, [session?.access_token]);

  const fetchPartners = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/partners/admin", {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to load partners data");
      }

      const data = await res.json();
      setExistingPartners(data.existing_partners || []);
      setWantedPartners(data.wanted_partners || []);
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message || "Failed to load partners",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Open Add/Edit Existing Dialog
  const handleOpenExistingDialog = (partner?: ExistingPartner) => {
    if (partner) {
      setEditingExistingId(partner.id);
      setExistingName(partner.name);
      setExistingLogoUrl(partner.logo_url || "");
      setExistingWebsiteUrl(partner.website_url || "");
      setExistingDescription(partner.description || "");
      setExistingCategory(partner.category || "General");
    } else {
      setEditingExistingId(null);
      setExistingName("");
      setExistingLogoUrl("");
      setExistingWebsiteUrl("");
      setExistingDescription("");
      setExistingCategory("General");
    }
    setExistingDialogOpen(true);
  };

  // Save Existing Partner
  const handleSaveExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!existingName.trim()) return;

    setSubmittingExisting(true);
    try {
      const url = editingExistingId
        ? `/api/partners/admin/existing/${editingExistingId}`
        : "/api/partners/admin/existing";
      const method = editingExistingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          name: existingName.trim(),
          logo_url: existingLogoUrl.trim(),
          website_url: existingWebsiteUrl.trim(),
          description: existingDescription.trim(),
          category: existingCategory.trim(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save partner");
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: editingExistingId
          ? t("admin.partnerUpdated", undefined, "Partner updated successfully")
          : t("admin.partnerCreated", undefined, "Partner added successfully"),
      });

      setExistingDialogOpen(false);
      fetchPartners();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmittingExisting(false);
    }
  };

  // Delete Existing Partner
  const handleDeleteExisting = async (id: string, name: string) => {
    if (!confirm(t("admin.deletePartnerConfirm", { name }, `Are you sure you want to delete partner "${name}"?`))) {
      return;
    }

    try {
      const res = await fetch(`/api/partners/admin/existing/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) throw new Error("Failed to delete partner");

      toast({
        title: t("common.success", undefined, "Success"),
        description: t("admin.partnerDeleted", undefined, "Partner deleted successfully"),
      });
      fetchPartners();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  // Open Add/Edit Wanted Dialog
  const handleOpenWantedDialog = (wanted?: WantedPartner) => {
    if (wanted) {
      setEditingWantedId(wanted.id);
      setWantedCategory(wanted.category);
      setWantedTargetCompanies(wanted.target_companies || "");
      setWantedWhatWeProvide(wanted.what_we_provide || "");
      setWantedWhatIsRequested(wanted.what_is_requested || "");
    } else {
      setEditingWantedId(null);
      setWantedCategory("");
      setWantedTargetCompanies("");
      setWantedWhatWeProvide("");
      setWantedWhatIsRequested("");
    }
    setWantedDialogOpen(true);
  };

  // Save Wanted Partner
  const handleSaveWanted = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wantedCategory.trim()) return;

    setSubmittingWanted(true);
    try {
      const url = editingWantedId
        ? `/api/partners/admin/wanted/${editingWantedId}`
        : "/api/partners/admin/wanted";
      const method = editingWantedId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          category: wantedCategory.trim(),
          target_companies: wantedTargetCompanies.trim(),
          what_we_provide: wantedWhatWeProvide.trim(),
          what_is_requested: wantedWhatIsRequested.trim(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to save wanted opportunity");
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: editingWantedId
          ? t("admin.wantedUpdated", undefined, "Opportunity updated successfully")
          : t("admin.wantedCreated", undefined, "Opportunity added successfully"),
      });

      setWantedDialogOpen(false);
      fetchPartners();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmittingWanted(false);
    }
  };

  // Delete Wanted Partner
  const handleDeleteWanted = async (id: string, category: string) => {
    if (!confirm(t("admin.deleteWantedConfirm", { category }, `Are you sure you want to delete category "${category}"?`))) {
      return;
    }

    try {
      const res = await fetch(`/api/partners/admin/wanted/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });

      if (!res.ok) throw new Error("Failed to delete opportunity");

      toast({
        title: t("common.success", undefined, "Success"),
        description: t("admin.wantedDeleted", undefined, "Opportunity deleted successfully"),
      });
      fetchPartners();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate("/admin")}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
              title={t("common.back", undefined, "Back to Admin Panel")}
            >
              <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-400" />
            </button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Handshake className="w-8 h-8 text-indigo-500" />
                <span>{t("admin.partnersTitle", undefined, "Partners Management")}</span>
              </h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                {t(
                  "admin.partnersSubtitle",
                  undefined,
                  "Manage active partners and target partner categories displayed on the public Partners page.",
                )}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate("/partners")}
            className="flex items-center gap-2 text-sm"
          >
            <span>{t("admin.viewPublicPage", undefined, "View Public Page")}</span>
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>

        {/* Tabs for Existing Partners and Wanted Partner Opportunities */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <TabsList className="grid w-full sm:w-[400px] grid-cols-2">
            <TabsTrigger
              value="existing"
              onClick={() => setActiveTab("existing")}
              className="flex items-center gap-2"
            >
              <Building2 className="w-4 h-4" />
              <span>{t("admin.tabExisting", undefined, "Existing Partners")}</span>
              <Badge variant="secondary" className="ml-1 text-xs">
                {existingPartners.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger
              value="wanted"
              onClick={() => setActiveTab("wanted")}
              className="flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{t("admin.tabWanted", undefined, "Wanted Categories")}</span>
              <Badge variant="secondary" className="ml-1 text-xs">
                {wantedPartners.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Existing Partners */}
          <TabsContent value="existing" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {t("admin.existingPartnersTitle", undefined, "Active Partners")}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t("admin.existingPartnersDesc", undefined, "Companies and organizations currently partnered with Oxygen Low's Software.")}
                </p>
              </div>
              <Button onClick={() => handleOpenExistingDialog()} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                <span>{t("admin.addPartner", undefined, "Add Partner")}</span>
              </Button>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="animate-pulse h-36 bg-muted/30" />
                ))}
              </div>
            ) : existingPartners.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <p className="text-muted-foreground">{t("admin.noExistingPartners", undefined, "No existing partners added yet.")}</p>
                <Button variant="outline" size="sm" onClick={() => handleOpenExistingDialog()} className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("admin.addFirstPartner", undefined, "Add First Partner")}
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {existingPartners.map((partner) => (
                  <Card key={partner.id} className="flex flex-col justify-between">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {partner.logo_url ? (
                            <img
                              src={partner.logo_url}
                              alt={partner.name}
                              className="w-10 h-10 rounded-lg object-contain border bg-white p-1"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold">
                              {partner.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <CardTitle className="text-base font-semibold">{partner.name}</CardTitle>
                            {partner.category && (
                              <Badge variant="secondary" className="text-xs">
                                {partner.category}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                            onClick={() => handleOpenExistingDialog(partner)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            onClick={() => handleDeleteExisting(partner.id, partner.name)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      {partner.description && (
                        <CardDescription className="text-xs mt-2 line-clamp-3">
                          {partner.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    {partner.website_url && (
                      <div className="px-6 py-2 border-t text-xs text-muted-foreground flex items-center justify-between">
                        <span className="truncate max-w-[200px]">{partner.website_url}</span>
                        <a
                          href={partner.website_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tab 2: Wanted Partner Opportunities */}
          <TabsContent value="wanted" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {t("admin.wantedPartnersTitle", undefined, "Wanted Partner Categories & Requests")}
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t(
                    "admin.wantedPartnersDesc",
                    undefined,
                    "Define target partnership opportunities, what Oxygen Low's Software provides, and what is requested.",
                  )}
                </p>
              </div>
              <Button onClick={() => handleOpenWantedDialog()} className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                <span>{t("admin.addWantedCategory", undefined, "Add Category Opportunity")}</span>
              </Button>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => (
                  <Card key={i} className="animate-pulse h-36 bg-muted/30" />
                ))}
              </div>
            ) : wantedPartners.length === 0 ? (
              <Card className="p-8 text-center border-dashed">
                <p className="text-muted-foreground">{t("admin.noWantedPartners", undefined, "No wanted partner opportunities defined yet.")}</p>
                <Button variant="outline" size="sm" onClick={() => handleOpenWantedDialog()} className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("admin.addFirstWanted", undefined, "Add First Opportunity")}
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {wantedPartners.map((item) => (
                  <Card key={item.id} className="p-5">
                    <div className="flex items-start justify-between gap-4 border-b pb-3">
                      <div>
                        <h3 className="font-bold text-base flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          {item.category}
                        </h3>
                        {item.target_companies && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <span className="font-semibold">{t("partners.targetCompanies", undefined, "Target/Example")}:</span> {item.target_companies}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                          onClick={() => handleOpenWantedDialog(item)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          onClick={() => handleDeleteWanted(item.id, item.category)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
                      <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 text-xs mb-1">
                          <Gift className="w-3.5 h-3.5" />
                          <span>{t("partners.whatWeProvide", undefined, "What Oxygen Low's Software Provides")}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                          {item.what_we_provide || "-"}
                        </p>
                      </div>

                      <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <div className="flex items-center gap-1.5 font-semibold text-indigo-700 dark:text-indigo-400 text-xs mb-1">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>{t("partners.whatIsRequested", undefined, "What Is Requested from Partner")}</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                          {item.what_is_requested || "-"}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Modal: Add/Edit Existing Partner */}
        <Dialog open={existingDialogOpen} onOpenChange={setExistingDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>
                {editingExistingId
                  ? t("admin.editPartnerTitle", undefined, "Edit Partner")
                  : t("admin.addPartnerTitle", undefined, "Add New Partner")}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "admin.existingPartnerModalDesc",
                  undefined,
                  "Enter the partner company details to display on the public page.",
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveExisting} className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("admin.partnerName", undefined, "Company Name")} *</label>
                <Input
                  required
                  placeholder="e.g., Cloudflare"
                  value={existingName}
                  onChange={(e) => setExistingName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("admin.partnerCategory", undefined, "Category / Industry")}</label>
                <Input
                  placeholder="e.g., Infrastructure, Game Studio, Security"
                  value={existingCategory}
                  onChange={(e) => setExistingCategory(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("admin.partnerLogoUrl", undefined, "Logo URL")}</label>
                <Input
                  placeholder="https://example.com/logo.png"
                  value={existingLogoUrl}
                  onChange={(e) => setExistingLogoUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("admin.partnerWebsiteUrl", undefined, "Website URL")}</label>
                <Input
                  placeholder="https://example.com"
                  value={existingWebsiteUrl}
                  onChange={(e) => setExistingWebsiteUrl(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("admin.partnerDescription", undefined, "Description")}</label>
                <Textarea
                  rows={3}
                  placeholder="Brief summary of the company and partnership..."
                  value={existingDescription}
                  onChange={(e) => setExistingDescription(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setExistingDialogOpen(false)}>
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button type="submit" disabled={submittingExisting}>
                  {submittingExisting
                    ? t("common.saving", undefined, "Saving...")
                    : t("common.save", undefined, "Save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal: Add/Edit Wanted Opportunity */}
        <Dialog open={wantedDialogOpen} onOpenChange={setWantedDialogOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>
                {editingWantedId
                  ? t("admin.editWantedTitle", undefined, "Edit Wanted Partner Opportunity")
                  : t("admin.addWantedTitle", undefined, "Add Wanted Partner Opportunity")}
              </DialogTitle>
              <DialogDescription>
                {t(
                  "admin.wantedModalDesc",
                  undefined,
                  "Define the category, targets, and mutual value exchange for prospective partners.",
                )}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSaveWanted} className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("admin.wantedCategoryField", undefined, "Category Name")} *</label>
                <Input
                  required
                  placeholder="e.g., Cloud & AI Infrastructure"
                  value={wantedCategory}
                  onChange={(e) => setWantedCategory(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("admin.wantedTargetCompaniesField", undefined, "Target / Example Companies")}</label>
                <Input
                  placeholder="e.g., Cloudflare, Together AI, Hugging Face"
                  value={wantedTargetCompanies}
                  onChange={(e) => setWantedTargetCompanies(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("partners.whatWeProvide", undefined, "What Oxygen Low's Software Provides")}</label>
                <Textarea
                  rows={2}
                  placeholder="e.g., Platform integration, developer tool exposure, user ecosystem testing."
                  value={wantedWhatWeProvide}
                  onChange={(e) => setWantedWhatWeProvide(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{t("partners.whatIsRequested", undefined, "What Is Requested from Partner")}</label>
                <Textarea
                  rows={2}
                  placeholder="e.g., Compute credits, API access, co-marketing."
                  value={wantedWhatIsRequested}
                  onChange={(e) => setWantedWhatIsRequested(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-4">
                <Button type="button" variant="outline" onClick={() => setWantedDialogOpen(false)}>
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button type="submit" disabled={submittingWanted}>
                  {submittingWanted
                    ? t("common.saving", undefined, "Saving...")
                    : t("common.save", undefined, "Save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
