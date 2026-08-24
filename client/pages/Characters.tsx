import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  User,
  Plus,
  Edit2,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Globe,
  ShieldCheck,
  Clock,
  XCircle,
  AlertTriangle,
  Send,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/storage";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { EncryptionRequiredPrompt } from "@/components/EncryptionRequiredPrompt";
import {
  isCategoryLocked,
  isCategoryEncryptionEnabled,
  getActiveMasterKey,
  encryptCharacterData,
  decryptCharacterData,
} from "@/lib/crypto";

interface Character {
  id: string;
  user_id: string;
  name: string;
  short_description: string | null;
  display_name: string | null;
  image_path: string | null;
  image_url: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  hidden_description: string | null;
  is_universe?: boolean;
  is_verified_public?: boolean;
}

interface CharVerificationInfo {
  id: string;
  status: "pending" | "approved" | "rejected";
  target_type: "public_asset" | "public_usage";
  rejection_reason: string | null;
  public_character_id: string | null;
}

export default function Characters() {
  const { session } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  usePageTitle(t("titles.characters", undefined, "Characters"), {
    description: t(
      "characters.subtitle",
      undefined,
      "Create, customize, and share AI characters and interactive universes.",
    ),
  });
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeTab, setActiveTab] = useState<"characters" | "universes">(
    "characters",
  );
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState<Partial<Character>>(
    {},
  );
  const [encryptionLocked, setEncryptionLocked] = useState(() =>
    isCategoryLocked("characters"),
  );

  // Public characters and verifications map
  const [publicCharsMap, setPublicCharsMap] = useState<Record<string, any>>({});
  const [verificationsMap, setVerificationsMap] = useState<
    Record<string, CharVerificationInfo[]>
  >({});

  // Denial Reason Dialog State
  const [selectedDenialReason, setSelectedDenialReason] = useState<
    string | null
  >(null);

  // Submitting verification state
  const [submittingVerifId, setSubmittingVerifId] = useState<string | null>(
    null,
  );
  const [deletingVerifId, setDeletingVerifId] = useState<string | null>(null);

  useEffect(() => {
    setEncryptionLocked(isCategoryLocked("characters"));
  }, []);

  const handleUnlocked = () => {
    setEncryptionLocked(false);
    fetchCharacters();
  };

  useEffect(() => {
    fetchInitialData();
  }, [session?.user?.id]);

  const fetchInitialData = async () => {
    if (!session?.user?.id) return;
    try {
      fetchCharacters();
    } catch (err) {
      console.error("Error fetching characters", err);
      setLoading(false);
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
          if (urlData?.signedUrl)
            return { ...char, image_url: urlData.signedUrl };
          else return { ...char, image_url: "" };
        }
        return char;
      }),
    );
  };

  const fetchCharacters = async () => {
    try {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      let processedData = data || [];
      const key = getActiveMasterKey();
      const decryptedList = await Promise.all(
        processedData.map((c: any) => decryptCharacterData(c, key)),
      );
      const charsWithUrls = await attachSignedImageUrls(decryptedList);
      setCharacters(charsWithUrls);

      // Fetch public characters for user
      if (session?.user?.id) {
        const { data: pubData } = await supabase
          .from("public_characters")
          .select("*")
          .eq("uploader_id", session.user.id);

        const pMap: Record<string, any> = {};
        (pubData || []).forEach((pc: any) => {
          if (pc.original_character_id) {
            pMap[pc.original_character_id] = pc;
          }
          pMap[pc.name] = pc;
        });
        setPublicCharsMap(pMap);

        // Fetch verifications
        const { data: verifs } = await supabase
          .from("asset_verifications")
          .select("*")
          .eq("user_id", session.user.id)
          .in("asset_type", ["character", "universe"])
          .order("created_at", { ascending: false });

        const vMap: Record<string, CharVerificationInfo[]> = {};
        (verifs || []).forEach((v: any) => {
          const key = v.original_id || v.title;
          if (!vMap[key]) vMap[key] = [];
          vMap[key].push({
            id: v.id,
            status: v.status,
            target_type: v.target_type,
            rejection_reason: v.rejection_reason,
            public_character_id: v.public_character_id,
          });
        });
        setVerificationsMap(vMap);
      }
    } catch (err: any) {
      console.error("Error fetching characters", err);
      toast({
        title: t("common.error", undefined, "Error"),
        description: "Failed to load characters",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (submitForReverification = false) => {
    if (!session?.user?.id) return;
    if (!currentCharacter.name) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: "Name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      let payload: any = {
        user_id: session.user.id,
        name: currentCharacter.name,
        short_description: currentCharacter.short_description,
        display_name: currentCharacter.display_name,
        image_path: currentCharacter.image_path,
        appearance: currentCharacter.appearance,
        personality: currentCharacter.personality,
        backstory: currentCharacter.backstory,
        hidden_description: currentCharacter.hidden_description,
        is_universe: currentCharacter.is_universe || false,
      };

      if (isCategoryEncryptionEnabled("characters")) {
        const key = getActiveMasterKey();
        if (key) {
          payload = await encryptCharacterData(payload, key);
        }
      }

      let savedId = currentCharacter.id;

      if (currentCharacter.id) {
        // If modified, reset is_verified_public status
        payload.is_verified_public = false;

        const { error } = await supabase
          .from("characters")
          .update(payload)
          .eq("id", currentCharacter.id);
        if (error) throw error;

        // Invalidate previous verification in backend
        if (session.access_token) {
          await fetch("/api/assets/verifications/invalidate", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              asset_type: currentCharacter.is_universe
                ? "universe"
                : "character",
              original_id: currentCharacter.id,
            }),
          }).catch(() => {});
        }
      } else {
        const { data: inserted, error } = await supabase
          .from("characters")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (inserted) savedId = inserted.id;
      }

      // If user requested re-verification on save
      if (submitForReverification && savedId && session.access_token) {
        const pubChar = publicCharsMap[savedId];
        await fetch("/api/assets/verifications/submit", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            asset_type: currentCharacter.is_universe ? "universe" : "character",
            target_type: "public_asset",
            title: currentCharacter.display_name || currentCharacter.name,
            description: currentCharacter.short_description || "",
            original_id: savedId,
            public_character_id: pubChar?.id || null,
            metadata: {
              name: currentCharacter.name,
              display_name: currentCharacter.display_name,
              short_description: currentCharacter.short_description,
              appearance: currentCharacter.appearance,
              personality: currentCharacter.personality,
              backstory: currentCharacter.backstory,
              hidden_description: currentCharacter.hidden_description,
              image_path: currentCharacter.image_path,
              is_universe: currentCharacter.is_universe || false,
            },
          }),
        });
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: submitForReverification
          ? t(
              "verification.requestSubmitted",
              undefined,
              "Saved and submitted for verification!",
            )
          : t(
              "characters.characterSaved",
              undefined,
              "Character saved successfully",
            ),
      });

      setIsEditing(false);
      setCurrentCharacter({});
      fetchCharacters();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("characters").delete().eq("id", id);
      if (error) throw error;

      toast({
        title: t("common.success", undefined, "Success"),
        description: t(
          "characters.characterDeleted",
          undefined,
          "Character deleted successfully",
        ),
      });
      fetchCharacters();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleUnpublishChar = async (char: Character) => {
    if (!session?.access_token) return;
    const pubChar = publicCharsMap[char.id] || publicCharsMap[char.name];
    if (!pubChar) return;

    try {
      const res = await fetch("/api/assets/unpublish", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "character", id: pubChar.id }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to unpublish character");
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: t(
          "publicAssets.unpublishSuccess",
          undefined,
          "Asset unpublished successfully.",
        ),
      });
      fetchCharacters();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleSubmitVerification = async (
    char: Character,
    targetType: "public_asset" | "public_usage",
  ) => {
    if (!session?.access_token) return;

    if (char.name === "[Encrypted]") {
      toast({
        title: t("common.error", undefined, "Error"),
        description: t(
          "publicAssets.unauthorizedEncrypted",
          undefined,
          "Cannot upload an encrypted character. Please unlock first.",
        ),
        variant: "destructive",
      });
      return;
    }

    setSubmittingVerifId(char.id);
    try {
      const pubChar = publicCharsMap[char.id];
      const res = await fetch("/api/assets/verifications/submit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset_type: char.is_universe ? "universe" : "character",
          target_type: targetType,
          title: char.display_name || char.name,
          description: char.short_description || "",
          original_id: char.id,
          public_character_id: pubChar?.id || null,
          metadata: {
            name: char.name,
            display_name: char.display_name,
            short_description: char.short_description,
            appearance: char.appearance,
            personality: char.personality,
            backstory: char.backstory,
            hidden_description: char.hidden_description,
            image_path: char.image_path,
            image_url: char.image_url,
            is_universe: Boolean(char.is_universe),
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit verification request");
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: t(
          "verification.requestSubmitted",
          undefined,
          "Verification request submitted successfully!",
        ),
      });
      fetchCharacters();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmittingVerifId(null);
    }
  };

  const handleDeleteVerification = async (verifId: string) => {
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
    setDeletingVerifId(verifId);
    try {
      if (!session?.access_token) return;
      const res = await fetch(`/api/assets/verifications/${verifId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete verification request");
      }

      toast({
        title: t("common.success", undefined, "Success"),
        description: t(
          "verification.submissionDeleted",
          undefined,
          "Verification request deleted successfully",
        ),
      });
      fetchCharacters();
    } catch (err: any) {
      toast({
        title: t("common.error", undefined, "Error"),
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setDeletingVerifId(null);
    }
  };

  const handleStorageSelect = async (file: any) => {
    if (!file?.name || file.name.includes("..")) {
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
    setCurrentCharacter((prev) => ({
      ...prev,
      image_path: file.name,
    }));
    const { data } = await storage
      .from("Storage")
      .createSignedUrl(file.name, 3600);
    if (data?.signedUrl) {
      setCurrentCharacter((prev) => ({
        ...prev,
        image_url: data.signedUrl,
      }));
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="sr-only">
              {t("titles.characters", undefined, "Characters")}
            </h1>
            <div className="flex gap-4 items-center">
              <button
                type="button"
                onClick={() => setActiveTab("characters")}
                className={`text-3xl font-bold tracking-tight transition-colors ${activeTab === "characters" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                {t("characters.charactersTab", undefined, "My Characters")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("universes")}
                className={`text-3xl font-bold tracking-tight transition-colors ${activeTab === "universes" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                {t("characters.universesTab", undefined, "My Universes")}
              </button>
            </div>
            <p className="text-slate-400 mt-1"></p>
          </div>
          <Dialog
            open={isEditing}
            onOpenChange={(open) => {
              setIsEditing(open);
              if (!open) setCurrentCharacter({});
            }}
          >
            <DialogTrigger asChild>
              <Button
                className="bg-cyan-600 hover:bg-cyan-700"
                onClick={() =>
                  setCurrentCharacter({
                    is_universe: activeTab === "universes",
                  })
                }
              >
                <Plus className="w-4 h-4 mr-2" />
                {activeTab === "characters"
                  ? t("characters.createCharacter", undefined, "New Character")
                  : t("characters.createUniverse", undefined, "New Universe")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
              <DialogHeader>
                <DialogTitle>
                  {currentCharacter.id
                    ? `Edit ${currentCharacter.is_universe ? "Universe" : "Character"}`
                    : `Create ${activeTab === "characters" ? "Character" : "Universe"}`}
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  {currentCharacter.is_universe || activeTab === "universes"
                    ? "Tell us a bit about your new universe and its lore."
                    : "Tell us a bit about your character and what makes them unique."}
                </DialogDescription>
              </DialogHeader>

              {/* Versioning Notice if Character is Public */}
              {currentCharacter.id && publicCharsMap[currentCharacter.id] && (
                <div className="p-3 bg-cyan-950/40 border border-cyan-800/60 rounded-lg text-xs text-cyan-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
                  <span>
                    {t(
                      "verification.versionNotice",
                      undefined,
                      "Editing this asset locally does not affect the published version. To update the public asset, submit a new update verification request.",
                    )}
                  </span>
                </div>
              )}

              <div className="space-y-4 py-4">
                <div className="flex gap-4">
                  <div className="w-24 h-24 bg-slate-800 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group border border-slate-700">
                    {currentCharacter.image_url ? (
                      <img
                        src={currentCharacter.image_url}
                        alt="Character"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    )}
                    <StorageFileSelector
                      onSelect={handleStorageSelect}
                      allowedTypes={["image"]}
                      trigger={
                        <button
                          type="button"
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          aria-label="Select character image"
                        />
                      }
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label htmlFor="char-name" className="text-sm font-medium">
                      {t("characters.name", undefined, "Name")}
                    </label>
                    <Input
                      id="char-name"
                      value={currentCharacter.name || ""}
                      onChange={(e) =>
                        setCurrentCharacter((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder={
                        currentCharacter.is_universe
                          ? "Universe name"
                          : "Character name"
                      }
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                </div>

                {!currentCharacter.is_universe ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label
                          htmlFor="char-short-desc"
                          className="text-sm font-medium"
                        >
                          {t(
                            "characters.shortDescription",
                            undefined,
                            "Short Description",
                          )}
                        </label>
                        <Input
                          id="char-short-desc"
                          value={currentCharacter.short_description || ""}
                          onChange={(e) =>
                            setCurrentCharacter((prev) => ({
                              ...prev,
                              short_description: e.target.value,
                            }))
                          }
                          placeholder="A one-line hook"
                          className="bg-slate-800 border-slate-700"
                        />
                      </div>
                      <div className="space-y-2 text-cyan-400">
                        <label
                          htmlFor="char-display-name"
                          className="text-sm font-medium"
                        >
                          {t(
                            "characters.displayName",
                            undefined,
                            "Display Name",
                          )}
                        </label>
                        <Input
                          id="char-display-name"
                          value={currentCharacter.display_name || ""}
                          onChange={(e) =>
                            setCurrentCharacter((prev) => ({
                              ...prev,
                              display_name: e.target.value,
                            }))
                          }
                          placeholder="For organizing characters..."
                          className="bg-slate-800 border-cyan-900"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="char-appearance"
                        className="text-sm font-medium"
                      >
                        {t("characters.appearance", undefined, "Appearance")}
                      </label>
                      <Textarea
                        id="char-appearance"
                        value={currentCharacter.appearance || ""}
                        onChange={(e) =>
                          setCurrentCharacter((prev) => ({
                            ...prev,
                            appearance: e.target.value,
                          }))
                        }
                        placeholder="What do they look like?"
                        className="bg-slate-800 border-slate-700 h-20"
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="char-personality"
                        className="text-sm font-medium"
                      >
                        {t("characters.personality", undefined, "Personality")}
                      </label>
                      <Textarea
                        id="char-personality"
                        value={currentCharacter.personality || ""}
                        onChange={(e) =>
                          setCurrentCharacter((prev) => ({
                            ...prev,
                            personality: e.target.value,
                          }))
                        }
                        placeholder="How do they act?"
                        className="bg-slate-800 border-slate-700 h-20"
                      />
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="char-backstory"
                        className="text-sm font-medium"
                      >
                        {t("characters.backstory", undefined, "Backstory")}
                      </label>
                      <Textarea
                        id="char-backstory"
                        value={currentCharacter.backstory || ""}
                        onChange={(e) =>
                          setCurrentCharacter((prev) => ({
                            ...prev,
                            backstory: e.target.value,
                          }))
                        }
                        placeholder="Their history and origins..."
                        className="bg-slate-800 border-slate-700 h-32"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2 text-cyan-400">
                      <label
                        htmlFor="char-display-name"
                        className="text-sm font-medium"
                      >
                        {t("characters.displayName", undefined, "Display Name")}
                      </label>
                      <Input
                        id="char-display-name"
                        value={currentCharacter.display_name || ""}
                        onChange={(e) =>
                          setCurrentCharacter((prev) => ({
                            ...prev,
                            display_name: e.target.value,
                          }))
                        }
                        placeholder="For organizing universes..."
                        className="bg-slate-800 border-cyan-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="char-short-desc"
                        className="text-sm font-medium"
                      >
                        Description
                      </label>
                      <Textarea
                        id="char-short-desc"
                        value={currentCharacter.short_description || ""}
                        onChange={(e) =>
                          setCurrentCharacter((prev) => ({
                            ...prev,
                            short_description: e.target.value,
                          }))
                        }
                        placeholder="Describe your universe..."
                        className="bg-slate-800 border-slate-700 h-32"
                      />
                    </div>
                  </>
                )}

                <div className="space-y-2 text-cyan-400">
                  <label
                    htmlFor="char-hidden-desc"
                    className="text-sm font-medium"
                  >
                    {t(
                      "characters.hiddenDescription",
                      undefined,
                      "Private Notes",
                    )}
                  </label>
                  <Textarea
                    id="char-hidden-desc"
                    value={currentCharacter.hidden_description || ""}
                    onChange={(e) =>
                      setCurrentCharacter((prev) => ({
                        ...prev,
                        hidden_description: e.target.value,
                      }))
                    }
                    placeholder="Write notes for yourself here..."
                    className="bg-slate-800 border-cyan-900 h-32"
                  />
                </div>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  {t("common.cancel", undefined, "Cancel")}
                </Button>

                {currentCharacter.id && publicCharsMap[currentCharacter.id] && (
                  <Button
                    onClick={() => handleSave(true)}
                    className="bg-cyan-700 hover:bg-cyan-800 text-white"
                  >
                    <Send className="w-4 h-4 mr-1.5" />
                    {t(
                      "verification.updatePublicVersion",
                      undefined,
                      "Update & Re-verify",
                    )}
                  </Button>
                )}

                <Button
                  onClick={() => handleSave(false)}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  {t("common.save", undefined, "Save")}{" "}
                  {currentCharacter.is_universe ? "Universe" : "Character"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {encryptionLocked ? (
          <EncryptionRequiredPrompt
            category="characters"
            returnTo="/characters"
            onUnlocked={handleUnlocked}
            categoryLabel={
              activeTab === "characters"
                ? t("characters.charactersTab", undefined, "My Characters")
                : t("characters.universesTab", undefined, "My Universes")
            }
          />
        ) : loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters
              .filter((c) =>
                activeTab === "characters" ? !c.is_universe : c.is_universe,
              )
              .map((char) => {
                const pubChar =
                  publicCharsMap[char.id] || publicCharsMap[char.name];
                const charVerifs =
                  verificationsMap[char.id] ||
                  verificationsMap[char.name] ||
                  [];
                const pendingVerif = charVerifs.find(
                  (v) => v.status === "pending",
                );
                const rejectedVerif = charVerifs.find(
                  (v) => v.status === "rejected",
                );
                const usageApproved =
                  char.is_verified_public ||
                  charVerifs.some(
                    (v) =>
                      v.target_type === "public_usage" &&
                      v.status === "approved",
                  );

                return (
                  <Card
                    key={char.id}
                    className="bg-slate-900/50 border-slate-800 overflow-hidden hover:border-cyan-500/50 transition-colors group flex flex-col justify-between"
                  >
                    <div>
                      <div className="aspect-square bg-slate-800 relative overflow-hidden">
                        {char.image_url ? (
                          <img
                            src={char.image_url}
                            alt={char.name}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-700">
                            {char.is_universe ? (
                              <Globe className="w-16 h-16" />
                            ) : (
                              <User className="w-16 h-16" />
                            )}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />

                        {/* Badges */}
                        <div className="absolute top-3 left-3 flex flex-col gap-1 items-start">
                          {pubChar && (
                            <Badge className="bg-emerald-500/80 text-white text-[10px] backdrop-blur-sm">
                              <Globe className="w-3 h-3 mr-1" />
                              {t(
                                "verification.publicBadge",
                                undefined,
                                "Public Asset",
                              )}
                            </Badge>
                          )}
                          {usageApproved && !pubChar && (
                            <Badge className="bg-cyan-500/90 text-white text-[10px] backdrop-blur-sm border border-cyan-400/40">
                              <ShieldCheck className="w-3 h-3 mr-1" />
                              {t(
                                "characters.verifiedBadge",
                                undefined,
                                "Verified",
                              )}
                            </Badge>
                          )}
                          {pendingVerif && (
                            <Badge className="bg-amber-500/80 text-white text-[10px] backdrop-blur-sm">
                              <Clock className="w-3 h-3 mr-1" />
                              {t(
                                "verification.pendingReviewBadge",
                                undefined,
                                "Pending Review",
                              )}
                            </Badge>
                          )}
                          {rejectedVerif && (
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedDenialReason(
                                  rejectedVerif.rejection_reason ||
                                    "No reason provided.",
                                )
                              }
                              className="text-left"
                            >
                              <Badge className="bg-rose-500/80 hover:bg-rose-600 text-white text-[10px] backdrop-blur-sm cursor-pointer">
                                <XCircle className="w-3 h-3 mr-1" />
                                {t(
                                  "verification.rejectedBadge",
                                  undefined,
                                  "Verification Denied",
                                )}
                              </Badge>
                            </button>
                          )}
                        </div>

                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="text-xl font-bold text-white truncate">
                            {char.display_name || char.name}
                          </h3>
                          <p className="text-sm text-slate-300 truncate">
                            {char.short_description || "No description"}
                          </p>
                        </div>
                      </div>

                      <CardContent className="p-4 space-y-3">
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                            onClick={() => {
                              setCurrentCharacter(char);
                              setIsEditing(true);
                            }}
                          >
                            <Edit2 className="w-4 h-4 mr-2" />
                            {t("common.edit", undefined, "Edit")}
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => handleDelete(char.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>

                        {/* Verification / Unpublish Actions */}
                        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                          {pubChar ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-xs border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-rose-400"
                                >
                                  <Lock className="w-3 h-3 mr-1" />
                                  {t(
                                    "publicAssets.makePrivate",
                                    undefined,
                                    "Make Private / Unpublish",
                                  )}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-slate-900 border-slate-800 text-white">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    {t(
                                      "publicAssets.makePrivate",
                                      undefined,
                                      "Unpublish Asset?",
                                    )}
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-slate-400">
                                    {t(
                                      "publicAssets.makePrivateConfirm",
                                      undefined,
                                      "Are you sure you want to unpublish this asset? It will be removed from the public hub and reverted to private.",
                                    )}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="bg-slate-800 text-white border-slate-700">
                                    {t("common.cancel", undefined, "Cancel")}
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleUnpublishChar(char)}
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
                                disabled={submittingVerifId === char.id}
                                onClick={() =>
                                  handleSubmitVerification(char, "public_asset")
                                }
                                className="flex-1 text-[11px] h-7 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                              >
                                {submittingVerifId === char.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                ) : (
                                  <Globe className="w-3 h-3 mr-1 text-cyan-400" />
                                )}
                                {t(
                                  "verification.publishToPublicAssets",
                                  undefined,
                                  "Publish",
                                )}
                              </Button>

                              {!usageApproved && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={submittingVerifId === char.id}
                                  onClick={() =>
                                    handleSubmitVerification(
                                      char,
                                      "public_usage",
                                    )
                                  }
                                  className="flex-1 text-[11px] h-7 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                                >
                                  {submittingVerifId === char.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                  ) : (
                                    <ShieldCheck className="w-3 h-3 mr-1 text-emerald-400" />
                                  )}
                                  {t(
                                    "characters.verifyForMultiplayer",
                                    undefined,
                                    "Verify",
                                  )}
                                </Button>
                              )}

                              {charVerifs[0] && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={
                                    deletingVerifId === charVerifs[0].id
                                  }
                                  onClick={() =>
                                    handleDeleteVerification(charVerifs[0].id)
                                  }
                                  className="text-[11px] h-7 px-2 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-slate-800"
                                  title={t(
                                    "verification.deleteTooltip",
                                    undefined,
                                    "Delete verification",
                                  )}
                                >
                                  {deletingVerifId === charVerifs[0].id ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
                                  ) : (
                                    <Trash2 className="w-3 h-3" />
                                  )}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                );
              })}
            {characters.filter((c) =>
              activeTab === "characters" ? !c.is_universe : c.is_universe,
            ).length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-500">
                  {activeTab === "characters"
                    ? t(
                        "characters.noCharacters",
                        undefined,
                        'No characters here yet! Click "New Character" to get started and add some to your collection.',
                      )
                    : t(
                        "characters.noUniverses",
                        undefined,
                        'No universes here yet! Click "New Universe" to start building your own world.',
                      )}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

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
              {t(
                "verification.rejectionReasonDialogTitle",
                undefined,
                "Verification Denial Reason",
              )}
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
