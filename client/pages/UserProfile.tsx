import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import {
  Users,
  Loader2,
  UserPlus,
  UserMinus,
  UserX,
  UserCheck,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function UserProfile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useAuth();
  const currentUser = session?.user;

  const [profile, setProfile] = useState<any>(null);
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [friendship, setFriendship] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    friends: 0,
    followers: 0,
    following: 0,
  });

  useEffect(() => {
    if (!username) return;
    fetchProfile();
  }, [username, currentUser]);

  const fetchProfile = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch basic profile info
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, display_name, username, bio, show_email, email")
        .eq("username", username)
        .single();

      if (profileError) {
        if (profileError.code === "PGRST116") {
          setError("No items");
        } else {
          setError(profileError.message);
        }
        return;
      }

      // Fetch user preferences (for profile picture path)
      const { data: prefData } = await supabase
        .from("user_preferences")
        .select("profile_picture_path")
        .eq("user_id", profileData.user_id)
        .single();

      const combinedProfile = {
        ...profileData,
        profile_picture_path: prefData?.profile_picture_path,
      };

      setProfile(combinedProfile);

      if (combinedProfile.profile_picture_path) {
        const { data } = await supabase.storage
          .from("Storage")
          .createSignedUrl(combinedProfile.profile_picture_path, 3600);
        if (data?.signedUrl) setProfilePicture(data.signedUrl);
      }

      // Fetch stats
      const [friendsRes, followersRes, followingRes] = await Promise.all([
        supabase
          .from("friendships")
          .select("count")
          .eq("status", "accepted")
          .or(
            `user_id.eq.${profileData.user_id},friend_id.eq.${profileData.user_id}`,
          ),
        supabase
          .from("follows")
          .select("count")
          .eq("following_id", profileData.user_id),
        supabase
          .from("follows")
          .select("count")
          .eq("follower_id", profileData.user_id),
      ]);

      setStats({
        friends: (friendsRes.data as any)?.[0]?.count || 0,
        followers: (followersRes.data as any)?.[0]?.count || 0,
        following: (followingRes.data as any)?.[0]?.count || 0,
      });

      if (currentUser && currentUser.id !== profileData.user_id) {
        // Fetch relations
        const [friendshipRes, followingStatus, blockStatus] = await Promise.all(
          [
            supabase
              .from("friendships")
              .select("*")
              .or(
                `and(user_id.eq.${currentUser.id},friend_id.eq.${profileData.user_id}),and(user_id.eq.${profileData.user_id},friend_id.eq.${currentUser.id})`,
              )
              .maybeSingle(),
            supabase
              .from("follows")
              .select("*")
              .eq("follower_id", currentUser.id)
              .eq("following_id", profileData.user_id)
              .maybeSingle(),
            supabase
              .from("blocks")
              .select("*")
              .eq("blocker_id", currentUser.id)
              .eq("blocked_id", profileData.user_id)
              .maybeSingle(),
          ],
        );

        setFriendship(friendshipRes.data);
        setIsFollowing(!!followingStatus.data);
        setIsBlocked(!!blockStatus.data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFriendAction = async () => {
    if (!currentUser || !profile) return;
    setActionLoading(true);

    try {
      if (!friendship) {
        const { data, error } = await supabase
          .from("friendships")
          .insert({
            user_id: currentUser.id,
            friend_id: profile.user_id,
            status: "pending",
          })
          .select()
          .limit(1)
          .maybeSingle();
        if (error) {
          toast.error("Failed to send friend request: " + error.message);
          return;
        }
        setFriendship(data);
        toast.success("Friend request sent");
      } else if (
        friendship.status === "pending" &&
        friendship.friend_id === currentUser.id
      ) {
        const { data, error } = await supabase
          .from("friendships")
          .update({ status: "accepted" })
          .eq("id", friendship.id)
          .select()
          .limit(1)
          .maybeSingle();
        if (error) {
          toast.error("Failed to accept friend request: " + error.message);
          return;
        }
        setFriendship(data);
        toast.success("Accept Request");
        setStats((s) => ({ ...s, friends: s.friends + 1 }));
      } else {
        const { error } = await supabase
          .from("friendships")
          .delete()
          .eq("id", friendship.id);
        if (error) {
          toast.error("Failed to remove friendship: " + error.message);
          return;
        }
        const wasAccepted = friendship.status === "accepted";
        setFriendship(null);
        toast.success(wasAccepted ? "Unfriended user" : "Cancel Request");
        if (wasAccepted)
          setStats((s) => ({ ...s, friends: Math.max(0, s.friends - 1) }));
      }
    } catch (e: any) {
      toast.error("An unexpected error occurred: " + e.message);
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
        setStats((s) => ({ ...s, followers: Math.max(0, s.followers - 1) }));
        toast.success("Unfollow");
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({
            follower_id: currentUser.id,
            following_id: profile.user_id,
          });
        if (error) {
          toast.error("Failed to follow: " + error.message);
          return;
        }
        setIsFollowing(true);
        setStats((s) => ({ ...s, followers: s.followers + 1 }));
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

        // Use RPC for privileged cleanup of relations
        const { error: cleanupError } = await supabase.rpc(
          "handle_block_cleanup",
          {
            p_blocker_id: currentUser.id,
            p_blocked_id: profile.user_id,
          },
        );

        if (cleanupError) {
          toast.error(
            "Failed to cleanup relations after block: " + cleanupError.message,
          );
          return;
        }

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
            <p className="text-slate-400">Loading...</p>
          </div>
        ) : error || !profile ? (
          <div className="text-center py-12">
            <p className="text-red-400 text-lg">{error ?? "No items"}</p>
            <Button
              variant="link"
              onClick={() => navigate(-1)}
              className="text-slate-500"
            >
              Back
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
                    <h2 className="text-3xl font-bold text-white mb-1">
                      {profile.display_name}
                    </h2>
                    <p className="text-cyan-500 font-medium">
                      @{profile.username}
                    </p>
                    {profile.show_email && profile.email && (
                      <p className="text-slate-500 text-sm mt-1">
                        {profile.email}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-center md:justify-start gap-6 py-2">
                    <div className="text-center md:text-left">
                      <p className="text-white font-bold text-lg">
                        {stats.friends}
                      </p>
                      <p className="text-slate-500 text-xs uppercase tracking-wider">
                        Friends
                      </p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-white font-bold text-lg">
                        {stats.followers}
                      </p>
                      <p className="text-slate-500 text-xs uppercase tracking-wider">
                        Followers
                      </p>
                    </div>
                    <div className="text-center md:text-left">
                      <p className="text-white font-bold text-lg">
                        {stats.following}
                      </p>
                      <p className="text-slate-500 text-xs uppercase tracking-wider">
                        Following
                      </p>
                    </div>
                  </div>

                  {currentUser && currentUser.id !== profile.user_id && (
                    <div className="flex flex-wrap justify-center md:justify-start gap-3 pt-2">
                      <Button
                        onClick={handleFriendAction}
                        disabled={actionLoading}
                        className={cn(
                          "min-w-[120px]",
                          friendship?.status === "accepted"
                            ? "bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-200"
                            : "bg-cyan-600 hover:bg-cyan-700 text-white",
                        )}
                      >
                        {actionLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : !friendship ? (
                          <>
                            <UserPlus className="w-4 h-4 mr-2" />
                            Add Friend
                          </>
                        ) : friendship.status === "pending" ? (
                          friendship.user_id === currentUser.id ? (
                            <>
                              <UserX className="w-4 h-4 mr-2" />
                              Cancel Request
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-4 h-4 mr-2" />
                              Accept Request
                            </>
                          )
                        ) : (
                          <>
                            <UserMinus className="w-4 h-4 mr-2" />
                            Unfriend
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={handleFollowAction}
                        disabled={actionLoading}
                        className={cn(
                          "min-w-[120px] border-slate-700",
                          isFollowing
                            ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                            : "text-slate-300",
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
                          isBlocked
                            ? "text-red-500 bg-red-500/10"
                            : "text-slate-500 hover:text-red-400 hover:bg-red-400/10",
                        )}
                        title={isBlocked ? "Unblock" : "Blocked"}
                      >
                        {isBlocked ? (
                          <ShieldCheck className="w-5 h-5" />
                        ) : (
                          <ShieldAlert className="w-5 h-5" />
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-800/50">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Bio
                </h3>
                <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                  <p className="text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {profile.bio ||
                      "This user hasn't written a bio yet." ||
                      "This user hasn't written a bio yet."}
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
