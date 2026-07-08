import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Users,
  UserPlus,
  UserMinus,
  UserCheck,
  UserX,
  Search,
  MoreVertical,
  ExternalLink,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface SocialProfile {
  user_id: string;
  username: string;
  display_name: string | null;
  image_url: string | null;
}

interface Friendship {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted";
  profile: SocialProfile;
}

export function FriendsApp() {
  const { session } = useAuth();
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<Friendship[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<Friendship[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [blocked, setBlocked] = useState<SocialProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("friends");
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    try {
      const [
        { data: fData },
        { data: folData },
        { data: ferData },
        { data: bData },
      ] = await Promise.all([
        supabase.rpc("get_my_friendships"),
        supabase
          .from("follows")
          .select(
            "id, following_id, profile:profiles!follows_following_id_fkey(*)",
          )
          .eq("follower_id", session.user.id),
        supabase
          .from("follows")
          .select(
            "id, follower_id, profile:profiles!follows_follower_id_fkey(*)",
          )
          .eq("following_id", session.user.id),
        supabase
          .from("blocks")
          .select("blocked_id, profile:profiles!blocks_blocked_id_fkey(*)")
          .eq("blocker_id", session.user.id),
      ]);

      if (fData) {
        setFriends(fData.filter((f: any) => f.status === "accepted"));
        setPendingIncoming(
          fData.filter(
            (f: any) =>
              f.status === "pending" && f.friend_id === session.user.id,
          ),
        );
        setPendingOutgoing(
          fData.filter(
            (f: any) => f.status === "pending" && f.user_id === session.user.id,
          ),
        );
      }
      if (folData)
        setFollowing(
          folData.map((f: any) => ({ id: f.id, profile: f.profile })),
        );
      if (ferData)
        setFollowers(
          ferData.map((f: any) => ({ id: f.id, profile: f.profile })),
        );
      if (bData) setBlocked(bData.map((b: any) => b.profile));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [session]);

  const handleSendRequest = async () => {
    if (!searchQuery.trim() || !session?.user?.id) return;
    try {
      // Find user by username
      const { data: targetUser, error: findError } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("username", searchQuery.trim().toLowerCase())
        .single();

      if (findError || !targetUser) {
        toast.error("User not found");
        return;
      }

      if (targetUser.user_id === session.user.id) {
        toast.error("You cannot add yourself");
        return;
      }

      const { error } = await supabase.from("friendships").insert({
        user_id: session.user.id,
        friend_id: targetUser.user_id,
        status: "pending",
      });

      if (error) throw error;
      toast.success("Friend request sent");
      setSearchQuery("");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleAcceptRequest = async (id: string) => {
    try {
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted" })
        .eq("id", id);
      if (error) throw error;
      toast.success("Friend request accepted");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteFriendship = async (id: string) => {
    try {
      const { error } = await supabase
        .from("friendships")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Success");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUnfollow = async (id: string) => {
    try {
      const { error } = await supabase.from("follows").delete().eq("id", id);
      if (error) throw error;
      toast.success("Unfollow");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleUnblock = async (id: string) => {
    if (!session?.user?.id) return;
    try {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", session.user.id)
        .eq("blocked_id", id);
      if (error) throw error;
      toast.success("User unblocked");
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

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
            onKeyDown={(e) => e.key === "Enter" && handleSendRequest()}
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
        <TabsList className="bg-slate-950 border border-slate-800 w-full justify-start overflow-x-auto h-auto flex-wrap">
          <TabsTrigger value="friends" className="flex gap-2">
            <Users className="w-4 h-4" /> Friends ({friends.length})
          </TabsTrigger>
          <TabsTrigger value="requests" className="flex gap-2">
            <UserPlus className="w-4 h-4" /> Requests (
            {pendingIncoming.length + pendingOutgoing.length})
          </TabsTrigger>
          <TabsTrigger value="following" className="flex gap-2">
            <UserCheck className="w-4 h-4" />
            Social
          </TabsTrigger>
          <TabsTrigger value="blocked" className="flex gap-2">
            <ShieldAlert className="w-4 h-4" />
            Blocked
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-400"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-slate-950 border-slate-800"
                      >
                        <DropdownMenuItem
                          asChild
                          className="text-slate-200 focus:bg-slate-900 focus:text-white"
                        >
                          <Link
                            to={`/users/${friend.profile.username}`}
                            className="flex items-center gap-2"
                          >
                            <ExternalLink className="w-4 h-4" />
                            View Profile
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-red-400 focus:bg-red-500/10 focus:text-red-400"
                          onClick={() => handleDeleteFriendship(friend.id)}
                        >
                          <UserMinus className="w-4 h-4 mr-2" />
                          Unfriend
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
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Incoming Requests
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingIncoming.length === 0 ? (
                <p className="text-slate-600 text-sm">
                  No incoming friend requests.
                </p>
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
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Sent Requests
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pendingOutgoing.length === 0 ? (
                <p className="text-slate-600 text-sm">
                  No outgoing friend requests.
                </p>
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
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Following
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {following.length === 0 ? (
                <p className="text-slate-600 text-sm">
                  You aren't following anyone.
                </p>
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
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              Followers
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {followers.length === 0 ? (
                <p className="text-slate-600 text-sm">
                  You don't have any followers yet.
                </p>
              ) : (
                followers.map((f) => (
                  <UserCard key={f.id} profile={f.profile} />
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="blocked" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {blocked.length === 0 ? (
              <p className="text-slate-600 py-8 text-center col-span-full">
                No blocked users.
              </p>
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

function UserCard({
  profile,
  action,
}: {
  profile: SocialProfile;
  action?: React.ReactNode;
}) {
  if (!profile) return null;

  return (
    <Card className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors">
      <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
        <Link
          to={`/users/${profile.username}`}
          className="flex items-center gap-3 group"
        >
          <Avatar className="h-10 w-10 border border-slate-700">
            <AvatarImage src={profile.image_url || undefined} />
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
