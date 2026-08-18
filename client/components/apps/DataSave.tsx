import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Save,
  Trash2,
  Database,
  Search,
  Loader2,
  KeyRound,
  FileText,
  Tag,
  Filter,
  Pencil,
  Plus,
  Copy,
  Code,
  List,
  X,
  Sparkles,
  RotateCcw,
  Check,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { EncryptionRequiredPrompt } from "@/components/EncryptionRequiredPrompt";
import {
  isCategoryLocked,
  isCategoryEncryptionEnabled,
  getActiveMasterKey,
  encryptDataSaveData,
  decryptDataSaveData,
  encryptDataSaveCategoryData,
  decryptDataSaveCategoryData,
} from "@/lib/crypto";

interface KeyValuePair {
  id: string;
  key: string;
  value: string;
}

interface DataSaveRecord {
  id: string;
  user_id: string;
  key_name: string;
  content: string;
  category_id: string | null;
  category?: {
    id: string;
    name: string;
  } | null;
  created_at: string;
  updated_at: string;
}

interface CategoryRecord {
  id: string;
  name: string;
}

const generateRowId = () =>
  Math.random().toString(36).substring(2, 9) + Date.now().toString(36);

function parseJsonToKvPairs(raw: string): { isJson: boolean; pairs: KeyValuePair[] } {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const pairs = Object.entries(parsed).map(([k, v]) => ({
        id: generateRowId(),
        key: k,
        value: typeof v === "object" ? JSON.stringify(v) : String(v),
      }));
      return {
        isJson: true,
        pairs: pairs.length > 0 ? pairs : [{ id: generateRowId(), key: "", value: "" }],
      };
    }
  } catch {
    // Not valid JSON object
  }
  return { isJson: false, pairs: [{ id: generateRowId(), key: "", value: "" }] };
}

function kvPairsToJsonString(pairs: KeyValuePair[]): string {
  const obj: Record<string, any> = {};
  pairs.forEach((pair) => {
    const k = pair.key.trim();
    if (k) {
      try {
        const parsedVal = JSON.parse(pair.value);
        obj[k] = parsedVal;
      } catch {
        obj[k] = pair.value;
      }
    }
  });
  return JSON.stringify(obj, null, 2);
}

export function DataSaveApp() {
  const { session } = useAuth();

  // Main Left Form State
  const [keyName, setKeyName] = useState("");
  const [content, setContent] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [formKvPairs, setFormKvPairs] = useState<KeyValuePair[]>([
    { id: generateRowId(), key: "", value: "" },
  ]);
  const [formEditorTab, setFormEditorTab] = useState<"raw" | "kv">("raw");
  const [editingFormSaveId, setEditingFormSaveId] = useState<string | null>(null);
  const [editingFormOriginalKey, setEditingFormOriginalKey] = useState<string>("");

  // Data State
  const [saves, setSaves] = useState<DataSaveRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);

  // Edit Modal State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSave, setEditingSave] = useState<DataSaveRecord | null>(null);
  const [editKeyName, setEditKeyName] = useState("");
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editKvPairs, setEditKvPairs] = useState<KeyValuePair[]>([]);
  const [editEditorTab, setEditEditorTab] = useState<"raw" | "kv">("raw");
  const [dialogSaving, setDialogSaving] = useState(false);
  const [encryptionLocked, setEncryptionLocked] = useState(() => isCategoryLocked("data_save"));

  useEffect(() => {
    setEncryptionLocked(isCategoryLocked("data_save"));
  }, []);

  const handleUnlocked = () => {
    setEncryptionLocked(false);
    fetchData();
  };

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;
    setFetching(true);
    try {
      const [savesRes, catsRes] = await Promise.all([
        supabase
          .from("data_saves")
          .select("*, category:category_id(*)")
          .order("updated_at", { ascending: false }),
        supabase
          .from("data_save_categories")
          .select("*")
          .order("name", { ascending: true }),
      ]);

      if (savesRes.error) throw savesRes.error;
      if (catsRes.error) throw catsRes.error;

      const key = getActiveMasterKey();
      const decryptedSaves = await Promise.all(
        (savesRes.data || []).map(async (s: any) => {
          const decSave = await decryptDataSaveData(s, key);
          if (decSave.category) {
            decSave.category = await decryptDataSaveCategoryData(decSave.category, key);
          }
          return decSave;
        })
      );

      const decryptedCats = await Promise.all(
        (catsRes.data || []).map((c: any) => decryptDataSaveCategoryData(c, key))
      );

      setSaves(decryptedSaves);
      setCategories(decryptedCats);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error(error.message || "Failed to load data");
    } finally {
      setFetching(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resolveCategoryId = async (
    catName: string,
    userId?: string
  ): Promise<string | null> => {
    const trimmed = catName.trim();
    if (!trimmed) return null;
    const existing = categories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing.id;

    if (!userId) return null;

    let payload = { user_id: userId, name: trimmed };
    if (isCategoryEncryptionEnabled("data_save")) {
      const key = getActiveMasterKey();
      if (key) {
        payload = await encryptDataSaveCategoryData(payload, key);
      }
    }

    const { data: newCat, error: catError } = await supabase
      .from("data_save_categories")
      .insert(payload)
      .select()
      .single();

    if (catError) throw catError;
    return newCat.id;
  };

  // Form Save / Update Handler
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedKey = keyName.trim();

    let finalContent = content;
    if (formEditorTab === "kv") {
      finalContent = kvPairsToJsonString(formKvPairs);
    }

    if (!trimmedKey || !finalContent.trim()) {
      toast.error("Please provide both a key/name and content");
      return;
    }

    setLoading(true);
    try {
      const categoryId = await resolveCategoryId(categoryName, session?.user?.id);

      if (editingFormSaveId) {
        // Check for duplicate key name when renaming
        const duplicate = saves.find(
          (s) =>
            s.id !== editingFormSaveId &&
            s.key_name.toLowerCase() === trimmedKey.toLowerCase()
        );
        if (duplicate) {
          toast.error(`A save with the key "${trimmedKey}" already exists.`);
          setLoading(false);
          return;
        }

        let updatePayload: any = {
          key_name: trimmedKey,
          content: finalContent,
          category_id: categoryId,
          updated_at: new Date().toISOString(),
        };

        if (isCategoryEncryptionEnabled("data_save")) {
          const key = getActiveMasterKey();
          if (key) {
            updatePayload = await encryptDataSaveData(updatePayload, key);
          }
        }

        const { error: updateError } = await supabase
          .from("data_saves")
          .update(updatePayload)
          .eq("id", editingFormSaveId);

        if (updateError) throw updateError;

        toast.success("Data save updated successfully!");
        cancelFormEdit();
      } else {
        // Check if data save exists with exact key name for upsert behavior
        const existing = saves.find(
          (s) => s.key_name.toLowerCase() === trimmedKey.toLowerCase()
        );

        let error;
        if (existing) {
          let updatePayload: any = {
            content: finalContent,
            category_id: categoryId,
            updated_at: new Date().toISOString(),
          };

          if (isCategoryEncryptionEnabled("data_save")) {
            const key = getActiveMasterKey();
            if (key) {
              updatePayload = await encryptDataSaveData(updatePayload, key);
            }
          }

          const { error: updateError } = await supabase
            .from("data_saves")
            .update(updatePayload)
            .eq("id", existing.id);
          error = updateError;
        } else {
          let insertPayload: any = {
            user_id: session?.user?.id,
            key_name: trimmedKey,
            content: finalContent,
            category_id: categoryId,
          };

          if (isCategoryEncryptionEnabled("data_save")) {
            const key = getActiveMasterKey();
            if (key) {
              insertPayload = await encryptDataSaveData(insertPayload, key);
            }
          }

          const { error: insertError } = await supabase
            .from("data_saves")
            .insert(insertPayload);
          error = insertError;
        }

        if (error) throw error;
        toast.success("Data saved successfully!");
        setKeyName("");
        setContent("");
        setCategoryName("");
        setFormKvPairs([{ id: generateRowId(), key: "", value: "" }]);
      }

      fetchData();
    } catch (error: any) {
      console.error("Save error:", error);
      toast.error(error.message || "Failed to save data");
    } finally {
      setLoading(false);
    }
  };

  const handleEditInForm = (save: DataSaveRecord) => {
    setEditingFormSaveId(save.id);
    setEditingFormOriginalKey(save.key_name);
    setKeyName(save.key_name);
    setContent(save.content);
    setCategoryName(save.category?.name || "");

    const { isJson, pairs } = parseJsonToKvPairs(save.content);
    setFormKvPairs(pairs);
    setFormEditorTab(isJson ? "kv" : "raw");

    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelFormEdit = () => {
    setEditingFormSaveId(null);
    setEditingFormOriginalKey("");
    setKeyName("");
    setContent("");
    setCategoryName("");
    setFormKvPairs([{ id: generateRowId(), key: "", value: "" }]);
    setFormEditorTab("raw");
  };

  // Modal Edit Handlers
  const handleOpenEditDialog = (save: DataSaveRecord) => {
    setEditingSave(save);
    setEditKeyName(save.key_name);
    setEditCategoryName(save.category?.name || "");
    setEditContent(save.content);

    const { isJson, pairs } = parseJsonToKvPairs(save.content);
    setEditKvPairs(pairs);
    setEditEditorTab(isJson ? "kv" : "raw");
    setEditDialogOpen(true);
  };

  const handleDialogSave = async () => {
    if (!editingSave) return;
    const trimmedKey = editKeyName.trim();

    let finalContent = editContent;
    if (editEditorTab === "kv") {
      finalContent = kvPairsToJsonString(editKvPairs);
    }

    if (!trimmedKey || !finalContent.trim()) {
      toast.error("Please provide both a key/name and content");
      return;
    }

    // Check for duplicate key name
    const duplicate = saves.find(
      (s) =>
        s.id !== editingSave.id &&
        s.key_name.toLowerCase() === trimmedKey.toLowerCase()
    );
    if (duplicate) {
      toast.error(`A save with the key "${trimmedKey}" already exists.`);
      return;
    }

    setDialogSaving(true);
    try {
      const categoryId = await resolveCategoryId(
        editCategoryName,
        session?.user?.id
      );

      let updatePayload: any = {
        key_name: trimmedKey,
        content: finalContent,
        category_id: categoryId,
        updated_at: new Date().toISOString(),
      };

      if (isCategoryEncryptionEnabled("data_save")) {
        const key = getActiveMasterKey();
        if (key) {
          updatePayload = await encryptDataSaveData(updatePayload, key);
        }
      }

      const { error } = await supabase
        .from("data_saves")
        .update(updatePayload)
        .eq("id", editingSave.id);

      if (error) throw error;

      toast.success("Data save updated successfully!");
      setEditDialogOpen(false);
      setEditingSave(null);

      // If this was also being edited in the form, update form or reset
      if (editingFormSaveId === editingSave.id) {
        cancelFormEdit();
      }

      fetchData();
    } catch (error: any) {
      console.error("Update error:", error);
      toast.error(error.message || "Failed to update data save");
    } finally {
      setDialogSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from("data_saves").delete().eq("id", id);

      if (error) throw error;

      toast.success("Data deleted successfully");
      if (editingFormSaveId === id) {
        cancelFormEdit();
      }
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete data");
    }
  };

  // Key-Value Row Management Helpers
  const handleAddKvPair = (isDialog: boolean) => {
    const newPair: KeyValuePair = { id: generateRowId(), key: "", value: "" };
    if (isDialog) {
      setEditKvPairs((prev) => [...prev, newPair]);
    } else {
      setFormKvPairs((prev) => [...prev, newPair]);
    }
  };

  const handleUpdateKvPair = (
    id: string,
    field: "key" | "value",
    val: string,
    isDialog: boolean
  ) => {
    if (isDialog) {
      setEditKvPairs((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: val } : p))
      );
    } else {
      setFormKvPairs((prev) =>
        prev.map((p) => (p.id === id ? { ...p, [field]: val } : p))
      );
    }
  };

  const handleDeleteKvPair = (id: string, isDialog: boolean) => {
    if (isDialog) {
      setEditKvPairs((prev) => {
        const filtered = prev.filter((p) => p.id !== id);
        return filtered.length > 0
          ? filtered
          : [{ id: generateRowId(), key: "", value: "" }];
      });
    } else {
      setFormKvPairs((prev) => {
        const filtered = prev.filter((p) => p.id !== id);
        return filtered.length > 0
          ? filtered
          : [{ id: generateRowId(), key: "", value: "" }];
      });
    }
  };

  const handleFormatJson = (isDialog: boolean) => {
    try {
      const textToFormat = isDialog ? editContent : content;
      const parsed = JSON.parse(textToFormat);
      const formatted = JSON.stringify(parsed, null, 2);
      if (isDialog) {
        setEditContent(formatted);
      } else {
        setContent(formatted);
      }
      toast.success("JSON formatted");
    } catch {
      toast.error("Content is not valid JSON");
    }
  };

  /**
   * ⚡ Bolt Performance Optimization:
   * Memoize saves filtering and hoist toLowerCase() outside the loop.
   */
  const filteredSaves = useMemo(() => {
    const lowerSearchTerm = searchTerm.toLowerCase();
    return saves.filter((s) => {
      const matchesSearch =
        !lowerSearchTerm ||
        s.key_name.toLowerCase().includes(lowerSearchTerm) ||
        s.content.toLowerCase().includes(lowerSearchTerm);
      const matchesCategory = selectedCategoryFilter
        ? s.category_id === selectedCategoryFilter
        : true;
      return matchesSearch && matchesCategory;
    });
  }, [saves, searchTerm, selectedCategoryFilter]);

  if (encryptionLocked) {
    return (
      <EncryptionRequiredPrompt
        category="data_save"
        returnTo="/apps?app=datasave"
        onUnlocked={handleUnlocked}
        categoryLabel="Data Save Entries"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Form: Create or Edit Save */}
      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-white flex items-center gap-2">
                {editingFormSaveId ? (
                  <>
                    <Pencil className="w-5 h-5 text-amber-400" />
                    Edit Data Save
                  </>
                ) : (
                  <>
                    <Database className="w-5 h-5 text-cyan-500" />
                    Save New Data
                  </>
                )}
              </CardTitle>
              {editingFormSaveId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelFormEdit}
                  className="text-xs text-slate-400 hover:text-white h-7 px-2"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Cancel Edit
                </Button>
              )}
            </div>
            <CardDescription className="text-slate-400">
              {editingFormSaveId
                ? `Updating "${editingFormOriginalKey}". Modify its key, values, or category directly.`
                : "Store arbitrary data, tokens, key-value pairs, or notes."}
            </CardDescription>
            {editingFormSaveId && (
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-800 text-xs text-amber-400/90">
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-300 font-mono"
                >
                  Editing Mode
                </Badge>
                <span>Changes will update this existing save key in-place.</span>
              </div>
            )}
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-cyan-500" />
                  Key / Name
                </label>
                <Input
                  placeholder="e.g. Server URL or Note Title"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white font-medium"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-cyan-500" />
                  Category (Optional)
                </label>
                <div className="relative">
                  <Input
                    placeholder="e.g. Work, Configs, Notes"
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-white"
                    list="form-category-options"
                  />
                  <datalist id="form-category-options">
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-500" />
                    Value / Content
                  </label>
                  <Tabs
                    value={formEditorTab}
                    onValueChange={(val) => {
                      const nextTab = val as "raw" | "kv";
                      if (nextTab === "kv" && formEditorTab === "raw") {
                        const { isJson, pairs } = parseJsonToKvPairs(content);
                        if (isJson) {
                          setFormKvPairs(pairs);
                        } else if (content.trim()) {
                          setFormKvPairs([
                            { id: generateRowId(), key: "value", value: content },
                          ]);
                        }
                      } else if (nextTab === "raw" && formEditorTab === "kv") {
                        setContent(kvPairsToJsonString(formKvPairs));
                      }
                      setFormEditorTab(nextTab);
                    }}
                  >
                    <TabsList className="h-7 bg-slate-950 border border-slate-800 p-0.5">
                      <TabsTrigger
                        value="raw"
                        className="text-xs px-2.5 py-1 data-[state=active]:bg-cyan-500 data-[state=active]:text-white"
                      >
                        <Code className="w-3 h-3 mr-1" />
                        Raw
                      </TabsTrigger>
                      <TabsTrigger
                        value="kv"
                        className="text-xs px-2.5 py-1 data-[state=active]:bg-cyan-500 data-[state=active]:text-white"
                      >
                        <List className="w-3 h-3 mr-1" />
                        Key-Values
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {formEditorTab === "raw" ? (
                  <div className="space-y-1.5">
                    <Textarea
                      placeholder="Enter the value or JSON contents you want to save..."
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white min-h-[150px] font-mono text-sm"
                    />
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFormatJson(false)}
                        className="h-6 text-[11px] text-slate-400 hover:text-cyan-400 px-2"
                      >
                        <Sparkles className="w-3 h-3 mr-1" />
                        Format JSON
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <div className="text-[11px] text-slate-400 flex items-center justify-between pb-1 border-b border-slate-800/60">
                      <span>Edit individual fields & values</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddKvPair(false)}
                        className="h-6 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 px-2"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Add Field
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {formKvPairs.map((pair) => (
                        <div key={pair.id} className="flex items-center gap-2">
                          <Input
                            placeholder="Field Key"
                            value={pair.key}
                            onChange={(e) =>
                              handleUpdateKvPair(pair.id, "key", e.target.value, false)
                            }
                            className="bg-slate-900 border-slate-800 text-white text-xs h-8 flex-1"
                          />
                          <Input
                            placeholder="Field Value"
                            value={pair.value}
                            onChange={(e) =>
                              handleUpdateKvPair(pair.id, "value", e.target.value, false)
                            }
                            className="bg-slate-900 border-slate-800 text-white text-xs h-8 flex-[1.5]"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteKvPair(pair.id, false)}
                            className="h-8 w-8 text-slate-500 hover:text-red-400 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                {editingFormSaveId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={cancelFormEdit}
                    className="border-slate-800 text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={loading || !keyName.trim()}
                  className={`flex-1 ${
                    editingFormSaveId
                      ? "bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold"
                      : "bg-cyan-500 hover:bg-cyan-600 text-white"
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {editingFormSaveId ? "Updating..." : "Saving..."}
                    </>
                  ) : editingFormSaveId ? (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Update Key & Values
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-2" />
                      Save Data
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Right List: Saved Data */}
      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800 h-full flex flex-col">
          <CardHeader className="pb-4">
            <CardTitle className="text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5 text-cyan-500" />
                Saved Data
              </div>
              <Badge variant="secondary" className="bg-slate-800 text-slate-300 text-xs">
                {filteredSaves.length} {filteredSaves.length === 1 ? "Key" : "Keys"}
              </Badge>
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Search keys or content..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 bg-slate-950 border-slate-800 text-white"
                />
              </div>
              {categories.length > 0 && (
                <div className="relative">
                  <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  <select
                    className="pl-9 pr-4 h-10 w-full sm:w-40 rounded-md bg-slate-950 border-slate-800 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 appearance-none cursor-pointer"
                    value={selectedCategoryFilter || ""}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value || null)}
                  >
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
              <ScrollArea className="h-[460px] px-6 pb-6">
                <div className="space-y-4">
                  {filteredSaves.map((save) => {
                    const { isJson, pairs } = parseJsonToKvPairs(save.content);
                    const isCurrentlyFormEditing = editingFormSaveId === save.id;

                    return (
                      <div
                        key={save.id}
                        className={`p-4 bg-slate-950 rounded-xl border transition-all duration-200 group ${
                          isCurrentlyFormEditing
                            ? "border-amber-500/60 ring-1 ring-amber-500/30"
                            : "border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <div className="flex flex-col gap-1 overflow-hidden">
                            <h4 className="font-medium text-white flex items-center gap-2 truncate">
                              <KeyRound className="w-4 h-4 text-cyan-500 flex-shrink-0" />
                              <span className="truncate">{save.key_name}</span>
                            </h4>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {save.category && (
                                <Badge
                                  variant="secondary"
                                  className="bg-slate-800 text-cyan-400 hover:bg-slate-700 text-[10px] px-1.5 py-0 font-normal"
                                >
                                  {save.category.name}
                                </Badge>
                              )}
                              {isJson && (
                                <Badge
                                  variant="outline"
                                  className="border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-[10px] px-1.5 py-0 font-mono"
                                >
                                  {pairs.length} {pairs.length === 1 ? "value" : "values"}
                                </Badge>
                              )}
                              {isCurrentlyFormEditing && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px] px-1.5 py-0"
                                >
                                  Editing
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Edit key & individual values"
                              onClick={() => handleOpenEditDialog(save)}
                              className="h-8 px-2 text-slate-400 hover:text-cyan-400 hover:bg-cyan-950/30"
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              <span className="text-xs">Edit</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Delete save"
                              onClick={() => handleDelete(save.id)}
                              className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-950/20"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Content display */}
                        <div className="bg-slate-900 rounded-md p-3 relative group/content mt-2">
                          <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all max-h-32 overflow-hidden overflow-y-auto">
                            {save.content}
                          </pre>
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover/content:opacity-100 transition-opacity">
                            <Button
                              variant="secondary"
                              size="sm"
                              className="text-[10px] h-6 px-2 bg-slate-800 hover:bg-slate-700 text-slate-200"
                              onClick={() => {
                                navigator.clipboard.writeText(save.content);
                                toast.success("Copied to clipboard!");
                              }}
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              Copy
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2">
                          <span>Updated: {new Date(save.updated_at).toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => handleEditInForm(save)}
                            className="text-cyan-500 hover:text-cyan-400 underline underline-offset-2 transition-colors cursor-pointer"
                          >
                            Load in form editor
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dedicated Edit Modal Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Pencil className="w-5 h-5 text-cyan-500" />
              Edit Data Save & Values
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Update key name, category, or modify individual values without deleting the key.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-cyan-500" />
                Key / Name
              </label>
              <Input
                value={editKeyName}
                onChange={(e) => setEditKeyName(e.target.value)}
                placeholder="Key name"
                className="bg-slate-950 border-slate-800 text-white"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-cyan-500" />
                Category
              </label>
              <div className="relative">
                <Input
                  value={editCategoryName}
                  onChange={(e) => setEditCategoryName(e.target.value)}
                  placeholder="Category (Optional)"
                  className="bg-slate-950 border-slate-800 text-white"
                  list="dialog-category-options"
                />
                <datalist id="dialog-category-options">
                  {categories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-cyan-500" />
                  Values / Content
                </label>
                <Tabs
                  value={editEditorTab}
                  onValueChange={(val) => {
                    const nextTab = val as "raw" | "kv";
                    if (nextTab === "kv" && editEditorTab === "raw") {
                      const { isJson, pairs } = parseJsonToKvPairs(editContent);
                      if (isJson) {
                        setEditKvPairs(pairs);
                      } else if (editContent.trim()) {
                        setEditKvPairs([
                          { id: generateRowId(), key: "value", value: editContent },
                        ]);
                      }
                    } else if (nextTab === "raw" && editEditorTab === "kv") {
                      setEditContent(kvPairsToJsonString(editKvPairs));
                    }
                    setEditEditorTab(nextTab);
                  }}
                >
                  <TabsList className="h-7 bg-slate-950 border border-slate-800 p-0.5">
                    <TabsTrigger
                      value="raw"
                      className="text-xs px-2.5 py-1 data-[state=active]:bg-cyan-500 data-[state=active]:text-white"
                    >
                      <Code className="w-3 h-3 mr-1" />
                      Raw
                    </TabsTrigger>
                    <TabsTrigger
                      value="kv"
                      className="text-xs px-2.5 py-1 data-[state=active]:bg-cyan-500 data-[state=active]:text-white"
                    >
                      <List className="w-3 h-3 mr-1" />
                      Key-Values
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {editEditorTab === "raw" ? (
                <div className="space-y-1.5">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Enter value or JSON payload..."
                    className="bg-slate-950 border-slate-800 text-white min-h-[160px] font-mono text-xs"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleFormatJson(true)}
                      className="h-6 text-[11px] text-slate-400 hover:text-cyan-400 px-2"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Format JSON
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <div className="text-[11px] text-slate-400 flex items-center justify-between pb-1 border-b border-slate-800/60">
                    <span>Individual Fields & Values</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddKvPair(true)}
                      className="h-6 text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/40 px-2"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Field
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {editKvPairs.map((pair) => (
                      <div key={pair.id} className="flex items-center gap-2">
                        <Input
                          placeholder="Field Key"
                          value={pair.key}
                          onChange={(e) =>
                            handleUpdateKvPair(pair.id, "key", e.target.value, true)
                          }
                          className="bg-slate-900 border-slate-800 text-white text-xs h-8 flex-1"
                        />
                        <Input
                          placeholder="Field Value"
                          value={pair.value}
                          onChange={(e) =>
                            handleUpdateKvPair(pair.id, "value", e.target.value, true)
                          }
                          className="bg-slate-900 border-slate-800 text-white text-xs h-8 flex-[1.5]"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteKvPair(pair.id, true)}
                          className="h-8 w-8 text-slate-500 hover:text-red-400 shrink-0"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
              className="text-slate-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleDialogSave}
              disabled={dialogSaving || !editKeyName.trim()}
              className="bg-cyan-500 hover:bg-cyan-600 text-white"
            >
              {dialogSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving Changes...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
