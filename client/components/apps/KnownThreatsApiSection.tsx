import React, { useState } from "react";
import { useTranslation } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Check, Zap } from "lucide-react";
import { toast } from "sonner";

export function KnownThreatsApiSection() {
  const { t } = useTranslation();
  const [copiedTab, setCopiedTab] = useState<string | null>(null);
  const [activeLang, setActiveLang] = useState("curl");

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(id);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const curlSnippet = `# GET Request
curl -X GET "https://oxygenlow.com/api/webdefender/known-threats?ip=1.1.1.1"

# POST Request
curl -X POST "https://oxygenlow.com/api/webdefender/known-threats" \\
  -H "Content-Type: application/json" \\
  -d '{"ip": "1.1.1.1"}'`;

  const jsSnippet = `// GET Request
const res = await fetch("https://oxygenlow.com/api/webdefender/known-threats?ip=1.1.1.1");
const data = await res.json();
console.log(data);

// POST Request
const res = await fetch("https://oxygenlow.com/api/webdefender/known-threats", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ip: "1.1.1.1" }),
});
const data = await res.json();
console.log(data);`;

  const pythonSnippet = `import requests

# GET Request
res = requests.get(
    "https://oxygenlow.com/api/webdefender/known-threats",
    params={"ip": "1.1.1.1"}
)
print(res.json())

# POST Request
res = requests.post(
    "https://oxygenlow.com/api/webdefender/known-threats",
    json={"ip": "1.1.1.1"}
)
print(res.json())`;

  const responseSnippet = `{
  "ip": "1.1.1.1",
  "is_known_threat": false,
  "is_tor": false,
  "is_vpn": false,
  "details": {
    "banned": false,
    "banned_reason": null,
    "threat_actor": false,
    "threat_category": null
  }
}`;

  return (
    <div className="mt-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold text-white">
              {t("threatLookup.apiTitle", undefined, "Known Threats API")}
            </h3>
            <Badge variant="outline" className="text-cyan-400 border-cyan-500/30 bg-cyan-500/10">
              REST API
            </Badge>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            {t(
              "threatLookup.apiSubtitle",
              undefined,
              "Query IP threat intelligence programmatically without an API key (up to 5,000 req/min).",
            )}
          </p>
        </div>
        <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/10 w-fit shrink-0">
          <Zap className="w-3 h-3 mr-1" />
          {t("threatLookup.apiRateLimit", undefined, "5,000 req/min · No Auth Required")}
        </Badge>
      </div>

      <Card className="bg-slate-900 border-slate-800 overflow-hidden">
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-300">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">GET</span>
            <span className="text-slate-200">https://oxygenlow.com/api/webdefender/known-threats?ip=&#123;ip&#125;</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-semibold">POST</span>
            <span className="text-slate-200">https://oxygenlow.com/api/webdefender/known-threats</span>
          </div>
        </div>

        <CardContent className="p-6">
          <Tabs value={activeLang} onValueChange={setActiveLang}>
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-slate-950 border border-slate-800">
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="curl" className="space-y-4 m-0">
              <div className="relative group">
                <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
                  {curlSnippet}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy cURL snippet"
                  className="absolute top-2 right-2 h-8 w-8 text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800"
                  onClick={() => copyToClipboard(curlSnippet, "curl")}
                >
                  {copiedTab === "curl" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="javascript" className="space-y-4 m-0">
              <div className="relative group">
                <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
                  {jsSnippet}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy JavaScript snippet"
                  className="absolute top-2 right-2 h-8 w-8 text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800"
                  onClick={() => copyToClipboard(jsSnippet, "javascript")}
                >
                  {copiedTab === "javascript" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="python" className="space-y-4 m-0">
              <div className="relative group">
                <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
                  {pythonSnippet}
                </pre>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Copy Python snippet"
                  className="absolute top-2 right-2 h-8 w-8 text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800"
                  onClick={() => copyToClipboard(pythonSnippet, "python")}
                >
                  {copiedTab === "python" ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6">
            <div className="text-sm font-semibold text-slate-300 mb-2">
              {t("threatLookup.apiResponseExample", undefined, "Example Response")}
            </div>
            <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-xs font-mono text-slate-300">
              {responseSnippet}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
