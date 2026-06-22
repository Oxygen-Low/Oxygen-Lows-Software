import { useState, useEffect, useCallback } from "react";
import {
  Book,
  Plus,
  HardDrive,
  GitBranch,
  RefreshCw,
  ChevronRight,
  File,
  Folder,
  Code,
  Save,
  Send,
  GitPullRequest,
  GitFork,
  AlertCircle,
  Copy,
  Users,
  Trash2,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";

export function RepositoriesApp() {
  const { session } = useAuth();
  const [repos, setRepos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoDesc, setNewRepoDesc] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);

  const fetchRepos = useCallback(async () => {
    setLoading(true);
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch("/api/repos", {
        headers: { Authorization: `Bearer ${token.session?.access_token}` },
      });
      const data = await res.json();
      if (res.ok) setRepos(data);
    } catch (err) {
      toast.error("Failed to fetch repositories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRepos();
  }, [fetchRepos]);

  const createRepo = async () => {
    if (!newRepoName) return;
    setCreating(true);
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.session?.access_token}`,
        },
        body: JSON.stringify({
          name: newRepoName,
          description: newRepoDesc,
          initReadme: true,
        }),
      });
      if (res.ok) {
        toast.success("Repository created");
        setNewRepoName("");
        setNewRepoDesc("");
        fetchRepos();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create repository");
      }
    } catch (err) {
      toast.error("Error creating repository");
    } finally {
      setCreating(false);
    }
  };

  if (selectedRepo)
    return (
      <RepoDetail
        repo={selectedRepo}
        onBack={() => {
          setSelectedRepo(null);
          fetchRepos();
        }}
      />
    );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Your Repositories</h2>
          <p className="text-slate-400">Manage your git projects.</p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Repo name..."
            value={newRepoName}
            onChange={(e) =>
              setNewRepoName(
                e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
              )
            }
            className="w-48 bg-slate-900 border-slate-800"
          />
          <Button onClick={createRepo} disabled={creating || !newRepoName}>
            {creating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4 mr-2" />
            )}
            New Repo
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {repos.map((repo) => (
            <Card
              key={repo.id}
              className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition cursor-pointer"
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
                  <div className="flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    {(repo.zip_size_bytes / 1024).toFixed(1)} KB
                  </div>
                  <div className="flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    {repo.default_branch}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {repos.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
              No repositories found. Create one to get started!
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
  const [isSaving, setIsSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gitPassword, setGitPassword] = useState<string | null>(null);

  const fetchTree = useCallback(
    async (path: string = "") => {
      setLoading(true);
      setCurrentPath(path);
      try {
        const { data: token } = await supabase.auth.getSession();
        const res = await fetch(
          `/api/repos/${repo.id}/tree?path=${encodeURIComponent(path)}`,
          {
            headers: { Authorization: `Bearer ${token.session?.access_token}` },
          },
        );
        const data = await res.json();
        if (res.ok) setTree(data);
      } catch (err) {
        toast.error("Failed to fetch tree");
      } finally {
        setLoading(false);
      }
    },
    [repo.id],
  );

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const loadFile = async (filePath: string) => {
    setSelectedFile(filePath);
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch(
        `/api/repos/${repo.id}/file?path=${encodeURIComponent(filePath)}`,
        { headers: { Authorization: `Bearer ${token.session?.access_token}` } },
      );
      const content = await res.text();
      setFileContent(content);
    } catch (err) {
      toast.error("Failed to load file");
    }
  };

  const saveFile = async () => {
    if (!selectedFile) return;
    setIsSaving(true);
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch(`/api/repos/${repo.id}/file`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token.session?.access_token}`,
        },
        body: JSON.stringify({
          path: selectedFile,
          content: fileContent,
          message: `Edit ${selectedFile}`,
        }),
      });
      if (res.ok) toast.success("Saved");
      else toast.error("Failed to save");
    } catch (err) {
      toast.error("Error saving");
    } finally {
      setIsSaving(false);
    }
  };

  const fetchGitPassword = async () => {
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch("/api/repos/user/git-password", {
        headers: { Authorization: `Bearer ${token.session?.access_token}` },
      });
      const data = await res.json();
      setGitPassword(data.password);
    } catch (err) {}
  };

  useEffect(() => {
    if (activeTab === "settings") fetchGitPassword();
  }, [activeTab]);

  const handleEntryClick = (file: any) => {
    const fullPath = currentPath ? `${currentPath}/${file.name}` : file.name;
    if (file.type === "blob") {
      loadFile(fullPath);
    } else if (file.type === "tree") {
      fetchTree(fullPath);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            <Book className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">
              {repo.profiles?.username}/{repo.name}
            </h2>
          </div>
        </div>
        <Badge variant={repo.is_loaded ? "default" : "secondary"}>
          {repo.is_loaded ? "Loaded" : "Unloaded"}
        </Badge>
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-900 border-slate-800 p-1">
          <TabsTrigger value="code">Code</TabsTrigger>
          <TabsTrigger value="issues">Issues</TabsTrigger>
          <TabsTrigger value="pulls">Pull Requests</TabsTrigger>
          <TabsTrigger value="collaborators">Collaborators</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="code" className="mt-6 space-y-4">
          <div className="flex gap-2 items-center text-sm bg-slate-900/50 p-2 rounded border border-slate-800">
            <span className="text-slate-500">Clone URL:</span>
            <code className="text-cyan-400 flex-1 px-2 py-1 bg-black/30 rounded">
              {window.location.origin}/api/git/{repo.profiles?.username}/
              {repo.name}.git
            </code>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/api/git/${repo.profiles?.username}/${repo.name}.git`,
                );
                toast.success("Copied");
              }}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-12 gap-4 h-[600px]">
            <Card className="col-span-3 bg-slate-900/50 border-slate-800 flex flex-col">
              <CardHeader className="p-4 border-b border-slate-800">
                <CardTitle className="text-sm font-medium">Files</CardTitle>
              </CardHeader>
              <ScrollArea className="flex-1 p-2">
                {currentPath && (
                  <button
                    type="button"
                    onClick={() =>
                      fetchTree(
                        currentPath.includes("/")
                          ? currentPath.substring(
                              0,
                              currentPath.lastIndexOf("/"),
                            )
                          : "",
                      )
                    }
                    className="flex items-center gap-2 p-2 rounded text-sm text-slate-500 hover:bg-slate-800 w-full text-left"
                  >
                    <Folder className="w-4 h-4" /> ..
                  </button>
                )}
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto mt-10" />
                ) : (
                  tree.map((file) => (
                    <button
                      key={file.name}
                      type="button"
                      onClick={() => handleEntryClick(file)}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded text-sm w-full text-left focus:outline-none focus:ring-2 focus:ring-cyan-500/50",
                        selectedFile ===
                          (currentPath
                            ? `${currentPath}/${file.name}`
                            : file.name)
                          ? "bg-cyan-500/10 text-cyan-400"
                          : "text-slate-400 hover:bg-slate-800",
                      )}
                    >
                      {file.type === "tree" ? (
                        <Folder className="w-4 h-4" />
                      ) : (
                        <File className="w-4 h-4" />
                      )}
                      {file.name}
                    </button>
                  ))
                )}
              </ScrollArea>
            </Card>
            <Card className="col-span-9 bg-slate-950 border-slate-800 flex flex-col overflow-hidden">
              {selectedFile ? (
                <>
                  <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
                    <span className="text-sm text-slate-300">
                      {selectedFile}
                    </span>
                    <Button size="sm" onClick={saveFile} disabled={isSaving}>
                      {isSaving ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3 mr-2" />
                      )}
                      Commit
                    </Button>
                  </div>
                  <div className="flex-1">
                    <Editor
                      height="100%"
                      defaultLanguage="typescript"
                      theme="vs-dark"
                      value={fileContent}
                      onChange={(val) => setFileContent(val || "")}
                    />
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
                  <Code className="w-12 h-12 mb-4 opacity-20" />
                  <p>Select a file to view</p>
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
        <TabsContent value="collaborators">
          <RepoCollaborators
            repoId={repo.id}
            isOwner={repo.permission === "admin"}
          />
        </TabsContent>
        <TabsContent value="settings" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle>Git Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {gitPassword ? (
                <div className="flex gap-2">
                  <code className="flex-1 bg-black/30 p-2 rounded border border-slate-800 text-cyan-400 break-all text-xs">
                    {gitPassword}
                  </code>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(gitPassword);
                      toast.success("Copied");
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <p className="text-slate-500 italic">No password generated.</p>
              )}
              <Button
                variant="secondary"
                onClick={async () => {
                  const { data: token } = await supabase.auth.getSession();
                  const res = await fetch("/api/repos/user/git-password", {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${token.session?.access_token}`,
                    },
                  });
                  const data = await res.json();
                  setGitPassword(data.password);
                }}
              >
                Generate Password
              </Button>
            </CardContent>
          </Card>
          {repo.permission === "admin" && (
            <Card className="bg-slate-900/50 border-red-900/30">
              <CardHeader>
                <CardTitle className="text-red-400">Danger Zone</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (confirm("Delete?")) {
                      try {
                        const { data: token } =
                          await supabase.auth.getSession();
                        const res = await fetch(`/api/repos/${repo.id}`, {
                          method: "DELETE",
                          headers: {
                            Authorization: `Bearer ${token.session?.access_token}`,
                          },
                        });
                        if (res.ok) {
                          toast.success("Repository deleted");
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
                  Delete Repository
                </Button>
              </CardContent>
            </Card>
          )}
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
      .select("*, author:profiles!repository_issues_author_id_fkey(username)")
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
        />
        <Button
          onClick={async () => {
            if (!title) return;
            await supabase
              .from("repository_issues")
              .insert({
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
                opened by {issue.author?.username}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
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
      .select(
        "*, author:profiles!repository_pull_requests_author_id_fkey(username)",
      )
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
      headers: { Authorization: `Bearer ${token.session?.access_token}` },
    });
    setDiff(await res.text());
    const { data: comms } = await supabase
      .from("repository_pull_request_comments")
      .select(
        "*, user:profiles!repository_pull_request_comments_user_id_fkey(username)",
      )
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
        headers: { Authorization: `Bearer ${token.session?.access_token}` },
      },
    );
    if (res.ok) {
      toast.success("Merged");
      fetchPrs();
      setSelectedPr(null);
    }
  };

  const addComment = async () => {
    if (!newComment) return;
    await supabase
      .from("repository_pull_request_comments")
      .insert({
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
        Authorization: `Bearer ${token.session?.access_token}`,
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
        <Button variant="ghost" onClick={() => setSelectedPr(null)}>
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
              {selectedPr.author?.username} wants to merge{" "}
              {selectedPr.source_branch} into {selectedPr.target_branch}
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
          <TabsList>
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
                    <span className="text-xs font-bold">
                      {c.user?.username}
                    </span>
                  </CardHeader>
                  <CardContent className="p-3 text-sm">{c.body}</CardContent>
                </Card>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add comment..."
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
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
        <Button onClick={() => setShowCreate(!showCreate)} variant="outline">
          {showCreate ? "Cancel" : "New PR"}
        </Button>
      </div>
      {showCreate && (
        <Card className="bg-slate-900/50 border-slate-800 p-4 space-y-4">
          <Input
            placeholder="Title"
            value={newPr.title}
            onChange={(e) => setNewPr({ ...newPr, title: e.target.value })}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Source Branch (e.g. feature)"
              value={newPr.source}
              onChange={(e) => setNewPr({ ...newPr, source: e.target.value })}
            />
            <Input
              placeholder="Target Branch"
              value={newPr.target}
              onChange={(e) => setNewPr({ ...newPr, target: e.target.value })}
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
                #{pr.number} by {pr.author?.username}
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

function RepoCollaborators({
  repoId,
  isOwner,
}: {
  repoId: string;
  isOwner: boolean;
}) {
  const [collabs, setCollabs] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [username, setUsername] = useState("");
  const fetchData = useCallback(async () => {
    supabase
      .from("repository_collaborators")
      .select(
        "*, user:profiles!repository_collaborators_user_id_fkey(username, display_name)",
      )
      .eq("repo_id", repoId)
      .then(({ data }) => {
        if (data) setCollabs(data);
      });
    if (isOwner) {
      const { data } = await supabase.rpc("get_my_friendships");
      if (data) setFriends(data.filter((f: any) => f.status === "accepted"));
    }
  }, [repoId, isOwner]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const add = async () => {
    if (!username) return;
    const { error } = await supabase.rpc("add_repo_collaborator", {
      p_repo_id: repoId,
      p_username: username,
      p_permission: "write",
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Added");
      setUsername("");
      fetchData();
    }
  };
  return (
    <div className="space-y-6">
      {isOwner && (
        <div className="flex gap-2">
          <select
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded p-2 text-sm text-white flex-1"
          >
            <option value="">Select a friend...</option>
            {friends.map((f) => (
              <option key={f.id} value={f.profile.username}>
                {f.profile.display_name || f.profile.username}
              </option>
            ))}
          </select>
          <Button onClick={add}>Add</Button>
        </div>
      )}
      <div className="space-y-2">
        {collabs.map((c) => (
          <div
            key={c.id}
            className="flex justify-between items-center p-3 bg-slate-900/30 border border-slate-800 rounded"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
                <Users className="w-4 h-4 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-white">
                  {c.user?.display_name || c.user?.username}
                </p>
              </div>
            </div>
            <Badge variant="outline">{c.permission}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
