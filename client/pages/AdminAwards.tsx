import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Trophy, Plus, Trash2, ArrowLeft } from "lucide-react";

interface AdminAwardItem {
  id: string;
  title: string;
  description: string;
  rewardName: string;
  isActive: boolean;
  options: { value: string; defaultLabel: string }[];
  currentMonthKey: string;
}

export default function AdminAwards() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();

  usePageTitle(t("admin.awardsTitle", undefined, "Admin Software Awards"), {
    description: t(
      "admin.awardsDesc",
      undefined,
      "Create, edit, and manage software awards.",
    ),
  });

  const [awards, setAwards] = useState<AdminAwardItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newRewardName, setNewRewardName] = useState("");
  const [options, setOptions] = useState<string[]>(["Option 1", "Option 2"]);
  const [creating, setCreating] = useState(false);

  const fetchAwards = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/software-awards", {
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.awards && Array.isArray(data.awards)) {
        setAwards(data.awards);
      } else {
        toast.error(
          t("admin.awardsFetchError", undefined, "Failed to fetch awards list."),
        );
      }
    } catch (err) {
      toast.error(
        t("admin.awardsFetchError", undefined, "Failed to fetch awards list."),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAwards();
  }, [session?.access_token]);

  const handleAddOption = () => {
    setOptions((prev) => [...prev, `Option ${prev.length + 1}`]);
  };

  const handleRemoveOption = (idx: number) => {
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleCreateAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim() || !newRewardName.trim()) {
      toast.error(
        t(
          "admin.fillRequired",
          undefined,
          "Please fill in title, description, and reward name.",
        ),
      );
      return;
    }

    if (options.length < 2 || options.some((opt) => !opt.trim())) {
      toast.error(
        t(
          "admin.optionsRequired",
          undefined,
          "At least 2 valid options are required.",
        ),
      );
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/software-awards/admin/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim(),
          rewardName: newRewardName.trim(),
          options: options.map((opt) => opt.trim()),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          t("admin.awardCreated", undefined, "Award created successfully!"),
        );
        setIsCreateOpen(false);
        setNewTitle("");
        setNewDescription("");
        setNewRewardName("");
        setOptions(["Option 1", "Option 2"]);
        fetchAwards();
      } else {
        toast.error(
          data.error ||
            t("admin.awardCreateFail", undefined, "Failed to create award."),
        );
      }
    } catch (err: any) {
      toast.error(
        t("admin.awardCreateFail", undefined, "Failed to create award."),
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAward = async (id: string) => {
    if (
      !confirm(
        t(
          "admin.confirmDeleteAward",
          undefined,
          "Are you sure you want to delete this award?",
        ),
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/software-awards/admin/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
      });
      if (res.ok) {
        toast.success(t("admin.awardDeleted", undefined, "Award deleted."));
        fetchAwards();
      } else {
        const data = await res.json();
        toast.error(
          data.error || t("admin.actionFailed", undefined, "Delete failed."),
        );
      }
    } catch (err) {
      toast.error(t("admin.actionFailed", undefined, "Action failed."));
    }
  };

  return (
    <Layout>
      <div className="min-h-[calc(100vh-8rem)] bg-card text-card-foreground rounded-xl shadow-sm border border-border p-6 sm:p-8 space-y-6">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-6">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/admin")}
              className="text-muted-foreground hover:text-foreground mb-1 -ml-2"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {t("admin.backToAdmin", undefined, "Back to Admin Panel")}
            </Button>
            <h1 className="text-3xl font-extrabold text-foreground flex items-center gap-2.5">
              <Trophy className="w-8 h-8 text-yellow-500" />
              {t("admin.awardsTitle", undefined, "Software Awards Management")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t(
                "admin.awardsDesc",
                undefined,
                "Create and monitor software awards.",
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("admin.createAward", undefined, "Create Award")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card text-card-foreground border-border">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-foreground">
                    {t(
                      "admin.newAwardTitle",
                      undefined,
                      "Create New Software Award",
                    )}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground text-xs">
                    {t(
                      "admin.newAwardDesc",
                      undefined,
                      "Add a new software award.",
                    )}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreateAward} className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-foreground">
                      {t(
                        "admin.awardTitleLabel",
                        undefined,
                        "Award Question / Title",
                      )}
                    </Label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g., Which Browser Is Best?"
                      className="bg-background border-border text-foreground"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground">
                      {t("admin.awardDescLabel", undefined, "Description")}
                    </Label>
                    <Textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Briefly describe the award..."
                      className="bg-background border-border text-foreground"
                      rows={2}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground">
                      {t(
                        "admin.awardRewardNameLabel",
                        undefined,
                        "Reward Name",
                      )}
                    </Label>
                    <Input
                      value={newRewardName}
                      onChange={(e) => setNewRewardName(e.target.value)}
                      placeholder="e.g., Best Browser"
                      className="bg-background border-border text-foreground"
                      required
                    />
                  </div>

                  {/* Options Editor */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <Label className="text-xs text-muted-foreground">
                      Options
                    </Label>
                    {options.map((opt, optIdx) => (
                      <div key={optIdx} className="flex items-center gap-2">
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOptions((prev) => {
                              const copy = [...prev];
                              copy[optIdx] = val;
                              return copy;
                            });
                          }}
                          className="h-8 text-xs bg-background border-border text-foreground"
                          placeholder={`Option ${optIdx + 1}`}
                          required
                        />
                        {options.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveOption(optIdx)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAddOption}
                      className="h-7 text-xs text-primary hover:underline"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Option
                    </Button>
                  </div>

                  <DialogFooter className="pt-4 border-t border-border">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsCreateOpen(false)}
                      className="border-border text-muted-foreground"
                    >
                      {t("common.cancel", undefined, "Cancel")}
                    </Button>
                    <Button
                      type="submit"
                      disabled={creating}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold"
                    >
                      {creating
                        ? t("common.loading", undefined, "Creating...")
                        : t("common.create", undefined, "Create Award")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Survey Cards Table / Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-muted-foreground text-sm">
              {t("common.loading", undefined, "Loading awards...")}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {awards.map((award) => (
              <Card
                key={award.id}
                className="flex flex-col justify-between border-border bg-card shadow-sm"
              >
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={award.isActive ? "default" : "secondary"}
                      className={
                        award.isActive
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }
                    >
                      {award.isActive
                        ? t("common.status", undefined, "Active")
                        : t("awards.closed", undefined, "Closed")}
                    </Badge>
                  </div>

                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">
                      {award.title}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-xs mt-1 line-clamp-2">
                      {award.description}
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardFooter className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground font-semibold">
                    Reward: {award.rewardName}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteAward(award.id)}
                      className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      aria-label={t("admin.deleteAward", undefined, "Delete Award")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
