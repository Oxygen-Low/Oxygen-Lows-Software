import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
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
import { File, Search, Loader2, Image as ImageIcon, Music, Film } from "lucide-react";
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
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const fetchFiles = async () => {
    setLoading(true);
    const { data, error } = await supabase.storage.from("Storage").list("", {
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      console.error("Error fetching storage files:", error);
    } else {
      setFiles((data as any[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      fetchFiles();
    }
  }, [open]);

  const filteredFiles = files.filter((file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const mimeType = file.metadata?.mimetype || "";

    const matchesSearch = file.name.toLowerCase().includes(search.toLowerCase());

    let matchesExtension = true;
    if (allowedExtensions && allowedExtensions.length > 0) {
      matchesExtension = extension ? allowedExtensions.includes(`.${extension}`) : false;
    }

    let matchesType = true;
    if (allowedTypes && allowedTypes.length > 0) {
      matchesType = allowedTypes.some((type) => mimeType.startsWith(`${type}/`));
    }

    return matchesSearch && matchesExtension && matchesType;
  });

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (mimetype: string) => {
    if (mimetype.startsWith("image/")) return <ImageIcon className="w-4 h-4 text-pink-500" />;
    if (mimetype.startsWith("audio/")) return <Music className="w-4 h-4 text-cyan-500" />;
    if (mimetype.startsWith("video/")) return <Film className="w-4 h-4 text-purple-500" />;
    return <File className="w-4 h-4 text-slate-400" />;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || <Button variant="outline">Select File from Storage</Button>}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle>Select File</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-500" />
            <Input
              placeholder="Search files..."
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
            ) : filteredFiles.length > 0 ? (
              <div className="space-y-1">
                {filteredFiles.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => {
                      onSelect(file);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-900 transition-colors text-left group"
                  >
                    <div className="shrink-0">
                      {getFileIcon(file.metadata?.mimetype || "")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-cyan-400">
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatSize(file.metadata?.size || 0)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <File className="w-8 h-8 mb-2 opacity-20" />
                <p>No files found</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
