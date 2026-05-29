import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  ShieldAlert,
  ShieldCheck,
  Loader2,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [friendship, setFriendship] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [stats, setStats] = useState({ followers: 0, following: 0, friends: 0 });
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchProfile(controller.signal);
    return () => controller.abort();
  }, [username]);

  const fetchProfile = async (signal: AbortSignal) => {
    if (!username) return;
    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (signal.aborted) return;
      setCurrentUser(user);

      const { data, error: profileError } = await supabase
        .from("user_profiles")
        .select("user_id, username, display_name, bio, email, show_email")
        .eq("username", username)
        .single();

      if (signal.aborted) return;

      if (profileError || !data) {
        setError("User not found");
        setIsLoading(false);
        return;
      }

      setProfile(data);

      // Fetch profile picture
      const { data: pictureData } = await supabase
        .from("profile_pictures")
        .select("image_url")
        .eq("user_id", data.user_id)
        .single<ProfilePicture>();

      if (signal.aborted) return;
      setProfilePicture(pictureData?.image_url ?? null);

      if (user && user.id !== data.user_id) {
        // Fetch relationship status
        const [friendData, followData, blockData] = await Promise.all([
          supabase.from("friendships")
            .select("*")
            .or(`and(user_id.eq.${user.id},friend_id.eq.${data.user_id}),and(user_id.eq.${data.user_id},friend_id.eq.${user.id})`)
            .single(),
          supabase.from("follows")
            .select("*")
            .eq("follower_id", user.id)
            .eq("following_id", data.user_id)
            .single(),
          supabase.from("blocks")
            .select("*")
            .eq("blocker_id", user.id)
            .eq("blocked_id", data.user_id)
            .single()
        ]);

        if (signal.aborted) return;
        setFriendship(friendData.data);
        setIsFollowing(!!followData.data);
        setIsBlocked(!!blockData.data);
      }

      // Fetch stats
      const [followersCount, followingCount, friendsCount] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", data.user_id),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", data.user_id),
        supabase.from("friendships").select("*", { count: "exact", head: true }).eq("status", "accepted")
          .or(`user_id.eq.${data.user_id},friend_id.eq.${data.user_id}`)
      ]);

      if (signal.aborted) return;
      setStats({
        followers: followersCount.count || 0,
        following: followingCount.count || 0,
        friends: friendsCount.count || 0
      });
    } catch (e) {
      if (!signal.aborted) {
        console.error("Error fetching profile:", e);
        setError("Failed to load profile");
      }
    } finally {
      if (!signal.aborted) {
        setIsLoading(false);
      }
    }
  };

  const handleFriendAction = async () => {
    if (!currentUser || !profile) return;
    setActionLoading(true);

    try {
      if (!friendship) {
        const { data, error } = await supabase
          .from("friendships")
          .insert({ user_id: currentUser.id, friend_id: profile.user_id, status: 'pending' })
          .select()
          .single();
        if (error) {
          toast.error("Failed to send friend request: " + error.message);
          return;
        }
        setFriendship(data);
        toast.success("Friend request sent!");
      } else if (friendship.status === 'pending' && friendship.friend_id === currentUser.id) {
        const { data, error } = await supabase
          .from("friendships")
          .update({ status: 'accepted' })
          .eq("id", friendship.id)
          .select()
          .single();
        if (error) {
          toast.error("Failed to accept friend request: " + error.message);
          return;
        }
        setFriendship(data);
        toast.success("Friend request accepted!");
        setStats(s => ({ ...s, friends: s.friends + 1 }));
      } else {
        const { error } = await supabase
          .from("friendships")
          .delete()
          .eq("id", friendship.id);
        if (error) {
          toast.error("Failed to remove friendship: " + error.message);
          return;
        }
        const wasAccepted = friendship.status === 'accepted';
        setFriendship(null);
        toast.success(wasAccepted ? "Unfriended user" : "Request cancelled");
        if (wasAccepted) setStats(s => ({ ...s, friends: Math.max(0, s.friends - 1) }));
      }
    } catch (e: any) {
      toast.error("An unexpected error occurred: " + e.message);
      throw e;
    } finally {
      setActionLoading(false);
    }
  };

  const handleFollowAction = async () => {
    if (!currentUser || !profile) return;
    setActionLoading(true);

    try {
      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentUser.id)
          .eq("following_id", profile.user_id);
        if (error) {
          toast.error("Failed to unfollow: " + error.message);
          return;
        }
        setIsFollowing(false);
        setStats(s => ({ ...s, followers: Math.max(0, s.followers - 1) }));
        toast.success("Unfollowed user");
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({ follower_id: currentUser.id, following_id: profile.user_id });
        if (error) {
          toast.error("Failed to follow: " + error.message);
          return;
        }
        setIsFollowing(true);
        setStats(s => ({ ...s, followers: s.followers + 1 }));
        toast.success("Following user");
      }
    } catch (e: any) {
      toast.error("An unexpected error occurred: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBlockAction = async () => {
    if (!currentUser || !profile) return;
    setActionLoading(true);

    try {
      if (isBlocked) {
        const { error } = await supabase
          .from("blocks")
          .delete()
          .eq("blocker_id", currentUser.id)
          .eq("blocked_id", profile.user_id);
        if (error) {
          toast.error("Failed to unblock: " + error.message);
          return;
        }
        setIsBlocked(false);
        toast.success("User unblocked");
      } else {
        // Start block transaction
        const { error: blockError } = await supabase
          .from("blocks")
          .insert({ blocker_id: currentUser.id, blocked_id: profile.user_id });

        if (blockError) {
          toast.error("Failed to block user: " + blockError.message);
          return;
        }

        // Also unfollow and unfriend if blocking - do these concurrently
        await Promise.all([
          supabase.from("follows").delete().eq("follower_id", currentUser.id).eq("following_id", profile.user_id),
          supabase.from("follows").delete().eq("follower_id", profile.user_id).eq("following_id", currentUser.id),
          supabase.from("friendships")
            .delete()
            .or(`and(user_id.eq.${currentUser.id},friend_id.eq.${profile.user_id}),and(user_id.eq.${profile.user_id},friend_id.eq.${currentUser.id})`)
        ]);

        setIsBlocked(true);
        setIsFollowing(false);
        setFriendship(null);
        toast.success("User blocked");
      }
    } catch (e: any) {
      toast.error("An unexpected error occurred: " + e.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-8">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
            <p className="text-slate-400">Loading profile...</p>
          </div>
        ) : error || !profile ? (
          <div className="text-center py-12">
            <p className="text-red-400 text-lg">{error ?? "User not found"}</p>
            <Button variant="link" onClick={() => window.history.back()} className="text-slate-500">
              Go Back
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-8 shadow-xl backdrop-blur-sm">
              <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
                <div className="relative group">
                  <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-slate-800 bg-slate-950 flex items-center justify-center shadow-2xl">
                    {profilePicture ? (
                      <img
                        src={profilePicture}
                        alt={`${profile.display_name} profile`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Users className="w-12 h-12 text-slate-700" />
                    )}
                  </div>
                </div>

                <div className="flex-1 text-center md:text-left space-y-4">
                  <div>
                    <h2 className="text-3xl font-bold text-white mb-1">{profile.display_name}</h2>
                    <p className="text-cyan-500 font-medium">@{profile.username}</p>
                    {profile.show_email && profile.email && (
                      <p className="text-slate-500 text-sm mt-1">{profile.email}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-center md:justify-start gap-6 py-2">
                    <div className="text-center md:text-left">
                      <p className="text-white font-bold text-lg">{stats.friends}</p>
                      <p className="text-slate-500 text-xs uppercase tracking-wider">Friends</p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-white font-bold text-lg">{stats.followers}</p>
                      <p className="text-slate-500 text-xs uppercase tracking-wider">Followers</p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-white font-bold text-lg">{stats.following}</p>
                      <p className="text-slate-500 text-xs uppercase tracking-wider">Following</p>
                    </div>
                  </div>

                  {currentUser && currentUser.id !== profile.user_id && (
                    <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2">
                      <Button
                        onClick={handleFriendAction}
                        disabled={actionLoading}
                        className={cn(
                          "min-w-[120px]",
                          friendship?.status === 'accepted'
                            ? "bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-200"
                            : "bg-cyan-600 hover:bg-cyan-700 text-white"
                        )}
                      >
                        {actionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : !friendship ? (
                          <><UserPlus className="w-4 h-4 mr-2" /> Add Friend</>
                        ) : friendship.status === 'pending' ? (
                          friendship.user_id === currentUser.id
                            ? <><UserX className="w-4 h-4 mr-2" /> Cancel Request</>
                            : <><UserCheck className="w-4 h-4 mr-2" /> Accept</>
                        ) : (
                          <><UserMinus className="w-4 h-4 mr-2" /> Unfriend</>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={handleFollowAction}
                        disabled={actionLoading}
                        className={cn(
                          "min-w-[120px] border-slate-700",
                          isFollowing ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30" : "text-slate-300"
                        )}
                      >
                        {isFollowing ? "Following" : "Follow"}
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleBlockAction}
                        disabled={actionLoading}
                        className={cn(
                          "h-10 w-10",
                          isBlocked ? "text-red-500 bg-red-500/10" : "text-slate-500 hover:text-red-400 hover:bg-red-400/10"
                        )}
                        title={isBlocked ? "Unblock" : "Block"}
                      >
                        {isBlocked ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-800/50">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Bio</h3>
                <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                  <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {profile.bio || "This user hasn't written a bio yet."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
