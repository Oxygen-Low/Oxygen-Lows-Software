import { useState } from "react";
import {
  Code,
  ArrowRight,
  ArrowLeft,
  Copy,
  CheckCircle2,
  AlertCircle,
  FileText
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

export function Base64EncoderApp() {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const handleEncode = () => {
    if (!input) {
      setOutput("");
      return;
    }
    try {
      // In JS, btoa takes a binary string. To handle Unicode, we encode encodeURIComponent and unescape
      // but a standard btoa for basic text is often enough. For robustness:
      const encoded = btoa(unescape(encodeURIComponent(input)));
      setOutput(encoded);
      toast.success("Encoded successfully");
    } catch (e: any) {
      toast.error(e.message || "Failed to encode text");
    }
  };

  const handleDecode = () => {
    if (!input) {
      setOutput("");
      return;
    }
    try {
      const decoded = decodeURIComponent(escape(atob(input)));
      setOutput(decoded);
      toast.success("Decoded successfully");
    } catch (e: any) {
      toast.error("Invalid Base64 string");
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
            Input text
          </CardTitle>
          <CardDescription className="text-slate-400">
            Enter the text or Base64 string you want to convert.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type or paste your text here..."
            className="flex-1 resize-none bg-slate-950 border-slate-800 text-white font-mono text-sm min-h-[300px]"
          />
          <div className="grid grid-cols-2 gap-4">
            <Button
              className="bg-cyan-500 hover:bg-cyan-600 text-white h-12"
              onClick={handleEncode}
              disabled={!input}
            >
              <ArrowRight className="w-5 h-5 mr-2" />
              Encode
            </Button>
            <Button
              variant="outline"
              className="border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10 h-12"
              onClick={handleDecode}
              disabled={!input}
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Decode
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
              The converted result will appear here.
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
