import { useState, useEffect, useMemo } from "react";
import Layout from "@/components/Layout";
import {
  User,
  Users,
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
  Sparkles,
} from "lucide-react";
import { AiGenerateDialog } from "@/components/characters/AiGenerateDialog";
import type { GeneratedEntityResult } from "@/services/entityGenerator";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { db, supabase } from "@/lib/db";
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
  type CharacterStats,
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
  is_race?: boolean;
  race_id?: string | null;
  universe_id?: string | null;
  is_verified_public?: boolean;
  stats_enabled?: boolean;
  stats?: CharacterStats | null;
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
      "Create, customize, and share AI characters, races, and interactive universes.",
    ),
  });
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeTab, setActiveTab] = useState<
    "characters" | "universes" | "races"
  >("characters");

  const regularCharacters = useMemo(
    () => characters.filter((c) => !c.is_universe && !c.is_race),
    [characters],
  );
  const universes = useMemo(
    () => characters.filter((c) => c.is_universe),
    [characters],
  );
  const races = useMemo(
    () => characters.filter((c) => c.is_race),
    [characters],
  );
  const racesMap = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);
  const universesMap = useMemo(
    () => new Map(universes.map((u) => [u.id, u])),
    [universes],
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

  // Publish Dialog State
  const [publishModalChar, setPublishModalChar] = useState<Character | null>(
    null,
  );
  const [publishModalAnonymous, setPublishModalAnonymous] = useState(false);

  // AI Generation Modal State
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiInitialType, setAiInitialType] = useState<
    "character" | "universe" | "race"
  >("character");
  const [aiInitialUniverse, setAiInitialUniverse] = useState<Character | null>(
    null,
  );
  const [aiInitialRace, setAiInitialRace] = useState<Character | null>(null);

  const handleOpenAiGenerate = (
    type?: "character" | "universe" | "race",
    univ?: Character | null,
    race?: Character | null,
  ) => {
    setAiInitialType(
      type ||
        (activeTab === "races"
          ? "race"
          : activeTab === "universes"
            ? "universe"
            : "character"),
    );
    setAiInitialUniverse(univ || null);
    setAiInitialRace(race || null);
    setAiDialogOpen(true);
  };

  const handleApplyAiGenerated = (entity: GeneratedEntityResult) => {
    setCurrentCharacter((prev) => ({
      ...prev,
      name: entity.name,
      display_name: entity.display_name,
      short_description: entity.short_description,
      appearance: entity.appearance,
      personality: entity.personality,
      backstory: entity.backstory,
      hidden_description: entity.hidden_description,
      is_universe: entity.is_universe,
      is_race: entity.is_race,
      universe_id: entity.universe_id,
      race_id: entity.race_id,
      stats_enabled: entity.stats_enabled,
      stats: entity.stats,
    }));
    setActiveTab(
      entity.is_race
        ? "races"
        : entity.is_universe
          ? "universes"
          : "characters",
    );
    setIsEditing(true);
  };

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
          .in("asset_type", ["character", "universe", "race"])
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
        is_race: currentCharacter.is_race || false,
        race_id: currentCharacter.race_id || null,
        universe_id: currentCharacter.universe_id || null,
        stats_enabled: currentCharacter.stats_enabled || false,
        stats: currentCharacter.stats || null,
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
              asset_type: currentCharacter.is_race
                ? "race"
                : currentCharacter.is_universe
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
            asset_type: currentCharacter.is_race
              ? "race"
              : currentCharacter.is_universe
                ? "universe"
                : "character",
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
              is_race: currentCharacter.is_race || false,
              race_id: currentCharacter.race_id || null,
              universe_id: currentCharacter.universe_id || null,
              stats_enabled: currentCharacter.stats_enabled || false,
              stats: currentCharacter.stats || null,
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
    isAnonymous = false,
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
          asset_type: char.is_race
            ? "race"
            : char.is_universe
              ? "universe"
              : "character",
          target_type: targetType,
          title: char.display_name || char.name,
          description: char.short_description || "",
          original_id: char.id,
          public_character_id: pubChar?.id || null,
          is_anonymous: targetType === "public_asset" ? isAnonymous : false,
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
            is_race: Boolean(char.is_race),
            race_id: char.race_id || null,
            universe_id: char.universe_id || null,
            stats_enabled: Boolean(char.stats_enabled),
            stats: char.stats || null,
            is_anonymous: targetType === "public_asset" ? isAnonymous : false,
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
                onClick={() => setActiveTab("races")}
                className={`text-3xl font-bold tracking-tight transition-colors ${activeTab === "races" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                {t("characters.racesTab", undefined, "My Races")}
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
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() =>
                handleOpenAiGenerate(
                  activeTab === "races"
                    ? "race"
                    : activeTab === "universes"
                      ? "universe"
                      : "character",
                )
              }
              className="border-cyan-800/80 bg-cyan-950/30 text-cyan-300 hover:bg-cyan-900/50 hover:text-cyan-200"
            >
              <Sparkles className="w-4 h-4 mr-2 text-cyan-400" />
              {t("characters.aiGenerate.button", undefined, "AI Generate")}
            </Button>
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
                      is_race: activeTab === "races",
                    })
                  }
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {activeTab === "characters"
                    ? t(
                        "characters.createCharacter",
                        undefined,
                        "New Character",
                      )
                    : activeTab === "races"
                      ? t("characters.createRace", undefined, "New Race")
                      : t(
                          "characters.createUniverse",
                          undefined,
                          "New Universe",
                        )}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
                <DialogHeader>
                  <div className="flex items-center justify-between pr-6">
                    <DialogTitle>
                      {currentCharacter.id
                        ? `Edit ${currentCharacter.is_race ? "Race" : currentCharacter.is_universe ? "Universe" : "Character"}`
                        : `Create ${activeTab === "races" ? "Race" : activeTab === "universes" ? "Universe" : "Character"}`}
                    </DialogTitle>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleOpenAiGenerate(
                          currentCharacter.is_race || activeTab === "races"
                            ? "race"
                            : currentCharacter.is_universe ||
                                activeTab === "universes"
                              ? "universe"
                              : "character",
                          null,
                          null,
                        )
                      }
                      className="border-cyan-800/80 bg-cyan-950/20 text-cyan-300 hover:bg-cyan-950/60 flex items-center gap-1.5 text-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                      {t(
                        "characters.aiGenerate.button",
                        undefined,
                        "AI Generate",
                      )}
                    </Button>
                  </div>
                  <DialogDescription className="text-slate-400">
                    {currentCharacter.is_race || activeTab === "races"
                      ? t(
                          "characters.raceDescriptionSub",
                          undefined,
                          "Define a unique species or race, including biological traits, culture, and origins.",
                        )
                      : currentCharacter.is_universe ||
                          activeTab === "universes"
                        ? t(
                            "characters.universeDescriptionSub",
                            undefined,
                            "Tell us a bit about your new universe and its lore.",
                          )
                        : t(
                            "characters.characterDescriptionSub",
                            undefined,
                            "Tell us a bit about your character and what makes them unique.",
                          )}
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
                      <label
                        htmlFor="char-name"
                        className="text-sm font-medium"
                      >
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
                          currentCharacter.is_race
                            ? "Race/Species name (e.g. High Elf, Android)"
                            : currentCharacter.is_universe
                              ? "Universe name"
                              : "Character name"
                        }
                        className="bg-slate-800 border-slate-700"
                      />
                    </div>
                  </div>

                  {currentCharacter.is_race ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label
                            htmlFor="race-short-desc"
                            className="text-sm font-medium"
                          >
                            {t(
                              "characters.shortDescription",
                              undefined,
                              "Lore & Overview",
                            )}
                          </label>
                          <Input
                            id="race-short-desc"
                            value={currentCharacter.short_description || ""}
                            onChange={(e) =>
                              setCurrentCharacter((prev) => ({
                                ...prev,
                                short_description: e.target.value,
                              }))
                            }
                            placeholder="Overview of this race / species..."
                            className="bg-slate-800 border-slate-700"
                          />
                        </div>
                        <div className="space-y-2 text-cyan-400">
                          <label
                            htmlFor="race-display-name"
                            className="text-sm font-medium"
                          >
                            {t(
                              "characters.displayName",
                              undefined,
                              "Classification / Moniker",
                            )}
                          </label>
                          <Input
                            id="race-display-name"
                            value={currentCharacter.display_name || ""}
                            onChange={(e) =>
                              setCurrentCharacter((prev) => ({
                                ...prev,
                                display_name: e.target.value,
                              }))
                            }
                            placeholder="e.g. Sub-species, Highborne..."
                            className="bg-slate-800 border-cyan-900"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="race-universe-select"
                          className="text-sm font-medium"
                        >
                          {t(
                            "characters.targetUniverse",
                            undefined,
                            "Universe (Optional)",
                          )}
                        </label>
                        <select
                          id="race-universe-select"
                          value={currentCharacter.universe_id || ""}
                          onChange={(e) =>
                            setCurrentCharacter((prev) => ({
                              ...prev,
                              universe_id: e.target.value || null,
                            }))
                          }
                          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          <option value="">
                            {t(
                              "characters.noUniverse",
                              undefined,
                              "None / Standalone",
                            )}
                          </option>
                          {universes.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.display_name || u.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="race-appearance"
                          className="text-sm font-medium"
                        >
                          {t(
                            "characters.racePhysiology",
                            undefined,
                            "Physical Traits & Physiology",
                          )}
                        </label>
                        <Textarea
                          id="race-appearance"
                          value={currentCharacter.appearance || ""}
                          onChange={(e) =>
                            setCurrentCharacter((prev) => ({
                              ...prev,
                              appearance: e.target.value,
                            }))
                          }
                          placeholder="Anatomy, size, distinct visual traits, lifespan..."
                          className="bg-slate-800 border-slate-700 h-20"
                        />
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="race-personality"
                          className="text-sm font-medium"
                        >
                          {t(
                            "characters.raceCulture",
                            undefined,
                            "Cultural Traits & Behaviors",
                          )}
                        </label>
                        <Textarea
                          id="race-personality"
                          value={currentCharacter.personality || ""}
                          onChange={(e) =>
                            setCurrentCharacter((prev) => ({
                              ...prev,
                              personality: e.target.value,
                            }))
                          }
                          placeholder="Social norms, values, traditions, and tendencies..."
                          className="bg-slate-800 border-slate-700 h-20"
                        />
                      </div>

                      <div className="space-y-2">
                        <label
                          htmlFor="race-backstory"
                          className="text-sm font-medium"
                        >
                          {t(
                            "characters.raceHistory",
                            undefined,
                            "Origins & History",
                          )}
                        </label>
                        <Textarea
                          id="race-backstory"
                          value={currentCharacter.backstory || ""}
                          onChange={(e) =>
                            setCurrentCharacter((prev) => ({
                              ...prev,
                              backstory: e.target.value,
                            }))
                          }
                          placeholder="Origins, evolutionary or mythological history..."
                          className="bg-slate-800 border-slate-700 h-28"
                        />
                      </div>
                    </>
                  ) : !currentCharacter.is_universe ? (
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

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label
                            htmlFor="char-race-select"
                            className="text-sm font-medium"
                          >
                            {t("characters.race", undefined, "Race / Species")}
                          </label>
                          <select
                            id="char-race-select"
                            value={currentCharacter.race_id || ""}
                            onChange={(e) =>
                              setCurrentCharacter((prev) => ({
                                ...prev,
                                race_id: e.target.value || null,
                              }))
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          >
                            <option value="">
                              {t(
                                "characters.noRace",
                                undefined,
                                "None / Standalone",
                              )}
                            </option>
                            {races.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.display_name || r.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label
                            htmlFor="char-univ-select"
                            className="text-sm font-medium"
                          >
                            {t("characters.universe", undefined, "Universe")}
                          </label>
                          <select
                            id="char-univ-select"
                            value={currentCharacter.universe_id || ""}
                            onChange={(e) =>
                              setCurrentCharacter((prev) => ({
                                ...prev,
                                universe_id: e.target.value || null,
                              }))
                            }
                            className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          >
                            <option value="">
                              {t(
                                "characters.noUniverse",
                                undefined,
                                "None / Standalone",
                              )}
                            </option>
                            {universes.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.display_name || u.name}
                              </option>
                            ))}
                          </select>
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
                          {t(
                            "characters.personality",
                            undefined,
                            "Personality",
                          )}
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

                      {/* Character Stats Block */}
                      <div className="p-4 bg-slate-950/60 rounded-lg border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <label
                              htmlFor="char-stats-toggle"
                              className="text-sm font-medium text-slate-200 cursor-pointer select-none"
                            >
                              {t(
                                "characters.statsTitle",
                                undefined,
                                "Character Stats / Attributes",
                              )}
                            </label>
                            <p className="text-xs text-slate-400">
                              {t(
                                "characters.statsHelp",
                                undefined,
                                "Optional attributes ranging from -100 to 100. Blank stats are omitted from prompts.",
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id="char-stats-toggle"
                              data-testid="char-stats-toggle"
                              checked={Boolean(currentCharacter.stats_enabled)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setCurrentCharacter((prev) => ({
                                  ...prev,
                                  stats_enabled: checked,
                                  stats: checked ? prev.stats || {} : prev.stats,
                                }));
                              }}
                              className="rounded bg-slate-900 border-slate-700 text-cyan-600 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                            />
                            <label
                              htmlFor="char-stats-toggle"
                              className="text-xs text-slate-300 cursor-pointer select-none"
                            >
                              {t(
                                "characters.enableStats",
                                undefined,
                                "Enable Stats",
                              )}
                            </label>
                          </div>
                        </div>

                        {currentCharacter.stats_enabled && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
                            {[
                              {
                                key: "str",
                                label: t(
                                  "characters.statStr",
                                  undefined,
                                  "Strength (STR)",
                                ),
                              },
                              {
                                key: "dex",
                                label: t(
                                  "characters.statDex",
                                  undefined,
                                  "Dexterity (DEX)",
                                ),
                              },
                              {
                                key: "con",
                                label: t(
                                  "characters.statCon",
                                  undefined,
                                  "Constitution (CON)",
                                ),
                              },
                              {
                                key: "int",
                                label: t(
                                  "characters.statInt",
                                  undefined,
                                  "Intelligence (INT)",
                                ),
                              },
                              {
                                key: "wis",
                                label: t(
                                  "characters.statWis",
                                  undefined,
                                  "Wisdom (WIS)",
                                ),
                              },
                              {
                                key: "cha",
                                label: t(
                                  "characters.statCha",
                                  undefined,
                                  "Charisma (CHA)",
                                ),
                              },
                            ].map(({ key, label }) => {
                              const currentVal =
                                (currentCharacter.stats as any)?.[key];
                              return (
                                <div key={key} className="space-y-1">
                                  <label
                                    htmlFor={`char-stat-${key}`}
                                    className="text-xs text-slate-300 font-medium"
                                  >
                                    {label}
                                  </label>
                                  <Input
                                    id={`char-stat-${key}`}
                                    data-testid={`char-stat-${key}`}
                                    type="number"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={
                                      currentVal !== undefined &&
                                      currentVal !== null
                                        ? currentVal
                                        : ""
                                    }
                                    placeholder="—"
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      let parsedVal: number | null = null;
                                      if (raw !== "") {
                                        const num = parseInt(raw, 10);
                                        if (!isNaN(num)) {
                                          parsedVal = Math.max(
                                            -100,
                                            Math.min(100, num),
                                          );
                                        }
                                      }
                                      setCurrentCharacter((prev) => ({
                                        ...prev,
                                        stats: {
                                          ...(prev.stats || {}),
                                          [key]: parsedVal,
                                        },
                                      }));
                                    }}
                                    className="bg-slate-800 border-slate-700 h-9 text-sm"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
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

                  {currentCharacter.id &&
                    publicCharsMap[currentCharacter.id] && (
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
                    {currentCharacter.is_race
                      ? "Race"
                      : currentCharacter.is_universe
                        ? "Universe"
                        : "Character"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {encryptionLocked ? (
          <EncryptionRequiredPrompt
            category="characters"
            returnTo="/characters"
            onUnlocked={handleUnlocked}
            categoryLabel={
              activeTab === "races"
                ? t("characters.racesTab", undefined, "My Races")
                : activeTab === "characters"
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
                activeTab === "characters"
                  ? !c.is_universe && !c.is_race
                  : activeTab === "universes"
                    ? c.is_universe
                    : c.is_race,
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

                const assignedRace = char.race_id && racesMap.get(char.race_id);
                const assignedUniverse =
                  char.universe_id && universesMap.get(char.universe_id);

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
                            {char.is_race ? (
                              <Users className="w-16 h-16" />
                            ) : char.is_universe ? (
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
                          {assignedRace && (
                            <Badge className="bg-purple-600/90 text-white text-[10px] backdrop-blur-sm border border-purple-400/30">
                              <Users className="w-3 h-3 mr-1" />
                              {assignedRace.display_name || assignedRace.name}
                            </Badge>
                          )}
                          {assignedUniverse && !char.is_universe && (
                            <Badge className="bg-indigo-600/90 text-white text-[10px] backdrop-blur-sm border border-indigo-400/30">
                              <Globe className="w-3 h-3 mr-1" />
                              {assignedUniverse.display_name ||
                                assignedUniverse.name}
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

                        {char.is_race && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs border-cyan-800/60 bg-cyan-950/20 text-cyan-300 hover:bg-cyan-950/60 hover:text-cyan-100 flex items-center justify-center gap-1.5"
                            onClick={() =>
                              handleOpenAiGenerate("character", null, char)
                            }
                          >
                            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                            {t(
                              "characters.aiGenerate.generateForRace",
                              undefined,
                              "Generate Character for this Race",
                            )}
                          </Button>
                        )}

                        {char.is_universe && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full text-xs border-cyan-800/60 bg-cyan-950/20 text-cyan-300 hover:bg-cyan-950/60 hover:text-cyan-100 flex items-center justify-center gap-1.5"
                            onClick={() =>
                              handleOpenAiGenerate("character", char, null)
                            }
                          >
                            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                            {t(
                              "characters.aiGenerate.generateForUniverse",
                              undefined,
                              "Generate Character in this Universe",
                            )}
                          </Button>
                        )}

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
                                onClick={() => {
                                  setPublishModalChar(char);
                                  setPublishModalAnonymous(false);
                                }}
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

      {/* Publish Dialog */}
      <Dialog
        open={Boolean(publishModalChar)}
        onOpenChange={(open) => {
          if (!open) {
            setPublishModalChar(null);
            setPublishModalAnonymous(false);
          }
        }}
      >
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>
              {t("publicAssets.publishAsset", undefined, "Publish Asset")}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t(
                "publicAssets.publishDesc",
                undefined,
                "Submit your character to be published on the Public Assets hub.",
              )}
            </DialogDescription>
          </DialogHeader>

          {publishModalChar && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700/50 flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                  {publishModalChar.image_url ? (
                    <img
                      src={publishModalChar.image_url}
                      alt={publishModalChar.name}
                      className="w-full h-full object-cover"
                    />
                  ) : publishModalChar.is_universe ? (
                    <Globe className="w-5 h-5 text-cyan-400" />
                  ) : publishModalChar.is_race ? (
                    <Users className="w-5 h-5 text-cyan-400" />
                  ) : (
                    <User className="w-5 h-5 text-cyan-400" />
                  )}
                </div>
                <div className="overflow-hidden">
                  <h4 className="font-semibold text-white truncate text-sm">
                    {publishModalChar.display_name || publishModalChar.name}
                  </h4>
                  <p className="text-xs text-slate-400 capitalize">
                    {publishModalChar.is_race
                      ? "Race"
                      : publishModalChar.is_universe
                        ? "Universe"
                        : "Character"}
                  </p>
                </div>
              </div>

              {/* Anonymous Publishing Checkbox */}
              <div className="flex items-start space-x-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <Checkbox
                  id="char-publish-anonymous"
                  checked={publishModalAnonymous}
                  onCheckedChange={(c) => setPublishModalAnonymous(Boolean(c))}
                  className="mt-0.5 border-slate-600 data-[state=checked]:bg-cyan-600 data-[state=checked]:border-cyan-600"
                />
                <div className="space-y-1 leading-none">
                  <label
                    htmlFor="char-publish-anonymous"
                    className="text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    {t(
                      "publicAssets.publishAnonymously",
                      undefined,
                      "Publish anonymously",
                    )}
                  </label>
                  <p className="text-xs text-slate-400">
                    {t(
                      "publicAssets.publishAnonymouslyDesc",
                      undefined,
                      "Hide your username on public listings. Administrators will still see your username during the review process.",
                    )}
                  </p>
                </div>
              </div>

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
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPublishModalChar(null);
                setPublishModalAnonymous(false);
              }}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {t("common.cancel", undefined, "Cancel")}
            </Button>
            <Button
              onClick={async () => {
                if (publishModalChar) {
                  const targetChar = publishModalChar;
                  const isAnon = publishModalAnonymous;
                  setPublishModalChar(null);
                  setPublishModalAnonymous(false);
                  await handleSubmitVerification(
                    targetChar,
                    "public_asset",
                    isAnon,
                  );
                }
              }}
              disabled={
                !publishModalChar || submittingVerifId === publishModalChar?.id
              }
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {submittingVerifId === publishModalChar?.id ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {t(
                "publicAssets.submitForVerification",
                undefined,
                "Submit for Review",
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Entity Generation Modal */}
      <AiGenerateDialog
        open={aiDialogOpen}
        onOpenChange={setAiDialogOpen}
        initialType={aiInitialType}
        initialUniverse={aiInitialUniverse}
        initialRace={aiInitialRace}
        universes={universes}
        races={races}
        onApply={handleApplyAiGenerated}
      />
    </Layout>
  );
}
