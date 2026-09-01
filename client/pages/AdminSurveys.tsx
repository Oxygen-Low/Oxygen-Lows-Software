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
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardList,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Eye,
  AlertTriangle,
  ArrowLeft,
  Settings2,
} from "lucide-react";

interface AdminSurveyItem {
  id: string;
  titleKey: string;
  defaultTitle: string;
  descriptionKey: string;
  defaultDescription: string;
  category: "Hardware" | "Development" | "Fun" | "General";
  recurrence: "monthly" | "permanent";
  isPredefined: boolean;
  isActive: boolean;
  questionsCount: number;
  currentMonthKey: string;
}

interface NewQuestion {
  title: string;
  type: "single_choice" | "multiple_choice" | "rating" | "text" | "number";
  required: boolean;
  options: string[];
}

export default function AdminSurveys() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const { t } = useTranslation();

  usePageTitle(t("admin.surveysTitle", undefined, "Admin Surveys Management"), {
    description: t(
      "admin.surveysDesc",
      undefined,
      "Create, edit, and manage community surveys and monthly resets.",
    ),
  });

  const [surveys, setSurveys] = useState<AdminSurveyItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<"Hardware" | "Development" | "Fun" | "General">("General");
  const [newRecurrence, setNewRecurrence] = useState<"monthly" | "permanent">("monthly");
  const [questions, setQuestions] = useState<NewQuestion[]>([
    {
      title: "",
      type: "single_choice",
      required: true,
      options: ["Option 1", "Option 2"],
    },
  ]);
  const [creating, setCreating] = useState(false);

  // Purge State
  const [purging, setPurging] = useState(false);

  const fetchSurveys = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/surveys", {
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
      });
      const data = await res.json();
      if (data.surveys) {
        setSurveys(data.surveys);
      }
    } catch (err) {
      toast.error(t("admin.surveysFetchError", undefined, "Failed to fetch surveys list."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSurveys();
  }, [session?.access_token]);

  const handleAddQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        title: "",
        type: "single_choice",
        required: true,
        options: ["Option 1", "Option 2"],
      },
    ]);
  };

  const handleRemoveQuestion = (idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddOption = (qIdx: number) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIdx].options.push(`Option ${copy[qIdx].options.length + 1}`);
      return copy;
    });
  };

  const handleRemoveOption = (qIdx: number, optIdx: number) => {
    setQuestions((prev) => {
      const copy = [...prev];
      copy[qIdx].options = copy[qIdx].options.filter((_, i) => i !== optIdx);
      return copy;
    });
  };

  const handleCreateSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim()) {
      toast.error(t("admin.fillRequired", undefined, "Please fill in title and description."));
      return;
    }

    if (questions.length === 0 || questions.some((q) => !q.title.trim())) {
      toast.error(t("admin.questionsRequired", undefined, "All questions must have a title."));
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/surveys/admin/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDescription.trim(),
          category: newCategory,
          recurrence: newRecurrence,
          questions: questions.map((q, idx) => ({
            id: `q_${Date.now()}_${idx}`,
            defaultTitle: q.title.trim(),
            type: q.type,
            required: q.required,
            options: q.type === "single_choice" || q.type === "multiple_choice" ? q.options : undefined,
          })),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(t("admin.surveyCreated", undefined, "Survey created successfully!"));
        setIsCreateOpen(false);
        setNewTitle("");
        setNewDescription("");
        setQuestions([{ title: "", type: "single_choice", required: true, options: ["Option 1", "Option 2"] }]);
        fetchSurveys();
      } else {
        toast.error(data.error || t("admin.surveyCreateFail", undefined, "Failed to create survey."));
      }
    } catch (err: any) {
      toast.error(t("admin.surveyCreateFail", undefined, "Failed to create survey."));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (survey: AdminSurveyItem) => {
    try {
      const res = await fetch(`/api/surveys/admin/${survey.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ isActive: !survey.isActive }),
      });
      if (res.ok) {
        toast.success(
          survey.isActive
            ? t("admin.surveyDeactivated", undefined, "Survey deactivated.")
            : t("admin.surveyActivated", undefined, "Survey activated."),
        );
        fetchSurveys();
      }
    } catch (err) {
      toast.error(t("admin.actionFailed", undefined, "Action failed."));
    }
  };

  const handleDeleteSurvey = async (id: string) => {
    if (!confirm(t("admin.confirmDeleteSurvey", undefined, "Are you sure you want to delete this custom survey?"))) {
      return;
    }
    try {
      const res = await fetch(`/api/surveys/admin/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
      });
      if (res.ok) {
        toast.success(t("admin.surveyDeleted", undefined, "Survey deleted."));
        fetchSurveys();
      } else {
        const data = await res.json();
        toast.error(data.error || t("admin.actionFailed", undefined, "Delete failed."));
      }
    } catch (err) {
      toast.error(t("admin.actionFailed", undefined, "Action failed."));
    }
  };

  const handlePurgeMonthly = async () => {
    if (
      !confirm(
        t(
          "admin.confirmPurge",
          undefined,
          "This will purge all previous month's survey submissions and reset monthly participation locks. Continue?",
        )
      )
    ) {
      return;
    }

    setPurging(true);
    try {
      const res = await fetch("/api/surveys/admin/purge", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          t(
            "admin.purgeSuccess",
            { responses: data.purgedResponses, submissions: data.purgedSubmissions },
            `Purged ${data.purgedResponses} expired responses and ${data.purgedSubmissions} submission records.`,
          ),
        );
        fetchSurveys();
      } else {
        toast.error(data.error || t("admin.purgeFailed", undefined, "Failed to purge."));
      }
    } catch (err) {
      toast.error(t("admin.purgeFailed", undefined, "Failed to purge."));
    } finally {
      setPurging(false);
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
              <ClipboardList className="w-8 h-8 text-primary" />
              {t("admin.surveysTitle", undefined, "Surveys Management")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("admin.surveysDesc", undefined, "Create, configure, and monitor community and monthly surveys.")}
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurgeMonthly}
              disabled={purging}
              className="border-amber-500/40 text-amber-500 hover:bg-amber-500/10"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${purging ? "animate-spin" : ""}`} />
              {t("admin.purgeExpired", undefined, "Purge Monthly Data")}
            </Button>

            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                  <Plus className="w-4 h-4 mr-2" />
                  {t("admin.createSurvey", undefined, "Create Survey")}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card text-card-foreground border-border">
                <DialogHeader>
                  <DialogTitle className="text-xl font-bold text-foreground">
                    {t("admin.newSurveyTitle", undefined, "Create New Custom Survey")}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground text-xs">
                    {t("admin.newSurveyDesc", undefined, "Add a new survey to the community benchmarks.")}
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleCreateSurvey} className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label className="text-foreground">{t("admin.surveyTitleLabel", undefined, "Survey Title")}</Label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="e.g., Programming Languages 2026"
                      className="bg-background border-border text-foreground"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-foreground">{t("admin.surveyDescLabel", undefined, "Description")}</Label>
                    <Textarea
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="Briefly describe the survey..."
                      className="bg-background border-border text-foreground"
                      rows={2}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-foreground">{t("admin.categoryLabel", undefined, "Category")}</Label>
                      <Select
                        value={newCategory}
                        onValueChange={(val: any) => setNewCategory(val)}
                      >
                        <SelectTrigger className="bg-background border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border text-card-foreground">
                          <SelectItem value="Hardware">Hardware</SelectItem>
                          <SelectItem value="Fun">Fun & Gaming</SelectItem>
                          <SelectItem value="Development">Development</SelectItem>
                          <SelectItem value="General">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-foreground">{t("admin.recurrenceLabel", undefined, "Recurrence")}</Label>
                      <Select
                        value={newRecurrence}
                        onValueChange={(val: any) => setNewRecurrence(val)}
                      >
                        <SelectTrigger className="bg-background border-border text-foreground">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border text-card-foreground">
                          <SelectItem value="monthly">Monthly (Resets each month)</SelectItem>
                          <SelectItem value="permanent">Permanent (One-time)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Dynamic Questions Builder */}
                  <div className="space-y-4 pt-2 border-t border-border">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-bold text-primary">
                        {t("admin.questionsSection", undefined, "Survey Questions")}
                      </Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddQuestion}
                        className="border-border text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        {t("admin.addQuestion", undefined, "Add Question")}
                      </Button>
                    </div>

                    {questions.map((q, qIdx) => (
                      <div
                        key={qIdx}
                        className="p-4 rounded-xl bg-background/60 border border-border space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-primary">
                            Question {qIdx + 1}
                          </span>
                          {questions.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveQuestion(qIdx)}
                              className="h-7 w-7 p-0 text-rose-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        <Input
                          value={q.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setQuestions((prev) => {
                              const copy = [...prev];
                              copy[qIdx].title = val;
                              return copy;
                            });
                          }}
                          placeholder={`Enter question prompt...`}
                          className="bg-background border-border text-foreground"
                          required
                        />

                        <div className="grid grid-cols-2 gap-3">
                          <Select
                            value={q.type}
                            onValueChange={(val: any) => {
                              setQuestions((prev) => {
                                const copy = [...prev];
                                copy[qIdx].type = val;
                                return copy;
                              });
                            }}
                          >
                            <SelectTrigger className="bg-background border-border text-foreground text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-card border-border text-card-foreground">
                              <SelectItem value="single_choice">Single Choice</SelectItem>
                              <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                              <SelectItem value="rating">Rating (1-5)</SelectItem>
                              <SelectItem value="text">Text Response</SelectItem>
                              <SelectItem value="number">Number</SelectItem>
                            </SelectContent>
                          </Select>

                          <div className="flex items-center gap-2">
                            <Switch
                              checked={q.required}
                              onCheckedChange={(checked) => {
                                setQuestions((prev) => {
                                  const copy = [...prev];
                                  copy[qIdx].required = checked;
                                  return copy;
                                });
                              }}
                            />
                            <Label className="text-xs text-muted-foreground">
                              {t("common.required", undefined, "Required")}
                            </Label>
                          </div>
                        </div>

                        {/* Options Editor for Choice Questions */}
                        {(q.type === "single_choice" || q.type === "multiple_choice") && (
                          <div className="space-y-2 pt-2 border-t border-border">
                            <Label className="text-xs text-muted-foreground">Options</Label>
                            {q.options.map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-2">
                                <Input
                                  value={opt}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setQuestions((prev) => {
                                      const copy = [...prev];
                                      copy[qIdx].options[optIdx] = val;
                                      return copy;
                                    });
                                  }}
                                  className="h-8 text-xs bg-background border-border text-foreground"
                                  placeholder={`Option ${optIdx + 1}`}
                                />
                                {q.options.length > 2 && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRemoveOption(qIdx, optIdx)}
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
                              onClick={() => handleAddOption(qIdx)}
                              className="h-7 text-xs text-primary hover:underline"
                            >
                              <Plus className="w-3 h-3 mr-1" />
                              Add Option
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
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
                      {creating ? t("common.loading", undefined, "Creating...") : t("common.create", undefined, "Create Survey")}
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
            <span className="text-muted-foreground text-sm">{t("common.loading", undefined, "Loading surveys...")}</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {surveys.map((survey) => (
              <Card
                key={survey.id}
                className="flex flex-col justify-between border-border bg-card shadow-sm"
              >
                <CardHeader className="space-y-3 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={survey.isActive ? "default" : "secondary"}
                      className={
                        survey.isActive
                          ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                          : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }
                    >
                      {survey.isActive
                        ? t("common.status", undefined, "Active")
                        : t("surveys.closed", undefined, "Closed")}
                    </Badge>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xs">
                        {survey.category}
                      </Badge>
                      <Badge variant="outline" className="text-xs font-mono">
                        {survey.recurrence}
                      </Badge>
                    </div>
                  </div>

                  <div>
                    <CardTitle className="text-lg font-bold text-foreground">
                      {t(survey.titleKey, undefined, survey.defaultTitle)}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-xs mt-1 line-clamp-2">
                      {t(survey.descriptionKey, undefined, survey.defaultDescription)}
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardFooter className="pt-3 border-t border-border flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {survey.isPredefined
                      ? t("admin.predefined", undefined, "Predefined System Survey")
                      : t("admin.customSurvey", undefined, "Custom Admin Survey")}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(survey)}
                      className="h-8 px-2 text-xs"
                    >
                      {survey.isActive
                        ? t("admin.deactivate", undefined, "Close")
                        : t("admin.activate", undefined, "Open")}
                    </Button>

                    {!survey.isPredefined && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteSurvey(survey.id)}
                        className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
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
