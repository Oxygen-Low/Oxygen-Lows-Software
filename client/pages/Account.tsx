import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Lock, Upload, Share2, Globe, Cpu, Key, Plus, Trash2, ChevronRight, ShieldAlert, ShieldCheck, ShieldOff, Copy, RefreshCw, Maximize } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { encrypt, decrypt, generateMasterKey, saveMasterKey, getMasterKey, clearMasterKey } from "@/lib/crypto";
import Cropper, { Area } from "react-easy-crop";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UserProfile { user_id: string; username: string; display_name: string; bio: string; email: string | null; show_email: boolean; }
interface ProfilePicture { id: string; user_id?: string; image_url: string; crop_data: Area; }
interface Integration { provider: string; base_url?: string; has_key: boolean; }
interface UserModel { provider: string; model_id: string; }

const PROVIDERS = [
  { id: "openrouter", name: "OpenRouter" },
  { id: "openai", name: "ChatGPT/OpenAI" },
  { id: "google", name: "Gemini/Google" },
  { id: "grok", name: "Grok" },
  { id: "anthropic", name: "Claude/Anthropic" },
  { id: "stablehorde", name: "Stable Horde" },
  { id: "custom", name: "Custom/OpenAI-Like", hasUrl: true },
];

export default function Account() {
  const { session, linkIdentity } = useAuth();
  const { toast } = useToast();
  const [profilePicture, setProfilePicture] = useState<ProfilePicture | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [selectedStoragePath, setSelectedStoragePath] = useState<string | null>(null);
  const [fitImage, setFitImage] = useState(false);

  const [identities, setIdentities] = useState<any[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [bioInput, setBioInput] = useState("");
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [userModels, setUserModels] = useState<UserModel[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [baseUrlInputs, setBaseUrlInputs] = useState<Record<string, string>>({});
  const [newModelInput, setNewModelInput] = useState("");
  const [selectedProviderForModel, setSelectedProviderForModel] = useState("openai");
  const [encryptionSettings, setEncryptionSettings] = useState<Record<string, any>>({});
  const [generatedKey, setGeneratedKey] = useState("");
  const [masterKeyInput, setMasterKeyInput] = useState("");
  const [isMigrating, setIsMigrating] = useState(false);
  const [selectedKeyLength, setSelectedKeyLength] = useState(32);

  const fetchAccountData = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data: pic } = await supabase.from("profile_pictures").select("*").eq("user_id", session.user.id).single();
    if (pic) { if (pic.image_path) { supabase.storage.from("Storage").createSignedUrl(pic.image_path, 3600).then(({ data }) => { if (data) setProfilePicture({ ...pic, image_url: data.signedUrl }); else setProfilePicture({ ...pic, image_url: "" }); }).catch(() => setProfilePicture({ ...pic, image_url: "" })); } else { setProfilePicture(pic); } }
    const { data: prof } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).single();
    if (prof) { setProfile(prof); setUsernameInput(prof.username || ""); setDisplayNameInput(prof.display_name || ""); setBioInput(prof.bio || ""); }
    const { data: idents } = await supabase.auth.getUser(); if (idents.user) setIdentities(idents.user.identities || []);
    const { data: ints } = await supabase.rpc("get_my_integrations");
    const { data: prefs } = await supabase.from("user_preferences").select("encryption_settings").eq("user_id", session.user.id).single();
    const settings = prefs?.encryption_settings || {};
    setEncryptionSettings(settings);

    if (ints) {
      const key = getMasterKey();
      if (settings.integrations && key) {
        const processedInts = await Promise.all(ints.map(async (i: any) => ({
          ...i,
          base_url: i.base_url ? await decrypt(i.base_url, key).catch(() => "[Encrypted]") : undefined
        })));
        setIntegrations(processedInts);
      } else {
        setIntegrations(ints);
      }
    }
    const { data: mods } = await supabase.from("user_models").select("*"); if (mods) setUserModels(mods);

  }, [session?.user?.id]);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  const handleStorageSelect = async (file: any) => {
    setSelectedStoragePath(file.name);
    setFitImage(false);
    setZoom(1);
    if (file.name.includes('..')) throw new Error('Invalid file name');
    const { data } = await supabase.storage.from("Storage").createSignedUrl(file.name, 3600);
    if (data?.signedUrl) setSelectedImage(data.signedUrl);
  };


    const handleUpload = async () => {
    if (!selectedImage || !croppedArea || !session?.user?.id || !selectedStoragePath) return;
    try {
      const { data: signedData } = await supabase.storage.from("Storage").createSignedUrl(selectedStoragePath, 3600);
      const publicUrl = signedData?.signedUrl || "";

      await supabase.from("profile_pictures").upsert({
        user_id: session.user.id,
        image_url: selectedStoragePath,
        crop_data: croppedArea,
        image_path: selectedStoragePath
      });

      await supabase.rpc('upsert_user_preferences', {
        p_user_id: session.user.id,
        p_profile_picture_path: selectedStoragePath
      });

      setProfilePicture({ id: "", user_id: session.user.id, image_url: publicUrl, crop_data: croppedArea });
      setSelectedImage(null);
      setSelectedStoragePath(null);
      toast({ title: "Success" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleToggleEmail = async (visible: boolean) => {
    if (!session?.user?.id) return;
    const { data, error } = await supabase.from("profiles").upsert({ user_id: session.user.id, show_email: visible }).select().single();
    if (!error && data) { setProfile(data); toast({ title: "Success" }); }
  };

  const handleSaveIntegration = async (provider: string) => {
    const key = apiKeyInputs[provider]; const url = baseUrlInputs[provider];
    if (!key && !url) return;

    if (!encryptionSettings.integrations) {
      toast({ title: "Encryption Required", description: "You must enable 'Integrations' encryption in the Security tab before saving API keys.", variant: "destructive" });
      return;
    }

    const masterKey = getMasterKey();
    if (!masterKey) {
       toast({ title: "Error", description: "Masterkey not found. Please enter it in the Security tab.", variant: "destructive" });
       return;
    }

    try {
      const finalKey = key ? await encrypt(key, masterKey) : null;
      const finalUrl = url ? await encrypt(url, masterKey) : (baseUrlInputs[provider] === "" ? null : undefined);

      await supabase.rpc("upsert_user_integration", {
        p_provider: provider,
        p_api_key: finalKey,
        p_base_url: finalUrl
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
        bio: bioInput
      });
      if (error) throw error;
      toast({ title: "Success" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleAddCustomModel = async () => {
    try {
      const { error } = await supabase.rpc("upsert_user_model", {
        p_provider: selectedProviderForModel,
        p_model_id: newModelInput
      });
      if (error) throw error;
      setNewModelInput("");
      const { data } = await supabase.from("user_models").select("*");
      if (data) setUserModels(data);
      toast({ title: "Added" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRemoveCustomModel = async (m: UserModel) => {
    try {
      const { error } = await supabase.rpc("remove_user_model", {
        p_provider: m.provider,
        p_model_id: m.model_id
      });
      if (error) throw error;
      setUserModels(userModels.filter(x => x !== m));
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleLinkIdentity = async (provider: string) => { try { await linkIdentity(provider as any); toast({ title: "Success" }); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } };
  const isLinked = (provider: string) => identities.some(i => i.provider === provider);

  const handleGenerateKey = () => {
    const key = generateMasterKey(selectedKeyLength);
    setGeneratedKey(key);
    toast({ title: "Key Generated", description: "Please copy it securely." });
  };

  const handleToggleEncryption = async (target: string) => {
    if (!masterKeyInput.trim()) {
      toast({ title: "Error", description: "Please enter your masterkey first.", variant: "destructive" });
      return;
    }

    const currentKey = getMasterKey();
    if (currentKey && currentKey !== masterKeyInput.trim()) {
       toast({ title: "Error", description: "Masterkey mismatch. If you want to change your key, you must first decrypt everything.", variant: "destructive" });
       return;
    }

    setIsMigrating(true);
    try {
      const isEnabling = !encryptionSettings[target];
      const key = masterKeyInput.trim();

      if (target === 'characters') {
        const { data: chars } = await supabase.from('characters').select('*').eq('user_id', session?.user?.id);
        if (chars) {
          for (const char of chars) {
            if (isEnabling && !char.is_encrypted) {
              const encryptedChar = {
                name: await encrypt(char.name || '', key),
                short_description: char.short_description ? await encrypt(char.short_description, key) : null,
                display_name: char.display_name ? await encrypt(char.display_name, key) : null,
                appearance: char.appearance ? await encrypt(char.appearance, key) : null,
                personality: char.personality ? await encrypt(char.personality, key) : null,
                backstory: char.backstory ? await encrypt(char.backstory, key) : null,
                hidden_description: char.hidden_description ? await encrypt(char.hidden_description, key) : null,
                is_encrypted: true
              };
              await supabase.from('characters').update(encryptedChar).eq('id', char.id);
            } else if (!isEnabling && char.is_encrypted) {
              const decryptedChar = {
                name: await decrypt(char.name, key),
                short_description: char.short_description ? await decrypt(char.short_description, key) : null,
                display_name: char.display_name ? await decrypt(char.display_name, key) : null,
                appearance: char.appearance ? await decrypt(char.appearance, key) : null,
                personality: char.personality ? await decrypt(char.personality, key) : null,
                backstory: char.backstory ? await decrypt(char.backstory, key) : null,
                hidden_description: char.hidden_description ? await decrypt(char.hidden_description, key) : null,
                is_encrypted: false
              };
              await supabase.from('characters').update(decryptedChar).eq('id', char.id);
            }
          }
        }
      }

      if (target === 'chats') {
        const { data: chats } = await supabase.from('chats').select('*').eq('user_id', session?.user?.id);
        if (chats) {
          for (const chat of chats) {
            if (isEnabling && !chat.is_encrypted) {
               const encryptedChat = {
                 title: await encrypt(chat.title || 'New Chat', key),
                 is_encrypted: true
               };
               await supabase.from('chats').update(encryptedChat).eq('id', chat.id);
            } else if (!isEnabling && chat.is_encrypted) {
               const decryptedChat = {
                 title: await decrypt(chat.title, key),
                 is_encrypted: false
               };
               await supabase.from('chats').update(decryptedChat).eq('id', chat.id);
            }

            const { data: messages } = await supabase.from('chat_messages').select('*').eq('chat_id', chat.id);
            if (messages) {
              for (const msg of messages) {
                if (isEnabling && !msg.is_encrypted) {
                  await supabase.from('chat_messages').update({
                    content: await encrypt(msg.content, key),
                    is_encrypted: true
                  }).eq('id', msg.id);
                } else if (!isEnabling && msg.is_encrypted) {
                   await supabase.from('chat_messages').update({
                     content: await decrypt(msg.content, key),
                     is_encrypted: false
                   }).eq('id', msg.id);
                }
              }
            }
          }
        }
      }

      if (target === 'integrations') {
        if (!isEnabling) {
          if (!window.confirm("Disabling encryption for integrations will PERMANENTLY DELETE all your saved API keys and Base URLs. Please make sure you have them saved elsewhere. Continue?")) {
            setIsMigrating(false);
            return;
          }
          await supabase.from('user_integrations').delete().eq('user_id', session?.user?.id);
          setIntegrations([]);
        } else {
          // Force delete existing unencrypted integrations when enabling
          await supabase.from('user_integrations').delete().eq('user_id', session?.user?.id);
          setIntegrations([]);
        }
      }

      const newSettings = { ...encryptionSettings, [target]: isEnabling };

      // If enabling encryption for the first time, save a validation hash
      if (isEnabling && !newSettings.validation_hash) {
        newSettings.validation_hash = await encrypt('valid', key);
      } else if (!isEnabling && !newSettings.characters && !newSettings.chats && !newSettings.integrations) {
        // If disabling everything, we can clear the validation hash
        delete newSettings.validation_hash;
      }

      await supabase.rpc('upsert_user_preferences', {
        p_user_id: session?.user?.id,
        p_encryption_settings: newSettings
      });
      setEncryptionSettings(newSettings);
      saveMasterKey(key);
      toast({ title: "Success", description: `${target} ${isEnabling ? 'encrypted' : 'decrypted'} successfully.` });
    } catch (e: any) {
      toast({ title: "Migration Error", description: e.message, variant: "destructive" });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleResetEncryption = async () => {
    if (!window.confirm("Are you sure you want to reset encryption? This will PERMANENTLY DELETE all currently encrypted data. Unencrypted data will not be affected.")) {
      return;
    }

    setIsMigrating(true);
    try {
      // 1. Delete encrypted data
      await supabase.from('characters').delete().eq('user_id', session?.user?.id).eq('is_encrypted', true);
      await supabase.from('chats').delete().eq('user_id', session?.user?.id).eq('is_encrypted', true);
      await supabase.from('chat_messages').delete().eq('is_encrypted', true);
      await supabase.from('user_integrations').delete().eq('user_id', session?.user?.id);

      // 2. Reset encryption settings
      const newSettings = {};
      await supabase.rpc('upsert_user_preferences', {
        p_user_id: session?.user?.id,
        p_encryption_settings: newSettings
      });

      // 3. Clear local state and session
      setEncryptionSettings(newSettings);
      setMasterKeyInput("");
      setGeneratedKey("");
      clearMasterKey();

      toast({ title: "Encryption Reset", description: "All encrypted data has been deleted and encryption settings have been reset." });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsMigrating(false);
    }
  };


  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-bold text-white tracking-tight">Account</h1>
          <p className="text-slate-400">Manage your profile, integrations, and preferences.</p>
        </header>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="bg-slate-900 border-slate-800 p-1 mb-8">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="models">Custom Models</TabsTrigger>
            <TabsTrigger value="security">Advanced Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Public Profile</CardTitle>
                <CardDescription>How others see you on Oxygen Low.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                  <div className="relative group">
                    <div className="w-32 h-32 rounded-3xl bg-slate-800 border-2 border-slate-700 overflow-hidden flex items-center justify-center">
                      {profilePicture ? <img src={profilePicture.image_url} alt="Profile" className="w-full h-full object-cover" /> : <Globe className="w-12 h-12 text-slate-600" />}
                    </div>
                    <StorageFileSelector onSelect={handleStorageSelect} allowedTypes={["image"]} trigger={<button aria-label="Select profile image" className="absolute -bottom-2 -right-2 p-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl shadow-lg"><Upload className="w-4 h-4" /></button>} />

                  </div>
                  <div className="flex-1 space-y-4">
                    <Input value={usernameInput} onChange={e => setUsernameInput(e.target.value.toLowerCase())} placeholder="Username" className="bg-slate-950" />
                    <Input value={displayNameInput} onChange={e => setDisplayNameInput(e.target.value)} placeholder="Display Name" className="bg-slate-950" />
                    <textarea value={bioInput} onChange={e => setBioInput(e.target.value)} placeholder="Bio" className="w-full min-h-[100px] bg-slate-950 border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition" />
                    <Button onClick={handleSaveProfile} className="bg-cyan-600">Save Changes</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="integrations" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 space-y-4">
                {PROVIDERS.map(p => (
                  <div key={p.id} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/50 space-y-4">
                    <h3 className="font-semibold text-white">{p.name}</h3>
                    <div className="flex gap-3">
                      {p.hasUrl && <Input placeholder="Base URL" value={baseUrlInputs[p.id] ?? integrations.find(i => i.provider === p.id)?.base_url ?? ""} onChange={e => setBaseUrlInputs({...baseUrlInputs, [p.id]: e.target.value})} className="bg-slate-900 flex-[2]" />}
                      <Input type="password" placeholder="API Key" value={apiKeyInputs[p.id] || ""} onChange={e => setApiKeyInputs({...apiKeyInputs, [p.id]: e.target.value})} className="bg-slate-900 flex-[3]" />
                      <Button onClick={() => handleSaveIntegration(p.id)} variant="secondary">Save Changes</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {['github', 'gitlab', 'google', 'discord'].map(p => (
                  <Button key={p} variant={isLinked(p) ? "secondary" : "outline"} onClick={() => handleLinkIdentity(p)} disabled={isLinked(p)} className={`h-12 justify-start gap-3 ${isLinked(p) ? 'bg-green-500/10 text-green-400' : 'bg-slate-950'}`}>
                    <Share2 className="w-4 h-4" /> Link {p.charAt(0).toUpperCase() + p.slice(1)}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="security" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-cyan-500" />
                  Client-Side Encryption
                </CardTitle>
                <CardDescription>
                  Protect your data with a masterkey. Data is encrypted in your browser before being sent to the server.
                  <br />
                  <strong className="text-red-400">Warning: If you lose your masterkey, your data cannot be recovered.</strong>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {!generatedKey && Object.values(encryptionSettings).every(v => !v) && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-sm font-medium text-slate-300">Key Security Level</label>
                       <select
                         value={selectedKeyLength}
                         onChange={(e) => setSelectedKeyLength(Number(e.target.value))}
                         className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm"
                       >
                         <option value={32}>Basic (32 chars)</option>
                         <option value={64}>Medium (64 chars)</option>
                         <option value={256}>High (256 chars)</option>
                         <option value={512}>Very High (512 chars)</option>
                       </select>
                    </div>
                    <Button onClick={handleGenerateKey} className="bg-cyan-600 w-full">
                      Generate New Masterkey
                    </Button>
                  </div>
                )}

                {generatedKey && (
                  <div className="p-4 rounded-xl bg-slate-950 border border-cyan-900/50 space-y-4">
                    <p className="text-xs font-mono break-all text-cyan-400">{generatedKey}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { navigator.clipboard.writeText(generatedKey); toast({ title: "Copied" }); }}
                      className="w-full gap-2"
                    >
                      <Copy className="w-4 h-4" /> Copy Masterkey
                    </Button>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Enter Masterkey to Toggle</label>
                    <Input
                      type="password"
                      placeholder="Paste your masterkey here"
                      value={masterKeyInput}
                      onChange={(e) => setMasterKeyInput(e.target.value)}
                      className="bg-slate-950"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Button
                      variant={encryptionSettings.characters ? "secondary" : "outline"}
                      onClick={() => handleToggleEncryption('characters')}
                      disabled={isMigrating}
                      className="h-16 justify-between px-6"
                    >
                      <div className="text-left">
                        <div className="font-semibold">Characters</div>
                        <div className="text-xs text-slate-500">{encryptionSettings.characters ? 'Encrypted' : 'Unencrypted'}</div>
                      </div>
                      {isMigrating ? <RefreshCw className="w-5 h-5 animate-spin" /> : (encryptionSettings.characters ? <ShieldCheck className="w-5 h-5 text-green-500" /> : <ShieldAlert className="w-5 h-5 text-slate-600" />)}
                    </Button>

                    <Button
                      variant={encryptionSettings.chats ? "secondary" : "outline"}
                      onClick={() => handleToggleEncryption('chats')}
                      disabled={isMigrating}
                      className="h-16 justify-between px-6"
                    >
                      <div className="text-left">
                        <div className="font-semibold">Chatbot Chats</div>
                        <div className="text-xs text-slate-500">{encryptionSettings.chats ? 'Encrypted' : 'Unencrypted'}</div>
                      </div>
                      {isMigrating ? <RefreshCw className="w-5 h-5 animate-spin" /> : (encryptionSettings.chats ? <ShieldCheck className="w-5 h-5 text-green-500" /> : <ShieldAlert className="w-5 h-5 text-slate-600" />)}
                    </Button>

                    <Button
                      variant={encryptionSettings.integrations ? "secondary" : "outline"}
                      onClick={() => handleToggleEncryption('integrations')}
                      disabled={isMigrating}
                      className="h-16 justify-between px-6 sm:col-span-2"
                    >
                      <div className="text-left">
                        <div className="font-semibold">Integrations</div>
                        <div className="text-xs text-slate-500">{encryptionSettings.integrations ? 'Encrypted' : 'Unencrypted'}</div>
                      </div>
                      {isMigrating ? <RefreshCw className="w-5 h-5 animate-spin" /> : (encryptionSettings.integrations ? <ShieldCheck className="w-5 h-5 text-green-500" /> : <ShieldAlert className="w-5 h-5 text-slate-600" />)}
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800">
                  <Button
                    variant="destructive"
                    onClick={handleResetEncryption}
                    disabled={isMigrating}
                    className="w-full gap-2"
                  >
                    <ShieldOff className="w-4 h-4" /> Reset Encryption
                  </Button>
                  <p className="text-[10px] text-slate-500 mt-2 text-center">
                    This will delete all encrypted data and allow you to set a new masterkey.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="models" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 space-y-6">
                <div className="flex gap-3">
                  <select value={selectedProviderForModel} onChange={e => setSelectedProviderForModel(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm">{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <Input placeholder="Model ID" value={newModelInput} onChange={e => setNewModelInput(e.target.value)} className="bg-slate-950" />
                  <Button onClick={handleAddCustomModel} className="bg-cyan-600">Add</Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {userModels.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800/50 group">
                      <div className="flex flex-col"><span className="text-xs text-slate-500 font-mono uppercase">{m.provider}</span><span className="text-sm text-white font-medium">{m.model_id}</span></div>
                      <button onClick={() => handleRemoveCustomModel(m)} aria-label={`Remove ${m.model_id} (${m.provider})`} className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {selectedImage && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"><Card className="w-full max-w-2xl bg-slate-900 border-slate-800"><CardHeader><CardTitle className="text-white">Crop Image</CardTitle></CardHeader><CardContent className="space-y-6"><div className="relative h-96 w-full bg-black">
                <Cropper
                  image={selectedImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={(_, p)=>setCroppedArea(p)}
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
              </div><div className="flex gap-3 justify-end"><Button variant="ghost" onClick={() => setSelectedImage(null)}>Cancel</Button><Button onClick={handleUpload} className="bg-cyan-600 text-white">Save</Button></div></CardContent></Card></div>}
    </Layout>
  );
}
