import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Book,
  Plus,
  Search,
  RefreshCw,
  ChevronRight,
  Code,
  AlertCircle,
  GitPullRequest,
  GitBranch,
  Send,
  Users,
  Trash2,
  Globe,
  Lock,
  Download,
  Edit2,
  FileCode,
  Folder,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { GithubImportModal } from "./GithubImportModal";
import { Github } from "./GithubIcon";

export function RepositoriesApp() {
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);

  const fetchRepos = async () => {
    setLoading(true);
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch("/api/repos", {
        headers: {
          Authorization: "Bearer " + (token.session?.access_token || ""),
        },
      });
      if (res.ok) setRepos(await res.json());
    } catch (err) {
      toast.error("Failed to fetch repositories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepos();
  }, []);

  /**
   * ⚡ Bolt Performance Optimization:
   * Pre-calculate lowercased fields for search filtering so they are not
   * re-evaluated on every keystroke in the O(N) filter pass.
   */
  const searchOptimizedRepos = useMemo(() => {
    return repos.map((r) => ({
      ...r,
      _searchName: r.name.toLowerCase(),
      _searchDesc: r.description?.toLowerCase() || "",
    }));
  }, [repos]);

  const filteredRepos = useMemo(() => {
    const searchLower = search.toLowerCase();
    return searchOptimizedRepos.filter(
      (r) =>
        r._searchName.includes(searchLower) ||
        r._searchDesc.includes(searchLower),
    );
  }, [searchOptimizedRepos, search]);

  if (selectedRepo) {
    return (
      <RepoDetail
        repo={selectedRepo}
        onBack={() => {
          setSelectedRepo(null);
          fetchRepos();
        }}
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Repositories
          </h1>
          <p className="text-slate-400">
            Manage and browse your GitHub repositories
          </p>
        </div>
        <Button
          onClick={() => setShowImport(true)}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          <Github className="w-4 h-4 mr-2" /> Import from GitHub
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search repositories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-slate-900 border-slate-800"
          />
        </div>
      </div>

      <GithubImportModal
        open={showImport}
        onOpenChange={setShowImport}
        onImported={fetchRepos}
      />

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRepos.map((repo) => (
            <Card
              key={repo.id}
              className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors cursor-pointer group"
              onClick={() => setSelectedRepo(repo)}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Book className="w-4 h-4 text-cyan-400" />
                    <CardTitle className="text-lg text-white">
                      {repo.profiles?.username}/{repo.name}
                    </CardTitle>
                  </div>
                  <Badge variant={repo.is_loaded ? "default" : "secondary"}>
                    {repo.is_loaded ? "Loaded" : "Unloaded"}
                  </Badge>
                </div>
                <CardDescription className="line-clamp-2 mt-1">
                  {repo.description || "No description."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />{" "}
                    {new Date(repo.updated_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1 truncate">
                    <Github className="w-3 h-3" /> {repo.github_repo_full_name}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredRepos.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
              No repositories found. Import one from GitHub to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RepoDetail({ repo, onBack }: { repo: any; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState("code");
  const [tree, setTree] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentBranch, setCurrentBranch] = useState(
    repo.default_branch || "main",
  );

  const fetchRepoInfo = useCallback(async () => {
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch("/api/repos/" + repo.id, {
        headers: {
          Authorization: "Bearer " + (token.session?.access_token || ""),
        },
      });
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
        if (data.currentBranch) setCurrentBranch(data.currentBranch);
      }
    } catch (err) {
      toast.error("Failed to fetch repository info");
    }
  }, [repo.id]);

  const fetchTree = useCallback(
    async (path = "", branch = currentBranch) => {
      setLoading(true);
      try {
        const { data: token } = await supabase.auth.getSession();
        const res = await fetch(
          `/api/repos/${repo.id}/files?path=${path}&branch=${branch}`,
          {
            headers: {
              Authorization: "Bearer " + (token.session?.access_token || ""),
            },
          },
        );
        if (res.ok) {
          const files = await res.json();
          setTree(
            files.map((f: string) => ({
              name: f.split("/").pop(),
              path: f,
              type: f.endsWith("/") ? "tree" : "blob",
            })),
          );
          setCurrentPath(path);
        }
      } catch (err) {
        toast.error("Failed to fetch files");
      } finally {
        setLoading(false);
      }
    },
    [repo.id, currentBranch],
  );

  useEffect(() => {
    fetchRepoInfo();
    fetchTree();
  }, [fetchRepoInfo, fetchTree]);

  const loadFile = async (path: string) => {
    setSelectedFile(path);
    setLoading(true);
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/repos/${repo.id}/file?path=${path}&branch=${currentBranch}`,
        {
          headers: {
            Authorization: "Bearer " + (token.session?.access_token || ""),
          },
        },
      );
      if (res.ok) setFileContent(await res.text());
    } catch (err) {
      toast.error("Failed to load file");
    } finally {
      setLoading(false);
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch("/api/repos/" + repo.id + "/files", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + (token.session?.access_token || ""),
          "x-github-token": token.session?.provider_token || "",
        },
        body: JSON.stringify({
          filePath: selectedFile,
          content: fileContent,
          branch: currentBranch,
          message: "Update " + selectedFile,
        }),
      });
      if (res.ok) toast.success("File saved and pushed to GitHub");
      else {
        const err = await res.json();
        toast.error(err.error || "Failed to save file");
      }
    } catch (err) {
      toast.error("Error saving file");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-full overflow-auto text-white">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Book className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold">
              {repo.profiles?.username}/{repo.name}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded px-2 py-1">
            <GitBranch className="w-4 h-4 text-slate-400" />
            <select
              value={currentBranch}
              onChange={(e) => {
                setCurrentBranch(e.target.value);
                setSelectedFile(null);
              }}
              className="bg-transparent text-sm outline-none cursor-pointer"
            >
              {branches.length > 0 ? (
                branches.map((b) => (
                  <option key={b} value={b} className="bg-slate-900">
                    {b}
                  </option>
                ))
              ) : (
                <option value={currentBranch}>{currentBranch}</option>
              )}
            </select>
          </div>
          <Badge variant={repo.is_loaded ? "default" : "secondary"}>
            {repo.is_loaded ? "Loaded" : "Unloaded"}
          </Badge>
          <Badge variant="secondary" className="bg-slate-800 text-slate-300">
            <Github className="w-3 h-3 mr-1" />
            Github
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-900 border-slate-800">
          <TabsTrigger value="code" className="gap-2">
            <Code className="w-4 h-4" />
            Code
          </TabsTrigger>
          <TabsTrigger value="issues" className="gap-2">
            <AlertCircle className="w-4 h-4" />
            Issues
          </TabsTrigger>
          <TabsTrigger value="pulls" className="gap-2">
            <GitPullRequest className="w-4 h-4" />
            Pull Requests
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <RefreshCw className="w-4 h-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="code" className="mt-4">
          <div className="grid grid-cols-12 gap-6 h-[600px]">
            <Card className="col-span-3 bg-slate-950 border-slate-800 flex flex-col">
              <CardHeader className="p-4 border-b border-slate-800">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Folder className="w-4 h-4 text-cyan-400" /> Files
                </CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {tree.map((item) => (
                    <button
                      key={item.path}
                      aria-label={`Open file ${item.name}`}
                      title={`Open file ${item.name}`}
                      onClick={() => loadFile(item.path)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded transition-colors focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:outline-none ${selectedFile === item.path ? "bg-cyan-900/30 text-cyan-400" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}
                    >
                      <FileCode className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  ))}
                  {loading && tree.length === 0 && (
                    <div className="p-4 text-center text-slate-500 animate-pulse">
                      Loading...
                    </div>
                  )}
                </div>
              </ScrollArea>
            </Card>

            <Card className="col-span-9 bg-slate-950 border-slate-800 flex flex-col overflow-hidden">
              {selectedFile ? (
                <>
                  <CardHeader className="p-4 border-b border-slate-800 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-cyan-400" />
                      <span className="text-sm font-mono text-slate-300">
                        {selectedFile}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      disabled={isSaving}
                      onClick={saveFile}
                      className="bg-cyan-600 hover:bg-cyan-700"
                    >
                      {isSaving ? (
                        <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Download className="w-4 h-4 mr-2" />
                      )}
                      Save & Push
                    </Button>
                  </CardHeader>
                  <div className="flex-1 overflow-auto p-4 bg-slate-950">
                    <textarea
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      className="w-full h-full bg-transparent text-cyan-50 font-mono text-sm outline-none resize-none"
                      spellCheck={false}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
                  <Code className="w-16 h-16 opacity-10" />
                  <p>Select a file to view or edit its content</p>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="issues">
          <RepoIssues repoId={repo.id} />
        </TabsContent>

        <TabsContent value="pulls">
          <RepoPullRequests repoId={repo.id} />
        </TabsContent>

        <TabsContent value="settings">
          <Card className="bg-slate-900 border-slate-800 max-w-2xl">
            <CardHeader>
              <CardTitle>Repository Settings</CardTitle>
              <CardDescription>
                Manage your repository configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white">
                  Repository Name
                </h4>
                <Input
                  value={repo.name}
                  disabled
                  className="bg-slate-950 border-slate-800"
                />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white">
                  GitHub Connection
                </h4>
                <div className="flex items-center gap-2 p-3 rounded-lg bg-slate-950 border border-slate-800">
                  <Github className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-300">
                    {repo.github_repo_full_name}
                  </span>
                </div>
              </div>
              <Separator className="bg-slate-800" />
              <div className="pt-2">
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (
                      window.confirm(
                        "Are you sure you want to delete this repository from the workspace? This will not affect the repository on GitHub.",
                      )
                    ) {
                      try {
                        const { data: token } =
                          await supabase.auth.getSession();
                        const res = await fetch("/api/repos/" + repo.id, {
                          method: "DELETE",
                          headers: {
                            Authorization:
                              "Bearer " + (token.session?.access_token || ""),
                          },
                        });
                        if (res.ok) {
                          toast.success("Repository removed from workspace");
                          onBack();
                        } else {
                          const error = await res.json();
                          toast.error(
                            error.error || "Failed to delete repository",
                          );
                        }
                      } catch (err) {
                        toast.error("Error deleting repository");
                      }
                    }
                  }}
                >
                  Delete from Workspace
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RepoIssues({ repoId }: { repoId: string }) {
  const [issues, setIssues] = useState<any[]>([]);
  const [title, setTitle] = useState("");
  const fetchIssues = useCallback(async () => {
    const { data } = await supabase
      .from("repository_issues")
      .select("*, author:profiles!author_id(username)")
      .eq("repo_id", repoId)
      .order("created_at", { ascending: false });
    if (data) setIssues(data);
  }, [repoId]);
  useEffect(() => {
    fetchIssues();
  }, [fetchIssues]);
  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Input
          placeholder="Issue title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="bg-slate-900 border-slate-800 text-white"
        />
        <Button
          onClick={async () => {
            if (!title) return;
            await supabase.from("repository_issues").insert({
              repo_id: repoId,
              title,
              author_id: (await supabase.auth.getUser()).data.user?.id,
            });
            setTitle("");
            fetchIssues();
          }}
        >
          Create Issue
        </Button>
      </div>
      <div className="space-y-2">
        {issues.map((issue) => (
          <Card key={issue.id} className="bg-slate-900/50 border-slate-800">
            <CardHeader className="p-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-green-500" />
                  <CardTitle className="text-base text-white">
                    {issue.title}
                  </CardTitle>
                  <span className="text-xs text-slate-500">
                    #{issue.number}
                  </span>
                </div>
                <Badge variant="outline">{issue.status}</Badge>
              </div>
              <CardDescription>
                opened by {issue.author?.username || issue.github_username}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
        {issues.length === 0 && (
          <div className="py-10 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
            No issues found.
          </div>
        )}
      </div>
    </div>
  );
}

function RepoPullRequests({ repoId }: { repoId: string }) {
  const [prs, setPrs] = useState<any[]>([]);
  const [selectedPr, setSelectedPr] = useState<any | null>(null);
  const [diff, setDiff] = useState("");
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newPr, setNewPr] = useState({ title: "", source: "", target: "main" });

  const fetchPrs = useCallback(async () => {
    const { data } = await supabase
      .from("repository_pull_requests")
      .select("*, author:profiles!author_id(username)")
      .eq("repo_id", repoId)
      .order("created_at", { ascending: false });
    if (data) setPrs(data);
  }, [repoId]);
  useEffect(() => {
    fetchPrs();
  }, [fetchPrs]);

  const loadPr = async (pr: any) => {
    setSelectedPr(pr);
    const { data: token } = await supabase.auth.getSession();
    const res = await fetch(`/api/repos/${repoId}/pulls/${pr.id}/diff`, {
      headers: {
        Authorization: "Bearer " + (token.session?.access_token || ""),
      },
    });
    if (res.ok) setDiff(await res.text());
    const { data: comms } = await supabase
      .from("repository_pull_request_comments")
      .select("*, user:profiles!user_id(username)")
      .eq("pr_id", pr.id)
      .order("created_at", { ascending: true });
    if (comms) setComments(comms);
  };

  const merge = async () => {
    const { data: token } = await supabase.auth.getSession();
    const res = await fetch(
      `/api/repos/${repoId}/pulls/${selectedPr.id}/merge`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + (token.session?.access_token || ""),
          "x-github-token": token.session?.provider_token || "",
        },
      },
    );
    if (res.ok) {
      toast.success("Merged and pushed to GitHub");
      fetchPrs();
      setSelectedPr(null);
    } else {
      const err = await res.json();
      toast.error(err.error || "Failed to merge PR");
    }
  };

  const addComment = async () => {
    if (!newComment) return;
    await supabase.from("repository_pull_request_comments").insert({
      pr_id: selectedPr.id,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      body: newComment,
    });
    setNewComment("");
    loadPr(selectedPr);
  };

  const createPr = async () => {
    if (!newPr.title || !newPr.source) return;
    const { data: token } = await supabase.auth.getSession();
    const res = await fetch(`/api/repos/${repoId}/pulls`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (token.session?.access_token || ""),
      },
      body: JSON.stringify({
        title: newPr.title,
        source_branch: newPr.source,
        target_branch: newPr.target,
      }),
    });
    if (res.ok) {
      toast.success("PR Created");
      setShowCreate(false);
      fetchPrs();
    }
  };

  if (selectedPr)
    return (
      <div className="space-y-4">
        <Button
          variant="ghost"
          onClick={() => setSelectedPr(null)}
          className="text-white"
        >
          <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
          Back
        </Button>
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              {selectedPr.title}{" "}
              <span className="text-slate-500">#{selectedPr.number}</span>
            </h2>
            <p className="text-sm text-slate-400">
              {selectedPr.author?.username || selectedPr.github_username} wants
              to merge {selectedPr.source_branch} into{" "}
              {selectedPr.target_branch}
            </p>
          </div>
          {selectedPr.status === "open" && (
            <Button
              onClick={merge}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Merge PR
            </Button>
          )}
        </div>
        <Tabs defaultValue="diff">
          <TabsList className="bg-slate-900 border-slate-800">
            <TabsTrigger value="diff">Diff</TabsTrigger>
            <TabsTrigger value="comments">
              Comments ({comments.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="diff">
            <Card className="bg-slate-950 p-4 font-mono text-xs text-slate-400 overflow-auto max-h-[400px]">
              <pre>{diff || "No changes."}</pre>
            </Card>
          </TabsContent>
          <TabsContent value="comments" className="space-y-4">
            <div className="space-y-2">
              {comments.map((c) => (
                <Card key={c.id} className="bg-slate-900/50 border-slate-800">
                  <CardHeader className="p-3 border-b border-slate-800">
                    <span className="text-xs font-bold text-white">
                      {c.user?.username}
                    </span>
                  </CardHeader>
                  <CardContent className="p-3 text-sm text-slate-300">
                    {c.body}
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="bg-slate-900 border-slate-800 text-white"
              />
              <Button onClick={addComment} size="sm">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Pull Requests</h3>
        <Button
          onClick={() => setShowCreate(!showCreate)}
          variant="outline"
          className="text-white border-slate-800 hover:bg-slate-900"
        >
          {showCreate ? "Cancel" : "New PR"}
        </Button>
      </div>
      {showCreate && (
        <Card className="bg-slate-900/50 border-slate-800 p-4 space-y-4">
          <Input
            placeholder="Title"
            value={newPr.title}
            onChange={(e) => setNewPr({ ...newPr, title: e.target.value })}
            className="bg-slate-950 border-slate-800 text-white"
          />
          <div className="flex gap-2">
            <Input
              placeholder="Source Branch (e.g. feature)"
              value={newPr.source}
              onChange={(e) => setNewPr({ ...newPr, source: e.target.value })}
              className="bg-slate-950 border-slate-800 text-white"
            />
            <Input
              placeholder="Target Branch"
              value={newPr.target}
              onChange={(e) => setNewPr({ ...newPr, target: e.target.value })}
              className="bg-slate-950 border-slate-800 text-white"
            />
          </div>
          <Button onClick={createPr}>Create Pull Request</Button>
        </Card>
      )}
      <div className="space-y-2">
        {prs.map((pr) => (
          <Card
            key={pr.id}
            className="bg-slate-900/50 border-slate-800 hover:border-slate-700 cursor-pointer"
            onClick={() => loadPr(pr)}
          >
            <CardHeader className="p-4">
              <div className="flex items-center gap-2">
                <GitPullRequest className="w-4 h-4 text-green-500" />
                <CardTitle className="text-base text-white">
                  {pr.title}
                </CardTitle>
                <Badge className="ml-auto">{pr.status}</Badge>
              </div>
              <CardDescription>
                #{pr.number} by {pr.author?.username || pr.github_username}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
        {prs.length === 0 && !showCreate && (
          <div className="py-10 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
            No PRs found.
          </div>
        )}
      </div>
    </div>
  );
}
