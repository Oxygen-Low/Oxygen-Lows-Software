import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitCommit, Loader2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";

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
  const { t } = useTranslation();
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCommits = async () => {
      try {
        // Fetch last 10 commits list and their stats from our server
        const response = await fetch("/api/changelogs");
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || "Failed to fetch commits");
        }
        
        const commitsWithStats: Commit[] = await response.json();
        
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
          <h2 className="text-xl font-bold mb-2">{t("changelogs.errorLoading", undefined, "Error Loading Changelogs")}</h2>
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
          <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
            {t("changelogs.title", undefined, "Changelogs")}
          </h1>
        </div>
      </div>

      <div className="relative border-l-2 border-muted/50 ml-4 sm:ml-6 space-y-6 pb-4 mt-6">
        {commits.map((commit, index) => {
          const title = commit.commit.message.split("\n")[0];
          const description = commit.commit.message.split("\n").slice(1).join("\n").trim();
          
          return (
            <motion.div
              key={commit.sha}
              initial={{ opacity: 0, x: -20, y: 10 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.3, ease: "easeOut" }}
              className="relative pl-6 sm:pl-8"
            >
              {/* Timeline dot */}
              <div className="absolute -left-[7px] top-4 w-3 h-3 rounded-full bg-background border-2 border-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
              
              <div className="bg-card hover:bg-card/80 transition-all duration-300 border border-border/50 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md hover:border-primary/30 group">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-2">
                  <div className="flex-1">
                    <div className="text-base sm:text-lg font-bold">
                      {title}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
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
                    <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold bg-background/50 border border-border/40 py-1.5 px-3 rounded-lg whitespace-nowrap shadow-sm">
                      <span className="flex items-center gap-1 text-emerald-500">
                        +{commit.stats.additions}
                      </span>
                      <span className="flex items-center gap-1 text-rose-500">
                        -{commit.stats.deletions}
                      </span>
                    </div>
                  )}
                </div>
                
                {description && (
                  <div className="mt-3 relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent rounded-lg pointer-events-none" />
                    <pre className="text-xs sm:text-sm text-muted-foreground/90 whitespace-pre-wrap font-sans bg-muted/20 p-3 sm:p-4 rounded-lg border border-border/30 relative">
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
