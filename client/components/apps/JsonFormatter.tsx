import { useState } from "react";
import {
  Code,
  ArrowRight,
  Copy,
  CheckCircle2,
  AlertCircle,
  FileText,
  Minimize2,
  Braces,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function JsonFormatterApp() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const handleFormat = () => {
    if (!input) {
      setOutput("");
      return;
    }
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed, null, 2));
      toast.success("JSON formatted successfully");
    } catch (e: any) {
      toast.error(e.message || "Invalid JSON string");
    }
  };

  const handleMinify = () => {
    if (!input) {
      setOutput("");
      return;
    }
    try {
      const parsed = JSON.parse(input);
      setOutput(JSON.stringify(parsed));
      toast.success("JSON minified successfully");
    } catch (e: any) {
      toast.error(e.message || "Invalid JSON string");
    }
  };

  const copyToClipboard = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      toast.success("Copied to clipboard");
    } catch (err) {
      toast.error("Failed to copy text");
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full max-w-7xl mx-auto w-full pb-8">
      <Card className="bg-slate-900/50 border-slate-800 flex flex-col h-full min-h-[500px]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-500" />
            Input JSON
          </CardTitle>
          <CardDescription className="text-slate-400">
            Enter the raw JSON string you want to format or validate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='{"hello": "world"}'
            className="flex-1 resize-none bg-slate-950 border-slate-800 text-white font-mono text-sm min-h-[300px]"
            spellCheck={false}
          />
          <div className="grid grid-cols-2 gap-4">
            <Button
              className="bg-cyan-500 hover:bg-cyan-600 text-white h-12"
              onClick={handleFormat}
              disabled={!input}
            >
              <Braces className="w-5 h-5 mr-2" />
              Format
            </Button>
            <Button
              variant="outline"
              className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 h-12"
              onClick={handleMinify}
              disabled={!input}
            >
              <Minimize2 className="w-5 h-5 mr-2" />
              Minify
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800 flex flex-col h-full min-h-[500px]">
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Output result
            </CardTitle>
            <CardDescription className="text-slate-400 mt-1.5">
              The formatted or minified JSON will appear here.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={copyToClipboard}
            className="text-slate-400 hover:text-white mt-1"
            disabled={!output}
            aria-label="Copy output"
            title="Copy output"
          >
            <Copy className="w-5 h-5" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          <Textarea
            value={output}
            readOnly
            placeholder="Result will be displayed here..."
            className="flex-1 resize-none bg-slate-950/50 border-slate-800 text-slate-300 font-mono text-sm min-h-[300px] focus-visible:ring-0"
            spellCheck={false}
          />
        </CardContent>
      </Card>
    </div>
  );
}
