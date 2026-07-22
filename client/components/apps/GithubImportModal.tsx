import { useState, useEffect, useMemo } from "react";
import { Search, RefreshCw, ChevronRight, Book, Download } from "lucide-react";
import { Github } from "./GithubIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string;
  default_branch: string;
}

export function GithubImportModal({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const fetchGithubRepos = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const githubToken = sessionData.session?.provider_token;

      if (!githubToken) {
        toast.error(
          "GitHub token not found. Please re-authenticate with GitHub.",
        );
        return;
      }

      const res = await fetch("/api/repos/github/list", {
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token}`,
          "x-github-token": githubToken,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setRepos(data);
      } else {
        toast.error("Failed to fetch GitHub repositories");
      }
    } catch (err) {
      toast.error("Error connecting to GitHub");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchGithubRepos();
  }, [open]);

  const importRepo = async (repo: GithubRepo) => {
    if (importing !== null) return;
    setImporting(repo.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const githubToken = sessionData.session?.provider_token;

      const res = await fetch("/api/repos/github/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
          "x-github-token": githubToken || "",
        },
        body: JSON.stringify({
          fullName: repo.full_name,
          name: repo.name.toLowerCase().replace(/[^a-z0-9._-]/g, ""),
          description: repo.description,
        }),
      });

      if (res.ok) {
        toast.success(`Imported ${repo.full_name}`);
        onImported();
        onOpenChange(false);
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to import repository");
      }
    } catch (err) {
      toast.error("Error importing repository");
    } finally {
      setImporting(null);
    }
  };

  /**
   * ⚡ Bolt Performance Optimization:
   * Pre-calculate lowercased fields for search filtering so they are not
   * re-evaluated on every keystroke in the O(N) filter pass.
   */
  const searchOptimizedRepos = useMemo(() => {
    return repos.map((r) => ({
      ...r,
      _searchFullName: r.full_name.toLowerCase(),
    }));
  }, [repos]);

  const filteredRepos = useMemo(() => {
    const searchLower = search.toLowerCase();
    return searchOptimizedRepos.filter((r) =>
      r._searchFullName.includes(searchLower),
    );
  }, [searchOptimizedRepos, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-slate-950 border-slate-800">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Github className="w-5 h-5" /> Import from GitHub
          </DialogTitle>
          <DialogDescription>
            Select a repository to import into your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search your repositories..."
            className="pl-10 bg-slate-900 border-slate-800 text-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <ScrollArea className="h-[400px] mt-4 pr-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <RefreshCw className="w-6 h-6 text-cyan-500 animate-spin" />
              <p className="text-sm text-slate-500">Fetching repositories...</p>
            </div>
          ) : (
            <div className="space-y-2 pb-4">
              {filteredRepos.map((repo) => (
                <button
                  key={repo.id}
                  disabled={importing !== null}
                  onClick={() => importRepo(repo)}
                  aria-label={`Import repository ${repo.full_name}`}
                  className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:border-cyan-500/50 hover:bg-slate-900 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed group focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none"
                >
                  <div className="flex items-center gap-3 overflow-hidden min-w-0">
                    <Book className="w-4 h-4 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
                    <div className="overflow-hidden min-w-0">
                      <p className="text-sm font-medium text-white truncate">
                        {repo.full_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {repo.description || "No description"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {importing === repo.id ? (
                      <RefreshCw className="w-4 h-4 text-cyan-500 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                    )}
                  </div>
                </button>
              ))}
              {filteredRepos.length === 0 && !loading && (
                <p className="text-center py-10 text-slate-500 text-sm">
                  No repositories found.
                </p>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
