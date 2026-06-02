import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Lock, Upload, Share2, Globe, Cpu, Key, Database, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import Cropper, { Area } from "react-easy-crop";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UserProfile {
  user_id: string;
  username: string;
  display_name: string;
  username_updated_at: string;
  display_name_updated_at: string;
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
  { id: "stablehorde", name: "Stable Horde" },
  { id: "custom", name: "Custom/OpenAI-Like", hasUrl: true },
];

export default function Account() {
  const { session, linkIdentity } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [profilePicture, setProfilePicture] = useState<ProfilePicture | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [identities, setIdentities] = useState<any[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [bioInput, setBioInput] = useState("");
  const [isSavingNames, setIsSavingNames] = useState(false);
  const [isSavingEmailVisibility, setIsSavingEmailVisibility] = useState(false);

  // AI Integrations state
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [userModels, setUserModels] = useState<UserModel[]>([]);
  const [localProviders, setLocalProviders] = useState<any[]>([]);
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [baseUrlInputs, setBaseUrlInputs] = useState<Record<string, string>>({});
  const [newModelInput, setNewModelInput] = useState("");
  const [selectedProviderForModel, setSelectedProviderForModel] = useState("openai");

  useEffect(() => {
    const fetchProfilePicture = async () => {
      if (!session?.user?.id) return;
      const { data, error } = await supabase
        .from("profile_pictures")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (data) setProfilePicture(data);
    };

    const fetchIdentities = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (user?.identities) {
        setIdentities(user.identities);
      }
    };

    const fetchProfile = async () => {
      if (!session?.user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (data) {
        setProfile(data);
        setUsernameInput(data.username || "");
        setDisplayNameInput(data.display_name || "");
        setBioInput(data.bio || "");
      }
    };

    const fetchIntegrations = async () => {
      const { data, error } = await supabase.rpc("get_my_integrations");
      if (data) setIntegrations(data);
    };

    const fetchModels = async () => {
      const { data, error } = await supabase
        .from("user_models")
        .select("*");
      if (data) setUserModels(data);
    };

    const fetchLocalProviders = async () => {
      try {
        const res = await fetch("/api/ai/local-providers");
        const data = await res.json();
        setLocalProviders(data);
      } catch (e) {
        console.error("Failed to fetch local providers", e);
      }
    };

    fetchProfilePicture();
    fetchIdentities();
    fetchProfile();
    fetchIntegrations();
    fetchModels();
    fetchLocalProviders();
  }, [session]);

  const handleResetPassword = async () => {
    if (!session?.user?.email) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, {
        redirectTo: `${window.location.origin}/auth?type=recovery`,
      });
      if (error) throw error;
      toast({
        title: "Success",
        description: "Password reset link sent to your email.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.addEventListener("load", () => setSelectedImage(reader.result as string));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedArea(areaPixels);
  }, []);

  const handleUpload = async () => {
    if (!selectedImage || !croppedArea || !session?.user?.id) return;
    setIsUploading(true);

    try {
      const canvas = document.createElement("canvas");
      const img = new Image();
      img.src = selectedImage;
      await new Promise((resolve) => (img.onload = resolve));

      canvas.width = croppedArea.width;
      canvas.height = croppedArea.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(
        img,
        croppedArea.x,
        croppedArea.y,
        croppedArea.width,
        croppedArea.height,
        0,
        0,
        croppedArea.width,
        croppedArea.height
      );

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9)
      );

      const fileName = `profile_${session.user.id}_${Date.now()}.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("Storage")
        .upload(`profiles/${fileName}`, blob);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("Storage")
        .getPublicUrl(uploadData.path);

      const { error: dbError } = await supabase.from("profile_pictures").upsert({
        user_id: session.user.id,
        image_url: publicUrl,
        crop_data: croppedArea,
      });

      if (dbError) throw dbError;

      setProfilePicture({
        id: "",
        image_url: publicUrl,
        crop_data: croppedArea,
      });
      setSelectedImage(null);
      toast({ title: "Success", description: "Profile picture updated." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteProfilePicture = async () => {
    if (!profilePicture || !session?.user?.id) return;
    setIsUploading(true);

    try {
      const { error } = await supabase
        .from("profile_pictures")
        .delete()
        .eq("user_id", session.user.id);

      if (error) throw error;

      setProfilePicture(null);
      toast({ title: "Success", description: "Profile picture deleted." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveNames = async () => {
    if (!session?.user?.id) return;
    setIsSavingNames(true);

    try {
      const { error } = await supabase.from("profiles").upsert({
        user_id: session.user.id,
        username: usernameInput,
        display_name: displayNameInput,
        bio: bioInput,
      });

      if (error) throw error;
      toast({ title: "Success", description: "Profile updated." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingNames(false);
    }
  };

  const handleToggleEmailVisibility = async (visible: boolean) => {
    if (!session?.user?.id) return;
    setIsSavingEmailVisibility(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ show_email: visible })
        .eq("user_id", session.user.id);

      if (error) throw error;
      setProfile(prev => prev ? { ...prev, show_email: visible } : null);
      toast({ title: "Success", description: `Email is now ${visible ? 'visible' : 'hidden'}.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingEmailVisibility(false);
    }
  };

  const isLinked = (provider: string) => identities.some(id => id.provider === provider);

  const handleLinkIdentity = async (provider: string) => {
    try {
      await linkIdentity(provider as any);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // AI Integration Handlers
  const handleSaveIntegration = async (providerId: string) => {
    try {
      const apiKey = apiKeyInputs[providerId];
      const baseUrl = baseUrlInputs[providerId];

      const { error } = await supabase.rpc("upsert_user_integration", {
        p_provider: providerId,
        p_api_key: apiKey,
        p_base_url: baseUrl
      });

      if (error) throw error;

      toast({ title: "Success", description: `${providerId} integration saved.` });
      // Refresh integrations
      const { data } = await supabase.rpc("get_my_integrations");
      if (data) setIntegrations(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleAddModel = async () => {
    if (!newModelInput) return;
    try {
      const { error } = await supabase.rpc("upsert_user_model", {
        p_provider: selectedProviderForModel,
        p_model_id: newModelInput
      });

      if (error) throw error;

      toast({ title: "Success", description: "Model added." });
      setNewModelInput("");
      const { data } = await supabase.from("user_models").select("*");
      if (data) setUserModels(data);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleRemoveModel = async (provider: string, modelId: string) => {
    try {
      const { error } = await supabase.rpc("remove_user_model", {
        p_provider: provider,
        p_model_id: modelId
      });

      if (error) throw error;

      toast({ title: "Success", description: "Model removed." });
      setUserModels(prev => prev.filter(m => !(m.provider === provider && m.model_id === modelId)));
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-3xl font-bold text-white tracking-tight">Account Settings</h1>
          <p className="text-slate-400">Manage your profile, security, and integrations.</p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="bg-slate-900 border border-slate-800 p-1">
            <TabsTrigger value="profile" className="data-[state=active]:bg-cyan-600">Profile</TabsTrigger>
            <TabsTrigger value="integrations" className="data-[state=active]:bg-cyan-600">Integrations</TabsTrigger>
            <TabsTrigger value="models" className="data-[state=active]:bg-cyan-600">Models</TabsTrigger>
            <TabsTrigger value="security" className="data-[state=active]:bg-cyan-600">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Globe className="w-5 h-5 text-cyan-400" />
                  Public Profile
                </CardTitle>
                <CardDescription>How others see you on the platform.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  <div className="relative group">
                    <div className="w-24 h-24 rounded-2xl bg-slate-800 overflow-hidden ring-4 ring-slate-800 group-hover:ring-cyan-500/30 transition-all duration-300">
                      {profilePicture?.image_url ? (
                        <img src={profilePicture.image_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500">
                          <Upload className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute -bottom-2 -right-2 p-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl shadow-lg transition-transform hover:scale-110 active:scale-95"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                  </div>

                  <div className="flex-1 space-y-4 w-full">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Username</label>
                        <Input
                          value={usernameInput}
                          onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
                          className="bg-slate-950 border-slate-800 focus:ring-cyan-500/20"
                          placeholder="johndoe"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-300">Display Name</label>
                        <Input
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          className="bg-slate-950 border-slate-800 focus:ring-cyan-500/20"
                          placeholder="John Doe"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">Bio</label>
                      <textarea
                        value={bioInput}
                        onChange={(e) => setBioInput(e.target.value)}
                        className="w-full min-h-[100px] bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                        placeholder="Tell the world about yourself..."
                      />
                    </div>
                    <Button
                      onClick={handleSaveNames}
                      disabled={isSavingNames}
                      className="bg-cyan-600 hover:bg-cyan-700 text-white w-full sm:w-auto"
                    >
                      {isSavingNames ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-cyan-400" />
                  AI Integrations
                </CardTitle>
                <CardDescription>Enter your API keys to enable LLM providers.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {PROVIDERS.map((provider) => (
                  <div key={provider.id} className="p-4 rounded-xl bg-slate-950/50 border border-slate-800/50 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-white">{provider.name}</h3>
                      {integrations.find(i => i.provider === provider.id)?.has_key && (
                        <span className="text-xs bg-green-500/10 text-green-400 px-2 py-1 rounded-full border border-green-500/20 font-medium">
                          Configured
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      {provider.hasUrl && (
                        <Input
                          placeholder="Base URL (e.g. https://api.proxy.com/v1)"
                          value={baseUrlInputs[provider.id] || integrations.find(i => i.provider === provider.id)?.base_url || ""}
                          onChange={(e) => setBaseUrlInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                          className="bg-slate-900 border-slate-800 flex-[2]"
                        />
                      )}
                      <Input
                        type="password"
                        placeholder="API Key"
                        value={apiKeyInputs[provider.id] || ""}
                        onChange={(e) => setApiKeyInputs(prev => ({ ...prev, [provider.id]: e.target.value }))}
                        className="bg-slate-900 border-slate-800 flex-[3]"
                      />
                      <Button
                        onClick={() => handleSaveIntegration(provider.id)}
                        variant="secondary"
                        className="bg-slate-800 hover:bg-slate-700"
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-cyan-400" />
                  OAuth Providers
                </CardTitle>
                <CardDescription>Link your social accounts for easy login.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {['github', 'discord', 'gitlab', 'google'].map((provider) => (
                  <Button
                    key={provider}
                    variant={isLinked(provider) ? "secondary" : "outline"}
                    onClick={() => handleLinkIdentity(provider)}
                    disabled={isLinked(provider)}
                    className={`h-12 justify-start gap-3 ${isLinked(provider) ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-slate-950'}`}
                  >
                    <Share2 className="w-4 h-4" />
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                    {isLinked(provider) && <span className="ml-auto text-xs">Linked</span>}
                  </Button>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="models" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-cyan-400" />
                  Model Management
                </CardTitle>
                <CardDescription>Select which models from which providers you want to use.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <select
                    value={selectedProviderForModel}
                    onChange={(e) => setSelectedProviderForModel(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white text-sm focus:ring-cyan-500/20"
                  >
                    {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    {localProviders.map(p => <option key={p.id} value={p.id}>{p.name} (Local)</option>)}
                  </select>
                  <Input
                    placeholder="Model ID (e.g. gpt-4o, claude-3-opus)"
                    value={newModelInput}
                    onChange={(e) => setNewModelInput(e.target.value)}
                    className="bg-slate-950 border-slate-800"
                  />
                  <Button onClick={handleAddModel} className="bg-cyan-600 hover:bg-cyan-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add
                  </Button>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-400">Added Models</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {userModels.map((m, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800/50 group">
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-500 font-mono uppercase tracking-wider">{m.provider}</span>
                          <span className="text-sm text-white font-medium">{m.model_id}</span>
                        </div>
                        <button
                          onClick={() => handleRemoveModel(m.provider, m.model_id)}
                          className="p-2 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {userModels.length === 0 && (
                      <div className="col-span-full py-8 text-center border border-dashed border-slate-800 rounded-xl">
                        <p className="text-slate-500 text-sm">No models added yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
            <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-xl text-white flex items-center gap-2">
                  <Lock className="w-5 h-5 text-cyan-400" />
                  Security
                </CardTitle>
                <CardDescription>Keep your account safe.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Email Address</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 flex items-center justify-between">
                      <span className="text-slate-200">{session?.user?.email}</span>
                      <button
                        onClick={() => handleToggleEmailVisibility(!(profile?.show_email ?? false))}
                        className={`text-xs font-medium px-2 py-1 rounded ${profile?.show_email ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-800 text-slate-400'}`}
                      >
                        {profile?.show_email ? "Publicly Visible" : "Hidden"}
                      </button>
                    </div>
                  </div>
                  <div className="pt-4 border-t border-slate-800">
                    <Button
                      onClick={handleResetPassword}
                      disabled={isLoading}
                      variant="destructive"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <Lock className="w-4 h-4 mr-2" />
                      Reset Password via Email
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-2xl bg-slate-900 border-slate-800 overflow-hidden">
            <CardHeader>
              <CardTitle className="text-white">Crop Profile Picture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="relative h-96 w-full rounded-xl overflow-hidden bg-black">
                <Cropper
                  image={selectedImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onCropComplete}
                />
              </div>
              <div className="flex gap-3 justify-end">
                <Button variant="ghost" onClick={() => setSelectedImage(null)}>Cancel</Button>
                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  className="bg-cyan-600 hover:bg-cyan-700 text-white"
                >
                  {isUploading ? "Uploading..." : "Save Picture"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Layout>
  );
}
