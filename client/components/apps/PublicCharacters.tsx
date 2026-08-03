import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  Loader2,
  Download,
  Upload,
  Heart,
  Globe,
  User,
  Search,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { decrypt, getMasterKey } from "@/lib/crypto";
import { EncryptionUnlockModal } from "@/components/EncryptionUnlockModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PublicCharacter {
  id: string;
  uploader_id: string;
  original_character_id: string | null;
  name: string;
  display_name: string | null;
  image_url: string | null;
  image_path: string | null;
  short_description: string | null;
  appearance: string | null;
  personality: string | null;
  hidden_description: string | null;
  backstory: string | null;
  is_universe: boolean;
  downloads: number;
  created_at: string;
  author_username?: string;
  likes_count: number;
  is_liked_by_user: boolean;
}

interface LocalCharacter {
  id: string;
  name: string;
  display_name: string | null;
  is_universe: boolean;
  is_encrypted: boolean;
  short_description: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  hidden_description: string | null;
  image_path: string | null;
}

type SortOption = "most_liked" | "most_recent" | "most_downloaded";

export function PublicCharactersApp() {
  const { session } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"characters" | "universes">(
    "characters",
  );
  const [sortBy, setSortBy] = useState<SortOption>("most_recent");
  const [searchQuery, setSearchQuery] = useState("");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PublicCharacter[]>([]);

  const [localCharacters, setLocalCharacters] = useState<LocalCharacter[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedLocalCharId, setSelectedLocalCharId] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  const [selectedItem, setSelectedItem] = useState<PublicCharacter | null>(
    null,
  );
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [showEncryptionUnlockModal, setShowEncryptionUnlockModal] =
    useState(false);

  useEffect(() => {
    fetchData();
  }, [session?.user?.id]);

  const fetchData = async () => {
    if (!session?.user?.id) return;
    try {
      setLoading(true);
      // Fetch public characters without join
      const { data: pubData, error: pubError } = await supabase
        .from("public_characters")
        .select("*");
        
      if (pubError) throw pubError;

      // Fetch profiles manually to avoid schema cache relationship issues
      const uploaderIds = [...new Set(pubData.map((p: any) => p.uploader_id))].filter(Boolean);
      let profilesData: any[] = [];
      if (uploaderIds.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, username")
          .in("user_id", uploaderIds);
        if (data) profilesData = data;
      }

      // Fetch likes count
      const { data: likesData, error: likesError } = await supabase
        .from("public_character_likes")
        .select("public_character_id, user_id");

      if (likesError) throw likesError;

      const itemsWithLikes = pubData.map((item: any) => {
        const itemLikes = likesData.filter((l: any) => l.public_character_id === item.id);
        const isLiked = itemLikes.some((l: any) => l.user_id === session.user.id);
        const profile = profilesData?.find((p: any) => p.user_id === item.uploader_id);
        
        return {
          ...item,
          author_username: profile?.username || "Unknown",
          likes_count: itemLikes.length,
          is_liked_by_user: isLiked
        };
      });

      const charsWithUrls = await attachSignedImageUrls(itemsWithLikes);
      setItems(charsWithUrls);

      fetchLocalCharacters();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchLocalCharacters = async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      let processedData = data || [];
      const hasEncrypted = processedData.some((c) => c.is_encrypted);

      if (hasEncrypted) {
        const key = getMasterKey();
        if (!key) {
          setShowEncryptionUnlockModal(true);
          return;
        }
        processedData = await Promise.all(
          processedData.map(async (char) => {
            if (!char.is_encrypted) return char;
            try {
              return {
                ...char,
                name: await decrypt(char.name, key),
                short_description: char.short_description
                  ? await decrypt(char.short_description, key)
                  : null,
                display_name: char.display_name
                  ? await decrypt(char.display_name, key)
                  : null,
                appearance: char.appearance
                  ? await decrypt(char.appearance, key)
                  : null,
                personality: char.personality
                  ? await decrypt(char.personality, key)
                  : null,
                backstory: char.backstory
                  ? await decrypt(char.backstory, key)
                  : null,
                hidden_description: char.hidden_description
                  ? await decrypt(char.hidden_description, key)
                  : null,
              };
            } catch (e) {
              return {
                ...char,
                name: "[Encrypted]",
                display_name: "[Encrypted]",
              };
            }
          }),
        );
      }
      setLocalCharacters(processedData);
    } catch (err: any) {
      console.error(err);
    }
  };

  const attachSignedImageUrls = async (chars: any[]) => {
    return Promise.all(
      (chars || []).map(async (char) => {
        if (char.image_path) {
          if (char.image_path.includes("..")) return { ...char, image_url: "" };
          const { data: urlData } = await supabase.storage
            .from("Storage")
            .createSignedUrl(char.image_path, 3600)
            .catch(() => ({ data: null }));
          if (urlData?.signedUrl)
            return { ...char, image_url: urlData.signedUrl };
          else return { ...char, image_url: "" };
        }
        return char;
      }),
    );
  };

  const handleLike = async (item: PublicCharacter, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!session?.user?.id) return;

    const isLiking = !item.is_liked_by_user;

    // Optimistic update
    setItems(
      items.map((i) => {
        if (i.id === item.id) {
          return {
            ...i,
            is_liked_by_user: isLiking,
            likes_count: i.likes_count + (isLiking ? 1 : -1),
          };
        }
        return i;
      }),
    );

    try {
      if (isLiking) {
        await supabase.from("public_character_likes").insert({
          user_id: session.user.id,
          public_character_id: item.id,
        });
      } else {
        await supabase
          .from("public_character_likes")
          .delete()
          .match({ user_id: session.user.id, public_character_id: item.id });
      }
    } catch (err) {
      console.error(err);
      fetchData(); // Revert on error
    }
  };

  const handleDownload = async (item: PublicCharacter) => {
    if (!session?.user?.id) return;
    try {
      const payload = {
        user_id: session.user.id,
        name: item.name,
        short_description: item.short_description,
        display_name: item.display_name,
        appearance: item.appearance,
        personality: item.personality,
        backstory: item.backstory,
        hidden_description: item.hidden_description,
        image_path: item.image_path,
        is_encrypted: false,
        is_universe: item.is_universe,
      };

      const { error } = await supabase.from("characters").insert(payload);
      if (error) throw error;

      // Increment downloads count
      await supabase.rpc("increment_public_character_downloads", {
        character_id: item.id,
      });

      toast({
        title: "Success",
        description: "Added to your collection successfully!",
      });
      setDetailsDialogOpen(false);
      fetchData(); // Refresh to get updated downloads count
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const handleUpload = async () => {
    if (!session?.user?.id || !selectedLocalCharId) return;

    const charToUpload = localCharacters.find(
      (c) => c.id === selectedLocalCharId,
    );
    if (!charToUpload) return;

    // Check if it's encrypted and not fully decrypted properly
    if (charToUpload.name === "[Encrypted]") {
      toast({
        title: "Error",
        description:
          "Cannot upload an encrypted character. Please unlock first.",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      const payload = {
        uploader_id: session.user.id,
        original_character_id: charToUpload.id,
        name: charToUpload.name,
        short_description: charToUpload.short_description,
        display_name: charToUpload.display_name,
        appearance: charToUpload.appearance,
        personality: charToUpload.personality,
        backstory: charToUpload.backstory,
        hidden_description: charToUpload.hidden_description,
        image_path: charToUpload.image_path,
        is_universe: charToUpload.is_universe || false,
      };

      const { error } = await supabase
        .from("public_characters")
        .insert(payload);
      if (error) throw error;

      toast({ title: "Success", description: "Successfully published!" });
      setUploadDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const filteredItems = useMemo(() => {
    let filtered = items.filter((item) => {
      const matchesTab =
        activeTab === "characters" ? !item.is_universe : item.is_universe;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.author_username?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesSearch;
    });

    switch (sortBy) {
      case "most_liked":
        filtered.sort((a, b) => b.likes_count - a.likes_count);
        break;
      case "most_downloaded":
        filtered.sort((a, b) => b.downloads - a.downloads);
        break;
      case "most_recent":
      default:
        filtered.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        break;
    }

    return filtered;
  }, [items, activeTab, sortBy, searchQuery]);

  return (
    <div className="w-full max-w-6xl mx-auto">
      <EncryptionUnlockModal
        isOpen={showEncryptionUnlockModal}
        onClose={() => setShowEncryptionUnlockModal(false)}
        onUnlock={() => {
          setShowEncryptionUnlockModal(false);
          fetchLocalCharacters();
        }}
      />

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="w-[400px]"
        >
          <TabsList className="bg-slate-900 border border-slate-800">
            <TabsTrigger
              value="characters"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400"
            >
              Characters
            </TabsTrigger>
            <TabsTrigger
              value="universes"
              className="data-[state=active]:bg-slate-800 data-[state=active]:text-white text-slate-400"
            >
              Universes
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-900 border-slate-800 text-white"
            />
          </div>

          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as SortOption)}
          >
            <SelectTrigger className="w-[180px] bg-slate-900 border-slate-800 text-white">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                <SelectValue placeholder="Sort by" />
              </div>
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800 text-white">
              <SelectItem value="most_recent">Most Recent</SelectItem>
              <SelectItem value="most_liked">Most Liked</SelectItem>
              <SelectItem value="most_downloaded">Most Downloaded</SelectItem>
            </SelectContent>
          </Select>

          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-cyan-600 hover:bg-cyan-700">
                <Upload className="w-4 h-4 mr-2" />
                Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-white">
              <DialogHeader>
                <DialogTitle>Publish to Public Hub</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Select one of your existing {activeTab} to publish for
                  everyone to see and download.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <Select
                  value={selectedLocalCharId}
                  onValueChange={setSelectedLocalCharId}
                >
                  <SelectTrigger className="w-full bg-slate-800 border-slate-700 text-white">
                    <SelectValue
                      placeholder={`Select a ${activeTab === "characters" ? "character" : "universe"}`}
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700 text-white">
                    {localCharacters
                      .filter((c) =>
                        activeTab === "characters"
                          ? !c.is_universe
                          : c.is_universe,
                      )
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.display_name || c.name}
                        </SelectItem>
                      ))}
                    {localCharacters.filter((c) =>
                      activeTab === "characters"
                        ? !c.is_universe
                        : c.is_universe,
                    ).length === 0 && (
                      <div className="p-2 text-sm text-slate-500 text-center">
                        No {activeTab} found in your collection.
                      </div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setUploadDialogOpen(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpload}
                  disabled={!selectedLocalCharId || uploading}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  Publish
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <Card
              key={item.id}
              className="bg-slate-900/50 border-slate-800 overflow-hidden hover:border-cyan-500/50 transition-colors cursor-pointer group"
              onClick={() => {
                setSelectedItem(item);
                setDetailsDialogOpen(true);
              }}
            >
              <div className="aspect-video bg-slate-800 relative overflow-hidden">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    {item.is_universe ? (
                      <Globe className="w-16 h-16" />
                    ) : (
                      <User className="w-16 h-16" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-transparent" />

                <div className="absolute top-3 right-3 flex flex-col gap-2">
                  <button
                    onClick={(e) => handleLike(item, e)}
                    className="p-2 rounded-full bg-slate-900/60 backdrop-blur-sm border border-slate-800 hover:bg-slate-800 transition-colors flex flex-col items-center gap-1"
                  >
                    <Heart
                      className={`w-5 h-5 ${item.is_liked_by_user ? "fill-pink-500 text-pink-500" : "text-white"}`}
                    />
                  </button>
                </div>

                <div className="absolute bottom-4 left-4 right-4">
                  <h3 className="text-xl font-bold text-white truncate">
                    {item.display_name || item.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                      @{item.author_username}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                      <Download className="w-3 h-3" /> {item.downloads}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                      <Heart className="w-3 h-3" /> {item.likes_count}
                    </span>
                  </div>
                </div>
              </div>
              <CardContent className="p-4">
                <p className="text-sm text-slate-300 line-clamp-2">
                  {item.short_description || "No description provided."}
                </p>
              </CardContent>
            </Card>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
              <p className="text-slate-500">
                No public {activeTab} found. Be the first to upload one!
              </p>
            </div>
          )}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col bg-slate-900 border-slate-800 text-white p-0 overflow-hidden">
          {selectedItem && (
            <>
              <div className="h-48 relative bg-slate-800 shrink-0">
                {selectedItem.image_url ? (
                  <img
                    src={selectedItem.image_url}
                    alt={selectedItem.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-700">
                    {selectedItem.is_universe ? (
                      <Globe className="w-16 h-16" />
                    ) : (
                      <User className="w-16 h-16" />
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                  <h2 className="text-3xl font-bold">
                    {selectedItem.display_name || selectedItem.name}
                  </h2>
                  <p className="text-slate-300 mt-1">
                    Uploaded by @{selectedItem.author_username}
                  </p>
                </div>
              </div>

              <ScrollArea className="flex-1 p-6">
                <div className="space-y-6">
                  {selectedItem.short_description && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-1">
                        Short Description
                      </h4>
                      <p className="text-slate-200">
                        {selectedItem.short_description}
                      </p>
                    </div>
                  )}
                  {selectedItem.appearance && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-1">
                        Appearance
                      </h4>
                      <p className="text-slate-200 whitespace-pre-wrap">
                        {selectedItem.appearance}
                      </p>
                    </div>
                  )}
                  {selectedItem.personality && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-1">
                        Personality
                      </h4>
                      <p className="text-slate-200 whitespace-pre-wrap">
                        {selectedItem.personality}
                      </p>
                    </div>
                  )}
                  {selectedItem.backstory && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-400 mb-1">
                        Backstory
                      </h4>
                      <p className="text-slate-200 whitespace-pre-wrap">
                        {selectedItem.backstory}
                      </p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="p-4 border-t border-slate-800 flex justify-between items-center bg-slate-900 shrink-0">
                <div className="flex gap-4 text-sm text-slate-400">
                  <span className="flex items-center gap-1">
                    <Download className="w-4 h-4" /> {selectedItem.downloads}{" "}
                    Downloads
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="w-4 h-4" /> {selectedItem.likes_count}{" "}
                    Likes
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDetailsDialogOpen(false)}
                    className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handleDownload(selectedItem)}
                    className="bg-cyan-600 hover:bg-cyan-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download to Collection
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
