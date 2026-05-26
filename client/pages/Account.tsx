import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { Lock, Upload, Share2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import Cropper, { Area } from "react-easy-crop";

interface ProfilePicture {
  id: string;
  user_id?: string;
  image_url: string;
  crop_data: Area;
}

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

  useEffect(() => {
    const fetchProfilePicture = async () => {
      if (!session?.user?.id) return;
      const { data, error } = await supabase
        .from("profile_pictures")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (data && !error) {
        setProfilePicture(data);
      }
    };

    const fetchIdentities = async () => {
      const { data, error } = await supabase.auth.getUserIdentities();
      if (data && !error) {
        setIdentities(data.identities);
      }
    };

    fetchProfilePicture();
    fetchIdentities();
  }, [session]);

  const onCropComplete = useCallback((_sharedArea: Area, _croppedAreaPixels: Area) => {
    setCroppedArea(_croppedAreaPixels);
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const createCircleImage = async (imageSrc: string, pixelCrop: Area, imageElement: HTMLImageElement): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return new Blob();

    canvas.width = pixelCrop.width;
    canvas.height = pixelCrop.height;

    ctx.beginPath();
    ctx.arc(pixelCrop.width / 2, pixelCrop.height / 2, pixelCrop.width / 2, 0, Math.PI * 2);
    ctx.clip();

    const imgX = -pixelCrop.x;
    const imgY = -pixelCrop.y;

    ctx.drawImage(imageElement, imgX, imgY);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob || new Blob());
      }, "image/png");
    });
  };

  const handleDeleteProfilePicture = async () => {
    if (!profilePicture) return;

    setIsUploading(true);
    try {
      const fileName = profilePicture.image_url.split("/").pop();
      if (fileName) {
        await supabase.storage.from("Storage").remove([fileName]);
      }

      const { error } = await supabase
        .from("profile_pictures")
        .delete()
        .eq("user_id", session?.user?.id);

      if (error) throw error;

      toast({ title: "Success", description: "Profile picture deleted" });
      setProfilePicture(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete profile picture";
      toast({ title: "Error", description: message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveProfilePicture = async () => {
    if (!selectedImage || !croppedArea) {
      toast({ title: "Error", description: "Please crop an image first" });
      return;
    }

    setIsUploading(true);
    try {
      const oldFileName = profilePicture?.image_url.split("/").pop();

      const img = new Image();
      img.onload = async () => {
        const circleBlob = await createCircleImage(selectedImage, croppedArea, img);
        const fileName = `profile-${session?.user?.id}-${Date.now()}.png`;

        const { error: uploadError } = await supabase.storage
          .from("Storage")
          .upload(fileName, circleBlob, { upsert: true });

        if (uploadError) throw uploadError;

        if (oldFileName) {
          await supabase.storage.from("Storage").remove([oldFileName]);
        }

        const publicUrl = supabase.storage.from("Storage").getPublicUrl(fileName).data
          .publicUrl;

        const { error: dbError } = await supabase
          .from("profile_pictures")
          .upsert(
            {
              user_id: session?.user?.id,
              image_url: publicUrl,
              crop_data: croppedArea,
            },
            { onConflict: "user_id" }
          );

        if (dbError) throw dbError;

        toast({ title: "Success", description: "Profile picture updated" });
        setSelectedImage(null);
        setProfilePicture({ id: session?.user?.id || "", image_url: publicUrl, crop_data: croppedArea });
      };
      img.src = selectedImage;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save profile picture";
      toast({ title: "Error", description: message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!session?.user?.email) {
      toast({
        title: "Error",
        description: "No email found in session",
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Password reset link sent to your email",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send reset link";
      toast({
        title: "Error",
        description: message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLinkIdentity = async (provider: 'github' | 'discord') => {
    try {
      await linkIdentity(provider);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to link ${provider}`;
      toast({
        title: "Error",
        description: message,
      });
    }
  };

  const isLinked = (provider: string) => {
    return identities.some(id => id.provider === provider);
  };

  return (
    <Layout>
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold text-slate-100 mb-8">Account Settings</h2>

        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6 space-y-8">
          {/* Profile Picture Section */}
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-300">Profile Picture</label>

            {selectedImage ? (
              <div className="space-y-4">
                <div className="bg-slate-950 rounded-lg border border-slate-700 p-4">
                  <div className="relative w-full h-96 bg-slate-950">
                    <Cropper
                      image={selectedImage}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      cropShape="round"
                      showGrid={false}
                      onCropChange={setCrop}
                      onCropComplete={onCropComplete}
                      onZoomChange={setZoom}
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="block text-xs text-slate-400">Zoom</label>
                  <input
                    type="range"
                    min="1"
                    max="3"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSaveProfilePicture}
                    disabled={isUploading}
                    className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-cyan-500/30 transition duration-200 text-sm font-medium"
                  >
                    {isUploading ? "Saving..." : "Save Profile Picture"}
                  </button>
                  <button
                    onClick={() => setSelectedImage(null)}
                    disabled={isUploading}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-200 rounded-lg border border-slate-700 transition duration-200 text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {profilePicture?.image_url && (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-slate-700 bg-slate-950">
                      <img
                        src={profilePicture.image_url}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-sm text-slate-400">Current profile picture</p>
                    <div className="flex gap-3 w-full">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 px-4 py-2 bg-slate-950 hover:bg-slate-900 text-slate-200 rounded-lg border border-dashed border-slate-700 transition duration-200 text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Replace
                      </button>
                      <button
                        onClick={handleDeleteProfilePicture}
                        disabled={isUploading}
                        className="px-4 py-2 bg-red-600/10 hover:bg-red-600/20 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 rounded-lg border border-red-600/30 transition duration-200 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}

                {!profilePicture?.image_url && (
                  <>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full px-4 py-3 bg-slate-950 hover:bg-slate-900 text-slate-200 rounded-lg border border-dashed border-slate-700 transition duration-200 text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Choose Image
                    </button>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Social Accounts Section */}
          <div className="border-t border-slate-800 pt-8 space-y-4">
            <label className="block text-sm font-medium text-slate-300">Social Accounts</label>
            <p className="text-sm text-slate-400 mb-4">
              Link your social accounts to sign in more easily. Automatic linking is disabled for your security.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={() => handleLinkIdentity('github')}
                disabled={isLinked('github')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition duration-200 text-sm font-medium ${
                  isLinked('github')
                    ? "bg-green-500/10 border-green-500/30 text-green-400 cursor-default"
                    : "bg-slate-950 hover:bg-slate-900 border-slate-700 text-slate-200"
                }`}
              >
                <Share2 className="w-4 h-4" />
                {isLinked('github') ? "GitHub Linked" : "Link GitHub"}
              </button>
              <button
                onClick={() => handleLinkIdentity('discord')}
                disabled={isLinked('discord')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition duration-200 text-sm font-medium ${
                  isLinked('discord')
                    ? "bg-green-500/10 border-green-500/30 text-green-400 cursor-default"
                    : "bg-slate-950 hover:bg-slate-900 border-slate-700 text-slate-200"
                }`}
              >
                <Share2 className="w-4 h-4" />
                {isLinked('discord') ? "Discord Linked" : "Link Discord"}
              </button>
            </div>
          </div>

          {/* Email Section */}
          <div className="border-t border-slate-800 pt-8 space-y-3">
            <label className="block text-sm font-medium text-slate-300">Email Address</label>
            <div className="bg-slate-950 rounded-lg border border-slate-700 px-4 py-3">
              <p className="text-slate-200">{session?.user?.email || "Loading..."}</p>
            </div>
          </div>

          {/* Password Reset Section */}
          <div className="border-t border-slate-800 pt-8">
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">Password</label>
              <p className="text-sm text-slate-400">
                Update your password to keep your account secure.
              </p>
              <button
                onClick={handleResetPassword}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg border border-blue-500/30 transition duration-200 text-sm font-medium"
              >
                <Lock className="w-4 h-4" />
                {isLoading ? "Sending..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
