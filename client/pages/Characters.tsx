import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Plus, Trash2, Edit2, User, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface Character {
  id: string;
  name: string;
  image_url: string | null;
  short_description: string | null;
  appearance: string | null;
  personality: string | null;
  hidden_description: string | null;
  hidden_short_description: string | null;
  backstory: string | null;
}

export default function Characters() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCharacter, setCurrentCharacter] = useState<Partial<Character>>({});
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (session?.user) {
      fetchCharacters();
    }
  }, [session]);

  const fetchCharacters = async () => {
    try {
      const { data, error } = await supabase
        .from("characters")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setCharacters(data || []);
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

      const payload = {
        ...currentCharacter,
        user_id: session?.user.id,
      };

      if (currentCharacter.id) {
        const { error } = await supabase
          .from("characters")
          .update(payload)
          .eq("id", currentCharacter.id);
        if (error) throw error;
        toast({ title: "Success", description: "Character updated" });
      } else {
        const { error } = await supabase.from("characters").insert(payload);
        if (error) throw error;
        toast({ title: "Success", description: "Character created" });
      }

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
      const { error } = await supabase.from("characters").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Character deleted" });
      fetchCharacters();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      const fileExt = file.name.split(".").pop();
      const fileName = `${session?.user.id}/${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("Storage")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("Storage")
        .getPublicUrl(filePath);

      setCurrentCharacter(prev => ({ ...prev, image_url: publicUrl }));
      toast({ title: "Success", description: "Image uploaded" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white">Characters</h2>
            <p className="text-slate-400">Create and manage characters for your chats.</p>
          </div>
          <Dialog open={isEditing} onOpenChange={(open) => { setIsEditing(open); if (!open) setCurrentCharacter({}); }}>
            <DialogTrigger asChild>
              <Button className="bg-cyan-600 hover:bg-cyan-700">
                <Plus className="w-4 h-4 mr-2" />
                New Character
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-800 text-white">
              <DialogHeader>
                <DialogTitle>{currentCharacter.id ? "Edit Character" : "Create Character"}</DialogTitle>
                <DialogDescription className="text-slate-400">
                  Define your character's traits and backstory.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex gap-4">
                  <div className="w-24 h-24 bg-slate-800 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group border border-slate-700">
                    {currentCharacter.image_url ? (
                      <img src={currentCharacter.image_url} alt="Character" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-slate-600" />
                    )}
                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} disabled={uploading} />
                    {uploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-6 h-6 animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className="text-sm font-medium">Name</label>
                    <Input value={currentCharacter.name || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, name: e.target.value }))} placeholder="Character Name" className="bg-slate-800 border-slate-700" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Short Description</label>
                    <Input value={currentCharacter.short_description || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, short_description: e.target.value }))} placeholder="A one-line hook" className="bg-slate-800 border-slate-700" />
                  </div>
                  <div className="space-y-2 text-cyan-400">
                    <label className="text-sm font-medium">Hidden Short Description (Private)</label>
                    <Input value={currentCharacter.hidden_short_description || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, hidden_short_description: e.target.value }))} placeholder="Secret details..." className="bg-slate-800 border-cyan-900" />
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
                  <label className="text-sm font-medium">Hidden Description (Private)</label>
                  <Textarea value={currentCharacter.hidden_description || ""} onChange={e => setCurrentCharacter(prev => ({ ...prev, hidden_description: e.target.value }))} placeholder="Inner secrets not shared with LLM..." className="bg-slate-800 border-cyan-900 h-32" />
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
                    <h3 className="text-xl font-bold text-white truncate">{char.name}</h3>
                    <p className="text-sm text-slate-300 truncate">{char.short_description || "No description"}</p>
                  </div>
                </div>
                <CardContent className="p-4 flex gap-2">
                  <Button variant="secondary" className="flex-1 bg-slate-800 hover:bg-slate-700 text-white" onClick={() => { setCurrentCharacter(char); setIsEditing(true); }}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
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
