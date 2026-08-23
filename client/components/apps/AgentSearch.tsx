import React, { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Search, Globe, Loader2, Square, Image as ImageIcon, X, ChevronDown, ChevronRight, FileText, ExternalLink, Zap, Copy, Check } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useAgentSearch, AgentSearchImage } from "@/hooks/useAgentSearch";

export const AgentSearchApp = () => {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { search, isSearching, status, toolCalls, result, error, abort } = useAgentSearch();

  const [query, setQuery] = useState("");
  const [responseFormat, setResponseFormat] = useState("conclusion");
  const [images, setImages] = useState<AgentSearchImage[]>([]);
  const [copied, setCopied] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<number, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleTool = (index: number) => {
    setExpandedTools(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copied to clipboard");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    if (images.length + files.length > 5) {
      toast.error("Maximum 5 images allowed");
      return;
    }

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImages(prev => [...prev, {
            data: event.target!.result as string,
            type: file.type
          }]);
        }
      };
      reader.readAsDataURL(file);
    });
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    try {
      await search({
        query: query.trim(),
        responseFormat,
        images: images.length > 0 ? images : undefined,
        stream: true
      });
    } catch (err: any) {
      toast.error(t("apps.agentSearchError", undefined, "Search failed") + ": " + err.message);
    }
  };

  if (!session) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="text-center p-8 bg-card rounded-lg border border-border shadow-sm">
            <Globe className="w-12 h-12 mx-auto text-primary mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("apps.agentSearchSignIn", undefined, "Sign in to use Agent Search")}</h2>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-full max-w-4xl mx-auto p-4 md:p-6 space-y-6">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-full mb-2">
            <Globe className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">{t("apps.agentSearchTitle", undefined, "Agent Search")}</h1>
          <p className="text-muted-foreground">{t("apps.agentSearchDesc", undefined, "AI-powered agentic search that researches the web and synthesizes answers.")}</p>
        </div>

        {/* Input Area */}
        <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-4">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("apps.agentSearchPlaceholder", undefined, "What would you like to research?")}
            className="w-full min-h-[100px] bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground"
            disabled={isSearching}
          />
          
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img.data} alt="Attached" className="h-16 w-16 object-cover rounded-md border border-border" />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    disabled={isSearching}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                ref={fileInputRef}
                onChange={handleImageUpload}
                disabled={isSearching || images.length >= 5}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSearching || images.length >= 5}
                title={t("apps.agentSearchAttachImage", undefined, "Attach image")}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                {images.length}/5
              </Button>
              
              <select
                value={responseFormat}
                onChange={(e) => setResponseFormat(e.target.value)}
                className="bg-background border border-border text-sm rounded-md px-3 py-2 outline-none focus:ring-1 focus:ring-primary"
                disabled={isSearching}
              >
                <option value="conclusion">{t("apps.agentSearchConclusion", undefined, "Conclusion")}</option>
                <option value="description">{t("apps.agentSearchDescription", undefined, "Description")}</option>
                <option value="summary">{t("apps.agentSearchSummary", undefined, "Summary")}</option>
                <option value="analysis">{t("apps.agentSearchAnalysis", undefined, "Analysis")}</option>
                <option value="comparison">{t("apps.agentSearchComparison", undefined, "Comparison")}</option>
              </select>
            </div>
            
            {isSearching ? (
              <Button variant="destructive" onClick={abort}>
                <Square className="w-4 h-4 mr-2" />
                {t("apps.agentSearchAbort", undefined, "Stop search")}
              </Button>
            ) : (
              <Button onClick={handleSearch} disabled={!query.trim()}>
                <Search className="w-4 h-4 mr-2" />
                {t("apps.agentSearchTitle", undefined, "Search")}
              </Button>
            )}
          </div>
        </div>

        {/* Progress Area */}
        {isSearching && status && (
          <div className="flex items-center gap-3 text-muted-foreground bg-card/50 p-3 rounded-lg border border-border">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="font-medium">{status}</span>
          </div>
        )}

        {/* Tool Calls */}
        {toolCalls.length > 0 && (
          <div className="space-y-2">
            {toolCalls.map((call, i) => {
              const isExpanded = expandedTools[i];
              return (
                <div key={i} className="bg-card border border-border rounded-lg overflow-hidden text-sm">
                  <button
                    onClick={() => toggleTool(i)}
                    className="w-full flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {call.name === "search_web" ? <Globe className="w-4 h-4 text-blue-500" /> : <FileText className="w-4 h-4 text-green-500" />}
                    <span className="font-medium text-foreground">{call.name}</span>
                    <span className="text-muted-foreground truncate flex-1 text-xs">
                      {JSON.stringify(call.args)}
                    </span>
                    {!call.result && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  </button>
                  
                  {isExpanded && call.result && (
                    <div className="p-3 pt-0 border-t border-border bg-muted/20">
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-x-auto p-2 bg-background rounded">
                        {JSON.stringify(call.result, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Result Area */}
        {error && (
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-lg">
            {error}
          </div>
        )}

        {result && (
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm flex-1 flex flex-col min-h-[300px]">
            <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-medium">
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <Check className="w-4 h-4 text-green-500" />}
                {isSearching ? t("apps.agentSearchSearching", undefined, "Searching...") : t("apps.agentSearchComplete", undefined, "Search complete")}
              </div>
              <div className="flex items-center gap-2">
                {!isSearching && (
                  <span className="text-xs text-muted-foreground flex items-center bg-background px-2 py-1 rounded-md border border-border">
                    <Zap className="w-3 h-3 mr-1 text-yellow-500" />
                    {t("apps.agentSearchPointsUsed", undefined, "points used")}
                  </span>
                )}
                <Button variant="ghost" size="sm" onClick={handleCopy} title="Copy result">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            
            <ScrollArea className="flex-1 p-4 md:p-6 prose prose-sm md:prose-base dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <SyntaxHighlighter
                        {...props}
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        className="rounded-md border border-border"
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code {...props} className="bg-muted px-1.5 py-0.5 rounded-md text-sm">
                        {children}
                      </code>
                    );
                  },
                  a({ node, children, href, ...props }) {
                    return (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5" {...props}>
                        {children}
                        <ExternalLink className="w-3 h-3 inline" />
                      </a>
                    );
                  }
                }}
              >
                {result}
              </ReactMarkdown>
            </ScrollArea>
          </div>
        )}
      </div>
    </Layout>
  );
};
