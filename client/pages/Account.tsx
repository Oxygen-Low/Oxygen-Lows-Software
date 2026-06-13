import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Lock, Upload, Share2, Globe, Cpu, Key, Plus, Trash2, Globe2, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import Cropper, { Area } from "react-easy-crop";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTheme } from "@/contexts/ThemeContext";
import { LANGUAGES, getLanguageLabel } from "@/lib/languages";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const { session, linkIdentity } = useAuth();
  const { language, subLanguage, setLanguage } = useTheme();
  const { toast } = useToast();
  const [profilePicture, setProfilePicture] = useState<ProfilePicture | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [activeLangId, setActiveLangId] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    const fetchAll = async () => {
      const { data: pic } = await supabase.from("profile_pictures").select("*").eq("user_id", session.user.id).single();
      if (pic) setProfilePicture(pic);
      const { data: idents } = await supabase.auth.getUser();
      if (idents.user?.identities) setIdentities(idents.user.identities);
      const { data: prof } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).single();
      if (prof) { setProfile(prof); setUsernameInput(prof.username || ""); setDisplayNameInput(prof.display_name || ""); setBioInput(prof.bio || ""); }
      const { data: ints } = await supabase.rpc("get_my_integrations"); if (ints) setIntegrations(ints);
      const { data: mods } = await supabase.from("user_models").select("*"); if (mods) setUserModels(mods);
    };
    fetchAll();
  }, [session]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const r = new FileReader(); r.onload = () => setSelectedImage(r.result as string); r.readAsDataURL(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedImage || !croppedArea || !session?.user?.id) return;
    try {
      const canvas = document.createElement("canvas");
      const img = new Image(); img.src = selectedImage; await new Promise(r => img.onload = r);
      canvas.width = croppedArea.width; canvas.height = croppedArea.height;
      canvas.getContext("2d")?.drawImage(img, croppedArea.x, croppedArea.y, croppedArea.width, croppedArea.height, 0, 0, croppedArea.width, croppedArea.height);
      const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), "image/jpeg", 0.9));
      const { data: old } = await supabase.from("profile_pictures").select("image_url").eq("user_id", session.user.id).single();
      const { data: up, error: err } = await supabase.storage.from("Storage").upload(`profiles/${session.user.id}_${Date.now()}.jpg`, blob);
      if (err) throw err;
      const { data: { publicUrl } } = supabase.storage.from("Storage").getPublicUrl(up.path);
      await supabase.from("profile_pictures").upsert({ user_id: session.user.id, image_url: publicUrl, crop_data: croppedArea });
      if (old?.image_url) { const p = old.image_url.split('/public/Storage/')[1]; if (p) await supabase.storage.from("Storage").remove([p]); }
      setProfilePicture({ id: "", image_url: publicUrl, crop_data: croppedArea }); setSelectedImage(null);
      toast({ title: t('account.success') });
    } catch (e: any) { toast({ title: t('account.error'), description: e.message, variant: "destructive" }); }
  };

  const handleToggleEmailVisibility = async (visible: boolean) => {
    if (!session?.user?.id) return;
    const { data, error } = await supabase.from("profiles").upsert({ user_id: session.user.id, show_email: visible }).select().single();
    if (!error && data) { setProfile(data); toast({ title: t('account.success') }); }
  };

  const handleLinkIdentity = async (provider: string) => {
    await supabase.auth.updateUser({ data: { manual_link_allowed: true } });
    await linkIdentity(provider as any);
  };

  const handleSaveIntegration = async (id: string) => {
    await supabase.rpc("upsert_user_integration", { p_provider: id, p_api_key: apiKeyInputs[id], p_base_url: baseUrlInputs[id] });
    const { data } = await supabase.rpc("get_my_integrations"); if (data) setIntegrations(data);
    toast({ title: t('account.success') });
  };

  const handleLanguageSelect = (langId: string, subLangId: string | null) => {
    setLanguage(langId, subLangId);
    setShowLanguageMenu(false);
    setActiveLangId(null);
    toast({ title: t('account.success') });
  };

  const isLinked = (p: string) => identities.some(id => id.provider === p);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white mb-8">{t('nav.account')}</h1>
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 overflow-x-auto justify-start h-auto flex-wrap">
            <TabsTrigger value="profile">{t('account.profile')}</TabsTrigger>
            <TabsTrigger value="integrations">{t('account.integrations')}</TabsTrigger>
            <TabsTrigger value="models">{t('account.models')}</TabsTrigger>
            <TabsTrigger value="language">{t('account.language')}</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6">
                <div className="flex gap-6 items-start">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-2xl bg-slate-800 overflow-hidden ring-4 ring-slate-800">
                      {profilePicture?.image_url ? <img src={profilePicture.image_url} alt="Profile" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-500"><Upload className="w-8 h-8" /></div>}
                    </div>
                    <button onClick={() => fileInputRef.current?.click()} aria-label="Upload profile image" className="absolute -bottom-2 -right-2 p-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl shadow-lg"><Upload className="w-4 h-4" /></button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                  </div>
                  <div className="flex-1 space-y-4">
                    <Input value={usernameInput} onChange={e => setUsernameInput(e.target.value.toLowerCase())} placeholder={t('auth.username')} className="bg-slate-950" />
                    <Input value={displayNameInput} onChange={e => setDisplayNameInput(e.target.value)} placeholder={t('account.displayName')} className="bg-slate-950" />
                    <textarea value={bioInput} onChange={e => setBioInput(e.target.value)} placeholder={t('account.bio')} className="w-full min-h-[100px] bg-slate-950 border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition" />
                    <Button onClick={() => supabase.from("profiles").upsert({ user_id: session?.user?.id, username: usernameInput, display_name: displayNameInput, bio: bioInput }).then(() => toast({ title: t('account.success') }))} className="bg-cyan-600">{t('account.save')}</Button>
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
                      <Button onClick={() => handleSaveIntegration(p.id)} variant="secondary">{t('account.save')}</Button>
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
          <TabsContent value="models" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 space-y-6">
                <div className="flex gap-3">
                  <select value={selectedProviderForModel} onChange={e => setSelectedProviderForModel(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm">{PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <Input placeholder="Model ID" value={newModelInput} onChange={e => setNewModelInput(e.target.value)} className="bg-slate-950" />
                  <Button onClick={() => supabase.rpc("upsert_user_model", { p_provider: selectedProviderForModel, p_model_id: newModelInput }).then(() => { setNewModelInput(""); supabase.from("user_models").select("*").then(({data}) => data && setUserModels(data)); toast({title: "Added"}); })} className="bg-cyan-600">Add</Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {userModels.map((m, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800/50 group">
                      <div className="flex flex-col"><span className="text-xs text-slate-500 font-mono uppercase">{m.provider}</span><span className="text-sm text-white font-medium">{m.model_id}</span></div>
                      <button onClick={() => supabase.rpc("remove_user_model", { p_provider: m.provider, p_model_id: m.model_id }).then(() => setUserModels(userModels.filter(x => x !== m)))} aria-label={`Remove ${m.model_id} (${m.provider})`} className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="language" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Globe2 className="w-5 h-5 text-cyan-500" />
                  {t('account.language')}
                </CardTitle>
                <CardDescription>
                  Current: {getLanguageLabel(language, subLanguage)}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {!showLanguageMenu ? (
                  <Button onClick={() => setShowLanguageMenu(true)} variant="outline" className="w-full bg-slate-950 border-slate-800">
                    Change Language
                  </Button>
                ) : (
                  <div className="space-y-4">
                    {!activeLangId ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {LANGUAGES.map((lang) => (
                          <button
                            key={lang.id}
                            onClick={() => {
                              if (lang.subLanguages) {
                                setActiveLangId(lang.id);
                              } else {
                                handleLanguageSelect(lang.id, null);
                              }
                            }}
                            className="flex items-center justify-between p-4 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition group"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-2xl">{lang.flag}</span>
                              <span className="text-white font-medium">{lang.name}</span>
                            </div>
                            {lang.subLanguages && <ChevronRight className="w-4 h-4 text-slate-500" />}
                          </button>
                        ))}
                        <Button variant="ghost" onClick={() => setShowLanguageMenu(false)} className="sm:col-span-2">Cancel</Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-2">
                          <button onClick={() => setActiveLangId(null)} className="text-slate-400 hover:text-white p-2">
                            <Plus className="w-4 h-4 rotate-45" />
                          </button>
                          <span className="text-white font-semibold">
                            {LANGUAGES.find(l => l.id === activeLangId)?.name} Sub-languages
                          </span>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {LANGUAGES.find(l => l.id === activeLangId)?.subLanguages?.map((sub) => (
                            <button
                              key={sub.id}
                              onClick={() => handleLanguageSelect(activeLangId!, sub.id)}
                              className="flex items-center gap-3 p-4 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl transition group text-left"
                            >
                              <span className="text-2xl">{sub.flag}</span>
                              <span className="text-white font-medium">{sub.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {selectedImage && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"><Card className="w-full max-w-2xl bg-slate-900 border-slate-800"><CardHeader><CardTitle className="text-white">Crop Image</CardTitle></CardHeader><CardContent className="space-y-6"><div className="relative h-96 w-full bg-black"><Cropper image={selectedImage} crop={{x:0,y:0}} zoom={1} aspect={1} onCropChange={()=>{}} onZoomChange={()=>{}} onCropComplete={(_, p)=>setCroppedArea(p)} /></div><div className="flex gap-3 justify-end"><Button variant="ghost" onClick={() => setSelectedImage(null)}>Cancel</Button><Button onClick={handleUpload} className="bg-cyan-600 text-white">Save</Button></div></CardContent></Card></div>}
    </Layout>
  );
}
