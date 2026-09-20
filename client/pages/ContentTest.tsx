import React, { useState, useRef } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { handleSafetyModeration } from "@/lib/safetyModeration";
import { toast } from "sonner";
import {
  ShieldCheck,
  ShieldAlert,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  X,
} from "lucide-react";

interface ModerationVerdict {
  safe: boolean;
  category?: string;
  reason?: string;
  message?: string;
  code?: string;
  redirectUrl?: string;
}

export default function ContentTest() {
  const { session } = useAuth();
  const { t } = useTranslation();

  usePageTitle(t("contentTest.title", undefined, "Content Moderation Test"), {
    description: t(
      "contentTest.subtitle",
      undefined,
      "Test text prompts and images against the tiered safety pipeline.",
    ),
  });

  const [activeTab, setActiveTab] = useState<"text" | "image">("text");
  const [textInput, setTextInput] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [verdict, setVerdict] = useState<ModerationVerdict | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file (PNG, JPEG, WebP, GIF).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image file size exceeds the 10MB limit.");
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    setVerdict(null);
  };

  const handleClearImage = () => {
    setSelectedFile(null);
    setImagePreview(null);
    setVerdict(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleTest = async () => {
    if (!session?.access_token) {
      toast.error("You must be signed in to use the moderation test tool.");
      return;
    }

    if (activeTab === "text" && !textInput.trim()) {
      toast.error("Please enter some text to test.");
      return;
    }

    if (activeTab === "image" && (!selectedFile || !imagePreview)) {
      toast.error("Please select an image file to test.");
      return;
    }

    setIsAnalyzing(true);
    setVerdict(null);

    try {
      const payload: any = {};
      if (activeTab === "text") {
        payload.text = textInput.trim();
      } else if (imagePreview) {
        payload.image = imagePreview;
      }

      const res = await fetch("/api/contenttest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.safe) {
        setVerdict({
          safe: true,
          message: data.message || t("contentTest.safeDescription"),
        });
      } else {
        // Run global handler for helpline redirection if self-harm or lockdown alert
        handleSafetyModeration(data, t);

        setVerdict({
          safe: false,
          category: data.category || "Prohibited Content",
          reason: data.reason || data.error || t("contentTest.unsafeDescription"),
          code: data.code,
          redirectUrl: data.redirectUrl,
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to analyze content.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8 py-4">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("contentTest.title", undefined, "Content Moderation Test")}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base mt-1">
                {t(
                  "contentTest.subtitle",
                  undefined,
                  "Test text prompts and images against the tiered safety pipeline (CSAM Guard + OpenAI Multimodal Moderation).",
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Main Testing Card */}
        <Card className="border-border/60 shadow-lg bg-card/60 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <Tabs
              value={activeTab}
              onValueChange={(val) => {
                setActiveTab(val as "text" | "image");
                setVerdict(null);
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 max-w-sm">
                <TabsTrigger value="text" className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>{t("contentTest.tabText", undefined, "Text Moderation")}</span>
                </TabsTrigger>
                <TabsTrigger value="image" className="flex items-center space-x-2">
                  <ImageIcon className="w-4 h-4" />
                  <span>{t("contentTest.tabImage", undefined, "Image Moderation")}</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>

          <CardContent className="space-y-6">
            {activeTab === "text" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    {t("contentTest.textLabel", undefined, "Text Content")}
                  </label>
                  {textInput.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setTextInput("");
                        setVerdict(null);
                      }}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t("contentTest.clear", undefined, "Clear")}
                    </Button>
                  )}
                </div>
                <Textarea
                  value={textInput}
                  onChange={(e) => {
                    setTextInput(e.target.value);
                    if (verdict) setVerdict(null);
                  }}
                  placeholder={t(
                    "contentTest.textPlaceholder",
                    undefined,
                    "Type or paste text to test against the moderation pipeline...",
                  )}
                  rows={6}
                  className="resize-y bg-background/50 font-sans"
                />
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>{textInput.length} characters</span>
                  <Button
                    onClick={handleTest}
                    disabled={isAnalyzing || !textInput.trim()}
                    className="min-w-[140px]"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t("contentTest.testing", undefined, "Analyzing Content...")}
                      </>
                    ) : (
                      t("contentTest.testTextButton", undefined, "Test Text Content")
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="text-sm font-medium">
                  {t("contentTest.imageLabel", undefined, "Image Upload")}
                </label>

                {!imagePreview ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border/80 hover:border-primary/60 transition-colors rounded-xl p-8 text-center cursor-pointer flex flex-col items-center justify-center space-y-3 bg-background/30 hover:bg-background/50"
                  >
                    <div className="p-3 rounded-full bg-primary/10 text-primary">
                      <UploadCloud className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {t(
                          "contentTest.imageDropzone",
                          undefined,
                          "Click or drag an image here to upload (PNG, JPEG, WebP, GIF up to 10MB)",
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Supports standard binary formats and transparent PNGs
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png, image/jpeg, image/webp, image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileSelect(file);
                      }}
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative max-w-sm mx-auto rounded-xl overflow-hidden border border-border bg-black/40 shadow-md">
                      <img
                        src={imagePreview}
                        alt="Upload preview"
                        className="w-full max-h-72 object-contain"
                      />
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={handleClearImage}
                        className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg"
                        title="Remove image"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>{selectedFile?.name}</span>
                      <Button onClick={handleTest} disabled={isAnalyzing} className="min-w-[140px]">
                        {isAnalyzing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            {t("contentTest.testing", undefined, "Analyzing Content...")}
                          </>
                        ) : (
                          t("contentTest.testImageButton", undefined, "Test Image")
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Simple Verdict Card */}
            {verdict && (
              <div
                className={`mt-6 p-5 rounded-xl border transition-all duration-300 ${
                  verdict.safe
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-100"
                }`}
              >
                <div className="flex items-start space-x-3">
                  {verdict.safe ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-6 h-6 text-rose-400 mt-0.5 shrink-0" />
                  )}

                  <div className="space-y-2 flex-1">
                    <div className="flex items-center space-x-2">
                      <Badge
                        variant={verdict.safe ? "default" : "destructive"}
                        className={`text-xs font-semibold px-2.5 py-0.5 ${
                          verdict.safe
                            ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                            : "bg-rose-600 hover:bg-rose-600 text-white"
                        }`}
                      >
                        {verdict.safe
                          ? t("contentTest.safeVerdict", undefined, "Safe")
                          : t("contentTest.unsafeVerdict", undefined, "Unsafe")}
                      </Badge>

                      {verdict.category && (
                        <Badge variant="outline" className="border-rose-500/40 text-rose-200">
                          {verdict.category}
                        </Badge>
                      )}
                    </div>

                    <p className="text-sm font-medium leading-relaxed">
                      {verdict.reason ||
                        (verdict.safe
                          ? t(
                              "contentTest.safeDescription",
                              undefined,
                              "This content passed all safety and moderation filters.",
                            )
                          : t(
                              "contentTest.unsafeDescription",
                              undefined,
                              "This content was flagged by policy enforcement.",
                            ))}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
