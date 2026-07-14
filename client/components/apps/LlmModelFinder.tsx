import { useState, useMemo } from "react";
import {
  Search,
  Cpu,
  HardDrive,
  Zap,
  ExternalLink,
  Info,
  Layers,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const TASKS = [
  { id: "text-generation", label: "Text Generation", hfTag: "text-generation" },
  { id: "chat", label: "Roleplaying/Chatting", hfTag: "conversational" },
  {
    id: "coding",
    label: "Coding",
    hfTag: "text-generation",
    additionalTags: ["code"],
  },
  { id: "summarization", label: "Summarization", hfTag: "summarization" },
  {
    id: "thinking",
    label: "Thinking",
    hfTag: "text-generation",
    additionalTags: ["reasoning", "thought", "deepseek-r1"],
  },
  {
    id: "agent",
    label: "Coding Agent",
    hfTag: "text-generation",
    additionalTags: ["agent", "tool-use"],
  },
];

interface Model {
  id: string;
  name: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  lastModified: string;
  paramsEstimate?: number; // in billions
  ramRequired?: number; // in GB
}

export const LlmModelFinderApp = () => {
  const [task, setTask] = useState(TASKS[0].id);
  const [ram, setRam] = useState(16);
  const [useGpu, setUseGpu] = useState(false);
  const [vram, setVram] = useState(8);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<Model[]>([]);

  const ramLimit = useMemo(() => Math.max(0, ram - 1), [ram]); // 1GB reserved

  const fetchModels = async () => {
    setLoading(true);
    setError(null);
    try {
      const selectedTask = TASKS.find((t) => t.id === task);
      let url = `https://huggingface.co/api/models?filter=${selectedTask?.hfTag}&sort=downloads&direction=-1&limit=100&full=true&config=true`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch models from Hugging Face: ${response.statusText}`,
        );
      }
      const data = await response.json();

      const processedModels = data.map((m: any) => {
        let params = 0;

        const paramTag = m.tags?.find(
          (t: string) =>
            t.toLowerCase().startsWith("params:") || /^[0-9.]+[bm]$/i.test(t),
        );

        if (paramTag) {
          const match = paramTag.match(/([0-9.]+)([BMbm])?/);
          if (match) {
            params = parseFloat(match[1]);
            const unit = match[2]?.toLowerCase();
            if (unit === "m") {
              params = params / 1000;
            }
          }
        } else {
          const nameMatch = m.id.match(/([0-9.]+)[Bb]/);
          if (nameMatch) params = parseFloat(nameMatch[1]);
        }

        const ramNeeded = params > 0 ? params * 0.7 + 1.0 : 0;

        return {
          id: m.id,
          name: m.id.split("/")[1],
          author: m.id.split("/")[0],
          downloads: m.downloads,
          likes: m.likes,
          tags: m.tags || [],
          lastModified: m.lastModified,
          paramsEstimate: params,
          ramRequired: ramNeeded,
        };
      });

      const filtered = processedModels.filter((m: Model) => {
        const matchesSearch = m.id
          .toLowerCase()
          .includes(searchQuery.toLowerCase());
        const hardwareLimit = useGpu ? vram : ramLimit;
        // Only include models with known size that fit
        const fitsInHardware =
          m.ramRequired > 0 && m.ramRequired <= hardwareLimit;

        const matchesAdditional = selectedTask?.additionalTags
          ? selectedTask.additionalTags.some(
              (tag) =>
                m.tags.some((mt) => mt.toLowerCase().includes(tag)) ||
                m.id.toLowerCase().includes(tag),
            )
          : true;

        return matchesSearch && fitsInHardware && matchesAdditional;
      });

      setModels(
        filtered.sort((a: Model, b: Model) => b.downloads - a.downloads),
      );
    } catch (err: any) {
      console.error("Error fetching models:", err);
      setError(
        err.message ||
          "An unexpected error occurred while searching for models.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-slate-900/50 border-slate-800 lg:col-span-1 h-fit">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              Hardware Config
            </CardTitle>
            <CardDescription>
              We'll filter models that fit your specs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label className="text-slate-300">What do you want to do?</Label>
              <Select value={task} onValueChange={setTask}>
                <SelectTrigger className="bg-slate-950 border-slate-800 text-white">
                  <SelectValue placeholder="Select task" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-800 text-white">
                  {TASKS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between">
                <Label className="text-slate-300">System RAM</Label>
                <span className="text-cyan-400 font-mono font-bold">
                  {ram} GB
                </span>
              </div>
              <Slider
                value={[ram]}
                onValueChange={(v) => setRam(v[0])}
                min={4}
                max={128}
                step={4}
                className="py-4"
              />
              <p className="text-xs text-slate-500 italic">
                1GB reserved for system. Available: {ramLimit}GB
              </p>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/50 border border-slate-800">
              <div className="space-y-0.5">
                <Label htmlFor="gpu-mode" className="text-slate-300">
                  GPU Acceleration
                </Label>
                <p className="text-[10px] text-slate-500">
                  Search for VRAM compatibility
                </p>
              </div>
              <Switch
                id="gpu-mode"
                checked={useGpu}
                onCheckedChange={setUseGpu}
              />
            </div>

            {useGpu && (
              <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between">
                  <Label className="text-slate-300">VRAM</Label>
                  <span className="text-cyan-400 font-mono font-bold">
                    {vram} GB
                  </span>
                </div>
                <Slider
                  value={[vram]}
                  onValueChange={(v) => setVram(v[0])}
                  min={2}
                  max={48}
                  step={2}
                  className="py-4"
                />
              </div>
            )}

            <Button
              onClick={fetchModels}
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold h-11"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </div>
              ) : (
                "Find Compatible Models"
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-white text-xl">
                  Top Recommendations
                </CardTitle>
                <CardDescription>
                  Models matched to your hardware profile.
                </CardDescription>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  placeholder="Filter by name..."
                  className="pl-9 bg-slate-950 border-slate-800 text-white w-full md:w-64"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] pr-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-slate-500">
                  <Loader2 className="w-12 h-12 mb-4 animate-spin opacity-20 text-cyan-500" />
                  <p className="font-medium">Fetching best models...</p>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-slate-500">
                  <Alert
                    variant="destructive"
                    className="bg-red-900/20 border-red-900/50 text-red-200 w-full max-w-md"
                  >
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Search Failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                  <Button
                    variant="outline"
                    className="mt-4 border-slate-800 text-slate-400"
                    onClick={fetchModels}
                  >
                    Try Again
                  </Button>
                </div>
              ) : models.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[400px] text-slate-500 border-2 border-dashed border-slate-800 rounded-xl">
                  <Search className="w-12 h-12 mb-4 opacity-20" />
                  <p className="font-medium text-lg">No models found</p>
                  <p className="text-sm">
                    Try adjusting your specs or search query.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {models.map((model) => (
                    <div
                      key={model.id}
                      className="group p-5 rounded-xl bg-slate-950/50 border border-slate-800 hover:border-cyan-500/50 transition-all duration-200"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h3 className="text-white font-bold text-lg group-hover:text-cyan-400 transition-colors">
                              {model.name}
                            </h3>
                            {model.paramsEstimate ? (
                              <Badge
                                variant="secondary"
                                className="bg-cyan-500/10 text-cyan-400 border-none px-2 py-0"
                              >
                                {model.paramsEstimate.toFixed(1)}B
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">
                            {model.author}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-slate-500 hover:text-white hover:bg-slate-800 -mt-2 -mr-2"
                          onClick={() =>
                            window.open(
                              `https://huggingface.co/${model.id}`,
                              "_blank",
                            )
                          }
                          aria-label="Open in HuggingFace"
                          title="Open in HuggingFace"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-6 mb-4">
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-xs text-slate-300 font-medium">
                            {model.ramRequired?.toFixed(1)}GB{" "}
                            {useGpu ? "VRAM" : "RAM"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-yellow-500" />
                          <span className="text-xs text-slate-300">
                            {model.downloads > 1000
                              ? `${(model.downloads / 1000).toFixed(1)}k`
                              : model.downloads}{" "}
                            pulls
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Layers className="w-3.5 h-3.5 text-blue-400" />
                          <span className="text-xs text-slate-300">
                            {model.tags.includes("gguf")
                              ? "GGUF Native"
                              : "Auto-Quant"}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-5">
                        {model.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-500 border border-slate-800"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="pt-4 border-t border-slate-800/50 flex items-center justify-between">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-8 bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 text-xs"
                            onClick={() =>
                              window.open(
                                `https://ollama.com/search?q=${model.name.toLowerCase()}`,
                                "_blank",
                              )
                            }
                          >
                            Search Ollama
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-cyan-500 hover:text-cyan-400 text-xs"
                            onClick={() =>
                              window.open(
                                `https://huggingface.co/spaces/HuggingFaceH4/open_llm_leaderboard`,
                                "_blank",
                              )
                            }
                          >
                            Bench
                          </Button>
                        </div>
                        <div className="text-[10px] text-slate-600 italic">
                          Updated{" "}
                          {new Date(model.lastModified).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
