import { useState, useEffect, useCallback, useMemo } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Upload, Maximize, Plus, X } from "lucide-react";
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
import { SUPPORTED_LANGUAGES, getLanguageOption } from "@/lib/languages";
import { CountryFlag } from "@/components/ui/CountryFlag";

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
                      profile?.display_name ||
                      profile?.username ||
                      "Profile"
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
          </TabsList>

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
        </Tabs>
      </div>
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
