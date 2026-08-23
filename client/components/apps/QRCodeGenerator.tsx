import { useState, useRef } from "react";
import {
  QrCode,
  Download,
  Copy,
  Settings2,
  CheckCircle2,
  Palette,
  LayoutTemplate,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";

export function QRCodeGeneratorApp() {
  const [value, setValue] = useState("https://example.com");
  const [size, setSize] = useState(256);
  const [fgColor, setFgColor] = useState("#ffffff");
  const [bgColor, setBgColor] = useState("transparent");
  const [marginSize, setMarginSize] = useState(4);

  const qrRef = useRef<SVGSVGElement>(null);

  const handleDownload = () => {
    if (!qrRef.current) return;

    try {
      const svgData = new XMLSerializer().serializeToString(qrRef.current);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        // Adjust canvas size based on selected size plus some padding for margin if background is not transparent
        const padding = bgColor !== "transparent" ? marginSize * 10 : 0;
        canvas.width = size + padding * 2;
        canvas.height = size + padding * 2;

        if (ctx) {
          if (bgColor !== "transparent") {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, padding, padding, size, size);

          const pngFile = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.download = "qrcode.png";
          downloadLink.href = pngFile;
          downloadLink.click();
          toast.success("QR Code downloaded successfully");
        }
      };

      img.src =
        "data:image/svg+xml;base64," +
        btoa(unescape(encodeURIComponent(svgData)));
    } catch (error) {
      console.error("Error generating download:", error);
      toast.error("Failed to download QR code");
    }
  };

  const handleCopyLink = () => {
    if (!value) {
      toast.error("Please enter a link or text first");
      return;
    }
    navigator.clipboard.writeText(value);
    toast.success("Link copied to clipboard");
  };

  const presetColors = [
    { fg: "#ffffff", bg: "transparent" },
    { fg: "#06b6d4", bg: "transparent" }, // Cyan
    { fg: "#10b981", bg: "transparent" }, // Emerald
    { fg: "#f43f5e", bg: "transparent" }, // Rose
    { fg: "#8b5cf6", bg: "transparent" }, // Violet
    { fg: "#000000", bg: "#ffffff" }, // Classic B&W
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">
      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <QrCode className="w-5 h-5 text-cyan-500" />
              Content
            </CardTitle>
            <CardDescription className="text-slate-400">
              Enter the link or text you want to convert into a QR code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">URL or Text</Label>
              <div className="flex gap-2">
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="https://example.com"
                  className="bg-slate-950 border-slate-800 text-white flex-1"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                  className="bg-slate-950 border-slate-800 text-slate-400 hover:text-white shrink-0"
                  title="Copy text"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-cyan-500" />
              Customization
            </CardTitle>
            <CardDescription className="text-slate-400">
              Personalize the appearance of your QR code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between">
                <Label className="text-white flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4 text-slate-400" />
                  Size
                </Label>
                <span className="text-cyan-400 text-sm font-medium">
                  {size}px
                </span>
              </div>
              <Slider
                value={[size]}
                onValueChange={(vals) => setSize(vals[0])}
                min={128}
                max={512}
                step={8}
                className="py-4"
              />
              <div className="grid grid-cols-3 gap-2">
                {[128, 256, 512].map((s) => (
                  <Button
                    key={s}
                    variant="secondary"
                    size="sm"
                    onClick={() => setSize(s)}
                    className={cn(
                      "bg-slate-950 border-slate-800 text-slate-400 hover:text-white",
                      size === s &&
                        "bg-cyan-500/10 text-cyan-400 border-cyan-500/50",
                    )}
                  >
                    {s}px
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-slate-400" />
                Colors
              </Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Foreground</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="h-10 w-full bg-slate-950 border-slate-800 cursor-pointer p-1 rounded-md"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-400">Background</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={bgColor === "transparent" ? "#ffffff" : bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      disabled={bgColor === "transparent"}
                      className="h-10 w-full bg-slate-950 border-slate-800 cursor-pointer p-1 rounded-md disabled:opacity-50"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="transparent-bg"
                      checked={bgColor === "transparent"}
                      onChange={(e) =>
                        setBgColor(e.target.checked ? "transparent" : "#ffffff")
                      }
                      className="rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-cyan-500/50"
                    />
                    <Label
                      htmlFor="transparent-bg"
                      className="text-xs text-slate-400 cursor-pointer"
                    >
                      Transparent
                    </Label>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Label className="text-xs text-slate-400 mb-2 block">
                  Presets
                </Label>
                <div className="flex flex-wrap gap-2">
                  {presetColors.map((preset, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setFgColor(preset.fg);
                        setBgColor(preset.bg);
                      }}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 shadow-sm transition-transform hover:scale-110",
                        fgColor === preset.fg && bgColor === preset.bg
                          ? "border-cyan-500 ring-2 ring-cyan-500/20"
                          : "border-slate-700",
                      )}
                      style={{
                        background:
                          preset.bg === "transparent"
                            ? `linear-gradient(45deg, #1e293b 25%, transparent 25%, transparent 75%, #1e293b 75%, #1e293b), linear-gradient(45deg, #1e293b 25%, transparent 25%, transparent 75%, #1e293b 75%, #1e293b)`
                            : preset.bg,
                        backgroundPosition:
                          preset.bg === "transparent"
                            ? "0 0, 4px 4px"
                            : "initial",
                        backgroundSize:
                          preset.bg === "transparent" ? "8px 8px" : "initial",
                        backgroundColor:
                          preset.bg === "transparent" ? "#0f172a" : "initial",
                      }}
                      title="Apply preset"
                    >
                      <div
                        className="w-4 h-4 mx-auto rounded-sm"
                        style={{ backgroundColor: preset.fg }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800 h-full flex flex-col">
          <CardHeader>
            <CardTitle className="text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-cyan-500" />
                Preview
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={!value}
                className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500 hover:text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PNG
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col items-center justify-center p-8">
            <div
              className={cn(
                "relative p-8 rounded-2xl transition-all duration-300 flex items-center justify-center",
                bgColor === "transparent"
                  ? "bg-slate-950 border border-slate-800 shadow-xl"
                  : "shadow-2xl",
              )}
              style={{
                backgroundColor:
                  bgColor === "transparent" ? undefined : bgColor,
              }}
            >
              {value ? (
                <QRCodeSVG
                  ref={qrRef}
                  value={value}
                  size={size > 256 ? 256 : size} // Cap display size to 256px for UI, actual export uses full size
                  fgColor={fgColor}
                  bgColor="transparent" // We handle background in the wrapper for better UI
                  level="H"
                  marginSize={marginSize}
                  className="transition-all duration-300"
                />
              ) : (
                <div
                  className="flex items-center justify-center border-2 border-dashed border-slate-800 rounded-xl"
                  style={{
                    width: size > 256 ? 256 : size,
                    height: size > 256 ? 256 : size,
                  }}
                >
                  <span className="text-slate-500 text-sm text-center px-4">
                    Enter text to generate QR code
                  </span>
                </div>
              )}
            </div>

            {value && size > 256 && (
              <p className="mt-6 text-sm text-slate-500">
                Preview scaled for display. Export will be {size}x{size}px.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
