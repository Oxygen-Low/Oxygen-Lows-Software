import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  Search,
  ShieldAlert,
  Loader2,
  MoreVertical,
  ExternalLink
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SocialProfile {
  user_id: string;
  username: string;
  display_name: string;
  bio?: string;
  image_url?: string;
}

interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: 'pending' | 'accepted';
  profile: SocialProfile;
}

interface Follow {
  id: string;
  follower_id: string;
  following_id: string;
  profile: SocialProfile;
}

export function FriendsApp() {
  const [activeTab, setActiveTab] = useState("friends");
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<Friendship[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<Friendship[]>([]);
  const [following, setFollowing] = useState<Follow[]>([]);
  const [followers, setFollowers] = useState<Follow[]>([]);
  const [blocked, setBlocked] = useState<SocialProfile[]>([]);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUser(user);
    if (user) {
      await Promise.all([
        fetchFriends(user.id),
        fetchFollows(user.id),
        fetchBlocked(user.id)
      ]);
    }
    setLoading(false);
  };

  const fetchFriends = async (userId: string) => {
    const { data, error } = await supabase
      .from("friendships")
      .select(`
        id,
        user_id,
        friend_id,
        status,
        sender:user_profiles!friendships_user_id_fkey(user_id, username, display_name),
        receiver:user_profiles!friendships_friend_id_fkey(user_id, username, display_name)
      `);

    if (error) {
      toast.error("Failed to fetch friends");
      return;
    }

    const friendsList: Friendship[] = [];
    const incoming: Friendship[] = [];
    const outgoing: Friendship[] = [];

    (data || []).forEach((f: any) => {
      const isSender = f.user_id === userId;
      const profileData = isSender ? f.receiver : f.sender;

      if (!profileData) return;

      const friendship: Friendship = {
        id: f.id,
        user_id: f.user_id,
        friend_id: f.friend_id,
        status: f.status,
        profile: {
          user_id: profileData.user_id,
          username: profileData.username,
          display_name: profileData.display_name
        }
      };

      if (f.status === 'accepted') {
        friendsList.push(friendship);
      } else if (isSender) {
        outgoing.push(friendship);
      } else {
        incoming.push(friendship);
      }
    });

    setFriends(friendsList);
    setPendingIncoming(incoming);
    setPendingOutgoing(outgoing);
  };

  const fetchFollows = async (userId: string) => {
    const { data: followingData } = await supabase
      .from("follows")
      .select(`
        id,
        follower_id,
        following_id,
        profile:user_profiles!follows_following_id_fkey(user_id, username, display_name)
      `)
      .eq("follower_id", userId);

    const { data: followersData } = await supabase
      .from("follows")
      .select(`
        id,
        follower_id,
        following_id,
        profile:user_profiles!follows_follower_id_fkey(user_id, username, display_name)
      `)
      .eq("following_id", userId);

    const mapFollow = (f: any): Follow => ({
      id: f.id,
      follower_id: f.follower_id,
      following_id: f.following_id,
      profile: f.profile
    });

    setFollowing((followingData || []).map(mapFollow));
    setFollowers((followersData || []).map(mapFollow));
  };

  const fetchBlocked = async (userId: string) => {
    const { data } = await supabase
      .from("blocks")
      .select(`
        blocked_id,
        profile:user_profiles!blocks_blocked_id_fkey(user_id, username, display_name)
      `)
      .eq("blocker_id", userId);

    setBlocked((data || []).map(b => b.profile));
  };

  const handleSendRequest = async () => {
    if (!searchQuery.trim()) return;

    const { data: profile, error: searchError } = await supabase
      .from("user_profiles")
      .select("user_id, username")
      .eq("username", searchQuery.toLowerCase())
      .single();

    if (searchError || !profile) {
      toast.error("User not found");
      return;
    }

    if (profile.user_id === currentUser.id) {
      toast.error("You cannot friend yourself");
      return;
    }

    const { error } = await supabase
      .from("friendships")
      .insert({
        user_id: currentUser.id,
        friend_id: profile.user_id,
        status: 'pending'
      });

    if (error) {
      toast.error(error.message.includes("unique") ? "Request already exists" : "Failed to send request");
    } else {
      toast.success("Friend request sent!");
      setSearchQuery("");
      fetchFriends(currentUser.id);
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    const { error } = await supabase
      .from("friendships")
      .update({ status: 'accepted' })
      .eq("id", friendshipId);

    if (error) {
      toast.error("Failed to accept request");
    } else {
      toast.success("Friend request accepted!");
      fetchFriends(currentUser.id);
    }
  };

  const handleDeleteFriendship = async (friendshipId: string) => {
    const { error } = await supabase
      .from("friendships")
      .delete()
      .eq("id", friendshipId);

    if (error) {
      toast.error("Operation failed");
    } else {
      toast.success("Friendship/Request removed");
      fetchFriends(currentUser.id);
    }
  };

  const handleUnfollow = async (followId: string) => {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("id", followId);

    if (error) {
      toast.error("Failed to unfollow");
    } else {
      toast.success("Unfollowed user");
      fetchFollows(currentUser.id);
    }
  };

  const handleUnblock = async (blockedId: string) => {
    const { error } = await supabase
      .from("blocks")
      .delete()
      .eq("blocker_id", currentUser.id)
      .eq("blocked_id", blockedId);

    if (error) {
      toast.error("Failed to unblock");
    } else {
      toast.success("User unblocked");
      fetchBlocked(currentUser.id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search by username..."
            className="pl-10 bg-slate-950 border-slate-800 text-white"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendRequest()}
          />
          <Button
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-8 bg-cyan-600 hover:bg-cyan-700 text-white"
            onClick={handleSendRequest}
          >
            Add
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-950 border border-slate-800 w-full justify-start overflow-x-auto">
          <TabsTrigger value="friends" className="flex gap-2">
            <Users className="w-4 h-4" /> Friends ({friends.length})
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex gap-2">
            <UserPlus className="w-4 h-4" /> Requests ({pendingIncoming.length + pendingOutgoing.length})
          </TabsTrigger>
          <TabsTrigger value="following" className="flex gap-2">
            <UserCheck className="w-4 h-4" /> Social
          </TabsTrigger>
          <TabsTrigger value="blocked" className="flex gap-2">
            <ShieldAlert className="w-4 h-4" /> Blocked
          </TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {friends.length === 0 ? (
              <p className="text-slate-500 col-span-full py-8 text-center bg-slate-900/30 rounded-lg border border-dashed border-slate-800">
                You haven't added any friends yet.
              </p>
            ) : (
              friends.map((friend) => (
                <UserCard
                  key={friend.id}
                  profile={friend.profile}
                  action={
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-slate-950 border-slate-800">
                        <DropdownMenuItem asChild className="text-slate-200 focus:bg-slate-900 focus:text-white">
                          <Link to={`/users/${friend.profile.username}`} className="flex items-center gap-2">
                            <ExternalLink className="w-4 h-4" /> View Profile
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                          onClick={() => handleDeleteFriendship(friend.id)}
                        >
                          <UserMinus className="w-4 h-4 mr-2" /> Unfriend
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="requests" className="mt-6 space-y-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Incoming Requests</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingIncoming.length === 0 ? (
                <p className="text-slate-600 text-sm">No incoming requests.</p>
              ) : (
                pendingIncoming.map((req) => (
                  <UserCard
                    key={req.id}
                    profile={req.profile}
                    action={
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-500 hover:text-green-400 hover:bg-green-500/10"
                          onClick={() => handleAcceptRequest(req.id)}
                        >
                          <UserCheck className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
                          onClick={() => handleDeleteFriendship(req.id)}
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                      </div>
                    }
                  />
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Sent Requests</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingOutgoing.length === 0 ? (
                <p className="text-slate-600 text-sm">No outgoing requests.</p>
              ) : (
                pendingOutgoing.map((req) => (
                  <UserCard
                    key={req.id}
                    profile={req.profile}
                    action={
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-500 hover:text-red-400"
                        onClick={() => handleDeleteFriendship(req.id)}
                      >
                        Cancel
                      </Button>
                    }
                  />
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="following" className="mt-6 space-y-8">
           <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Following</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {following.length === 0 ? (
                <p className="text-slate-600 text-sm">You are not following anyone.</p>
              ) : (
                following.map((f) => (
                  <UserCard
                    key={f.id}
                    profile={f.profile}
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-slate-800 hover:bg-slate-900 text-slate-300"
                        onClick={() => handleUnfollow(f.id)}
                      >
                        Unfollow
                      </Button>
                    }
                  />
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Followers</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {followers.length === 0 ? (
                <p className="text-slate-600 text-sm">You don't have any followers yet.</p>
              ) : (
                followers.map((f) => (
                  <UserCard
                    key={f.id}
                    profile={f.profile}
                  />
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="blocked" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {blocked.length === 0 ? (
              <p className="text-slate-600 py-8 text-center col-span-full">No blocked users.</p>
            ) : (
              blocked.map((p) => (
                <UserCard
                  key={p.user_id}
                  profile={p}
                  action={
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-400 border-red-400/20 hover:bg-red-400/10"
                      onClick={() => handleUnblock(p.user_id)}
                    >
                      Unblock
                    </Button>
                  }
                />
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function UserCard({ profile, action }: { profile: SocialProfile, action?: React.ReactNode }) {
  if (!profile) return null;

  return (
    <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
      <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
        <Link to={`/users/${profile.username}`} className="flex items-center gap-3 group">
          <Avatar className="h-10 w-10 border border-slate-700">
            <AvatarImage src={profile.image_url} />
            <AvatarFallback className="bg-slate-800 text-slate-400">
              {profile.username?.substring(0, 2).toUpperCase() || "??"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">
              {profile.display_name}
            </span>
            <span className="text-xs text-slate-500">@{profile.username}</span>
          </div>
        </Link>
        {action}
      </CardHeader>
    </Card>
  );
}
