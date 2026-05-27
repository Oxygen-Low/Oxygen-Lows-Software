import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { supabase } from "@/lib/supabase";

interface UserProfileData {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  email: string | null;
  show_email: boolean;
}

interface ProfilePicture {
  image_url: string;
}

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!username) return;
      setIsLoading(true);
      setError(null);

      const { data, error: profileError } = await supabase
        .from("user_profiles")
        .select("user_id, username, display_name, bio, email, show_email")
        .eq("username", username)
        .single();

      if (profileError || !data) {
        setError("User not found");
        setIsLoading(false);
        return;
      }

      setProfile(data);

      const { data: pictureData } = await supabase
        .from("profile_pictures")
        .select("image_url")
        .eq("user_id", data.user_id)
        .single<ProfilePicture>();

      setProfilePicture(pictureData?.image_url ?? null);
      setIsLoading(false);
    };

    fetchProfile();
  }, [username]);

  return (
    <Layout>
      <div className="max-w-2xl">
        {isLoading ? (
          <p className="text-slate-400">Loading profile...</p>
        ) : error || !profile ? (
          <p className="text-red-400">{error ?? "User not found"}</p>
        ) : (
          <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-slate-700 bg-slate-950 flex items-center justify-center">
                {profilePicture ? (
                  <img
                    src={profilePicture}
                    alt={`${profile.display_name} profile`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-slate-500 text-xs">No Image</span>
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-100">{profile.display_name}</h2>
                <p className="text-slate-400">@{profile.username}</p>
                {profile.show_email && profile.email && (
                  <p className="text-slate-400 text-sm">{profile.email}</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-300 mb-2">Bio</h3>
              <p className="text-slate-300 whitespace-pre-wrap">{profile.bio || "No bio provided."}</p>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
