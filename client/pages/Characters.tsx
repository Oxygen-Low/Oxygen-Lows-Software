import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import {
  User,
  Plus,
  Edit2,
  Trash2,
  Image as ImageIcon,
  Loader2,
  Lock,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { StorageFileSelector } from "@/components/StorageFileSelector";
import { decrypt, encrypt, getMasterKey } from "@/lib/crypto";
import { EncryptionUnlockModal } from "@/components/EncryptionUnlockModal";

interface Character {
  id: string;
  user_id: string;
  name: string;
  short_description: string | null;
  display_name: string | null;
  image_path: string | null;
  image_url: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  hidden_description: string | null;
  is_encrypted: boolean;
  is_corrupted?: boolean;
  is_universe?: boolean;
}

export default function Characters() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeTab, setActiveTab] = useState<"characters" | "universes">(
    "characters",
  );
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState<Partial<Character>>(
    {},
  );
  const [showEncryptionUnlockModal, setShowEncryptionUnlockModal] =
    useState(false);

  useEffect(() => {
    fetchInitialData();
  }, [session?.user?.id]);

  const fetchInitialData = async () => {
    if (!session?.user?.id) return;
    try {
      fetchCharacters();
    } catch (err) {
      console.error("Error fetching characters", err);
      setLoading(false);
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

  const fetchCharacters = async () => {
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
              console.error("Failed to decrypt character", char.id, e);
              return {
                ...char,
                name: "[Encrypted]",
                display_name: "[Encrypted]",
                short_description: "[Encrypted]",
                appearance: "[Encrypted]",
                personality: "[Encrypted]",
                backstory: "[Encrypted]",
                hidden_description: "[Encrypted]",
                is_corrupted: true,
                is_universe: char.is_universe,
              };
            }
          }),
        );
      }
      const charsWithUrls = await attachSignedImageUrls(processedData);
      setCharacters(charsWithUrls);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!session?.user?.id) return;
    try {
      const payload = {
        user_id: session.user.id,
        name: currentCharacter.name,
        short_description: currentCharacter.short_description,
        display_name: currentCharacter.display_name,
        appearance: currentCharacter.appearance,
        personality: currentCharacter.personality,
        backstory: currentCharacter.backstory,
        hidden_description: currentCharacter.hidden_description,
        image_path: currentCharacter.image_path,
        is_encrypted: false,
        is_universe: currentCharacter.is_universe || false,
      };

      if (currentCharacter.id) {
        const { error } = await supabase
          .from("characters")
          .update(payload)
          .eq("id", currentCharacter.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("characters").insert(payload);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: currentCharacter.is_universe
          ? "Universe saved successfully"
          : "Character saved successfully",
      });
      setIsEditing(false);
      fetchCharacters();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!session?.user?.id) return;
    if (!confirm("Are you sure you want to delete this character?")) return;
    try {
      const { error } = await supabase
        .from("characters")
        .delete()
        .match({ id, user_id: session.user.id });
      if (error) throw error;

      setCharacters(characters.filter((c) => c.id !== id));
      toast({ title: "Character deleted" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleStorageSelect = async (file: any) => {
    const safeName = file.name.replace(/\.\.\//g, "");
    setCurrentCharacter((prev) => ({
      ...prev,
      image_path: safeName,
    }));
    const { data } = await supabase.storage
      .from("Storage")
      .createSignedUrl(safeName, 3600);
    if (data?.signedUrl) {
      setCurrentCharacter((prev) => ({
        ...prev,
        image_url: data.signedUrl,
      }));
    }
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <EncryptionUnlockModal
          isOpen={showEncryptionUnlockModal}
          onClose={() => setShowEncryptionUnlockModal(false)}
          onUnlock={() => {
            setShowEncryptionUnlockModal(false);
            fetchInitialData();
          }}
        />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex gap-4 items-center">
              <button
                onClick={() => setActiveTab("characters")}
                className={`text-3xl font-bold tracking-tight transition-colors ${activeTab === "characters" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                My Characters
              </button>
              <button
                onClick={() => setActiveTab("universes")}
                className={`text-3xl font-bold tracking-tight transition-colors ${activeTab === "universes" ? "text-white" : "text-slate-500 hover:text-slate-300"}`}
              >
                My Universes
              </button>
            </div>
            <p className="text-slate-400 mt-1"></p>
          </div>
          <Dialog
            open={isEditing}
            onOpenChange={(open) => {
              setIsEditing(open);
              if (!open) setCurrentCharacter({});
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-cyan-600 hover:bg-cyan-700">
                <Plus className="w-4 h-4 mr-2" />
                {activeTab === "characters" ? "New Character" : "New Universe"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
              <DialogHeader>
                <DialogTitle>
                  {currentCharacter.id
                    ? `Edit ${currentCharacter.is_universe ? "Universe" : "Character"}`
                    : `Create ${activeTab === "characters" ? "Character" : "Universe"}`}
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  {currentCharacter.is_universe || activeTab === "universes"
                    ? "Tell us a bit about your new universe and its lore."
                    : "Tell us a bit about your character and what makes them unique."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id="is_universe"
                    checked={currentCharacter.is_universe || false}
                    onChange={(e) =>
                      setCurrentCharacter((prev) => ({
                        ...prev,
                        is_universe: e.target.checked,
                      }))
                    }
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-cyan-600 focus:ring-cyan-500 focus:ring-offset-slate-900"
                  />
                  <label
                    htmlFor="is_universe"
                    className="text-sm font-medium text-slate-300"
                  >
                    This is a Universe (setting/lore)
                  </label>
                </div>
                <div className="flex gap-4">
                  <div className="w-24 h-24 bg-slate-800 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group border border-slate-700">
                    {currentCharacter.image_url ? (
                      <img
                        src={currentCharacter.image_url}
                        alt="Character"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    )}
                    <StorageFileSelector
                      onSelect={handleStorageSelect}
                      allowedTypes={["image"]}
                      trigger={
                        <button
                          type="button"
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                          aria-label="Select character image"
                        />
                      }
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label htmlFor="char-name" className="text-sm font-medium">
                      Name
                    </label>
                    <Input
                      id="char-name"
                      value={currentCharacter.name || ""}
                      onChange={(e) =>
                        setCurrentCharacter((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
                      }
                      placeholder="Character name"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="char-short-desc"
                      className="text-sm font-medium"
                    >
                      Short Description
                    </label>
                    <Input
                      id="char-short-desc"
                      value={currentCharacter.short_description || ""}
                      onChange={(e) =>
                        setCurrentCharacter((prev) => ({
                          ...prev,
                          short_description: e.target.value,
                        }))
                      }
                      placeholder="A one-line hook"
                      className="bg-slate-800 border-slate-700"
                    />
                  </div>
                  <div className="space-y-2 text-cyan-400">
                    <label
                      htmlFor="char-display-name"
                      className="text-sm font-medium"
                    >
                      Display Name
                    </label>
                    <Input
                      id="char-display-name"
                      value={currentCharacter.display_name || ""}
                      onChange={(e) =>
                        setCurrentCharacter((prev) => ({
                          ...prev,
                          display_name: e.target.value,
                        }))
                      }
                      placeholder="For organizing characters..."
                      className="bg-slate-800 border-cyan-900"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="char-appearance"
                    className="text-sm font-medium"
                  >
                    Appearance
                  </label>
                  <Textarea
                    id="char-appearance"
                    value={currentCharacter.appearance || ""}
                    onChange={(e) =>
                      setCurrentCharacter((prev) => ({
                        ...prev,
                        appearance: e.target.value,
                      }))
                    }
                    placeholder="What do they look like?"
                    className="bg-slate-800 border-slate-700 h-20"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="char-personality"
                    className="text-sm font-medium"
                  >
                    Personality
                  </label>
                  <Textarea
                    id="char-personality"
                    value={currentCharacter.personality || ""}
                    onChange={(e) =>
                      setCurrentCharacter((prev) => ({
                        ...prev,
                        personality: e.target.value,
                      }))
                    }
                    placeholder="How do they act?"
                    className="bg-slate-800 border-slate-700 h-20"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="char-backstory"
                    className="text-sm font-medium"
                  >
                    Backstory
                  </label>
                  <Textarea
                    id="char-backstory"
                    value={currentCharacter.backstory || ""}
                    onChange={(e) =>
                      setCurrentCharacter((prev) => ({
                        ...prev,
                        backstory: e.target.value,
                      }))
                    }
                    placeholder="Their history and origins..."
                    className="bg-slate-800 border-slate-700 h-32"
                  />
                </div>

                <div className="space-y-2 text-cyan-400">
                  <label
                    htmlFor="char-hidden-desc"
                    className="text-sm font-medium"
                  >
                    Private Notes
                  </label>
                  <Textarea
                    id="char-hidden-desc"
                    value={currentCharacter.hidden_description || ""}
                    onChange={(e) =>
                      setCurrentCharacter((prev) => ({
                        ...prev,
                        hidden_description: e.target.value,
                      }))
                    }
                    placeholder="Write notes for yourself here..."
                    className="bg-slate-800 border-cyan-900 h-32"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  className="bg-cyan-600 hover:bg-cyan-700"
                >
                  Save {currentCharacter.is_universe ? "Universe" : "Character"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters
              .filter((c) =>
                activeTab === "characters" ? !c.is_universe : c.is_universe,
              )
              .map((char) => (
                <Card
                  key={char.id}
                  className="bg-slate-900/50 border-slate-800 overflow-hidden hover:border-cyan-500/50 transition-colors group"
                >
                  <div className="aspect-square bg-slate-800 relative overflow-hidden">
                    {char.image_url ? (
                      <img
                        src={char.image_url}
                        alt={char.name}
                        className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-700">
                        {char.is_universe ? (
                          <Globe className="w-16 h-16" />
                        ) : (
                          <User className="w-16 h-16" />
                        )}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                      <h3 className="text-xl font-bold text-white truncate">
                        {char.display_name || char.name}
                      </h3>
                      <p className="text-sm text-slate-300 truncate">
                        {char.short_description || "No description"}
                      </p>
                    </div>
                  </div>
                  <CardContent className="p-4 flex gap-2">
                    <Button
                      variant="secondary"
                      className="flex-1 bg-slate-800 hover:bg-slate-700 text-white"
                      onClick={() => {
                        setCurrentCharacter(char);
                        setIsEditing(true);
                      }}
                    >
                      <Edit2 className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => handleDelete(char.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            {characters.filter((c) =>
              activeTab === "characters" ? !c.is_universe : c.is_universe,
            ).length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-500">
                  {activeTab === "characters"
                    ? 'No characters here yet! Click "New Character" to get started and add some to your collection.'
                    : 'No universes here yet! Click "New Universe" to start building your own world.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
