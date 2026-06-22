import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Download, Save, Loader2, FileCode } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface ArtifactSidebarProps {
  artifact: {
    language: string;
    filename: string;
    content: string;
  } | null;
  onClose: () => void;
}

export function ArtifactSidebar({ artifact, onClose }: ArtifactSidebarProps) {
    const [saving, setSaving] = useState(false);

  if (!artifact) return null;

  const handleSaveToCloud = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Construct file directly from content
      const file = new File([artifact.content], artifact.filename, { type: "text/plain" });

      const filePath = `${user.id}/${Date.now()}_${artifact.filename}`;
      if (filePath.includes('..')) throw new Error("Invalid file path");
      const { error } = await supabase.storage.from("Storage").upload(filePath, file);

      if (error) throw error;
      toast.success("Artifact saved to cloud storage");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = artifact.filename; // Use identical filename/extension as save
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-[400px] border-l border-slate-800 bg-slate-900/50 flex flex-col animate-in slide-in-from-right duration-300">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-slate-200 truncate">{artifact.filename}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} title={`Download as ${artifact.filename.split(".").pop()}`}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSaveToCloud} disabled={saving} title="Save">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4">
          <SyntaxHighlighter
            language={artifact.language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              background: "transparent",
              fontSize: "13px",
              lineHeight: "1.5",
            }}
          >
            {artifact.content}
          </SyntaxHighlighter>
        </div>
      </ScrollArea>
    </div>
  );
}
