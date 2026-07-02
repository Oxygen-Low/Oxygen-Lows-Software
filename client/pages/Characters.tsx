import { StorageFileSelector } from "@/components/StorageFileSelector";
import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, User, Image as ImageIcon, Loader2, Edit2, Trash2 } from "lucide-react";
import { encrypt, decrypt, getMasterKey } from "@/lib/crypto";
import { UnlockModal } from "@/components/UnlockModal";

export default function Characters() {
    const { session } = useAuth();
  const { toast } = useToast();
  const [characters, setCharacters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedStoragePath, setSelectedStoragePath] = useState<string | null>(null);

  const [currentCharacter, setCurrentCharacter] = useState<any>({});
  const [isEncryptionEnabled, setIsEncryptionEnabled] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);


  const handleStorageSelect = async (file: any) => {
    setSelectedStoragePath(file.name);
    const { data } = await supabase.storage.from("Storage").createSignedUrl(file.name, 3600);
    if (data?.signedUrl) {
      setCurrentCharacter(prev => ({ ...prev, image_url: data.signedUrl, image_path: file.name }));
    }
  };

  useEffect(() => {
    if (session?.user.id) {
      checkEncryptionSettings();
    }
  }, [session]);

  const checkEncryptionSettings = async () => {
    const { data } = await supabase.from('user_preferences').select('encryption_settings').eq('user_id', session?.user.id).single();
    const enabled = data?.encryption_settings?.characters || false;
    setIsEncryptionEnabled(enabled);
    if (enabled && !getMasterKey()) {
      setShowUnlockModal(true);
    } else {
      fetchCharacters(enabled);
    }
  };

  const fetchCharacters = async (overrideEncryptionEnabled?: boolean) => {
    const encryptionEnabled = overrideEncryptionEnabled !== undefined ? overrideEncryptionEnabled : isEncryptionEnabled;
    try {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (encryptionEnabled) {
        const key = getMasterKey();
        if (!key) {
           setShowUnlockModal(true);
           return;
        }
        const decryptedData = await Promise.all((data || []).map(async (char) => {
          if (!char.is_encrypted) return char;
          try {
            return {
              ...char,
              name: await decrypt(char.name, key),
              short_description: char.short_description ? await decrypt(char.short_description, key) : null,
              display_name: char.display_name ? await decrypt(char.display_name, key) : null,
              appearance: char.appearance ? await decrypt(char.appearance, key) : null,
              personality: char.personality ? await decrypt(char.personality, key) : null,
              backstory: char.backstory ? await decrypt(char.backstory, key) : null,
              hidden_description: char.hidden_description ? await decrypt(char.hidden_description, key) : null,
            };
          } catch (e) {
            console.error("Failed to decrypt character", char.id, e);
            return { ...char, name: "[Encrypted]", is_corrupted: true };
          }
        }));
        const charsWithSignedUrls = await Promise.all((decryptedData || []).map(async (char) => { if (char.image_path) { const { data: urlData } = await supabase.storage.from("Storage").createSignedUrl(char.image_path, 3600).catch(() => ({ data: null })); if (urlData?.signedUrl) return { ...char, image_url: urlData.signedUrl }; else return { ...char, image_url: "" }; } return char; })); setCharacters(charsWithSignedUrls);
      } else {
        const charsWithSignedUrls = await Promise.all((data || []).map(async (char) => { if (char.image_path) { const { data: urlData } = await supabase.storage.from("Storage").createSignedUrl(char.image_path, 3600).catch(() => ({ data: null })); if (urlData?.signedUrl) return { ...char, image_url: urlData.signedUrl }; else return { ...char, image_url: "" }; } return char; })); setCharacters(charsWithSignedUrls);
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!currentCharacter.name) {
        toast({ title: "Error", description: "Name is required", variant: "destructive" });
        return;
      }

      let charData = {
        ...currentCharacter,
        user_id: session?.user.id,
      };

      if (isEncryptionEnabled) {
        const key = getMasterKey();
        if (!key) {
           setShowUnlockModal(true);
           return;
        }
        charData = {
          ...charData,
          name: await encrypt(charData.name, key),
          short_description: charData.short_description ? await encrypt(charData.short_description, key) : null,
          display_name: charData.display_name ? await encrypt(charData.display_name, key) : null,
          appearance: charData.appearance ? await encrypt(charData.appearance, key) : null,
          personality: charData.personality ? await encrypt(charData.personality, key) : null,
          backstory: charData.backstory ? await encrypt(charData.backstory, key) : null,
          hidden_description: charData.hidden_description ? await encrypt(charData.hidden_description, key) : null,
          is_encrypted: true
        };
      } else {
        charData.is_encrypted = false;
      }

      let error;
      if (currentCharacter.id) {
        const { error: updateError } = await supabase
          .from("characters")
          .update(charData)
          .eq("id", currentCharacter.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("characters")
          .insert([charData]);
        error = insertError;
      }

      if (error) throw error;

      toast({ title: "Success", description: currentCharacter.id ? "Character updated" : "Character created" });
      setIsEditing(false);
      setCurrentCharacter({});
      fetchCharacters();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this character?")) return;
    try {
      // Get character first to get image_path
      const { data: char, error: fetchError } = await supabase
        .from("characters")
        .select("image_path")
        .eq("id", id)
        .single();

      if (fetchError) throw fetchError;

      if (char?.image_path) {
        if (char.image_path.includes('..')) {
          throw new Error("Invalid file path");
        }
        const { error: storageError } = await supabase.storage
          .from("Storage")
          .remove([char.image_path]);
        if (storageError) console.error("Failed to delete character image:", storageError);
      }

      const { error } = await supabase.from("characters").delete().match({ id: id, user_id: session.user.id });
      if (error) throw error;
      toast({ title: "Success", description: "Character deleted" });
      fetchCharacters();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  return (
    <Layout>
      <UnlockModal isOpen={showUnlockModal} onClose={() => setShowUnlockModal(false)} onUnlock={() => { setShowUnlockModal(false); fetchCharacters(true); }} />
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">Characters</h2>
            <p className="text-slate-400">Create and manage characters for your chats.</p>
          </div>
          <Dialog open={isEditing} onOpenChange={(open) => { setIsEditing(open); if (!open) setCurrentCharacter({}); }}>
            <DialogTrigger asChild>
              <Button className="bg-cyan-600 hover:bg-cyan-700">
                <Plus className="w-4 h-4 mr-2" />New Character</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
              <DialogHeader>
                <DialogTitle>{currentCharacter.id ? "Edit Character" : "Create Character"}</DialogTitle>
                <DialogDescription className="text-slate-400">Define your character's traits and backstory.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex gap-4">
                  <div className="w-24 h-24 bg-slate-800 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group border border-slate-700">
                    {currentCharacter.image_url ? (
                      <img src={currentCharacter.image_url} alt="Character" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    )}
                    <StorageFileSelector
                      onSelect={handleStorageSelect}
                      allowedTypes={["image"]}
                      trigger={
                        <button className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" aria-label="Select character image" />
                      }
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input value={currentCharacter.name || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, name: e.target.value }))} placeholder="Character name" className="bg-slate-800 border-slate-700" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Short Description</label>
                    <Input value={currentCharacter.short_description || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, short_description: e.target.value }))} placeholder="A one-line hook" className="bg-slate-800 border-slate-700" />
                  </div>
                  <div className="space-y-2 text-cyan-400">
                    <label className="text-sm font-medium">Display Name</label>
                    <Input value={currentCharacter.display_name || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, display_name: e.target.value }))} placeholder="For organizing characters..." className="bg-slate-800 border-cyan-900" />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Appearance</label>
                  <Textarea value={currentCharacter.appearance || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, appearance: e.target.value }))} placeholder="What do they look like?" className="bg-slate-800 border-slate-700 h-20" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Personality</label>
                  <Textarea value={currentCharacter.personality || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, personality: e.target.value }))} placeholder="How do they act?" className="bg-slate-800 border-slate-700 h-20" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Backstory</label>
                  <Textarea value={currentCharacter.backstory || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, backstory: e.target.value }))} placeholder="Their history and origins..." className="bg-slate-800 border-slate-700 h-32" />
                </div>

                <div className="space-y-2 text-cyan-400">
                  <label className="text-sm font-medium">Private Notes</label>
                  <Textarea value={currentCharacter.hidden_description || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, hidden_description: e.target.value }))} placeholder="Write notes for yourself here..." className="bg-slate-800 border-cyan-900 h-32" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditing(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800">Cancel</Button>
                <Button onClick={handleSave} className="bg-cyan-600 hover:bg-cyan-700">Save Character</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-cyan-500" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters.map((char) => (
              <Card key={char.id} className="bg-slate-900/50 border-slate-800 overflow-hidden hover:border-cyan-500/50 transition-colors group">
                <div className="aspect-square bg-slate-800 relative overflow-hidden">
                  {char.image_url ? (
                    <img src={char.image_url} alt={char.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-700"><User className="w-16 h-16" /></div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <h3 className="text-xl font-bold text-white truncate">{char.display_name || char.name}</h3>
                    <p className="text-sm text-slate-300 truncate">{char.short_description || "No description"}</p>
                  </div>
                </div>
                <CardContent className="p-4 flex gap-2">
                  <Button variant="secondary" className="flex-1 bg-slate-800 hover:bg-slate-700 text-white" onClick={() => { setCurrentCharacter(char); setIsEditing(true); }}>
                    <Edit2 className="w-4 h-4 mr-2" />Edit</Button>
                  <Button variant="destructive" size="icon" onClick={() => handleDelete(char.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
            {characters.length === 0 && (
              <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl">
                <p className="text-slate-500">No characters created yet. Click "New Character" to begin.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
