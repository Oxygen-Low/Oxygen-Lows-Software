import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import {
  Lock,
  Upload,
  Share2,
  Cpu,
  Key,
  Plus,
  Trash2,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Copy,
  RefreshCw,
  Maximize,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  encrypt,
  decrypt,
  generateMasterKey,
  saveMasterKey,
  getMasterKey,
  clearMasterKey,
} from "@/lib/crypto";
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

interface UserProfile {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  email: string | null;
  show_email: boolean;
}
interface ProfilePicture {
  id: string;
  user_id?: string;
  image_url: string;
  crop_data: Area;
}
interface Integration {
  provider: string;
  base_url?: string;
  has_key: boolean;
}
interface UserModel {
  provider: string;
  model_id: string;
}

const PROVIDERS = [
  { id: "openrouter", name: "OpenRouter" },
  { id: "openai", name: "ChatGPT/OpenAI" },
  { id: "google", name: "Gemini/Google" },
  { id: "grok", name: "Grok" },
  { id: "anthropic", name: "Claude/Anthropic" },
  { id: "horde", name: "AI Horde" },
  { id: "stablehorde", name: "Stable Horde" },
  { id: "custom", name: "Custom/OpenAI-Like", hasUrl: true },
];

export default function Account() {
  const { session } = useAuth();
  const { toast } = useToast();
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
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [userModels, setUserModels] = useState<UserModel[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [baseUrlInputs, setBaseUrlInputs] = useState<Record<string, string>>(
    {},
  );
  const [encryptionSettings, setEncryptionSettings] = useState<any>({});
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [isMigrating, setIsMigrating] = useState(false);
  const [newModelInput, setNewModelInput] = useState("");
  const [selectedProviderForModel, setSelectedProviderForModel] =
    useState("openrouter");

  const fetchAccountData = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data: pic } = await supabase
      .from("profile_pictures")
      .select("*")
      .eq("user_id", session.user.id)
      .single();
    if (pic) {
      const { data: signedData } = await supabase.storage
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
    }
    const { data: ints } = await supabase.rpc("get_my_integrations");
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("encryption_settings, custom_models")
      .eq("user_id", session.user.id)
      .single();
    if (ints) setIntegrations(ints);
    if (prefs) {
      setEncryptionSettings(prefs.encryption_settings || {});
      setUserModels(prefs.custom_models || []);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  const handleStorageSelect = async (file: any) => {
    if (file.name.includes("..")) {
      toast({
        title: "Error",
        description: "Invalid file name",
        variant: "destructive",
      });
      return;
    }
    setSelectedStoragePath(file.name);
    setFitImage(false);
    setZoom(1);
    const { data } = await supabase.storage
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
      const { data: signedData } = await supabase.storage
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
      toast({ title: "Success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
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
      toast({ title: "Success" });
    }
  };

  const handleSaveIntegration = async (provider: string) => {
    const key = apiKeyInputs[provider];
    const url = baseUrlInputs[provider];

    const isUrlClearing = baseUrlInputs[provider] === "";
    if (!key && !url && !isUrlClearing) return;

    if (!encryptionSettings.integrations) {
      toast({
        title: "Encryption Required",
        description:
          "You must enable 'Integrations' encryption in the Security tab before saving API keys.",
        variant: "destructive",
      });
      return;
    }

    const masterKey = getMasterKey();
    if (!masterKey) {
      toast({
        title: "Error",
        description:
          "Masterkey not found. Please enter it in the Security tab.",
        variant: "destructive",
      });
      return;
    }

    try {
      const finalKey = key ? await encrypt(key, masterKey) : null;
      const finalUrl = url
        ? await encrypt(url, masterKey)
        : isUrlClearing
          ? null
          : undefined;

      await supabase.rpc("upsert_user_integration", {
        p_provider: provider,
        p_api_key: finalKey,
        p_base_url: finalUrl,
      });

      setApiKeyInputs({ ...apiKeyInputs, [provider]: "" });
      setBaseUrlInputs({ ...baseUrlInputs, [provider]: "" });
      fetchAccountData();
      toast({ title: "Success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleSaveProfile = async () => {
    try {
      const { error } = await supabase.from("profiles").upsert({
        user_id: session?.user?.id,
        username: usernameInput,
        display_name: displayNameInput,
        bio: bioInput,
      });
      if (error) throw error;
      toast({ title: "Success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleToggleEncryption = async (target: string) => {
    const inputKey = masterKeyInput.trim();
    if (!inputKey) {
      toast({
        title: "Error",
        description: "Please enter your masterkey first.",
        variant: "destructive",
      });
      return;
    }

    if (encryptionSettings.validation_hash) {
      try {
        const decrypted = await decrypt(
          encryptionSettings.validation_hash,
          inputKey,
        );
        if (decrypted !== "valid") throw new Error("Invalid key");
      } catch (e) {
        toast({
          title: "Error",
          description: "Incorrect masterkey. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    const currentKey = getMasterKey();
    if (currentKey && currentKey !== inputKey) {
      toast({
        title: "Error",
        description:
          "Masterkey mismatch. If you want to change your key, you must first decrypt everything.",
        variant: "destructive",
      });
      return;
    }

    setIsMigrating(true);
    try {
      const isEnabling = !encryptionSettings[target];
      const key = inputKey;

      if (target === "characters") {
        const { data: chars } = await supabase
          .from("characters")
          .select("*")
          .eq("user_id", session?.user?.id);
        if (chars) {
          for (const char of chars) {
            if (isEnabling && !char.is_encrypted) {
              const encryptedChar = {
                name: await encrypt(char.name || "", key),
                short_description: char.short_description
                  ? await encrypt(char.short_description, key)
                  : null,
                display_name: char.display_name
                  ? await encrypt(char.display_name, key)
                  : null,
                appearance: char.appearance
                  ? await encrypt(char.appearance, key)
                  : null,
                personality: char.personality
                  ? await encrypt(char.personality, key)
                  : null,
                backstory: char.backstory
                  ? await encrypt(char.backstory, key)
                  : null,
                hidden_description: char.hidden_description
                  ? await encrypt(char.hidden_description, key)
                  : null,
                is_encrypted: true,
              };
              await supabase
                .from("characters")
                .update(encryptedChar)
                .eq("id", char.id);
            } else if (!isEnabling && char.is_encrypted) {
              const decryptedChar = {
                name: await decrypt(char.name, key),
                short_description: char.short_description
                  ? await decrypt(char.short_description, key)
                  : null,
                display_name: char.display_name
                  ? await decrypt(char.display_name, key)
                  : null,
                appearance: char.appearance
                  ? await decrypt(char.appearance, key)
                  : null,
                personality: char.personality
                  ? await decrypt(char.personality, key)
                  : null,
                backstory: char.backstory
                  ? await decrypt(char.backstory, key)
                  : null,
                hidden_description: char.hidden_description
                  ? await decrypt(char.hidden_description, key)
                  : null,
                is_encrypted: false,
              };
              await supabase
                .from("characters")
                .update(decryptedChar)
                .eq("id", char.id);
            }
          }
        }
      }

      if (target === "chats") {
        const { data: chats } = await supabase
          .from("chats")
          .select("*")
          .eq("user_id", session?.user?.id);
        if (chats) {
          for (const chat of chats) {
            if (isEnabling && !chat.is_encrypted) {
              const { data: msgs } = await supabase
                .from("chat_messages")
                .select("*")
                .eq("chat_id", chat.id);
              if (msgs) {
                for (const m of msgs) {
                  if (!m.is_encrypted) {
                    await supabase
                      .from("chat_messages")
                      .update({
                        content: await encrypt(m.content, key),
                        is_encrypted: true,
                      })
                      .eq("id", m.id);
                  }
                }
              }
              await supabase
                .from("chats")
                .update({
                  title: await encrypt(chat.title || "Untitled", key),
                  is_encrypted: true,
                })
                .eq("id", chat.id);
            } else if (!isEnabling && chat.is_encrypted) {
              const { data: msgs } = await supabase
                .from("chat_messages")
                .select("*")
                .eq("chat_id", chat.id);
              if (msgs) {
                for (const m of msgs) {
                  if (m.is_encrypted) {
                    await supabase
                      .from("chat_messages")
                      .update({
                        content: await decrypt(m.content, key),
                        is_encrypted: false,
                      })
                      .eq("id", m.id);
                  }
                }
              }
              await supabase
                .from("chats")
                .update({
                  title: await decrypt(chat.title, key),
                  is_encrypted: false,
                })
                .eq("id", chat.id);
            }
          }
        }
      }

      if (target === "integrations") {
        const { data: ints } = await supabase
          .from("user_integrations")
          .select("*")
          .eq("user_id", session?.user?.id);
        if (ints) {
          for (const int of ints) {
            if (isEnabling) {
              // Currently integrations are only saved if enabled.
              // This migration would normally handle converting existing ones.
            } else {
              if (int.api_key) {
                // If disabling, we should probably clear or decrypt them?
                // For security, if disabling encryption, we'll clear them.
                await supabase
                  .from("user_integrations")
                  .update({ api_key: null, base_url: null })
                  .eq("id", int.id);
              }
            }
          }
        }
      }

      const newSettings = { ...encryptionSettings, [target]: isEnabling };
      if (isEnabling && !newSettings.validation_hash) {
        newSettings.validation_hash = await encrypt("valid", key);
      }

      const allDisabled =
        !newSettings.characters &&
        !newSettings.chats &&
        !newSettings.integrations;
      if (allDisabled) {
        delete newSettings.validation_hash;
        clearMasterKey();
      } else {
        saveMasterKey(key);
      }

      await supabase.rpc("upsert_user_preferences", {
        p_user_id: session?.user?.id,
        p_encryption_settings: newSettings,
      });

      setEncryptionSettings(newSettings);
      fetchAccountData();
      toast({ title: "Success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleResetEncryption = async () => {
    if (
      !confirm(
        "WARNING: This will PERMANENTLY DELETE all your encrypted characters, chats, and integration keys. Continue?",
      )
    )
      return;
    try {
      setIsMigrating(true);
      await supabase.from("characters").delete().eq("is_encrypted", true);
      const { data: chats } = await supabase
        .from("chats")
        .select("id")
        .eq("is_encrypted", true);
      if (chats) {
        for (const c of chats) {
          await supabase.from("chat_messages").delete().eq("chat_id", c.id);
          await supabase.from("chats").delete().eq("id", c.id);
        }
      }
      await supabase
        .from("user_integrations")
        .update({ api_key: null, base_url: null })
        .eq("user_id", session?.user?.id);

      await supabase.rpc("upsert_user_preferences", {
        p_user_id: session?.user?.id,
        p_encryption_settings: {},
      });
      clearMasterKey();
      setEncryptionSettings({});
      setMasterKeyInput("");
      fetchAccountData();
      toast({ title: "Reset Complete" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleAddCustomModel = async () => {
    if (!newModelInput.trim()) return;
    try {
      const newModels = [
        ...userModels,
        { provider: selectedProviderForModel, model_id: newModelInput.trim() },
      ];
      await supabase.rpc("upsert_user_preferences", {
        p_user_id: session?.user?.id,
        p_custom_models: newModels,
      });
      setUserModels(newModels);
      setNewModelInput("");
      toast({ title: "Model Added" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRemoveCustomModel = async (model: UserModel) => {
    try {
      const newModels = userModels.filter(
        (m) => m.model_id !== model.model_id || m.provider !== model.provider,
      );
      await supabase.rpc("upsert_user_preferences", {
        p_user_id: session?.user?.id,
        p_custom_models: newModels,
      });
      setUserModels(newModels);
      toast({ title: "Model Removed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8 pb-20">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="relative group">
            <div className="w-40 h-40 rounded-full overflow-hidden border-4 border-slate-800 bg-slate-900 flex items-center justify-center">
              {profilePicture ? (
                <div
                  className="w-full h-full"
                  style={{
                    backgroundImage: `url(${profilePicture.image_url})`,
                    backgroundSize: `${100 / (profilePicture.crop_data.width / 100)}%`,
                    backgroundPosition: `${profilePicture.crop_data.x}% ${profilePicture.crop_data.y}%`,
                    backgroundRepeat: "no-repeat",
                  }}
                />
              ) : (
                <div className="text-slate-700">
                  <Upload className="w-12 h-12" />
                </div>
              )}
            </div>
            <StorageFileSelector
              onSelect={handleStorageSelect}
              trigger={
                <button
                  type="button"
                  aria-label="Upload profile picture"
                  title="Upload profile picture"
                  className="absolute bottom-1 right-1 p-2 bg-cyan-600 rounded-full text-white shadow-lg hover:bg-cyan-500 transition-colors"
                >
                  <Upload className="w-5 h-5" />
                </button>
              }
            />
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold text-white">
                {profile?.display_name || profile?.username || "Your Account"}
              </h1>
            </div>
          </div>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
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
                      Username
                    </Label>
                    <Input
                      id="username-input"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      placeholder="Username"
                      className="bg-slate-950"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label
                      htmlFor="display-name-input"
                      className="text-sm font-medium text-slate-300"
                    >
                      Display Name
                    </Label>
                    <Input
                      id="display-name-input"
                      value={displayNameInput}
                      onChange={(e) => setDisplayNameInput(e.target.value)}
                      placeholder="Display Name"
                      className="bg-slate-950"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="bio-input"
                    className="text-sm font-medium text-slate-300"
                  >
                    Bio
                  </Label>
                  <textarea
                    id="bio-input"
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                    placeholder="Bio"
                    className="w-full min-h-[100px] bg-slate-950 border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
                  />
                </div>
                <Button onClick={handleSaveProfile} className="bg-cyan-600">
                  Save Changes
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-lg">
                  Email Settings
                </CardTitle>
                <CardDescription>
                  Manage how your email is displayed to others
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-800">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Public Email
                    </p>
                    <p className="text-xs text-slate-500">
                      Show your email on your public profile
                    </p>
                  </div>
                  <Button
                    variant={profile?.show_email ? "secondary" : "outline"}
                    onClick={() => handleToggleEmail(!profile?.show_email)}
                    aria-pressed={!!profile?.show_email}
                  >
                    {profile?.show_email ? "Visible" : "Hidden"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {PROVIDERS.map((p) => {
                const integration = integrations.find(
                  (i) => i.provider === p.id,
                );
                return (
                  <Card key={p.id} className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        {p.name}
                        {integration?.has_key && (
                          <div className="px-2 py-0.5 rounded bg-green-500/10 text-green-500 text-[10px] uppercase font-bold">
                            Configured
                          </div>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {p.hasUrl && (
                        <div className="space-y-2">
                          <Label htmlFor={`base-url-${p.id}`} className="text-xs text-slate-500 uppercase">
                            Base URL
                          </Label>
                          <Input
                            id={`base-url-${p.id}`}
                            type="text"
                            placeholder="https://api.your-provider.com/v1"
                            value={baseUrlInputs[p.id] || ""}
                            onChange={(e) =>
                              setBaseUrlInputs({
                                ...baseUrlInputs,
                                [p.id]: e.target.value,
                              })
                            }
                            className="bg-slate-950"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor={`api-key-${p.id}`} className="text-xs text-slate-500 uppercase">
                          API Key
                        </Label>
                        <Input
                          id={`api-key-${p.id}`}
                          type="password"
                          placeholder="sk-..."
                          value={apiKeyInputs[p.id] || ""}
                          onChange={(e) =>
                            setApiKeyInputs({
                              ...apiKeyInputs,
                              [p.id]: e.target.value,
                            })
                          }
                          className="bg-slate-950"
                        />
                      </div>
                      <Button
                        onClick={() => handleSaveIntegration(p.id)}
                        className="w-full bg-cyan-600"
                        disabled={
                          !apiKeyInputs[p.id] &&
                          !baseUrlInputs[p.id] &&
                          baseUrlInputs[p.id] !== ""
                        }
                      >
                        Save Integration
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="security" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800 overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Lock className="w-32 h-32" />
              </div>
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-cyan-500" />
                  End-to-End Encryption
                </CardTitle>
                <CardDescription>
                  Protect your private data with a masterkey. This key never
                  leaves your browser.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-cyan-500/10 border border-cyan-500/20 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-cyan-400">
                    <ShieldCheck className="w-5 h-5" />
                    <span className="text-sm font-bold">
                      Secure Environment
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    If you lose your masterkey, your encrypted data will be lost
                    forever.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="masterkey-input" className="text-sm font-medium text-slate-300">
                      Enter Masterkey to Toggle
                    </Label>
                    <Input
                      id="masterkey-input"
                      type="password"
                      placeholder="Paste your masterkey here"
                      value={masterKeyInput}
                      onChange={(e) => setMasterKeyInput(e.target.value)}
                      className="bg-slate-950"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button
                      type="button"
                      variant={
                        encryptionSettings.characters ? "secondary" : "outline"
                      }
                      onClick={() => handleToggleEncryption("characters")}
                      disabled={isMigrating}
                      aria-pressed={!!encryptionSettings.characters}
                      className="h-16 justify-between px-6"
                    >
                      <div className="text-left">
                        <div className="font-semibold">Characters</div>
                        <div className="text-xs text-slate-500">
                          {encryptionSettings.characters
                            ? "Encrypted"
                            : "Unencrypted"}
                        </div>
                      </div>
                      {isMigrating ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : encryptionSettings.characters ? (
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-slate-600" />
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant={
                        encryptionSettings.chats ? "secondary" : "outline"
                      }
                      onClick={() => handleToggleEncryption("chats")}
                      disabled={isMigrating}
                      aria-pressed={!!encryptionSettings.chats}
                      className="h-16 justify-between px-6"
                    >
                      <div className="text-left">
                        <div className="font-semibold">Chatbot Chats</div>
                        <div className="text-xs text-slate-500">
                          {encryptionSettings.chats
                            ? "Encrypted"
                            : "Unencrypted"}
                        </div>
                      </div>
                      {isMigrating ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : encryptionSettings.chats ? (
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-slate-600" />
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant={
                        encryptionSettings.integrations
                          ? "secondary"
                          : "outline"
                      }
                      onClick={() => handleToggleEncryption("integrations")}
                      disabled={isMigrating}
                      aria-pressed={!!encryptionSettings.integrations}
                      className="h-16 justify-between px-6 sm:col-span-2"
                    >
                      <div className="text-left">
                        <div className="font-semibold">Integrations</div>
                        <div className="text-xs text-slate-500">
                          {encryptionSettings.integrations
                            ? "Encrypted"
                            : "Unencrypted"}
                        </div>
                      </div>
                      {isMigrating ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : encryptionSettings.integrations ? (
                        <ShieldCheck className="w-5 h-5 text-green-500" />
                      ) : (
                        <ShieldAlert className="w-5 h-5 text-slate-600" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleResetEncryption}
                    disabled={isMigrating}
                    className="w-full gap-2"
                  >
                    <ShieldOff className="w-4 h-4" /> Reset Encryption
                  </Button>
                  <p className="text-[10px] text-slate-500 mt-2 text-center">
                    This will delete all encrypted data and allow you to set a
                    new masterkey.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="models" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 space-y-6">
                <div className="flex gap-3">
                  <select
                    value={selectedProviderForModel}
                    onChange={(e) =>
                      setSelectedProviderForModel(e.target.value)
                    }
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    placeholder="Model ID"
                    value={newModelInput}
                    onChange={(e) => setNewModelInput(e.target.value)}
                    className="bg-slate-950"
                  />
                  <Button
                    onClick={handleAddCustomModel}
                    className="bg-cyan-600"
                  >
                    Add
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {userModels.map((m) => (
                    <div
                      key={`${m.provider}:${m.model_id}`}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800/50 group"
                    >
                      <div className="flex flex-col">
                        <span className="text-xs text-slate-500 font-mono uppercase">
                          {m.provider}
                        </span>
                        <span className="text-sm text-white font-medium">
                          {m.model_id}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomModel(m)}
                        aria-label={`Remove ${m.model_id} (${m.provider})`}
                        className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
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
              <CardTitle className="text-white">Crop Image</CardTitle>
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
                    {fitImage ? "Fill Area" : "Fit Entire Image"}
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400">Zoom</span>
                  <input
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
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  className="bg-cyan-600 text-white"
                >
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}
