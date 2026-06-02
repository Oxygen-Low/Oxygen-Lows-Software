import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Lock, Upload, Share2, Globe, Cpu, Key, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import Cropper, { Area } from "react-easy-crop";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    if (!session?.user?.id) return;
    const fetchAll = async () => {
      const { data: pic } = await supabase.from("profile_pictures").select("*").eq("user_id", session.user.id).single();
      if (pic) setProfilePicture(pic);
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.identities) setIdentities(user.identities);
      const { data: prof } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).single();
      if (prof) { setProfile(prof); setUsernameInput(prof.username || ""); setDisplayNameInput(prof.display_name || ""); setBioInput(prof.bio || ""); }
      const { data: ints } = await supabase.rpc("get_my_integrations");
      if (ints) setIntegrations(ints);
      const { data: mods } = await supabase.from("user_models").select("*");
      if (mods) setUserModels(mods);
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
      toast({ title: "Success" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handleToggleEmailVisibility = async (visible: boolean) => {
    if (!session?.user?.id) return;
    const { data, error } = await supabase.from("profiles").upsert({ user_id: session.user.id, show_email: visible }).select().single();
    if (!error && data) { setProfile(data); toast({ title: "Success" }); }
  };

  const handleLinkIdentity = async (provider: string) => {
    await supabase.auth.updateUser({ data: { manual_link_allowed: true } });
    await linkIdentity(provider as any);
  };

  const handleSaveIntegration = async (id: string) => {
    await supabase.rpc("upsert_user_integration", { p_provider: id, p_api_key: apiKeyInputs[id], p_base_url: baseUrlInputs[id] });
    const { data } = await supabase.rpc("get_my_integrations"); if (data) setIntegrations(data);
    toast({ title: "Success" });
  };

  const isLinked = (p: string) => identities.some(id => id.provider === p);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-white mb-8">Account Settings</h1>
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-slate-900 border border-slate-800 p-1">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="models">Models</TabsTrigger>
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
                    <Input value={usernameInput} onChange={e => setUsernameInput(e.target.value.toLowerCase())} placeholder="Username" className="bg-slate-950" />
                    <Input value={displayNameInput} onChange={e => setDisplayNameInput(e.target.value)} placeholder="Display Name" className="bg-slate-950" />
                    <textarea value={bioInput} onChange={e => setBioInput(e.target.value)} className="w-full min-h-[100px] bg-slate-950 border-slate-800 rounded-lg p-3 text-sm text-white" />
                    <Button onClick={() => supabase.from("profiles").upsert({ user_id: session?.user?.id, username: usernameInput, display_name: displayNameInput, bio: bioInput }).then(() => toast({ title: "Success" }))} className="bg-cyan-600">Save</Button>
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
                      <Button onClick={() => handleSaveIntegration(p.id)} variant="secondary">Save</Button>
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
        </Tabs>
      </div>
      {selectedImage && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"><Card className="w-full max-w-2xl bg-slate-900 border-slate-800"><CardHeader><CardTitle className="text-white">Crop Image</CardTitle></CardHeader><CardContent className="space-y-6"><div className="relative h-96 w-full bg-black"><Cropper image={selectedImage} crop={{x:0,y:0}} zoom={1} aspect={1} onCropChange={()=>{}} onZoomChange={()=>{}} onCropComplete={(_, p)=>setCroppedArea(p)} /></div><div className="flex gap-3 justify-end"><Button variant="ghost" onClick={() => setSelectedImage(null)}>Cancel</Button><Button onClick={handleUpload} className="bg-cyan-600 text-white">Save</Button></div></CardContent></Card></div>}
    </Layout>
  );
}
