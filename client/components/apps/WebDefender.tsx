import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, Check, Copy, ArrowLeft, AlertTriangle, Plus,
  Settings, Activity, Lock, Key, Trash2, Globe, Search,
  ShieldCheck, ArrowRight, X, ChevronDown, ChevronRight,
  Server, Zap, RefreshCw
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from "recharts";

export function CountryFlag({
  countryCode,
  className = "w-4 h-3 rounded-[2px] object-cover shrink-0 inline-block shadow-sm",
  alt
}: {
  countryCode?: string | null;
  className?: string;
  alt?: string;
}) {
  const [hasError, setHasError] = useState(false);

  if (!countryCode || countryCode.length !== 2) {
    return <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0 inline-block" />;
  }

  const code = countryCode.toLowerCase();

  if (hasError) {
    return (
      <span className="inline-flex items-center justify-center bg-slate-800 text-[10px] font-semibold text-slate-300 px-1 py-0.5 rounded border border-slate-700 select-none shrink-0 leading-none">
        {countryCode.toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
      alt={alt || `${countryCode.toUpperCase()} flag`}
      className={`inline-block ${className}`}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

function getCountryFlag(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

export const COUNTRIES = [
  { code: 'AF', name: 'Afghanistan' }, { code: 'AL', name: 'Albania' }, { code: 'DZ', name: 'Algeria' },
  { code: 'AD', name: 'Andorra' }, { code: 'AO', name: 'Angola' }, { code: 'AR', name: 'Argentina' },
  { code: 'AM', name: 'Armenia' }, { code: 'AU', name: 'Australia' }, { code: 'AT', name: 'Austria' },
  { code: 'AZ', name: 'Azerbaijan' }, { code: 'BS', name: 'Bahamas' }, { code: 'BH', name: 'Bahrain' },
  { code: 'BD', name: 'Bangladesh' }, { code: 'BY', name: 'Belarus' }, { code: 'BE', name: 'Belgium' },
  { code: 'BZ', name: 'Belize' }, { code: 'BO', name: 'Bolivia' }, { code: 'BA', name: 'Bosnia and Herzegovina' },
  { code: 'BR', name: 'Brazil' }, { code: 'BG', name: 'Bulgaria' }, { code: 'KH', name: 'Cambodia' },
  { code: 'CM', name: 'Cameroon' }, { code: 'CA', name: 'Canada' }, { code: 'CL', name: 'Chile' },
  { code: 'CN', name: 'China' }, { code: 'CO', name: 'Colombia' }, { code: 'CR', name: 'Costa Rica' },
  { code: 'HR', name: 'Croatia' }, { code: 'CU', name: 'Cuba' }, { code: 'CY', name: 'Cyprus' },
  { code: 'CZ', name: 'Czech Republic' }, { code: 'DK', name: 'Denmark' }, { code: 'DO', name: 'Dominican Republic' },
  { code: 'EC', name: 'Ecuador' }, { code: 'EG', name: 'Egypt' }, { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' }, { code: 'FR', name: 'France' }, { code: 'GE', name: 'Georgia' },
  { code: 'DE', name: 'Germany' }, { code: 'GH', name: 'Ghana' }, { code: 'GR', name: 'Greece' },
  { code: 'GT', name: 'Guatemala' }, { code: 'HN', name: 'Honduras' }, { code: 'HK', name: 'Hong Kong' },
  { code: 'HU', name: 'Hungary' }, { code: 'IS', name: 'Iceland' }, { code: 'IN', name: 'India' },
  { code: 'ID', name: 'Indonesia' }, { code: 'IR', name: 'Iran' }, { code: 'IQ', name: 'Iraq' },
  { code: 'IE', name: 'Ireland' }, { code: 'IL', name: 'Israel' }, { code: 'IT', name: 'Italy' },
  { code: 'JM', name: 'Jamaica' }, { code: 'JP', name: 'Japan' }, { code: 'JO', name: 'Jordan' },
  { code: 'KZ', name: 'Kazakhstan' }, { code: 'KE', name: 'Kenya' }, { code: 'KW', name: 'Kuwait' },
  { code: 'LV', name: 'Latvia' }, { code: 'LB', name: 'Lebanon' }, { code: 'LT', name: 'Lithuania' },
  { code: 'LU', name: 'Luxembourg' }, { code: 'MY', name: 'Malaysia' }, { code: 'MX', name: 'Mexico' },
  { code: 'MD', name: 'Moldova' }, { code: 'MC', name: 'Monaco' }, { code: 'MA', name: 'Morocco' },
  { code: 'NP', name: 'Nepal' }, { code: 'NL', name: 'Netherlands' }, { code: 'NZ', name: 'New Zealand' },
  { code: 'NG', name: 'Nigeria' }, { code: 'KP', name: 'North Korea' }, { code: 'MK', name: 'North Macedonia' },
  { code: 'NO', name: 'Norway' }, { code: 'OM', name: 'Oman' }, { code: 'PK', name: 'Pakistan' },
  { code: 'PA', name: 'Panama' }, { code: 'PY', name: 'Paraguay' }, { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' }, { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' },
  { code: 'PR', name: 'Puerto Rico' }, { code: 'QA', name: 'Qatar' }, { code: 'RO', name: 'Romania' },
  { code: 'RU', name: 'Russia' }, { code: 'SA', name: 'Saudi Arabia' }, { code: 'RS', name: 'Serbia' },
  { code: 'SG', name: 'Singapore' }, { code: 'SK', name: 'Slovakia' }, { code: 'SI', name: 'Slovenia' },
  { code: 'ZA', name: 'South Africa' }, { code: 'KR', name: 'South Korea' }, { code: 'ES', name: 'Spain' },
  { code: 'LK', name: 'Sri Lanka' }, { code: 'SE', name: 'Sweden' }, { code: 'CH', name: 'Switzerland' },
  { code: 'TW', name: 'Taiwan' }, { code: 'TH', name: 'Thailand' }, { code: 'TN', name: 'Tunisia' },
  { code: 'TR', name: 'Turkey' }, { code: 'UA', name: 'Ukraine' }, { code: 'AE', name: 'United Arab Emirates' },
  { code: 'GB', name: 'United Kingdom' }, { code: 'US', name: 'United States' }, { code: 'UY', name: 'Uruguay' },
  { code: 'UZ', name: 'Uzbekistan' }, { code: 'VE', name: 'Venezuela' }, { code: 'VN', name: 'Vietnam' },
  { code: 'ZW', name: 'Zimbabwe' }
];

type App = {
  id: string;
  name: string;
  api_key_prefix: string;
  block_mode_enabled: boolean;
  block_mode_enabled_at: string | null;
  first_request_at: string | null;
  created_at: string;
  defender_config?: any;
};

type AppConfig = {
  block_sql_injection: boolean;
  block_shell_injection: boolean;
  block_path_traversal: boolean;
  block_ssrf: boolean;
  block_tor: boolean;
  ddos_protection: boolean;
  ddos_threshold_rpm: number;
  block_countries: string[];
  block_ad_bots: boolean;
  block_ai_assistants: boolean;
  block_ai_scrapers: boolean;
  block_ai_search_crawlers: boolean;
  block_data_harvesters: boolean;
  block_bruteforce: boolean;
  block_http_dos: boolean;
  block_http_exploit: boolean;
  block_botnets: boolean;
};

type Route = {
  id: string;
  method: string;
  path: string;
  rate_limit_enabled: boolean;
  rate_limit_requests: number;
  rate_limit_window_seconds: number;
};

type Event = {
  id: string;
  created_at: string;
  ip: string;
  country_code: string | null;
  event_type: string;
  method: string;
  path: string;
  blocked: boolean;
  user_agent: string | null;
};

type Outbound = {
  id: string;
  host: string;
  port: number;
  protocol: string;
  first_seen: string;
  last_seen: string;
  request_count: number;
  allowed: boolean;
};

export function DefenderApp() {
  const { session } = useAuth();
  const [apps, setApps] = useState<App[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // App Creation State
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [newAppKey, setNewAppKey] = useState<string | null>(null);

  // App Deletion State
  const [appToDelete, setAppToDelete] = useState<App | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const authFetch = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
    });
    if (!res.ok) throw new Error(await res.text());
    return res;
  }, [session]);

  const loadApps = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await authFetch('/api/defender/apps');
      const data = await res.json();
      setApps(data || []);
    } catch (err) {
      console.error(err);
      toast.error("Failed to load apps.");
    } finally {
      setIsLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (session) {
      loadApps();
    }
  }, [session, loadApps]);

  const handleCreateApp = async () => {
    try {
      const res = await authFetch('/api/defender/apps', {
        method: 'POST',
        body: JSON.stringify({ name: newAppName })
      });
      const data = await res.json();
      setNewAppKey(data.apiKey);
      loadApps();
      toast.success("App created successfully.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to create app.");
    }
  };

  const handleDeleteAppFromList = async () => {
    if (!appToDelete) return;
    setIsDeleting(true);
    try {
      await authFetch(`/api/defender/apps/${appToDelete.id}`, { method: 'DELETE' });
      toast.success("App deleted successfully.");
      setAppToDelete(null);
      setDeleteConfirmText("");
      loadApps();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete app.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!selectedAppId) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
          <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center">
            <Shield className="w-10 h-10 text-cyan-500" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Web Defender</h1>
          <p className="text-lg text-slate-400 max-w-xl">
            Protect your websites and APIs from attacks, bots, and malicious traffic.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Activity className="w-8 h-8 text-cyan-500 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {apps.map(app => (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} key={app.id}>
                <Card 
                  className="group cursor-pointer border-slate-800 bg-slate-900/50 hover:bg-slate-900 hover:border-cyan-500/50 transition-all"
                  onClick={() => setSelectedAppId(app.id)}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <CardTitle className="text-xl text-white line-clamp-1">{app.name}</CardTitle>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={app.block_mode_enabled ? "destructive" : "default"} className={cn(app.block_mode_enabled ? "" : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20")}>
                          {app.block_mode_enabled ? "Block Mode ON" : "Block Mode OFF"}
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAppToDelete(app);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <CardDescription className="font-mono text-xs">
                      Key: {app.api_key_prefix}••••••••
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm">
                      <div className={cn("w-2 h-2 rounded-full", app.first_request_at ? "bg-emerald-500" : "bg-slate-500")} />
                      <span className="text-slate-400">
                        {app.first_request_at ? "Connected" : "Not Connected"}
                      </span>
                    </div>
                    <div className="mt-4 text-xs text-slate-500">
                      Created {new Date(app.created_at).toLocaleDateString()}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}

            <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
              setIsCreateDialogOpen(open);
              if (!open) { setNewAppName(""); setNewAppKey(null); }
            }}>
              <DialogTrigger asChild>
                <Card className="cursor-pointer border-dashed border-2 border-slate-800 bg-transparent hover:border-cyan-500/50 hover:bg-slate-900/30 transition-all flex flex-col items-center justify-center min-h-[200px]">
                  <Plus className="w-10 h-10 text-slate-500 mb-2" />
                  <span className="text-slate-400 font-medium">Create App</span>
                </Card>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800">
                <DialogHeader>
                  <DialogTitle>Create New Web Defender App</DialogTitle>
                  <DialogDescription>
                    Set up a new application to monitor and protect.
                  </DialogDescription>
                </DialogHeader>
                {!newAppKey ? (
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">App Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., Production API"
                        value={newAppName}
                        onChange={(e) => setNewAppName(e.target.value)}
                        className="bg-slate-900 border-slate-800"
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateApp} disabled={!newAppName.trim()}>Create App</Button>
                    </DialogFooter>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/50 text-rose-400">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Important</AlertTitle>
                      <AlertDescription>
                        This API key will only be shown once. Copy it now and store it securely.
                      </AlertDescription>
                    </Alert>
                    <div className="flex gap-2">
                      <Input value={newAppKey} readOnly className="bg-slate-900 font-mono text-sm border-slate-800" />
                      <Button variant="outline" size="icon" onClick={() => {
                        navigator.clipboard.writeText(newAppKey);
                        toast.success("Copied to clipboard");
                      }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <DialogFooter>
                      <Button onClick={() => setIsCreateDialogOpen(false)}>Done</Button>
                    </DialogFooter>
                  </div>
                )}
              </DialogContent>
            </Dialog>

            <Dialog open={!!appToDelete} onOpenChange={(open) => {
              if (!open) { setAppToDelete(null); setDeleteConfirmText(""); }
            }}>
              <DialogContent className="sm:max-w-md bg-slate-950 border-slate-800">
                <DialogHeader>
                  <DialogTitle>Delete App</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete <strong>{appToDelete?.name}</strong> and all its configuration and logs.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Type <strong className="text-white">{appToDelete?.name}</strong> to confirm</Label>
                    <Input 
                      value={deleteConfirmText} 
                      onChange={e => setDeleteConfirmText(e.target.value)} 
                      className="bg-slate-900 border-slate-800" 
                      placeholder={appToDelete?.name}
                    />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setAppToDelete(null); setDeleteConfirmText(""); }}>Cancel</Button>
                    <Button 
                      variant="destructive" 
                      onClick={handleDeleteAppFromList} 
                      disabled={deleteConfirmText !== appToDelete?.name || isDeleting}
                    >
                      {isDeleting ? "Deleting..." : "Delete App"}
                    </Button>
                  </DialogFooter>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        <div className="mt-12">
          <h3 className="text-xl font-semibold text-white mb-6">Integration Setup</h3>
          <Card className="bg-slate-900 border-slate-800 overflow-hidden">
            <div className="p-4 bg-slate-950 border-b border-slate-800 font-mono text-sm text-slate-300">
              npm install @oxygenlow/webdefender
            </div>
            <CardContent className="p-6">
              <Tabs defaultValue="express">
                <TabsList className="bg-slate-950 border border-slate-800 mb-4">
                  <TabsTrigger value="express">Express</TabsTrigger>
                  <TabsTrigger value="hono">Hono</TabsTrigger>
                  <TabsTrigger value="next">Next.js</TabsTrigger>
                </TabsList>
                <TabsContent value="express" className="space-y-4">
                  <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
{`import express from 'express';
import { defender } from '@oxygenlow/webdefender/express';

const app = express();

// Add middleware before other routes
app.use(defender({
  apiKey: process.env.DEFENDER_API_KEY
}));

app.get('/', (req, res) => res.send('Protected!'));`}
                  </pre>
                </TabsContent>
                <TabsContent value="hono" className="space-y-4">
                  <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
{`import { Hono } from 'hono';
import { defender } from '@oxygenlow/webdefender/hono';

const app = new Hono();

// Add middleware before other routes
app.use('*', defender({
  apiKey: process.env.DEFENDER_API_KEY
}));

app.get('/', (c) => c.text('Protected!'));`}
                  </pre>
                </TabsContent>
                <TabsContent value="next" className="space-y-4">
                  <pre className="p-4 bg-slate-950 rounded-lg overflow-x-auto text-sm font-mono text-slate-300">
{`// middleware.ts
import { withDefender } from '@oxygenlow/webdefender/next';

export default withDefender({
  apiKey: process.env.DEFENDER_API_KEY
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};`}
                  </pre>
                </TabsContent>
              </Tabs>
              <div className="mt-6 flex items-center gap-2 p-4 bg-slate-950 rounded-lg text-sm">
                <Lock className="w-4 h-4 text-cyan-500" />
                <span className="text-slate-400">Environment variable:</span>
                <code className="text-cyan-400 font-mono">DEFENDER_API_KEY=def_...</code>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <AppDashboard 
      appId={selectedAppId} 
      onBack={() => { setSelectedAppId(null); loadApps(); }} 
      authFetch={authFetch} 
    />
  );
}

function AppDashboard({ appId, onBack, authFetch }: { appId: string, onBack: () => void, authFetch: any }) {
  const [app, setApp] = useState<App | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [outbounds, setOutbounds] = useState<Outbound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [appRes, routesRes, eventsRes, outboundsRes] = await Promise.all([
        authFetch(`/api/defender/apps/${appId}`),
        authFetch(`/api/defender/apps/${appId}/routes`).catch(() => ({ json: () => ({ routes: [] }) })),
        authFetch(`/api/defender/apps/${appId}/events`).catch(() => ({ json: () => ({ events: [] }) })),
        authFetch(`/api/defender/apps/${appId}/outbound`).catch(() => ({ json: () => ({ outbounds: [] }) }))
      ]);

      const appData = await appRes.json();
      setApp(appData);
      const routesData = await routesRes.json();
      setRoutes(Array.isArray(routesData) ? routesData : (routesData.routes || []));
      const eventsData = await eventsRes.json();
      setEvents(eventsData.events || []);
      const outboundData = await outboundsRes.json();
      setOutbounds(Array.isArray(outboundData) ? outboundData : (outboundData.outbounds || []));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load app data.");
    } finally {
      setIsLoading(false);
    }
  }, [appId, authFetch]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (isLoading && !app) {
    return <div className="flex h-full items-center justify-center"><Activity className="w-8 h-8 text-cyan-500 animate-spin" /></div>;
  }

  if (!app) return <div>App not found</div>;

  const todayEvents = events.filter(e => new Date(e.created_at) > new Date(Date.now() - 86400000));
  const threats = todayEvents.filter(e => e.event_type !== 'allowed');
  const uniqueIps = new Set(todayEvents.map(e => e.ip)).size;

  return (
    <div className="h-full flex flex-col p-6 max-w-[1600px] mx-auto w-full space-y-6">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white">{app.name}</h2>
            <Badge variant={app.block_mode_enabled ? "destructive" : "default"} className={cn(!app.block_mode_enabled && "bg-emerald-500/10 text-emerald-500")}>
              {app.block_mode_enabled ? "Block Mode" : "Observe Mode"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <StatCard title="Total Events (24h)" value={todayEvents.length.toLocaleString()} icon={<Activity className="w-4 h-4" />} />
        <StatCard title="Threats Detected" value={threats.length.toLocaleString()} icon={<ShieldCheck className="w-4 h-4" />} color="text-rose-500" />
        <StatCard title="Unique IPs" value={uniqueIps.toLocaleString()} icon={<Globe className="w-4 h-4" />} />
        <StatCard title="Routes Protected" value={routes.length.toLocaleString()} icon={<Server className="w-4 h-4" />} />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="bg-slate-900 border border-slate-800 shrink-0 w-max">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="routes">Routes ({routes.length})</TabsTrigger>
          <TabsTrigger value="events">Event Log</TabsTrigger>
          <TabsTrigger value="outbound">Outbound</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto mt-6">
          <TabsContent value="overview" className="h-full m-0 space-y-6">
            <OverviewTab app={app} events={todayEvents} authFetch={authFetch} onUpdate={loadData} />
          </TabsContent>
          <TabsContent value="routes" className="h-full m-0">
            <RoutesTab routes={routes} authFetch={authFetch} onUpdate={loadData} />
          </TabsContent>
          <TabsContent value="events" className="h-full m-0">
            <EventsTab events={events} />
          </TabsContent>
          <TabsContent value="outbound" className="h-full m-0">
            <OutboundTab outbounds={outbounds} blockMode={app.block_mode_enabled} authFetch={authFetch} onUpdate={loadData} />
          </TabsContent>
          <TabsContent value="settings" className="h-full m-0">
            <SettingsTab app={app} authFetch={authFetch} onUpdate={loadData} onDelete={onBack} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function StatCard({ title, value, icon, color = "text-cyan-500" }: { title: string, value: string, icon: React.ReactNode, color?: string }) {
  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-400">{title}</p>
            <p className="text-3xl font-bold text-white">{value}</p>
          </div>
          <div className={cn("p-2 bg-slate-950 rounded-lg", color)}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ app, events, authFetch, onUpdate }: { app: App, events: Event[], authFetch: any, onUpdate: () => void }) {
  const toggleBlockMode = async () => {
    try {
      await authFetch(`/api/defender/apps/${app.id}/block-mode`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !app.block_mode_enabled })
      });
      toast.success(`Block mode ${!app.block_mode_enabled ? 'enabled' : 'disabled'}`);
      onUpdate();
    } catch (err) {
      toast.error("Failed to update block mode");
    }
  };

  const chartData = useMemo(() => {
    const data: Record<string, any> = {};
    const now = Date.now();
    for (let i = 23; i >= 0; i--) {
      const d = new Date(now - i * 3600000);
      data[d.getHours()] = { name: `${d.getHours()}:00`, allowed: 0, blocked: 0 };
    }
    events.forEach(e => {
      const hour = new Date(e.created_at).getHours();
      if (data[hour]) {
        if (e.blocked) data[hour].blocked++;
        else data[hour].allowed++;
      }
    });
    return Object.values(data);
  }, [events]);

  const topThreats = useMemo(() => {
    const counts: Record<string, number> = {};
    events.filter(e => e.event_type !== 'allowed').forEach(e => {
      counts[e.event_type] = (counts[e.event_type] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [events]);

  const isWaitPeriod = app.first_request_at && !app.block_mode_enabled_at && 
    (Date.now() - new Date(app.first_request_at).getTime() < 86400000);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle>Block Mode</CardTitle>
            <CardDescription>When enabled, Web Defender will actively block detected threats and unlisted outbound connections.</CardDescription>
          </CardHeader>
          <CardContent>
            {!app.first_request_at ? (
              <Alert className="bg-slate-950 border-slate-800">
                <Activity className="h-4 w-4 text-slate-400" />
                <AlertTitle>Waiting for connection...</AlertTitle>
                <AlertDescription className="text-slate-400">
                  Integrate the SDK into your application to begin monitoring traffic.
                </AlertDescription>
              </Alert>
            ) : isWaitPeriod && !app.block_mode_enabled ? (
              <Alert className="bg-amber-500/10 border-amber-500/50">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <AlertTitle className="text-amber-500">Learning Phase Active</AlertTitle>
                <AlertDescription className="text-amber-400/90 mt-2 flex flex-col gap-4">
                  <p>We recommend waiting at least 24 hours before enabling Block Mode. This allows all outbound connections to be logged, preventing false blocks.</p>
                  <Button variant="outline" className="w-max border-amber-500/50 text-amber-500 hover:bg-amber-500/20" onClick={toggleBlockMode}>
                    Enable Anyway
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex items-center justify-between p-4 bg-slate-950 rounded-lg border border-slate-800">
                <div className="space-y-1">
                  <p className="font-medium text-white">{app.block_mode_enabled ? 'Protection Active' : 'Observation Mode Active'}</p>
                  <p className="text-sm text-slate-400">{app.block_mode_enabled ? 'Threats are currently being blocked.' : 'Threats are logged but not blocked.'}</p>
                </div>
                <Switch checked={app.block_mode_enabled} onCheckedChange={toggleBlockMode} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle>Traffic Overview (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorAllowed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorBlocked" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                  />
                  <Area type="monotone" dataKey="allowed" stroke="#10b981" fillOpacity={1} fill="url(#colorAllowed)" />
                  <Area type="monotone" dataKey="blocked" stroke="#f43f5e" fillOpacity={1} fill="url(#colorBlocked)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="bg-slate-900 border-slate-800 h-[calc(50%-12px)]">
          <CardHeader>
            <CardTitle className="text-lg">Top Threats</CardTitle>
          </CardHeader>
          <CardContent>
            {topThreats.length === 0 ? (
              <div className="text-center text-slate-500 py-8">No threats detected today</div>
            ) : (
              <div className="space-y-4">
                {topThreats.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <EventBadge type={type} />
                    <span className="font-mono text-slate-300">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function RoutesTab({ routes, authFetch, onUpdate }: { routes: Route[], authFetch: any, onUpdate: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Route>>({});

  const handleSave = async (id: string) => {
    try {
      await authFetch(`/api/defender/routes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(editData)
      });
      toast.success("Route updated");
      setEditingId(null);
      onUpdate();
    } catch (err) {
      toast.error("Failed to update route");
    }
  };

  const getMethodColor = (m: string) => {
    switch (m.toUpperCase()) {
      case 'GET': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'POST': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'PUT': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'DELETE': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'PATCH': return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <Table>
        <TableHeader className="bg-slate-950/50">
          <TableRow className="border-slate-800 hover:bg-transparent">
            <TableHead className="whitespace-nowrap">Method</TableHead>
            <TableHead className="w-full">Path</TableHead>
            <TableHead className="whitespace-nowrap">Rate Limit</TableHead>
            <TableHead className="whitespace-nowrap">Max Requests</TableHead>
            <TableHead className="whitespace-nowrap">Window (ms)</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {routes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-slate-500 py-8">
                No routes discovered yet. Routes are added automatically as traffic flows.
              </TableCell>
            </TableRow>
          ) : routes.map(route => {
            const isEditing = editingId === route.id;
            const data = isEditing ? editData : route;
            return (
              <TableRow key={route.id} className="border-slate-800 hover:bg-slate-800/50">
                <TableCell className="whitespace-nowrap">
                  <Badge variant="outline" className={cn(getMethodColor(route.method), "whitespace-nowrap")}>{route.method}</Badge>
                </TableCell>
                <TableCell className="font-mono text-sm text-slate-300">{route.path}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Switch 
                    checked={data.rate_limit_enabled} 
                    onCheckedChange={(c) => {
                      if (!isEditing) { setEditingId(route.id); setEditData({ ...route, rate_limit_enabled: c }); }
                      else setEditData({ ...data, rate_limit_enabled: c });
                    }} 
                  />
                </TableCell>
                <TableCell>
                  {isEditing && data.rate_limit_enabled ? (
                    <Input 
                      type="number" 
                      value={data.rate_limit_requests} 
                      onChange={e => setEditData({ ...data, rate_limit_requests: parseInt(e.target.value) || 0 })}
                      className="w-24 h-8 bg-slate-950 border-slate-700"
                    />
                  ) : data.rate_limit_enabled ? (
                    <span className="text-slate-300">{route.rate_limit_requests}</span>
                  ) : <span className="text-slate-600">-</span>}
                </TableCell>
                <TableCell>
                  {isEditing && data.rate_limit_enabled ? (
                    <Input 
                      type="number" 
                      value={data.rate_limit_window_seconds} 
                      onChange={e => setEditData({ ...data, rate_limit_window_seconds: parseInt(e.target.value) || 0 })}
                      className="w-24 h-8 bg-slate-950 border-slate-700"
                    />
                  ) : data.rate_limit_enabled ? (
                    <span className="text-slate-300">{route.rate_limit_window_seconds}</span>
                  ) : <span className="text-slate-600">-</span>}
                </TableCell>
                <TableCell>
                  {isEditing && (
                    <Button size="sm" onClick={() => handleSave(route.id)}>Save</Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  );
}

function EventBadge({ type }: { type: string }) {
  const config: Record<string, { color: string, label: string }> = {
    sql_injection: { color: 'bg-rose-500/10 text-rose-500 border-rose-500/20', label: 'SQLi' },
    shell_injection: { color: 'bg-rose-500/10 text-rose-500 border-rose-500/20', label: 'Shell' },
    path_traversal: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', label: 'Path Trav' },
    ssrf: { color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', label: 'SSRF' },
    tor: { color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', label: 'TOR' },
    country_block: { color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', label: 'Geo Block' },
    bot: { color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', label: 'Bot' },
    threat_bruteforce: { color: 'bg-red-500/10 text-red-500 border-red-500/20', label: 'Bruteforce' },
    threat_dos: { color: 'bg-rose-600/10 text-rose-600 border-rose-600/20', label: 'HTTP DoS' },
    threat_exploit: { color: 'bg-orange-600/10 text-orange-500 border-orange-600/20', label: 'HTTP Exploit' },
    threat_botnet: { color: 'bg-purple-600/10 text-purple-400 border-purple-600/20', label: 'Botnet' },
    ddos: { color: 'bg-rose-600/10 text-rose-600 border-rose-600/20', label: 'DDoS' },
    rate_limit: { color: 'bg-amber-500/10 text-amber-500 border-amber-500/20', label: 'Rate Limit' },
    allowed: { color: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20', label: 'Allowed' }
  };
  const c = config[type] || { color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', label: type };
  return <Badge variant="outline" className={cn(c.color, "whitespace-nowrap")}>{c.label}</Badge>;
}

function EventsTab({ events }: { events: Event[] }) {
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const itemsPerPage = 20;

  const filtered = useMemo(() => events.filter(e => {
    if (filterType !== 'all' && e.event_type !== filterType) return false;
    if (filterStatus !== 'all') {
      const status = e.blocked ? 'blocked' : 'allowed';
      if (status !== filterStatus) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [events, filterType, filterStatus]);

  const paged = filtered.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const types = Array.from(new Set(events.map(e => e.event_type)));

  return (
    <Card className="bg-slate-900 border-slate-800 flex flex-col h-full">
      <div className="p-4 border-b border-slate-800 flex flex-wrap gap-4 items-center justify-between shrink-0">
        <div className="flex gap-4">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[180px] bg-slate-950 border-slate-800">
              <SelectValue placeholder="Event Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {types.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px] bg-slate-950 border-slate-800">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="allowed">Allowed</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-slate-400">Total: {filtered.length}</div>
      </div>
      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader className="bg-slate-950/50 sticky top-0">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="whitespace-nowrap">Time</TableHead>
              <TableHead className="whitespace-nowrap">IP</TableHead>
              <TableHead className="whitespace-nowrap">Location</TableHead>
              <TableHead className="whitespace-nowrap">Type</TableHead>
              <TableHead className="w-full">Target</TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className="whitespace-nowrap">User Agent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500 py-8">No events found matching filters.</TableCell>
              </TableRow>
            ) : paged.map(e => (
              <TableRow key={e.id} className="border-slate-800 hover:bg-slate-800/50">
                <TableCell className="text-xs text-slate-400 whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</TableCell>
                <TableCell className="font-mono text-xs whitespace-nowrap">{e.ip}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {e.country_code ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CountryFlag countryCode={e.country_code} className="w-4 h-3 rounded-[2px]" />
                      <span>{e.country_code}</span>
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell className="whitespace-nowrap"><EventBadge type={e.event_type} /></TableCell>
                <TableCell className="font-mono text-xs max-w-[200px] truncate">
                  <span className="text-slate-500 mr-2">{e.method}</span>
                  <span className="text-slate-300" title={e.path}>{e.path}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant={e.blocked ? 'destructive' : 'default'} className={cn(!e.blocked && 'bg-emerald-500/10 text-emerald-500', "whitespace-nowrap")}>
                    {e.blocked ? 'blocked' : 'allowed'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-slate-500 max-w-[200px] truncate" title={e.user_agent || ''}>
                  {e.user_agent?.substring(0, 50)}{e.user_agent && e.user_agent.length > 50 ? '...' : ''}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="p-4 border-t border-slate-800 flex justify-between items-center shrink-0">
        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
        <span className="text-sm text-slate-400">Page {page} of {Math.max(1, Math.ceil(filtered.length / itemsPerPage))}</span>
        <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(Math.ceil(filtered.length / itemsPerPage), p + 1))} disabled={page >= Math.ceil(filtered.length / itemsPerPage)}>Next</Button>
      </div>
    </Card>
  );
}

function OutboundTab({ outbounds, blockMode, authFetch, onUpdate }: { outbounds: Outbound[], blockMode: boolean, authFetch: any, onUpdate: () => void }) {
  const handleToggle = async (id: string, isAllowed: boolean) => {
    try {
      await authFetch(`/api/defender/outbound/${id}`, { method: 'PUT', body: JSON.stringify({ allowed: isAllowed }) });
      onUpdate();
    } catch (err) { toast.error("Failed to update outbound rule"); }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this outbound connection record?")) return;
    try {
      await authFetch(`/api/defender/outbound/${id}`, { method: 'DELETE' });
      onUpdate();
    } catch (err) { toast.error("Failed to delete outbound rule"); }
  };

  return (
    <div className="space-y-6">
      <Alert className="bg-slate-900 border-slate-800">
        <Globe className="h-4 w-4 text-cyan-500" />
        <AlertTitle>Outbound Connections</AlertTitle>
        <AlertDescription className="text-slate-400 mt-2">
          All outbound connections from your application are automatically logged. They are allowed by default until you enable Block Mode.
        </AlertDescription>
      </Alert>

      {!blockMode && (
        <Alert className="bg-amber-500/10 border-amber-500/50">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertTitle className="text-amber-500">Observation Mode Active</AlertTitle>
          <AlertDescription className="text-amber-400/90">
            Restrictions configured below will only apply when Block Mode is enabled.
          </AlertDescription>
        </Alert>
      )}

      <Card className="bg-slate-900 border-slate-800">
        <Table>
          <TableHeader className="bg-slate-950/50">
            <TableRow className="border-slate-800 hover:bg-transparent">
              <TableHead className="w-full">Host</TableHead>
              <TableHead className="whitespace-nowrap">Port</TableHead>
              <TableHead className="whitespace-nowrap">Protocol</TableHead>
              <TableHead className="whitespace-nowrap">Requests</TableHead>
              <TableHead className="whitespace-nowrap">Last Seen</TableHead>
              <TableHead className="whitespace-nowrap">Allowed</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {outbounds.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-slate-500 py-8">No outbound connections logged yet.</TableCell>
              </TableRow>
            ) : outbounds.map(o => (
              <TableRow key={o.id} className="border-slate-800 hover:bg-slate-800/50">
                <TableCell className="font-mono text-sm text-white max-w-[200px] truncate">{o.host}</TableCell>
                <TableCell className="font-mono text-sm text-slate-400 whitespace-nowrap">{o.port}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{o.protocol}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{o.request_count}</TableCell>
                <TableCell className="text-sm text-slate-400 whitespace-nowrap">{new Date(o.last_seen).toLocaleString()}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Switch checked={o.allowed} onCheckedChange={(c) => handleToggle(o.id, c)} />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Button variant="ghost" size="icon" onClick={() => handleRemove(o.id)} className="text-rose-500 hover:text-rose-400 hover:bg-rose-500/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

const defaultDefenderConfig: AppConfig = {
  block_sql_injection: true,
  block_shell_injection: true,
  block_path_traversal: true,
  block_ssrf: true,
  block_tor: true,
  ddos_protection: true,
  ddos_threshold_rpm: 1000,
  block_countries: [],
  block_ad_bots: false,
  block_ai_assistants: false,
  block_ai_scrapers: true,
  block_ai_search_crawlers: false,
  block_data_harvesters: true,
  block_bruteforce: true,
  block_http_dos: true,
  block_http_exploit: true,
  block_botnets: true
};

export function getAppConfig(defenderConfig: any): AppConfig {
  if (!defenderConfig) return defaultDefenderConfig;
  const raw = Array.isArray(defenderConfig) ? defenderConfig[0] : defenderConfig;
  return raw ? { ...defaultDefenderConfig, ...raw } : defaultDefenderConfig;
}

function SettingsTab({ app, authFetch, onUpdate, onDelete }: { app: App, authFetch: any, onUpdate: () => void, onDelete: () => void }) {
  const [config, setConfig] = useState<AppConfig>(() => getAppConfig(app.defender_config));
  const [newKey, setNewKey] = useState<string | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  useEffect(() => {
    setConfig(getAppConfig(app.defender_config));
  }, [app.defender_config]);

  const updateConfig = async (updates: Partial<AppConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    try {
      await authFetch(`/api/defender/apps/${app.id}/config`, {
        method: 'PUT',
        body: JSON.stringify(newConfig)
      });
      toast.success("Settings saved");
      onUpdate();
    } catch (err) {
      toast.error("Failed to save settings");
      setConfig(config); // revert
    }
  };

  const handleRotateKey = async () => {
    if (!confirm("Are you sure? The old API key will stop working immediately.")) return;
    setIsRotating(true);
    try {
      const res = await authFetch(`/api/defender/apps/${app.id}/rotate-key`, { method: 'POST' });
      const data = await res.json();
      setNewKey(data.apiKey);
      toast.success("API Key rotated");
      onUpdate();
    } catch (err) {
      toast.error("Failed to rotate API Key");
    } finally {
      setIsRotating(false);
    }
  };

  const handleDelete = async () => {
    if (deleteConfirm !== app.name) return;
    setIsDeleting(true);
    try {
      await authFetch(`/api/defender/apps/${app.id}`, { method: 'DELETE' });
      toast.success("App deleted");
      onDelete();
    } catch (err) {
      toast.error("Failed to delete app");
      setIsDeleting(false);
    }
  };

  if (!config) return <div>Loading config...</div>;

  return (
    <div className="space-y-8 max-w-4xl">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>API Key</CardTitle>
          <CardDescription>Authenticate your application with the Web Defender SDK.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {newKey ? (
            <div className="space-y-4">
              <Alert variant="destructive" className="bg-rose-500/10 border-rose-500/50 text-rose-400">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>New API Key Generated</AlertTitle>
                <AlertDescription>This key will only be shown once. Copy it now.</AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Input value={newKey} readOnly className="bg-slate-950 font-mono text-sm border-slate-700" />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Copied!"); }}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between p-4 bg-slate-950 rounded-lg border border-slate-800">
              <div className="font-mono text-sm text-slate-300">
                {app.api_key_prefix}••••••••••••••••••••••••
              </div>
              <Button variant="outline" size="sm" onClick={handleRotateKey} disabled={isRotating}>
                <RefreshCw className={cn("w-4 h-4 mr-2", isRotating && "animate-spin")} /> Rotate Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Attack Protection</CardTitle>
          <CardDescription>Automatically block common web vulnerabilities.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {[
            { id: 'block_sql_injection', label: 'SQL Injection', desc: 'Detect and block SQL injection attempts.' },
            { id: 'block_shell_injection', label: 'Shell Injection', desc: 'Prevent command execution attacks.' },
            { id: 'block_path_traversal', label: 'Path Traversal', desc: 'Block attempts to read unauthorized files.' },
            { id: 'block_ssrf', label: 'SSRF', desc: 'Prevent Server-Side Request Forgery.' }
          ].map(setting => (
            <div key={setting.id} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-white">{setting.label}</Label>
                <p className="text-sm text-slate-400">{setting.desc}</p>
              </div>
              <Switch checked={config[setting.id as keyof AppConfig] as boolean} onCheckedChange={(c) => updateConfig({ [setting.id]: c })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Traffic Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base text-white">Block TOR Network</Label>
              <p className="text-sm text-slate-400">Deny access from known TOR exit nodes.</p>
            </div>
            <Switch checked={config.block_tor} onCheckedChange={(c) => updateConfig({ block_tor: c })} />
          </div>
          <Separator className="bg-slate-800" />
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="text-base text-white">DDoS Protection</Label>
              <p className="text-sm text-slate-400">Automatically block IPs that exceed the threshold.</p>
            </div>
            <Switch checked={config.ddos_protection} onCheckedChange={(c) => updateConfig({ ddos_protection: c })} />
          </div>
          {config.ddos_protection && (
            <div className="pl-4 border-l-2 border-slate-800 space-y-2">
              <Label className="text-sm text-slate-400">Threshold (Requests per minute per IP)</Label>
              <Input 
                type="number" 
                value={config.ddos_threshold_rpm} 
                onChange={e => updateConfig({ ddos_threshold_rpm: parseInt(e.target.value) || 100 })} 
                className="w-32 bg-slate-950 border-slate-700" 
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Known Threat Actors</CardTitle>
          <CardDescription>Block malicious IP addresses actively tracked on global threat intelligence feeds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {[
            { id: 'block_bruteforce', label: 'Bruteforce Attackers', desc: 'Block known IPs engaged in credential stuffing and brute-force login attempts.' },
            { id: 'block_http_dos', label: 'HTTP DoS Attackers', desc: 'Block known IPs participating in HTTP denial-of-service and flood attacks.' },
            { id: 'block_http_exploit', label: 'HTTP Exploit Attackers', desc: 'Block known IPs actively exploiting web application vulnerabilities and RFI/LFI.' },
            { id: 'block_botnets', label: 'Botnet Actors', desc: 'Block known botnet Command & Control (C2) servers and compromised bot nodes.' }
          ].map(setting => (
            <div key={setting.id} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-white">{setting.label}</Label>
                <p className="text-sm text-slate-400">{setting.desc}</p>
              </div>
              <Switch checked={config[setting.id as keyof AppConfig] as boolean} onCheckedChange={(c) => updateConfig({ [setting.id]: c })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Bot Protection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {[
            { id: 'block_ad_bots', label: 'Ad Bots', desc: 'Block advertising crawlers and indexing bots.' },
            { id: 'block_ai_assistants', label: 'AI Assistants', desc: 'Block AI assistants like ChatGPT browsing, Claude Web.' },
            { id: 'block_ai_scrapers', label: 'AI Data Scrapers', desc: 'Block bots that scrape your content for AI training data.' },
            { id: 'block_ai_search_crawlers', label: 'AI Search Crawlers', desc: 'Block AI-powered search engine crawlers.' },
            { id: 'block_data_harvesters', label: 'Data Harvesters', desc: 'Block bots that scrape emails, phone numbers, and personal data.' }
          ].map(setting => (
            <div key={setting.id} className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base text-white">{setting.label}</Label>
                <p className="text-sm text-slate-400">{setting.desc}</p>
              </div>
              <Switch checked={config[setting.id as keyof AppConfig] as boolean} onCheckedChange={(c) => updateConfig({ [setting.id]: c })} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle>Country Blocking</CardTitle>
          <CardDescription>Select countries to block traffic from.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {(config.block_countries || []).map(code => {
              const country = COUNTRIES.find(c => c.code === code);
              return (
                <Badge key={code} variant="secondary" className="bg-slate-800 hover:bg-slate-700 flex items-center gap-2 py-1 px-2.5">
                  <CountryFlag countryCode={code} className="w-4 h-3 rounded-[2px]" />
                  <span>{country ? country.name : code}</span>
                  <button onClick={() => updateConfig({ block_countries: (config.block_countries || []).filter(c => c !== code) })} className="ml-1 text-slate-400 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
          <Select
            key={(config.block_countries || []).length}
            onValueChange={(val) => {
              if (val && !(config.block_countries || []).includes(val)) {
                updateConfig({ block_countries: [...(config.block_countries || []), val] });
              }
            }}
          >
            <SelectTrigger className="bg-slate-950 border-slate-800">
              <SelectValue placeholder="Add a country to block..." />
            </SelectTrigger>
            <SelectContent>
              <ScrollArea className="h-64">
                {COUNTRIES.filter(c => !(config.block_countries || []).includes(c.code)).map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="flex items-center gap-2">
                      <CountryFlag countryCode={c.code} className="w-4 h-3 rounded-[2px]" />
                      <span>{c.name}</span>
                      <span className="text-slate-500 text-xs font-mono">({c.code})</span>
                    </span>
                  </SelectItem>
                ))}
              </ScrollArea>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="border-rose-500/50 bg-rose-500/5">
        <CardHeader>
          <CardTitle className="text-rose-500">Danger Zone</CardTitle>
          <CardDescription>Permanently delete this application and all its data.</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="destructive">Delete App</Button>
            </DialogTrigger>
            <DialogContent className="bg-slate-950 border-slate-800">
              <DialogHeader>
                <DialogTitle>Are you absolutely sure?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. This will permanently delete the application <strong>{app.name}</strong> and remove all its event logs and configurations. Traffic flowing through this app will fail.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Type <strong className="text-white">{app.name}</strong> to confirm</Label>
                  <Input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} className="bg-slate-900 border-slate-800" />
                </div>
                <DialogFooter>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleteConfirm !== app.name || isDeleting} className="w-full">
                    {isDeleting ? "Deleting..." : "I understand, delete this app"}
                  </Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
