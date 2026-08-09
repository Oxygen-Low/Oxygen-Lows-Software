import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import {
  Lock,
  Upload,
  Share2,
  Cpu,
  Plus,
  Trash2,
  ChevronRight,
  Maximize,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
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
  const [userModels, setUserModels] = useState<UserModel[]>([]);
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
    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("custom_models")
      .eq("user_id", session.user.id)
      .single();
    if (prefs) {
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
            <TabsTrigger value="models">Models</TabsTrigger>
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
                  Choose how others see your email
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



          <TabsContent value="models" className="space-y-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardContent className="pt-6 space-y-6">
                <div className="flex gap-3">
                  <select
                    value={selectedProviderForModel}
                    onChange={(e) =>
                      setSelectedProviderForModel(e.target.value)
                    }
                    aria-label="Select Model Provider"
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
                    aria-label="Model ID"
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
                        className="p-2 text-slate-500 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100 opacity-100 focus:opacity-100 focus-visible:opacity-100 transition-opacity"
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
                  <Label
                    htmlFor="zoom-input"
                    className="text-xs text-slate-400"
                  >
                    Zoom
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
