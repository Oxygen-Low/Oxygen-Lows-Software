import { useState, useEffect } from "react";
import {
  Save,
  Trash2,
  Database,
  Search,
  Loader2,
  KeyRound,
  FileText,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export function DataSaveApp() {
  const { session } = useAuth();
  const [keyName, setKeyName] = useState("");
  const [content, setContent] = useState("");
  const [saves, setSaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchSaves = async () => {
    if (!session?.user?.id) return;
    setFetching(true);
    try {
      const { data, error } = await supabase
        .from("data_saves")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setSaves(data || []);
    } catch (error: any) {
      console.error("Error fetching data saves:", error);
      toast.error(error.message || "Failed to load saved data");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchSaves();
  }, [session]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim() || !content.trim()) {
      toast.error("Please provide both a key/name and content");
      return;
    }

    setLoading(true);
    try {
      // Check if it exists
      const existing = saves.find(s => s.key_name === keyName);
      
      let error;
      if (existing) {
        const { error: updateError } = await supabase
          .from("data_saves")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("data_saves")
          .insert({
            user_id: session?.user?.id,
            key_name: keyName,
            content,
          });
        error = insertError;
      }

      if (error) throw error;
      
      toast.success("Data saved successfully!");
      setKeyName("");
      setContent("");
      fetchSaves();
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save data");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("data_saves")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      
      toast.success("Data deleted successfully");
      fetchSaves();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete data");
    }
  };

  const filteredSaves = saves.filter(s => 
    s.key_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-cyan-500" />
              Save New Data
            </CardTitle>
            <CardDescription className="text-slate-400">
              Store arbitrary data, tokens, or notes with a key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-cyan-500" />
                  Key / Name
                </label>
                <Input
                  placeholder="e.g. API_KEY_GITHUB or Note Title"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-500" />
                  Content
                </label>
                <Textarea
                  placeholder="Enter the contents you want to save..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white min-h-[150px] font-mono text-sm"
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !keyName.trim() || !content.trim()}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4 mr-2" />
                    Save Data
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800 h-full flex flex-col">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5 text-cyan-500" />
                Saved Data
              </div>
            </CardTitle>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search keys or content..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 bg-slate-950 border-slate-800 text-white"
              />
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            {fetching ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin mb-4 text-cyan-500" />
                Loading your data...
              </div>
            ) : filteredSaves.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <Database className="w-12 h-12 opacity-20 mb-4" />
                <p>No data found.</p>
              </div>
            ) : (
              <ScrollArea className="h-[400px] px-6 pb-6">
                <div className="space-y-4">
                  {filteredSaves.map((save) => (
                    <div
                      key={save.id}
                      className="p-4 bg-slate-950 rounded-xl border border-slate-800 group"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <h4 className="font-medium text-white flex items-center gap-2">
                          <KeyRound className="w-4 h-4 text-cyan-500" />
                          {save.key_name}
                        </h4>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(save.id)}
                          className="h-8 w-8 text-slate-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="bg-slate-900 rounded-md p-3 relative group/content">
                        <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all max-h-32 overflow-hidden overflow-y-auto">
                          {save.content}
                        </pre>
                        <Button
                           variant="secondary"
                           size="sm"
                           className="absolute top-2 right-2 opacity-0 group-hover/content:opacity-100 transition-opacity text-[10px] h-6"
                           onClick={() => {
                             navigator.clipboard.writeText(save.content);
                             toast.success("Copied to clipboard!");
                           }}
                        >
                          Copy
                        </Button>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">
                        Updated: {new Date(save.updated_at).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
