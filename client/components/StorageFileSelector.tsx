import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  File,
  Search,
  Loader2,
  Image as ImageIcon,
  Music,
  Film,
  Folder,
  ChevronRight,
  Home,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StorageFile {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: {
    size: number;
    mimetype: string;
  };
}

interface StorageFileSelectorProps {
  onSelect: (file: StorageFile) => void;
  allowedExtensions?: string[];
  allowedTypes?: ("image" | "audio" | "video")[];
  trigger?: React.ReactNode;
}

export function StorageFileSelector({
  onSelect,
  allowedExtensions,
  allowedTypes,
  trigger,
}: StorageFileSelectorProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState<string[]>([]);

  const fetchFiles = async (path: string = "") => {
    setLoading(true);
    const basePath = userId ? `${userId}` : "";
    const fullPath = path ? `${basePath}/${path}` : basePath;
    const { data, error } = await supabase.storage.from("Storage").list(fullPath, {
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      console.error("Error fetching storage files:", error);
    } else {
      setItems((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      fetchFiles(currentPath.join("/"));
    }
  }, [open, currentPath]);

  /**
   * ⚡ Bolt Performance Optimization:
   * Pre-calculate lowercased fields and derived type matching attributes for search
   * filtering so they are not re-evaluated on every keystroke in the O(N) filter pass.
   */
  const searchOptimizedItems = useMemo(() => {
    return items.map((item) => {
      const isFolder = !item.id;
      const searchName = item.name.toLowerCase();
      const extension = isFolder
        ? undefined
        : item.name.split(".").pop()?.toLowerCase();
      const mimeType = isFolder ? "" : item.metadata?.mimetype || "";

      let matchesExtension = true;
      if (!isFolder && allowedExtensions && allowedExtensions.length > 0) {
        matchesExtension = extension
          ? allowedExtensions.includes(`.${extension}`)
          : false;
      }

      let matchesType = true;
      if (!isFolder && allowedTypes && allowedTypes.length > 0) {
        matchesType = allowedTypes.some((type) =>
          mimeType.startsWith(`${type}/`),
        );
      }

      return {
        ...item,
        isFolder,
        _searchName: searchName,
        _matchesExtension: matchesExtension,
        _matchesType: matchesType,
      };
    });
  }, [items, allowedExtensions, allowedTypes]);

  const filteredItems = useMemo(() => {
    const searchLower = search.toLowerCase();
    return searchOptimizedItems.filter((item) => {
      const matchesSearch = item._searchName.includes(searchLower);

      if (item.isFolder) return matchesSearch;

      return matchesSearch && item._matchesExtension && item._matchesType;
    });
  }, [searchOptimizedItems, search]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (mimetype: string) => {
    if (mimetype.startsWith("image/"))
      return <ImageIcon className="w-4 h-4 text-pink-500" />;
    if (mimetype.startsWith("audio/"))
      return <Music className="w-4 h-4 text-cyan-500" />;
    if (mimetype.startsWith("video/"))
      return <Film className="w-4 h-4 text-purple-500" />;
    return <File className="w-4 h-4 text-slate-400" />;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline">Click to select from storage</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle>Select File</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 bg-slate-900 border-slate-800 text-white"
            />
          </div>
          <ScrollArea className="h-[300px] rounded-md border border-slate-800 p-2">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
              </div>
            ) : (
              <div className="space-y-4">
                {currentPath.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-slate-400 mb-2 overflow-x-auto pb-1 no-scrollbar">
                    <button
                      onClick={() => setCurrentPath([])}
                      className="hover:text-cyan-400 flex items-center"
                    >
                      <Home className="w-3 h-3 mr-1" />
                      Home
                    </button>
                    {currentPath.map((part, i) => (
                      <div key={i} className="flex items-center">
                        <ChevronRight className="w-3 h-3 mx-1 opacity-50" />
                        <button
                          onClick={() =>
                            setCurrentPath(currentPath.slice(0, i + 1))
                          }
                          className={cn(
                            "hover:text-cyan-400 truncate max-w-[100px]",
                            i === currentPath.length - 1 &&
                              "text-cyan-400 font-medium",
                          )}
                        >
                          {part}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {filteredItems.length > 0 ? (
                  <div className="space-y-1">
                    {filteredItems.map((item) => {
                      const isFolder = !item.id;
                      return (
                        <button
                          key={item.id || item.name}
                          aria-label={`Select ${isFolder ? "folder" : "file"} ${item.name}`}
                          title={`Select ${isFolder ? "folder" : "file"} ${item.name}`}
                          onClick={() => {
                            if (isFolder) {
                              setCurrentPath([...currentPath, item.name]);
                            } else {
                              // Ensure the name includes the full path for the consumer
                              const relativeName =
                                currentPath.length > 0
                                  ? `${currentPath.join("/")}/${item.name}`
                                  : item.name;
                              const fullName = userId
                                ? `${userId}/${relativeName}`
                                : relativeName;
                              onSelect({ ...item, name: fullName });
                              setOpen(false);
                            }
                          }}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-900 transition-colors text-left group focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none"
                        >
                          <div className="shrink-0">
                            {isFolder ? (
                              <Folder className="w-4 h-4 text-amber-500" />
                            ) : (
                              getFileIcon(item.metadata?.mimetype || "")
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={cn(
                                "text-sm font-medium truncate",
                                isFolder
                                  ? "text-slate-300"
                                  : "group-hover:text-cyan-400",
                              )}
                            >
                              {item.name}
                            </p>
                            {!isFolder && (
                              <p className="text-xs text-slate-500">
                                {formatSize(item.metadata?.size || 0)}
                              </p>
                            )}
                          </div>
                          {isFolder && (
                            <ChevronRight className="w-4 h-4 text-slate-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[200px] text-slate-500">
                    <File className="w-8 h-8 mb-2 opacity-20" />
                    <p>No items</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
