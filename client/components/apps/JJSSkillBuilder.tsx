import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Copy, CheckCircle2, AlertCircle, Music, Share2 } from "lucide-react";
import { convertMidiToBlocks, blocksToCode } from "@/lib/midi-converter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ConvertedBlock = {
  type: "Sound" | "Wait";
  id?: string;
  speed?: number;
  start?: number;
  end?: number;
  duration?: number;
};

export function JJSSkillBuilderApp() {
  const [blocks, setBlocks] = useState<ConvertedBlock[]>([]);
  const [blockCode, setBlockCode] = useState("");
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".mid")) {
      setError("Please upload a valid .mid file");
      return;
    }

    setIsConverting(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const convertedBlocks = convertMidiToBlocks(arrayBuffer);

      if (convertedBlocks.length === 0) {
        setError("No notes found in MIDI file. Please check your file.");
        setIsConverting(false);
        return;
      }

      setBlocks(convertedBlocks);
      const code = blocksToCode(convertedBlocks);
      setBlockCode(code);
      toast.success(`Successfully converted MIDI file with ${convertedBlocks.length} blocks`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to parse MIDI file";
      setError(message);
      toast.error(message);
    } finally {
      setIsConverting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(blockCode);
      setCopied(true);
      toast.success("Copied to clipboard!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const handleClear = () => {
    setBlocks([]);
    setBlockCode("");
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="w-5 h-5 text-cyan-500" />
              MIDI to Blocks Converter
            </CardTitle>
            <CardDescription>Upload a piano MIDI file to convert it to JJS Skill Builder blocks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="midi-input" className="text-slate-300">
                Upload MIDI File
              </Label>
              <div className="relative">
                <Input
                  ref={fileInputRef}
                  id="midi-input"
                  type="file"
                  accept=".mid,.midi"
                  onChange={handleFileSelect}
                  disabled={isConverting}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  className="w-full border-dashed border-2 border-slate-700 hover:border-cyan-500 hover:bg-slate-800 text-slate-300 h-24 flex flex-col items-center justify-center gap-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isConverting}
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-sm">{isConverting ? "Converting..." : "Click to upload or drag MIDI file"}</span>
                </Button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {blocks.length > 0 && (
              <div className="space-y-3">
                <div className="p-3 bg-slate-800 rounded-lg">
                  <p className="text-sm text-slate-300">
                    <span className="font-semibold text-cyan-400">{blocks.length}</span> blocks converted
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {blocks.filter((b) => b.type === "Sound").length} sound blocks, {blocks.filter((b) => b.type === "Wait").length} wait blocks
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={handleCopyCode}
                    className={cn(
                      "flex-1",
                      copied
                        ? "bg-green-600 hover:bg-green-600"
                        : "bg-cyan-600 hover:bg-cyan-700"
                    )}
                    disabled={!blockCode}
                  >
                    {copied ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Code
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleClear}
                    className="border-slate-700 hover:bg-slate-800"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {blockCode && (
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-lg">Generated Code</CardTitle>
              <CardDescription>Copy this into your JJS Skill Builder</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={blockCode}
                readOnly
                className="font-mono text-sm bg-slate-950 border-slate-700 text-slate-200 h-96 resize-none"
                spellCheck="false"
              />
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-cyan-500" />
            Publish & Share
          </CardTitle>
          <CardDescription>Coming soon - share your block examples with the community</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-slate-800 rounded-lg border border-dashed border-slate-700 text-center">
            <p className="text-slate-400 text-sm">
              This feature is coming soon. You'll be able to upload your created blocks, add comments, and get feedback from the community.
            </p>
          </div>
        </CardContent>
      </Card>

      {blocks.length > 0 && (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg">Block Preview</CardTitle>
            <CardDescription>First 10 blocks from your conversion</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {blocks.slice(0, 10).map((block, idx) => (
                <div key={idx} className="p-2 bg-slate-800 rounded border border-slate-700 text-sm font-mono text-slate-300">
                  {block.type === "Sound" ? (
                    <span>
                      <span className="text-cyan-400">Sound</span>
                      <span className="text-slate-500">([</span>
                      <span className="text-yellow-400">{block.id}</span>
                      <span className="text-slate-500">], </span>
                      <span className="text-green-400">{block.speed}</span>
                      <span className="text-slate-500">, </span>
                      <span className="text-orange-400">{block.start}</span>
                      <span className="text-slate-500">, </span>
                      <span className="text-orange-400">{block.end}</span>
                      <span className="text-slate-500">)</span>
                    </span>
                  ) : (
                    <span>
                      <span className="text-cyan-400">Wait</span>
                      <span className="text-slate-500">(</span>
                      <span className="text-purple-400">{block.duration}</span>
                      <span className="text-slate-500">)</span>
                    </span>
                  )}
                </div>
              ))}
              {blocks.length > 10 && (
                <p className="text-xs text-slate-500 text-center pt-2">
                  ... and {blocks.length - 10} more blocks
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
