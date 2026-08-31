import { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import {
  Upload,
  Maximize,
  Plus,
  X,
  Trash2,
  Bot,
  Sparkles,
  Search,
  Server,
  Cpu,
  Layers,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db, supabase } from "@/lib/db";
import { storage } from "@/lib/storage";
import Cropper, { Area } from "react-easy-crop";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { LanguageSelect } from "@/components/ui/LanguageSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "@/components/ui/alert-dialog";
import { SUPPORTED_LANGUAGES, getLanguageOption } from "@/lib/languages";
import { CountryFlag } from "@/components/ui/CountryFlag";
import {
  useAiModels,
  type Model,
  POPULAR_PRESETS,
  BUILTIN_MODELS,
} from "@/hooks/useAiModels";
import { formatModelLabel } from "@/utils/aiUtils";
import { Link } from "react-router-dom";

interface UserProfile {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  email: string | null;
  show_email: boolean;
  language?: string | null;
  additional_languages?: string[] | null;
}
interface ProfilePicture {
  id: string;
  user_id?: string;
  image_url: string;
  crop_data?: Area | null;
}

export default function Account() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { t, language, setLanguage } = useTranslation();
  usePageTitle(t("titles.account", undefined, "Account"), {
    description: t("account.profileSettings", undefined, "Profile Settings"),
  });
  const [profilePicture, setProfilePicture] = useState<ProfilePicture | null>(
    null,
  );
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedStoragePath, setSelectedStoragePath] = useState<string | null>(
    null,
  );
  const [fitImage, setFitImage] = useState(false);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [bioInput, setBioInput] = useState("");
  const [additionalLanguages, setAdditionalLanguages] = useState<string[]>([]);
  const [selectedAddLanguage, setSelectedAddLanguage] = useState<string>("");

  // Models Tab State & Hooks
  const {
    models,
    isLoading: modelsLoading,
    refreshModels,
    hordeStatus,
    localStatus,
    configuredProviders,
    isProviderConfigured,
    addCustomModel,
    removeCustomModel,
    chatbotDefaultModel,
    chatbotDefaultProvider,
    setChatbotDefault,
    researchAgentDefaultModel,
    researchAgentDefaultProvider,
    setResearchAgentDefault,
    researchSummarizerDefaultModel,
    researchSummarizerDefaultProvider,
    setResearchSummarizerDefault,
  } = useAiModels();

  // Add Model Dialog State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addProvider, setAddProvider] = useState<string>("openai");
  const [selectedPreset, setSelectedPreset] = useState<string>("gpt-4o");
  const [customModelId, setCustomModelId] = useState<string>("gpt-4o");
  const [customModelName, setCustomModelName] =
    useState<string>("GPT-4o (Omni)");
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmittingModel, setIsSubmittingModel] = useState(false);

  // Delete Model Alert State
  const [modelToDelete, setModelToDelete] = useState<Model | null>(null);
  const [isDeletingModel, setIsDeletingModel] = useState(false);

  const fetchAccountData = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data: pic } = await supabase
      .from("profile_pictures")
      .select("*")
      .eq("user_id", session.user.id)
      .single();
    if (pic) {
      const { data: signedData } = await storage
        .from("Storage")
        .createSignedUrl(pic.image_url, 3600);
      setProfilePicture({ ...pic, image_url: signedData?.signedUrl || "" });
    }
    const { data: prof } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .single();
    if (prof) {
      setProfile(prof);
      setUsernameInput(prof.username || "");
      setDisplayNameInput(prof.display_name || "");
      setBioInput(prof.bio || "");
      if (prof.language) {
        setLanguage(prof.language);
      }
      if (Array.isArray(prof.additional_languages)) {
        setAdditionalLanguages(prof.additional_languages);
      }
    }
  }, [session?.user?.id, setLanguage]);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  const handleStorageSelect = async (file: any) => {
    if (file.name.includes("..")) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: t(
          "account.invalidFileName",
          undefined,
          "Invalid file name",
        ),
        variant: "destructive",
      });
      return;
    }
    setSelectedStoragePath(file.name);
    setFitImage(false);
    setZoom(1);
    const { data } = await storage
      .from("Storage")
      .createSignedUrl(file.name, 3600);
    if (data?.signedUrl) setSelectedImage(data.signedUrl);
  };

  const handleUpload = async () => {
    if (
      !selectedImage ||
      !croppedArea ||
      !session?.user?.id ||
      !selectedStoragePath
    )
      return;
    try {
      const { data: signedData } = await storage
        .from("Storage")
        .createSignedUrl(selectedStoragePath, 3600);
      const publicUrl = signedData?.signedUrl || "";

      await supabase.from("profile_pictures").upsert(
        {
          user_id: session.user.id,
          image_url: selectedStoragePath,
          crop_data: croppedArea,
          image_path: selectedStoragePath,
        },
        { onConflict: "user_id" },
      );

      await supabase.rpc("upsert_user_preferences", {
        p_user_id: session.user.id,
        p_profile_picture_path: selectedStoragePath,
      });

      setProfilePicture({
        id: "",
        user_id: session.user.id,
        image_url: publicUrl,
        crop_data: croppedArea,
      });
      setSelectedImage(null);
      setSelectedStoragePath(null);
      toast({ title: t("common.success", undefined, "Success") });
    } catch (e: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleToggleEmail = async (visible: boolean) => {
    if (!session?.user?.id) return;
    const { data, error } = await supabase
      .from("profiles")
      .upsert({ user_id: session.user.id, show_email: visible })
      .select()
      .single();
    if (!error && data) {
      setProfile(data);
      toast({ title: t("common.success", undefined, "Success") });
    }
  };

  const availableAdditionalLanguages = useMemo(() => {
    const currentLangOpt = getLanguageOption(language);
    return SUPPORTED_LANGUAGES.filter(
      (l) =>
        l.name !== currentLangOpt.name &&
        !additionalLanguages.some(
          (al) => getLanguageOption(al).name === l.name,
        ),
    );
  }, [language, additionalLanguages]);

  const handleLanguageChange = async (newLang: string) => {
    await setLanguage(newLang);
    const newOpt = getLanguageOption(newLang);
    if (
      additionalLanguages.some(
        (al) => getLanguageOption(al).name === newOpt.name,
      )
    ) {
      const updated = additionalLanguages.filter(
        (al) => getLanguageOption(al).name !== newOpt.name,
      );
      setAdditionalLanguages(updated);
      if (session?.user?.id) {
        await supabase.from("profiles").upsert({
          user_id: session.user.id,
          additional_languages: updated,
        });
      }
    }
    toast({
      title: t("account.languageUpdated", undefined, "Language updated"),
    });
  };

  const handleAddAdditionalLanguage = async () => {
    if (!selectedAddLanguage) return;
    const opt = getLanguageOption(selectedAddLanguage);
    if (
      additionalLanguages.some(
        (al) => getLanguageOption(al).name === opt.name,
      ) ||
      getLanguageOption(language).name === opt.name
    ) {
      return;
    }
    const updated = [...additionalLanguages, opt.name];
    setAdditionalLanguages(updated);
    setSelectedAddLanguage("");

    if (session?.user?.id) {
      try {
        await supabase.from("profiles").upsert({
          user_id: session.user.id,
          additional_languages: updated,
        });
        toast({
          title: t(
            "account.additionalLanguagesUpdated",
            undefined,
            "Additional languages updated",
          ),
        });
      } catch (err: any) {
        console.error("Failed to update additional languages:", err);
      }
    }
  };

  const handleRemoveAdditionalLanguage = async (langName: string) => {
    const updated = additionalLanguages.filter(
      (al) => getLanguageOption(al).name !== getLanguageOption(langName).name,
    );
    setAdditionalLanguages(updated);

    if (session?.user?.id) {
      try {
        await supabase.from("profiles").upsert({
          user_id: session.user.id,
          additional_languages: updated,
        });
        toast({
          title: t(
            "account.additionalLanguagesUpdated",
            undefined,
            "Additional languages updated",
          ),
        });
      } catch (err: any) {
        console.error("Failed to update additional languages:", err);
      }
    }
  };

  const handleSaveProfile = async () => {
    try {
      const { error } = await supabase.from("profiles").upsert({
        user_id: session?.user?.id,
        username: usernameInput,
        display_name: displayNameInput,
        bio: bioInput,
        language: language,
        additional_languages: additionalLanguages,
      });
      if (error) throw error;
      toast({ title: t("common.success", undefined, "Success") });
    } catch (e: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // Provider options for Add Model Dialog
  const providerOptions = useMemo(
    () => [
      { value: "openai", label: "OpenAI", isLocal: false },
      { value: "anthropic", label: "Anthropic Claude", isLocal: false },
      { value: "google", label: "Google Gemini", isLocal: false },
      { value: "openrouter", label: "OpenRouter", isLocal: false },
      { value: "grok", label: "xAI Grok", isLocal: false },
      { value: "local-ollama", label: "Local Ollama", isLocal: true },
      { value: "local-lmstudio", label: "Local LM Studio", isLocal: true },
      { value: "local-kobold", label: "Local KoboldCPP", isLocal: true },
      { value: "cloudflare", label: "Cloudflare", isLocal: false },
      { value: "horde", label: "AI Horde", isLocal: false },
    ],
    [],
  );

  // When provider changes in Add Model modal, update default preset & custom id
  const handleProviderSelectChange = (newProvider: string) => {
    setAddProvider(newProvider);
    setAddError(null);
    const presets = POPULAR_PRESETS[newProvider] || [];
    if (presets.length > 0) {
      setSelectedPreset(presets[0].model_id);
      setCustomModelId(presets[0].model_id);
      setCustomModelName(presets[0].name);
    } else {
      setSelectedPreset("custom");
      setCustomModelId("");
      setCustomModelName("");
    }
  };

  const handlePresetSelectChange = (newPreset: string) => {
    setSelectedPreset(newPreset);
    setAddError(null);
    if (newPreset === "custom") {
      setCustomModelId("");
      setCustomModelName("");
    } else {
      const presets = POPULAR_PRESETS[addProvider] || [];
      const match = presets.find((p) => p.model_id === newPreset);
      if (match) {
        setCustomModelId(match.model_id);
        setCustomModelName(match.name);
      } else {
        setCustomModelId(newPreset);
      }
    }
  };

  const handleOpenAddModelModal = () => {
    setAddProvider("openai");
    const presets = POPULAR_PRESETS["openai"] || [];
    setSelectedPreset(presets[0]?.model_id || "custom");
    setCustomModelId(presets[0]?.model_id || "");
    setCustomModelName(presets[0]?.name || "");
    setAddError(null);
    setIsAddModalOpen(true);
  };

  const handleAddModelSubmit = async () => {
    if (!customModelId.trim()) {
      setAddError(
        t("account.modelIdRequired", undefined, "Model ID is required"),
      );
      return;
    }

    setIsSubmittingModel(true);
    setAddError(null);

    const res = await addCustomModel(
      addProvider,
      customModelId.trim(),
      customModelName.trim() || undefined,
    );
    setIsSubmittingModel(false);

    if (res.success) {
      toast({
        title: t(
          "account.modelAdded",
          undefined,
          "Model registered successfully",
        ),
      });
      setIsAddModalOpen(false);
    } else {
      setAddError(
        res.error || t("common.error", undefined, "Error registering model"),
      );
    }
  };

  const handleDeleteModelConfirm = async () => {
    if (!modelToDelete) return;
    setIsDeletingModel(true);
    const res = await removeCustomModel(
      modelToDelete.provider,
      modelToDelete.model_id,
    );
    setIsDeletingModel(false);
    setModelToDelete(null);

    if (res.success) {
      toast({
        title: t("account.modelRemoved", undefined, "Model removed"),
      });
    } else {
      toast({
        title: t("common.error", undefined, "Error"),
        description: res.error,
        variant: "destructive",
      });
    }
  };

  // Group models cleanly for display
  const localModels = useMemo(() => {
    return models.filter(
      (m) =>
        m.isLocal ||
        m.provider.startsWith("local-") ||
        ["ollama", "lmstudio", "kobold", "koboldcpp"].includes(m.provider),
    );
  }, [models]);

  const cloudProviders = useMemo(
    () => ["openai", "google", "anthropic", "openrouter", "grok"],
    [],
  );

  const cloudModelsByProvider = useMemo(() => {
    const map: Record<string, Model[]> = {};
    for (const p of cloudProviders) {
      map[p] = models.filter((m) => m.provider.toLowerCase() === p);
    }
    return map;
  }, [models, cloudProviders]);

  const builtInModels = useMemo(() => {
    const fromModels = models.filter((m) =>
      ["cloudflare", "horde"].includes(m.provider.toLowerCase()),
    );
    return fromModels.length > 0 ? fromModels : BUILTIN_MODELS;
  }, [models]);

  // Model value serialization for Select components: "provider:::model_id"
  const getModelKey = (provider: string | null, modelId: string | null) => {
    if (!provider || !modelId) return "";
    return `${provider}:::${modelId}`;
  };

  const parseModelKey = (key: string) => {
    const parts = key.split(":::");
    if (parts.length === 2) {
      return { provider: parts[0], modelId: parts[1] };
    }
    return null;
  };

  const chatbotSelectedKey = getModelKey(
    chatbotDefaultProvider,
    chatbotDefaultModel,
  );
  const researchAgentSelectedKey = getModelKey(
    researchAgentDefaultProvider,
    researchAgentDefaultModel,
  );
  const researchSummarizerSelectedKey = getModelKey(
    researchSummarizerDefaultProvider,
    researchSummarizerDefaultModel,
  );

  const handleChatbotDefaultSelect = async (val: string) => {
    const parsed = parseModelKey(val);
    if (parsed) {
      await setChatbotDefault(parsed.modelId, parsed.provider);
      toast({
        title: t(
          "account.defaultModelUpdated",
          undefined,
          "Default model updated",
        ),
      });
    }
  };

  const handleResearchAgentDefaultSelect = async (val: string) => {
    const parsed = parseModelKey(val);
    if (parsed) {
      await setResearchAgentDefault(parsed.modelId, parsed.provider);
      toast({
        title: t(
          "account.defaultModelUpdated",
          undefined,
          "Default model updated",
        ),
      });
    }
  };

  const handleResearchSummarizerDefaultSelect = async (val: string) => {
    const parsed = parseModelKey(val);
    if (parsed) {
      await setResearchSummarizerDefault(parsed.modelId, parsed.provider);
      toast({
        title: t(
          "account.defaultModelUpdated",
          undefined,
          "Default model updated",
        ),
      });
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-20">
        <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 items-center sm:items-start text-center sm:text-left">
          <div className="relative group shrink-0">
            <div className="w-28 h-28 sm:w-40 sm:h-40 rounded-full overflow-hidden border-4 border-slate-800 bg-slate-900 flex items-center justify-center">
              {profilePicture?.image_url ? (
                profilePicture.crop_data &&
                typeof profilePicture.crop_data.width === "number" &&
                profilePicture.crop_data.width > 0 ? (
                  <div
                    className="w-full h-full"
                    style={{
                      backgroundImage: `url(${profilePicture.image_url})`,
                      backgroundSize: `${100 / (profilePicture.crop_data.width / 100)}%`,
                      backgroundPosition: `${profilePicture.crop_data.x ?? 0}% ${profilePicture.crop_data.y ?? 0}%`,
                      backgroundRepeat: "no-repeat",
                    }}
                  />
                ) : (
                  <img
                    src={profilePicture.image_url}
                    alt={
                      profile?.display_name || profile?.username || "Profile"
                    }
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="text-slate-700">
                  <Upload className="w-10 h-10 sm:w-12 sm:h-12" />
                </div>
              )}
            </div>
            <StorageFileSelector
              onSelect={handleStorageSelect}
              trigger={
                <button
                  type="button"
                  aria-label={t(
                    "account.uploadProfilePicture",
                    undefined,
                    "Upload profile picture",
                  )}
                  title={t(
                    "account.uploadProfilePicture",
                    undefined,
                    "Upload profile picture",
                  )}
                  className="absolute bottom-1 right-1 p-2 bg-cyan-600 rounded-full text-white shadow-lg hover:bg-cyan-500 transition-colors"
                >
                  <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              }
            />
          </div>

          <div className="flex-1 space-y-2 sm:space-y-4">
            <h1 className="text-2xl sm:text-3xl font-bold text-white">
              {profile?.display_name ||
                profile?.username ||
                t("account.title", undefined, "Your Account")}
            </h1>
            {profile?.username && profile?.display_name && (
              <p className="text-sm text-slate-400">@{profile.username}</p>
            )}
          </div>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="profile">
              {t("account.profile", undefined, "Profile")}
            </TabsTrigger>
            <TabsTrigger value="models" data-testid="models-tab-trigger">
              {t("account.models", undefined, "Models")}
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor="username-input"
                      className="text-sm font-medium text-slate-300"
                    >
                      {t("account.username", undefined, "Username")}
                    </Label>
                    <Input
                      id="username-input"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder={t("account.username", undefined, "Username")}
                      className="bg-slate-950"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="display-name-input"
                      className="text-sm font-medium text-slate-300"
                    >
                      {t("account.displayName", undefined, "Display Name")}
                    </Label>
                    <Input
                      id="display-name-input"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      placeholder={t(
                        "account.displayName",
                        undefined,
                        "Display Name",
                      )}
                      className="bg-slate-950"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="bio-input"
                    className="text-sm font-medium text-slate-300"
                  >
                    {t("account.bio", undefined, "Bio")}
                  </Label>
                  <textarea
                    id="bio-input"
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    placeholder={t("account.bioPlaceholder", undefined, "Bio")}
                    className="w-full min-h-[100px] bg-slate-950 border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
                <Button onClick={handleSaveProfile} className="bg-cyan-600">
                  {t("account.saveChanges", undefined, "Save Changes")}
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-lg">
                  {t("account.languageSectionTitle", undefined, "Language")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "account.languageSectionDesc",
                    undefined,
                    "Choose your preferred language for your account and public profile",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2 max-w-sm">
                  <Label
                    htmlFor="account-language-select"
                    className="text-sm font-medium text-slate-300"
                  >
                    {t(
                      "account.displayLanguage",
                      undefined,
                      "Display Language",
                    )}
                  </Label>
                  <LanguageSelect
                    id="account-language-select"
                    value={language}
                    onValueChange={handleLanguageChange}
                  />
                  <p className="text-xs text-slate-500">
                    {t(
                      "account.displayLanguageDesc",
                      undefined,
                      "Controls the interface language across the application",
                    )}
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-slate-800/60">
                  <div>
                    <h4 className="text-sm font-medium text-white">
                      {t(
                        "account.additionalLanguages",
                        undefined,
                        "Additional Languages",
                      )}
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t(
                        "account.additionalLanguagesDesc",
                        undefined,
                        "Cosmetic languages displayed on your public profile for others to see",
                      )}
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 max-w-md">
                    <div className="flex-1">
                      <Select
                        value={selectedAddLanguage}
                        onValueChange={setSelectedAddLanguage}
                        disabled={availableAdditionalLanguages.length === 0}
                      >
                        <SelectTrigger
                          id="additional-language-select"
                          aria-label={t(
                            "account.selectLanguageToAdd",
                            undefined,
                            "Select a language to add",
                          )}
                          className="bg-slate-950 border-slate-800 text-white focus:ring-cyan-500"
                        >
                          <SelectValue
                            placeholder={t(
                              "account.selectLanguageToAdd",
                              undefined,
                              "Select a language to add",
                            )}
                          />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-[250px]">
                          {availableAdditionalLanguages.map((lang) => (
                            <SelectItem
                              key={lang.code}
                              value={lang.name}
                              className="flex items-center gap-2 focus:bg-slate-800 cursor-pointer py-1.5"
                            >
                              <div className="flex items-center gap-2">
                                <CountryFlag
                                  countryCode={lang.countryCode}
                                  className="w-4 h-3 rounded-[2px]"
                                  alt={`${lang.name} flag`}
                                />
                                <span>{lang.name}</span>
                                {lang.nativeName &&
                                  lang.nativeName !== lang.name && (
                                    <span className="text-xs text-slate-400">
                                      ({lang.nativeName})
                                    </span>
                                  )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddAdditionalLanguage}
                      disabled={!selectedAddLanguage}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white shrink-0 gap-1.5"
                    >
                      <Plus className="w-4 h-4" />
                      {t("account.addLanguage", undefined, "Add Language")}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {additionalLanguages.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">
                        {t(
                          "account.noAdditionalLanguages",
                          undefined,
                          "No additional languages added.",
                        )}
                      </p>
                    ) : (
                      additionalLanguages.map((lang) => {
                        const opt = getLanguageOption(lang);
                        return (
                          <div
                            key={lang}
                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-xs text-slate-200 shadow-sm group hover:border-slate-700 transition"
                          >
                            <CountryFlag
                              countryCode={opt.countryCode}
                              className="w-4 h-3 rounded-[2px]"
                              alt={`${opt.name} flag`}
                            />
                            <span className="font-medium">{opt.name}</span>
                            <button
                              type="button"
                              onClick={() =>
                                handleRemoveAdditionalLanguage(lang)
                              }
                              aria-label={`${t("account.removeLanguage", undefined, "Remove language")} ${opt.name}`}
                              title={`${t("account.removeLanguage", undefined, "Remove language")} ${opt.name}`}
                              className="text-slate-500 hover:text-red-400 transition-colors p-0.5 rounded-full"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-lg">
                  {t("account.emailSettingsTitle", undefined, "Email Settings")}
                </CardTitle>
                <CardDescription>
                  {t(
                    "account.emailSettingsDesc",
                    undefined,
                    "Choose how others see your email",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {t("account.publicEmail", undefined, "Public Email")}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t(
                        "account.publicEmailDesc",
                        undefined,
                        "Show your email on your public profile",
                      )}
                    </p>
                  </div>
                  <Button
                    variant={profile?.show_email ? "secondary" : "outline"}
                    onClick={() => handleToggleEmail(!profile?.show_email)}
                    aria-pressed={!!profile?.show_email}
                  >
                    {profile?.show_email
                      ? t("common.yes", undefined, "Visible")
                      : t("common.no", undefined, "Hidden")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Models Tab */}
          <TabsContent
            value="models"
            className="space-y-6"
            data-testid="models-tab-content"
          >
            {/* Header Card */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-white text-xl flex items-center gap-2.5">
                    <Cpu className="w-5 h-5 text-cyan-400" />
                    {t("account.models", undefined, "AI Models")}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {t(
                      "account.modelsSubtitle",
                      undefined,
                      "Configure AI models, detect running local instances, register custom endpoints, and set feature defaults.",
                    )}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={handleOpenAddModelModal}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
                    data-testid="add-model-btn"
                  >
                    <Plus className="w-4 h-4" />
                    {t("account.addModel", undefined, "Add Model")}
                  </Button>
                </div>
              </CardHeader>
            </Card>

            {/* Feature Default Model Pickers Section */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Layers className="w-5 h-5 text-cyan-400" />
                  {t(
                    "account.featureDefaults",
                    undefined,
                    "Feature Default Models",
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "account.featureDefaultsDesc",
                    undefined,
                    "Configure default AI models for Chatbot, Research Agent, and Search Summarizer.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Chatbot Default */}
                  <div
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3 flex flex-col justify-between"
                    data-testid="chatbot-default-card"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-cyan-400" />
                          <h4 className="text-sm font-semibold text-white">
                            {t(
                              "account.chatbotDefaultTitle",
                              undefined,
                              "Chatbot Default",
                            )}
                          </h4>
                        </div>
                        {chatbotDefaultProvider && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-cyan-800/60 bg-cyan-950/30 text-cyan-300"
                          >
                            {chatbotDefaultProvider}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {t(
                          "account.chatbotDefaultDesc",
                          undefined,
                          "Default model used when opening and creating new Chatbot conversations.",
                        )}
                      </p>
                    </div>

                    <Select
                      value={chatbotSelectedKey}
                      onValueChange={handleChatbotDefaultSelect}
                    >
                      <SelectTrigger
                        id="chatbot-default-select"
                        data-testid="chatbot-default-select"
                        aria-label={t(
                          "account.chatbotDefaultTitle",
                          undefined,
                          "Chatbot Default Model",
                        )}
                        className="bg-slate-900 border-slate-800 text-xs text-white h-9"
                      >
                        <SelectValue
                          placeholder={chatbotDefaultModel || "Select Model..."}
                        />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-[260px]">
                        {models.map((m) => (
                          <SelectItem
                            key={`${m.provider}:::${m.model_id}`}
                            value={`${m.provider}:::${m.model_id}`}
                            className="text-xs focus:bg-slate-800 py-1.5"
                          >
                            <span className="font-medium text-slate-200">
                              {m.name || m.model_id}
                            </span>
                            <span className="ml-2 text-[10px] text-slate-400">
                              ({m.provider})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Card 2: Research Agent Default */}
                  <div
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3 flex flex-col justify-between"
                    data-testid="research-agent-default-card"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Search className="w-4 h-4 text-purple-400" />
                          <h4 className="text-sm font-semibold text-white">
                            {t(
                              "account.researchAgentDefaultTitle",
                              undefined,
                              "Research Agent Default",
                            )}
                          </h4>
                        </div>
                        {researchAgentDefaultProvider && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-purple-800/60 bg-purple-950/30 text-purple-300"
                          >
                            {researchAgentDefaultProvider}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {t(
                          "account.researchAgentDefaultDesc",
                          undefined,
                          "Agentic search exploration and fact-gathering tool loop model.",
                        )}
                      </p>
                    </div>

                    <Select
                      value={researchAgentSelectedKey}
                      onValueChange={handleResearchAgentDefaultSelect}
                    >
                      <SelectTrigger
                        id="research-agent-default-select"
                        data-testid="research-agent-default-select"
                        aria-label={t(
                          "account.researchAgentDefaultTitle",
                          undefined,
                          "Research Agent Default Model",
                        )}
                        className="bg-slate-900 border-slate-800 text-xs text-white h-9"
                      >
                        <SelectValue
                          placeholder={
                            researchAgentDefaultModel ||
                            "Default: google/gemma-4-31b"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-[260px]">
                        {models.map((m) => (
                          <SelectItem
                            key={`${m.provider}:::${m.model_id}`}
                            value={`${m.provider}:::${m.model_id}`}
                            className="text-xs focus:bg-slate-800 py-1.5"
                          >
                            <span className="font-medium text-slate-200">
                              {m.name || m.model_id}
                            </span>
                            <span className="ml-2 text-[10px] text-slate-400">
                              ({m.provider})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Card 3: Research Summarizer Default */}
                  <div
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-3 flex flex-col justify-between"
                    data-testid="research-summarizer-default-card"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-amber-400" />
                          <h4 className="text-sm font-semibold text-white">
                            {t(
                              "account.researchSummarizerDefaultTitle",
                              undefined,
                              "Search Summarizer Default",
                            )}
                          </h4>
                        </div>
                        {researchSummarizerDefaultProvider && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-amber-800/60 bg-amber-950/30 text-amber-300"
                          >
                            {researchSummarizerDefaultProvider}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        {t(
                          "account.researchSummarizerDefaultDesc",
                          undefined,
                          "Model used to synthesize research findings into comprehensive final answers.",
                        )}
                      </p>
                    </div>

                    <Select
                      value={researchSummarizerSelectedKey}
                      onValueChange={handleResearchSummarizerDefaultSelect}
                    >
                      <SelectTrigger
                        id="research-summarizer-default-select"
                        data-testid="research-summarizer-default-select"
                        aria-label={t(
                          "account.researchSummarizerDefaultTitle",
                          undefined,
                          "Research Summarizer Default Model",
                        )}
                        className="bg-slate-900 border-slate-800 text-xs text-white h-9"
                      >
                        <SelectValue
                          placeholder={
                            researchSummarizerDefaultModel ||
                            "Default: nemotron-3-120b"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-[260px]">
                        {models.map((m) => (
                          <SelectItem
                            key={`${m.provider}:::${m.model_id}`}
                            value={`${m.provider}:::${m.model_id}`}
                            className="text-xs focus:bg-slate-800 py-1.5"
                          >
                            <span className="font-medium text-slate-200">
                              {m.name || m.model_id}
                            </span>
                            <span className="ml-2 text-[10px] text-slate-400">
                              ({m.provider})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Active & Registered Models Grouped by Provider */}
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-lg flex items-center justify-between">
                  <span>
                    {t(
                      "account.registeredModels",
                      undefined,
                      "Active & Registered Models",
                    )}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refreshModels()}
                    className="text-slate-400 hover:text-white h-8 px-2 gap-1.5 text-xs"
                    title={t("common.refresh", undefined, "Refresh")}
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${modelsLoading ? "animate-spin" : ""}`}
                    />
                    {t("common.refresh", undefined, "Refresh")}
                  </Button>
                </CardTitle>
                <CardDescription>
                  {t(
                    "account.registeredModelsDesc",
                    undefined,
                    "All available models grouped by provider, including detected local endpoints and custom registrations.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* 1. Local Models Group */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <Server className="w-4 h-4 text-emerald-400" />
                      <h4 className="text-sm font-semibold text-white">
                        {t(
                          "account.localModelsGroup",
                          undefined,
                          "Local Models (Ollama / LM Studio / KoboldCPP)",
                        )}
                      </h4>
                    </div>
                    {localStatus.totalLocal <= 0 && (
                      <Badge
                        variant="outline"
                        className="bg-slate-950 border-slate-800 text-slate-500 text-xs"
                      >
                        {t("account.localStatusOffline", undefined, "Offline")}
                      </Badge>
                    )}
                  </div>

                  {localModels.length === 0 ? (
                    <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/60 text-center space-y-1">
                      <p className="text-xs text-slate-400">
                        {t(
                          "account.noLocalModelsDetected",
                          undefined,
                          "No local models detected. Launch Ollama (11434), LM Studio (1234), or KoboldCPP (5001) to auto-detect.",
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {localModels.map((m) => (
                        <div
                          key={`${m.provider}:${m.model_id}`}
                          className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-white truncate">
                                {m.name || m.model_id}
                              </p>
                              <p className="text-[10px] text-slate-400 truncate">
                                {m.provider} &bull; {m.model_id}
                              </p>
                            </div>
                          </div>
                          {m.isCustom && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setModelToDelete(m)}
                              className="text-slate-500 hover:text-red-400 p-1.5 h-7 w-7 rounded-md shrink-0"
                              title={t("common.delete", undefined, "Delete")}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 2. Cloud Providers Group */}
                <div className="space-y-4 pt-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <Cpu className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-sm font-semibold text-white">
                      {t(
                        "account.cloudModelsGroup",
                        undefined,
                        "Cloud Providers",
                      )}
                    </h4>
                  </div>

                  <div className="space-y-4">
                    {cloudProviders.map((prov) => {
                      const pModels = cloudModelsByProvider[prov] || [];
                      const isConfigured = isProviderConfigured(prov);
                      const providerLabel =
                        prov === "openai"
                          ? "OpenAI"
                          : prov === "anthropic"
                            ? "Anthropic Claude"
                            : prov === "google"
                              ? "Google Gemini"
                              : prov === "openrouter"
                                ? "OpenRouter"
                                : "xAI Grok";

                      return (
                        <div
                          key={prov}
                          className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-200">
                                {providerLabel}
                              </span>
                              {isConfigured ? (
                                <Badge
                                  variant="outline"
                                  className="bg-emerald-950/40 border-emerald-800 text-emerald-300 text-[10px] px-2 py-0.5"
                                >
                                  <CheckCircle2 className="w-3 h-3 mr-1" />
                                  {t(
                                    "account.configured",
                                    undefined,
                                    "Configured",
                                  )}
                                </Badge>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-950/30 border-amber-800/60 text-amber-300 text-[10px] px-2 py-0.5"
                                >
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  {t(
                                    "account.notConfigured",
                                    undefined,
                                    "API Key Required",
                                  )}
                                </Badge>
                              )}
                            </div>

                            <Link
                              to="/integrations"
                              className="text-xs text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
                            >
                              {t(
                                "account.goToIntegrations",
                                undefined,
                                "Integrations",
                              )}
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>

                          {pModels.length === 0 ? (
                            <p className="text-xs text-slate-500 italic">
                              {t(
                                "account.noModelsAvailable",
                                undefined,
                                "No custom models registered for this provider.",
                              )}
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {pModels.map((m) => (
                                <div
                                  key={`${m.provider}:${m.model_id}`}
                                  className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 hover:border-slate-700 transition"
                                >
                                  <div className="min-w-0 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      <p className="text-xs font-medium text-white truncate">
                                        {m.name || m.model_id}
                                      </p>
                                      {m.isCustom && (
                                        <Badge
                                          variant="outline"
                                          className="text-[9px] px-1 py-0 border-cyan-800/50 bg-cyan-950/30 text-cyan-400"
                                        >
                                          {t(
                                            "account.customBadge",
                                            undefined,
                                            "Custom",
                                          )}
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-400 truncate">
                                      {m.model_id}
                                    </p>
                                  </div>
                                  {m.isCustom && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setModelToDelete(m)}
                                      className="text-slate-500 hover:text-red-400 p-1 h-6 w-6 rounded shrink-0"
                                      title={t(
                                        "common.delete",
                                        undefined,
                                        "Delete",
                                      )}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Built-in Cloud Services */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-800/80">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h4 className="text-sm font-semibold text-white">
                      {t(
                        "account.builtInModelsGroup",
                        undefined,
                        "Built-in Cloud Services (Cloudflare & AI Horde)",
                      )}
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {builtInModels.map((m) => (
                      <div
                        key={`${m.provider}:${m.model_id}`}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-950 border border-slate-800/80"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium text-white truncate">
                              {m.name || m.model_id}
                            </p>
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1 py-0 border-slate-700 bg-slate-900 text-slate-400"
                            >
                              {m.provider}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">
                            {m.model_id}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Custom Model Dialog */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" />
              {t("account.addCustomModelTitle", undefined, "Register AI Model")}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-400">
              {t(
                "account.addCustomModelDesc",
                undefined,
                "Add a model from a configured provider or enter a custom model identifier.",
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Provider Selection */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-slate-300">
                {t("account.provider", undefined, "Provider")}
              </Label>
              <Select
                value={addProvider}
                onValueChange={handleProviderSelectChange}
              >
                <SelectTrigger
                  id="add-model-provider-select"
                  className="bg-slate-950 border-slate-800 text-white text-xs h-9"
                >
                  <SelectValue
                    placeholder={t(
                      "account.selectProvider",
                      undefined,
                      "Select a provider",
                    )}
                  />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  {providerOptions.map((opt) => {
                    const isConfigured =
                      opt.isLocal || isProviderConfigured(opt.value);
                    return (
                      <SelectItem
                        key={opt.value}
                        value={opt.value}
                        className="text-xs focus:bg-slate-800 py-1.5"
                      >
                        <div className="flex items-center justify-between w-full gap-2">
                          <span>{opt.label}</span>
                          {isConfigured && (
                            <span className="text-[10px] text-emerald-400">
                              &#10003; active
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Model Preset Selection */}
            {POPULAR_PRESETS[addProvider]?.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-slate-300">
                  {t("account.modelPreset", undefined, "Model Preset")}
                </Label>
                <Select
                  value={selectedPreset}
                  onValueChange={handlePresetSelectChange}
                >
                  <SelectTrigger
                    id="add-model-preset-select"
                    className="bg-slate-950 border-slate-800 text-white text-xs h-9"
                  >
                    <SelectValue
                      placeholder={t(
                        "account.selectPreset",
                        undefined,
                        "Select a preset",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-800 text-white max-h-[220px]">
                    {POPULAR_PRESETS[addProvider].map((preset) => (
                      <SelectItem
                        key={preset.model_id}
                        value={preset.model_id}
                        className="text-xs focus:bg-slate-800 py-1.5"
                      >
                        <span className="font-medium">{preset.name}</span>
                        <span className="ml-2 text-[10px] text-slate-400">
                          ({preset.model_id})
                        </span>
                      </SelectItem>
                    ))}
                    <SelectItem
                      value="custom"
                      className="text-xs focus:bg-slate-800 py-1.5 font-semibold text-cyan-400"
                    >
                      +{" "}
                      {t(
                        "account.customModelPreset",
                        undefined,
                        "Custom Model ID...",
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Model ID Text Input */}
            <div className="space-y-1.5">
              <Label
                htmlFor="custom-model-id-input"
                className="text-xs font-medium text-slate-300"
              >
                {t("account.modelId", undefined, "Model ID")}{" "}
                <span className="text-red-400">*</span>
              </Label>
              <Input
                id="custom-model-id-input"
                value={customModelId}
                onChange={(e) => {
                  setCustomModelId(e.target.value);
                  setAddError(null);
                }}
                placeholder={t(
                  "account.modelIdPlaceholder",
                  undefined,
                  "e.g. gpt-4o, claude-3-7-sonnet, deepseek/deepseek-r1",
                )}
                className="bg-slate-950 border-slate-800 text-xs h-9 text-white font-mono"
              />
            </div>

            {/* Display Name Input */}
            <div className="space-y-1.5">
              <Label
                htmlFor="custom-model-name-input"
                className="text-xs font-medium text-slate-300"
              >
                {t("account.modelName", undefined, "Display Name (Optional)")}
              </Label>
              <Input
                id="custom-model-name-input"
                value={customModelName}
                onChange={(e) => setCustomModelName(e.target.value)}
                placeholder={t(
                  "account.modelNamePlaceholder",
                  undefined,
                  "e.g. GPT-4o (Omni)",
                )}
                className="bg-slate-950 border-slate-800 text-xs h-9 text-white"
              />
            </div>

            {/* Warning if unconfigured provider */}
            {!providerOptions.find((p) => p.value === addProvider)?.isLocal &&
              !isProviderConfigured(addProvider) && (
                <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-800/50 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-200/90 leading-tight">
                    {t(
                      "account.providerNotConfiguredWarning",
                      undefined,
                      "Note: This provider does not have an active API key in Integrations. You can register the model now and add the key later.",
                    )}
                  </p>
                </div>
              )}

            {/* Error message */}
            {addError && (
              <p className="text-xs text-red-400 font-medium">{addError}</p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsAddModalOpen(false)}
              className="text-slate-400 hover:text-white text-xs"
            >
              {t("common.cancel", undefined, "Cancel")}
            </Button>
            <Button
              type="button"
              onClick={handleAddModelSubmit}
              disabled={isSubmittingModel || !customModelId.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs gap-1.5"
              data-testid="submit-add-model-btn"
            >
              {isSubmittingModel ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {t("account.registerModel", undefined, "Register Model")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Model Confirmation Dialog */}
      <AlertDialog
        open={!!modelToDelete}
        onOpenChange={(open) => !open && setModelToDelete(null)}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-base">
              {t(
                "account.deleteModelConfirmTitle",
                undefined,
                "Remove Custom Model",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-slate-400">
              {t(
                "account.deleteModelConfirmDesc",
                undefined,
                "Are you sure you want to remove this custom model? You can re-register it at any time.",
              )}
              {modelToDelete && (
                <span className="block mt-2 font-mono text-cyan-300 font-semibold">
                  {modelToDelete.provider} : {modelToDelete.model_id}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent border-slate-800 text-slate-300 hover:bg-slate-800 text-xs">
              {t("common.cancel", undefined, "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteModelConfirm}
              disabled={isDeletingModel}
              className="bg-red-600 hover:bg-red-500 text-white text-xs"
              data-testid="confirm-delete-model-btn"
            >
              {isDeletingModel
                ? t("common.loading", undefined, "Removing...")
                : t("common.delete", undefined, "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Profile Picture Cropper Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">
                {t(
                  "account.cropProfilePicture",
                  undefined,
                  "Crop Profile Picture",
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="relative h-96 w-full bg-black">
                <Cropper
                  image={selectedImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, p) => setCroppedArea(p)}
                  objectFit={fitImage ? "contain" : "cover"}
                  minZoom={fitImage ? 0.1 : 1}
                />
              </div>
              <div className="flex flex-col gap-4 px-1">
                <div className="flex items-center gap-2">
                  <Button
                    variant={fitImage ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => {
                      setFitImage(!fitImage);
                      if (!fitImage) setZoom(0.1);
                      else setZoom(1);
                    }}
                    className="gap-2"
                  >
                    <Maximize className="w-4 h-4" />
                    {fitImage
                      ? t("account.fillArea", undefined, "Fill Area")
                      : t("account.fitImage", undefined, "Fit Entire Image")}
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <Label
                    htmlFor="zoom-input"
                    className="text-xs text-slate-400"
                  >
                    {t("account.zoom", undefined, "Zoom")}
                  </Label>
                  <input
                    id="zoom-input"
                    type="range"
                    min={fitImage ? 0.1 : 1}
                    max={3}
                    step={0.1}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="ghost" onClick={() => setSelectedImage(null)}>
                  {t("common.cancel", undefined, "Cancel")}
                </Button>
                <Button
                  onClick={handleUpload}
                  className="bg-cyan-600 text-white"
                >
                  {t("common.save", undefined, "Save")}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}
