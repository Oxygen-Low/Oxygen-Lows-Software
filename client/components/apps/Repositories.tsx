import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { Book, Code, AlertCircle, GitPullRequest, Settings, Plus, ChevronRight, Folder, File, Save, RefreshCw, Copy, Search, ExternalLink, Send, Users, Info } from "lucide-react";
import { Github } from "./GithubIcon";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import Editor from "@monaco-editor/react";

export function RepositoriesApp() {
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newRepo, setNewRepo] = useState({ name: "", description: "", initReadme: true });

  const fetchRepos = useCallback(async () => {
    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) return;

      const res = await fetch("/api/repos", {
        headers: { Authorization: "Bearer " + session.session.access_token }
      });
      if (res.ok) setRepos(await res.json());
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
    if (!newRepo.name) return;
    try {
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + (session.session?.access_token || "")
        },
        body: JSON.stringify(newRepo)
      });

      if (res.ok) {
        toast.success("Repository created");
        setShowCreate(false);
        setNewRepo({ name: "", description: "", initReadme: true });
        fetchRepos();
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to create repository");
      }
    } catch (err) {
      toast.error("Error creating repository");
    }
  };

  const filteredRepos = repos.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedRepo) {
    return <RepoDetail repo={selectedRepo} onBack={() => { setSelectedRepo(null); fetchRepos(); }} />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Repositories</h1>
          <p className="text-slate-400">Manage and browse your git repositories</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-cyan-600 hover:bg-cyan-700">
          <Plus className="w-4 h-4 mr-2" /> New Repository
        </Button>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Search repositories..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-slate-900 border-slate-800"
          />
        </div>
      </div>

      {showCreate && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle>Create New Repository</CardTitle>
            <CardDescription>A repository contains all project files, including the revision history.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Repository Name</label>
              <Input
                placeholder="my-awesome-project"
                value={newRepo.name}
                onChange={e => setNewRepo({ ...newRepo, name: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Description (optional)</label>
              <Input
                placeholder="Brief description of your project"
                value={newRepo.description}
                onChange={e => setNewRepo({ ...newRepo, description: e.target.value })}
                className="bg-slate-950 border-slate-800"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={newRepo.initReadme}
                onChange={e => setNewRepo({ ...newRepo, initReadme: e.target.checked })}
                id="initReadme"
              />
              <label htmlFor="initReadme" className="text-sm">Initialize with a README</label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={createRepo}>Create Repository</Button>
              <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRepos.map(repo => (
            <Card
              key={repo.id}
              className="bg-slate-900/50 border-slate-800 hover:border-slate-700 transition-colors cursor-pointer group"
              onClick={() => setSelectedRepo(repo)}
            >
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Book className="w-4 h-4 text-cyan-400" />
                    <CardTitle className="text-lg text-white">{repo.profiles?.username}/{repo.name}</CardTitle>
                  </div>
                  <Badge variant={repo.is_loaded ? "default" : "secondary"}>
                    {repo.is_loaded ? "Loaded" : "Unloaded"}
                  </Badge>
                  {repo.github_repo_full_name && <Badge variant="secondary" className="bg-slate-800 text-slate-300 ml-1"><Github className="w-3 h-3 mr-1" />Github</Badge>}
                </div>
                <CardDescription className="line-clamp-2 mt-1">{repo.description || "No description."}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> {new Date(repo.updated_at).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1"><Plus className="w-3 h-3" /> {(repo.zip_size_bytes / 1024).toFixed(1)} KB</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function RepoDetail({ repo, onBack }: { repo: any, onBack: () => void }) {
  const [activeTab, setActiveTab] = useState("code");
  const [tree, setTree] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
  }, []);

  const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
  const host = typeof window !== "undefined" ? window.location.host : "localhost";
  const cloneUrl = protocol + "//" + host + "/api/git/" + (repo.profiles?.username || "owner") + "/" + repo.name + ".git";

  const fetchTree = useCallback(async (path = "") => {
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch("/api/repos/" + repo.id + "/files?path=" + path, {
        headers: { Authorization: "Bearer " + (token.session?.access_token || "") }
      });
      if (res.ok) {
        const files = await res.json();
        setTree(files.map((f: string) => ({
          name: f.split("/").pop(),
          path: f,
          type: f.endsWith("/") ? "tree" : "blob"
        })));
        setCurrentPath(path);
      }
    } catch (err) {
      toast.error("Failed to fetch files");
    }
  }, [repo.id]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const loadFile = async (path: string) => {
    setSelectedFile(path);
    setLoading(true);
    try {
      const { data: token } = await supabase.auth.getSession();
      const res = await fetch("/api/repos/" + repo.id + "/file?path=" + path, {
        headers: { Authorization: "Bearer " + (token.session?.access_token || "") }
      });
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
          Authorization: "Bearer " + (token.session?.access_token || "")
        },
        body: JSON.stringify({
          filePath: selectedFile,
          content: fileContent,
          branch: repo.default_branch,
          message: "Update " + selectedFile
        })
      });
      if (res.ok) toast.success("File saved");
      else toast.error("Failed to save file");
    } catch (err) {
      toast.error("Error saving file");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto h-full overflow-auto">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronRight className="w-4 h-4 rotate-180 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <Book className="w-5 h-5 text-cyan-400" />
            <h2 className="text-xl font-bold text-white">{repo.profiles?.username}/{repo.name}</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={repo.is_loaded ? "default" : "secondary"}>
            {repo.is_loaded ? "Loaded" : "Unloaded"}
          </Badge>
          {repo.github_repo_full_name && <Badge variant="secondary" className="bg-slate-800 text-slate-300 ml-1"><Github className="w-3 h-3 mr-1" />Github</Badge>}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-900 border-slate-800">
          <TabsTrigger value="code" className="gap-2"><Code className="w-4 h-4" />Code</TabsTrigger>
          <TabsTrigger value="issues" className="gap-2"><AlertCircle className="w-4 h-4" />Issues</TabsTrigger>
          <TabsTrigger value="pulls" className="gap-2"><GitPullRequest className="w-4 h-4" />Pull Requests</TabsTrigger>
          <TabsTrigger value="settings" className="gap-2"><RefreshCw className="w-4 h-4" />Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="code" className="mt-4">
          <div className="grid grid-cols-12 gap-4">
            <Card className="col-span-12 md:col-span-4 lg:col-span-3 bg-slate-900/50 border-slate-800">
              <CardHeader className="p-4 border-b border-slate-800"><CardTitle className="text-sm font-medium">Files</CardTitle></CardHeader>
              <ScrollArea className="h-[500px]">
                <div className="p-2 space-y-1">
                  {currentPath && <div onClick={() => fetchTree(currentPath.split("/").slice(0, -1).join("/"))} className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded cursor-pointer text-sm text-slate-400"><Folder className="w-4 h-4" />..</div>}
                  {tree.map(item => (
                    <div key={item.path} onClick={() => item.type === "tree" ? fetchTree(item.path) : loadFile(item.path)} className={cn("flex items-center gap-2 p-2 hover:bg-slate-800 rounded cursor-pointer text-sm text-white", selectedFile === item.path && "bg-slate-800")}>{item.type === "tree" ? <Folder className="w-4 h-4 text-cyan-400" /> : <File className="w-4 h-4 text-slate-400" />}{item.name}</div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
            <Card className="col-span-12 md:col-span-8 lg:col-span-9 bg-slate-950 border-slate-800">
              {selectedFile ? (
                <div className="flex flex-col h-[560px]">
                  <div className="flex justify-between items-center p-3 border-b border-slate-800 bg-slate-900/50">
                    <span className="text-sm font-mono text-slate-300">{selectedFile}</span>
                    <Button size="sm" onClick={saveFile} disabled={isSaving}>{isSaving ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <Save className="w-3 h-3 mr-2" />}Save</Button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <Editor height="100%" theme="vs-dark" defaultLanguage="typescript" value={fileContent} onChange={(v) => setFileContent(v || "")} options={{ minimap: { enabled: false }, fontSize: 13 }} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[500px] text-slate-500 gap-4"><Code className="w-12 h-12 opacity-20" /><p>Select a file to view its content</p></div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="issues" className="mt-4"><RepoIssues repoId={repo.id} /></TabsContent>
        <TabsContent value="pulls" className="mt-4"><RepoPullRequests repoId={repo.id} /></TabsContent>

        <TabsContent value="settings" className="mt-4 space-y-4">
           <Card className="bg-slate-900/50 border-slate-800">
             <CardHeader>
               <CardTitle className="text-white">Clone Repository</CardTitle>
               <CardDescription>Clone this repository to your local machine. Read access is public.</CardDescription>
             </CardHeader>
             <CardContent className="space-y-4">
               <div className="space-y-2">
                 <label className="text-xs font-medium text-slate-400">Clone URL</label>
                 <div className="flex gap-2">
                   <Input readOnly value={cloneUrl} className="bg-slate-950 border-slate-800 font-mono text-xs" />
                   <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(cloneUrl); toast.success("Copied to clipboard"); }}><Copy className="w-4 h-4" /></Button>
                 </div>
               </div>
               <p className="text-[10px] text-slate-500 flex items-center gap-1">
                 <Info className="w-3 h-3" />
                 To push changes, use your Supabase Access Token as the password.
               </p>
             </CardContent>
           </Card>
           <Card className="bg-slate-900/50 border-slate-800"><CardHeader><CardTitle className="text-white">Collaborators</CardTitle><CardDescription>Manage who has access to this repository.</CardDescription></CardHeader><CardContent><RepoCollaborators repoId={repo.id} isOwner={repo.owner_id === session?.user?.id} /></CardContent></Card>
           {repo.owner_id === session?.user?.id && (
             <Card className="bg-red-950/20 border-red-900/50"><CardHeader><CardTitle className="text-red-400">Danger Zone</CardTitle><CardDescription>Irreversible actions for this repository.</CardDescription></CardHeader><CardContent><Button variant="destructive" onClick={async () => { if(confirm("Delete?")) { try { const { data: token } = await supabase.auth.getSession(); const res = await fetch("/api/repos/" + repo.id, { method: "DELETE", headers: { Authorization: "Bearer " + (token.session?.access_token || "") } }); if (res.ok) { toast.success("Repository deleted"); onBack(); } else { const error = await res.json(); toast.error(error.error || "Failed to delete repository"); } } catch (err) { toast.error("Error deleting repository"); } } }}>Delete Repository</Button></CardContent></Card>
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
    const { data } = await supabase.from("repository_issues").select("*, author:profiles!author_id(username)").eq("repo_id", repoId).order("created_at", { ascending: false });
    if (data) setIssues(data);
  }, [repoId]);
  useEffect(() => { fetchIssues(); }, [fetchIssues]);
  return (
    <div className="space-y-6">
      <div className="flex gap-2"><Input placeholder="Issue title" value={title} onChange={e => setTitle(e.target.value)} /><Button onClick={async () => { if(!title) return; await supabase.from("repository_issues").insert({ repo_id: repoId, title, author_id: (await supabase.auth.getUser()).data.user?.id }); setTitle(""); fetchIssues(); }}>Create Issue</Button></div>
      <div className="space-y-2">
        {issues.map(issue => <Card key={issue.id} className="bg-slate-900/50 border-slate-800"><CardHeader className="p-4"><div className="flex justify-between items-center"><div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-green-500" /><CardTitle className="text-base text-white">{issue.title}</CardTitle><span className="text-xs text-slate-500">#{issue.number}</span></div><Badge variant="outline">{issue.status}</Badge></div><CardDescription>opened by {issue.author?.username || issue.github_username}</CardDescription></CardHeader></Card>)}
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
    const { data } = await supabase.from("repository_pull_requests").select("*, author:profiles!author_id(username)").eq("repo_id", repoId).order("created_at", { ascending: false });
    if (data) setPrs(data);
  }, [repoId]);
  useEffect(() => { fetchPrs(); }, [fetchPrs]);

  const loadPr = async (pr: any) => {
    setSelectedPr(pr);
    const { data: token } = await supabase.auth.getSession();
    const res = await fetch("/api/repos/" + repoId + "/pulls/" + pr.id + "/diff", { headers: { Authorization: "Bearer " + (token.session?.access_token || "") } });
    setDiff(await res.text());
    const { data: comms } = await supabase.from("repository_pull_request_comments").select("*, user:profiles!user_id(username)").eq("pr_id", pr.id).order("created_at", { ascending: true });
    if (comms) setComments(comms);
  };

  const merge = async () => {
    const { data: token } = await supabase.auth.getSession();
    const res = await fetch("/api/repos/" + repoId + "/pulls/" + selectedPr.id + "/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token.session?.access_token || "") }
    });
    if (res.ok) { toast.success("Merged"); fetchPrs(); setSelectedPr(null); }
  };

  const addComment = async () => {
    if (!newComment) return;
    await supabase.from("repository_pull_request_comments").insert({ pr_id: selectedPr.id, user_id: (await supabase.auth.getUser()).data.user?.id, body: newComment });
    setNewComment(""); loadPr(selectedPr);
  };

  const createPr = async () => {
    if (!newPr.title || !newPr.source) return;
    const { data: token } = await supabase.auth.getSession();
    const res = await fetch("/api/repos/" + repoId + "/pulls", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (token.session?.access_token || "") }, body: JSON.stringify({ title: newPr.title, source_branch: newPr.source, target_branch: newPr.target }) });
    if (res.ok) { toast.success("PR Created"); setShowCreate(false); fetchPrs(); }
  };

  if (selectedPr) return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={() => setSelectedPr(null)}><ChevronRight className="w-4 h-4 rotate-180 mr-1" />Back</Button>
      <div className="flex justify-between">
        <div><h2 className="text-xl font-bold text-white">{selectedPr.title} <span className="text-slate-500">#{selectedPr.number}</span></h2><p className="text-sm text-slate-400">{selectedPr.author?.username || selectedPr.github_username} wants to merge {selectedPr.source_branch} into {selectedPr.target_branch}</p></div>
        {selectedPr.status === 'open' && <Button onClick={merge} className="bg-purple-600 hover:bg-purple-700">Merge PR</Button>}
      </div>
      <Tabs defaultValue="diff"><TabsList><TabsTrigger value="diff">Diff</TabsTrigger><TabsTrigger value="comments">Comments ({comments.length})</TabsTrigger></TabsList>
        <TabsContent value="diff"><Card className="bg-slate-950 p-4 font-mono text-xs text-slate-400 overflow-auto max-h-[400px]"><pre>{diff || "No changes."}</pre></Card></TabsContent>
        <TabsContent value="comments" className="space-y-4">
          <div className="space-y-2">{comments.map(c => <Card key={c.id} className="bg-slate-900/50 border-slate-800"><CardHeader className="p-3 border-b border-slate-800"><span className="text-xs font-bold">{c.user?.username}</span></CardHeader><CardContent className="p-3 text-sm">{c.body}</CardContent></Card>)}</div>
          <div className="flex gap-2"><Input placeholder="Add comment..." value={newComment} onChange={e => setNewComment(e.target.value)} /><Button onClick={addComment} size="sm"><Send className="w-4 h-4" /></Button></div>
        </TabsContent>
      </Tabs>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center"><h3 className="text-lg font-medium text-white">Pull Requests</h3><Button onClick={() => setShowCreate(!showCreate)} variant="outline">{showCreate ? "Cancel" : "New PR"}</Button></div>
      {showCreate && (
        <Card className="bg-slate-900/50 border-slate-800 p-4 space-y-4">
          <Input placeholder="Title" value={newPr.title} onChange={e => setNewPr({...newPr, title: e.target.value})} />
          <div className="flex gap-2">
            <Input placeholder="Source Branch (e.g. feature)" value={newPr.source} onChange={e => setNewPr({...newPr, source: e.target.value})} />
            <Input placeholder="Target Branch" value={newPr.target} onChange={e => setNewPr({...newPr, target: e.target.value})} />
          </div>
          <Button onClick={createPr}>Create Pull Request</Button>
        </Card>
      )}
      <div className="space-y-2">
        {prs.map(pr => <Card key={pr.id} className="bg-slate-900/50 border-slate-800 hover:border-slate-700 cursor-pointer" onClick={() => loadPr(pr)}><CardHeader className="p-4"><div className="flex items-center gap-2"><GitPullRequest className="w-4 h-4 text-green-500" /><CardTitle className="text-base text-white">{pr.title}</CardTitle><Badge className="ml-auto">{pr.status}</Badge></div><CardDescription>#{pr.number} by {pr.author?.username || pr.github_username}</CardDescription></CardHeader></Card>)}
        {prs.length === 0 && !showCreate && <div className="py-10 text-center border-2 border-dashed border-slate-800 rounded-xl text-slate-500">No PRs found.</div>}
      </div>
    </div>
  );
}

function RepoCollaborators({ repoId, isOwner }: { repoId: string, isOwner: boolean }) {
  const [collabs, setCollabs] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [username, setUsername] = useState("");
  const fetchData = useCallback(async () => {
    supabase.from("repository_collaborators").select("*, user:profiles!user_id(username, display_name)").eq("repo_id", repoId).then(({ data }) => { if (data) setCollabs(data); });
    if (isOwner) { const { data } = await supabase.rpc("get_my_friendships"); if (data) setFriends(data.filter((f:any) => f.status === 'accepted')); }
  }, [repoId, isOwner]);
  useEffect(() => { fetchData(); }, [fetchData]);
  const add = async () => {
    if (!username) return;
    const { error } = await supabase.rpc("add_repo_collaborator", { p_repo_id: repoId, p_username: username, p_permission: "write" });
    if (error) toast.error(error.message); else { toast.success("Added"); setUsername(""); fetchData(); }
  };
  return (
    <div className="space-y-6">
      {isOwner && <div className="flex gap-2"><select value={username} onChange={e => setUsername(e.target.value)} className="bg-slate-900 border border-slate-800 rounded p-2 text-sm text-white flex-1"><option value="">Select a friend...</option>{friends.map(f => <option key={f.id} value={f.profile.username}>{f.profile.display_name || f.profile.username}</option>)}</select><Button onClick={add}>Add</Button></div>}
      <div className="space-y-2">{collabs.map(c => <div key={c.id} className="flex justify-between items-center p-3 bg-slate-900/30 border border-slate-800 rounded"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center"><Users className="w-4 h-4 text-slate-500" /></div><div><p className="text-sm font-medium text-white">{c.user?.display_name || c.user?.username}</p></div></div><Badge variant="outline">{c.permission}</Badge></div>)}</div>
    </div>
  );
}
