import { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { toast } from "@/hooks/use-toast";
import { Lock, Upload } from "lucide-react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

interface CropData {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ProfilePicture {
  id: string;
  image_url: string;
  crop_data: CropData | null;
}

export default function Account() {
  const { session } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [profilePicture, setProfilePicture] = useState<ProfilePicture | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<CropData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session?.user?.id) {
      fetchProfilePicture();
    }
  }, [session?.user?.id]);

  const fetchProfilePicture = async () => {
    try {
      const { data, error } = await supabase
        .from("profile_pictures")
        .select("*")
        .eq("user_id", session?.user?.id)
        .single();

      if (data) {
        setProfilePicture(data);
      } else if (error?.code !== "PGRST116") {
        console.error("Error fetching profile picture:", error);
      }
    } catch (err) {
      console.error("Failed to fetch profile picture:", err);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = (_croppedArea: any, croppedAreaPixels: CropData) => {
    setCroppedArea(croppedAreaPixels);
  };

  const createCircleImage = async (
    imageSrc: string,
    cropData: CropData,
    imageElement: HTMLImageElement
  ): Promise<Blob> => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get canvas context");

    const diameter = Math.min(cropData.width, cropData.height);
    canvas.width = diameter;
    canvas.height = diameter;

    ctx.beginPath();
    ctx.arc(diameter / 2, diameter / 2, diameter / 2, 0, Math.PI * 2);
    ctx.clip();

    const x = Math.round(cropData.x);
    const y = Math.round(cropData.y);
    const imgX = -x;
    const imgY = -y;

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
