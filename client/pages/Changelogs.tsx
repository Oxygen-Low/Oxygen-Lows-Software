import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitCommit, ArrowRight, Loader2, PlusCircle, MinusCircle } from "lucide-react";
import { Layout } from "@/components/Layout";

interface CommitStats {
  additions: number;
  deletions: number;
  total: number;
}

interface Commit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
  stats?: CommitStats;
}

export default function Changelogs() {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCommits = async () => {
      try {
        // Fetch last 10 commits list
        const response = await fetch("https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/commits?per_page=10");
        if (!response.ok) throw new Error("Failed to fetch commits");
        const data: Commit[] = await response.json();
        
        // Fetch detailed stats for each commit to get insertions and deletions
        const commitsWithStats = await Promise.all(
          data.map(async (commit) => {
            try {
              const detailRes = await fetch(`https://api.github.com/repos/Oxygen-Low/Oxygen-Lows-Software/commits/${commit.sha}`);
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                return { ...commit, stats: detailData.stats };
              }
            } catch (e) {
              console.error("Failed to fetch stats for commit", commit.sha);
            }
            return commit;
          })
        );
        
        setCommits(commitsWithStats);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCommits();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-8 text-center bg-destructive/10 rounded-xl border border-destructive/20 text-destructive">
          <h2 className="text-xl font-bold mb-2">Error Loading Changelogs</h2>
          <p>{error}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 max-w-4xl mx-auto w-full px-2 py-4">
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-inner">
          <GitCommit className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            Changelogs
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base font-medium">
            Latest updates from the Oxygen Low's Software repository
          </p>
        </div>
      </div>

      <div className="relative border-l-2 border-muted/50 ml-4 sm:ml-6 space-y-10 pb-8 mt-12">
        {commits.map((commit, index) => {
          const title = commit.commit.message.split("\n")[0];
          const description = commit.commit.message.split("\n").slice(1).join("\n").trim();
          
          return (
            <motion.div
              key={commit.sha}
              initial={{ opacity: 0, x: -20, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ delay: index * 0.08, duration: 0.4, ease: "easeOut" }}
              className="relative pl-8 sm:pl-10"
            >
              {/* Timeline dot */}
              <div className="absolute -left-[11px] top-4 w-5 h-5 rounded-full bg-background border-[3px] border-primary shadow-[0_0_10px_rgba(var(--primary),0.5)]" />
              
              <div className="bg-card hover:bg-card/80 transition-all duration-300 border border-border/50 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-primary/30 group">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div className="flex-1">
                    <a 
                      href={commit.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-lg sm:text-xl font-bold hover:text-primary transition-colors flex items-center gap-2 group/link w-fit"
                    >
                      {title}
                      <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all" />
                    </a>
                    <div className="text-sm text-muted-foreground mt-2 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground/80">{commit.commit.author.name}</span>
                      <span className="text-muted-foreground/50">•</span>
                      <span>{new Date(commit.commit.author.date).toLocaleDateString(undefined, { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}</span>
                    </div>
                  </div>
                  
                  {commit.stats && (
                    <div className="flex items-center gap-4 text-sm font-semibold bg-background/50 border border-border/40 py-2 px-4 rounded-xl whitespace-nowrap shadow-sm">
                      <span className="flex items-center gap-1.5 text-emerald-500">
                        <PlusCircle className="w-4 h-4" />
                        {commit.stats.additions}
                      </span>
                      <span className="flex items-center gap-1.5 text-rose-500">
                        <MinusCircle className="w-4 h-4" />
                        {commit.stats.deletions}
                      </span>
                    </div>
                  )}
                </div>
                
                {description && (
                  <div className="mt-5 relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded-xl pointer-events-none" />
                    <pre className="text-sm text-muted-foreground/90 whitespace-pre-wrap font-sans bg-muted/20 p-4 sm:p-5 rounded-xl border border-border/30 relative">
                      {description}
                    </pre>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
      </div>
    </Layout>
  );
}
