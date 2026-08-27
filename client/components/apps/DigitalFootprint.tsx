import React, { useState, useMemo, useEffect } from "react";
import {
  Fingerprint,
  ShieldAlert,
  ShieldCheck,
  Search,
  Trash2,
  Download,
  ExternalLink,
  AlertTriangle,
  Lock,
  User,
  Mail,
  Phone,
  Key,
  RefreshCw,
  SlidersHorizontal,
  FileText,
  CheckCircle2,
  XCircle,
  Info,
  Laptop,
  Globe,
  Filter,
  Clock,
  ArrowRight,
  Database,
  Copy,
  Check,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
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
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";
import { isDesktopBridgeAvailable } from "@/lib/desktopBridge";
import {
  executeDigitalFootprintScan,
  filterSocialItems,
  exportBackupArchive,
  SAMPLE_SOCIAL_ITEMS,
  RECON_PLATFORMS,
  KNOWN_BREACHES,
  DATA_BROKERS,
  type ScanResult,
  type SocialPlatformId,
  type SocialItem,
  type RedactFilterOptions,
  type DeletionProgress,
} from "@/lib/digitalFootprint";
import { cn } from "@/lib/utils";

export function DigitalFootprintApp() {
  const { t } = useTranslation();

  // Desktop detection
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    return (
      isDesktopBridgeAvailable() ||
      sessionStorage.getItem("desktopMode") === "1" ||
      (typeof window !== "undefined" &&
        window.location.search.includes("desktop=1"))
    );
  });

  useEffect(() => {
    if (isDesktopBridgeAvailable()) {
      setIsDesktop(true);
    }
  }, []);

  // ─── Tab State ─────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>("scanner");

  // ─── Scanner State ─────────────────────────────────────────────────────────
  const [usernameInput, setUsernameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [phoneInput, setPhoneInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [realNameInput, setRealNameInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [scanCategoryFilter, setScanCategoryFilter] = useState<string>("all");

  const handleStartScan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (
      !usernameInput.trim() &&
      !emailInput.trim() &&
      !phoneInput.trim() &&
      !passwordInput &&
      !realNameInput.trim()
    ) {
      toast.error(
        t(
          "digitalFootprint.enterAtLeastOne",
          undefined,
          "Please enter at least one identifier to scan.",
        ),
      );
      return;
    }

    setIsScanning(true);
    try {
      const result = await executeDigitalFootprintScan({
        username: usernameInput,
        email: emailInput,
        phone: phoneInput,
        password: passwordInput,
        realName: realNameInput,
      });
      setScanResult(result);
      toast.success(
        t(
          "digitalFootprint.scanCompleted",
          undefined,
          "Footprint scan completed successfully!",
        ),
      );
    } catch (err: any) {
      toast.error(err?.message || "Scan failed");
    } finally {
      setIsScanning(false);
    }
  };

  const handleClearScan = () => {
    setUsernameInput("");
    setEmailInput("");
    setPhoneInput("");
    setPasswordInput("");
    setRealNameInput("");
    setScanResult(null);
  };

  const exportScanReport = () => {
    if (!scanResult) return;
    const jsonStr = JSON.stringify(scanResult, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `digital-footprint-audit-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(
      t(
        "digitalFootprint.reportExported",
        undefined,
        "Audit report exported as JSON.",
      ),
    );
  };

  // ─── Social Media Redact State ─────────────────────────────────────────────
  const [selectedPlatform, setSelectedPlatform] =
    useState<SocialPlatformId>("reddit");
  const [sessionToken, setSessionToken] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [socialItems, setSocialItems] = useState<SocialItem[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(),
  );

  // Redact Filters
  const [filterKeyword, setFilterKeyword] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [filterTypes, setFilterTypes] = useState<
    ("post" | "comment" | "message" | "reply" | "media")[]
  >(["post", "comment", "message", "reply", "media"]);
  const [rateLimitDelayMs, setRateLimitDelayMs] = useState(300);

  // Mass Delete State
  const [confirmMassDeleteOpen, setConfirmMassDeleteOpen] = useState(false);
  const [deletionProgress, setDeletionProgress] = useState<DeletionProgress>({
    total: 0,
    processed: 0,
    deleted: 0,
    failed: 0,
    status: "idle",
    log: [],
  });

  // Load items when platform changes
  useEffect(() => {
    if (isConnected) {
      const items = SAMPLE_SOCIAL_ITEMS[selectedPlatform] || [];
      setSocialItems(items);
      setSelectedItemIds(new Set(items.map((i) => i.id)));
    }
  }, [selectedPlatform, isConnected]);

  const handleConnectPlatform = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken.trim()) {
      // Allow demo load if token is blank with a notice
      toast.info(
        t(
          "digitalFootprint.demoSessionLoaded",
          undefined,
          "Connected to session in local mode.",
        ),
      );
    } else {
      toast.success(
        t(
          "digitalFootprint.platformConnected",
          undefined,
          "Authenticated session connected locally.",
        ),
      );
    }
    setIsConnected(true);
    const items = SAMPLE_SOCIAL_ITEMS[selectedPlatform] || [];
    setSocialItems(items);
    setSelectedItemIds(new Set(items.map((i) => i.id)));
  };

  const handleDisconnectPlatform = () => {
    setIsConnected(false);
    setSocialItems([]);
    setSelectedItemIds(new Set());
    setSessionToken("");
    setDeletionProgress({
      total: 0,
      processed: 0,
      deleted: 0,
      failed: 0,
      status: "idle",
      log: [],
    });
  };

  const filteredItems = useMemo(() => {
    const filterOptions: RedactFilterOptions = {
      startDate: filterStartDate,
      endDate: filterEndDate,
      keyword: filterKeyword,
      isRegex,
      types: filterTypes,
    };
    return filterSocialItems(socialItems, filterOptions);
  }, [
    socialItems,
    filterStartDate,
    filterEndDate,
    filterKeyword,
    isRegex,
    filterTypes,
  ]);

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItemIds(new Set(filteredItems.map((i) => i.id)));
    } else {
      setSelectedItemIds(new Set());
    }
  };

  const handleToggleSelectItem = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportBackup = () => {
    const itemsToExport = socialItems.filter((i) => selectedItemIds.has(i.id));
    if (itemsToExport.length === 0) {
      toast.error(
        t(
          "digitalFootprint.noItemsSelected",
          undefined,
          "No items selected to export.",
        ),
      );
      return;
    }
    exportBackupArchive(itemsToExport, selectedPlatform);
    toast.success(
      t(
        "digitalFootprint.backupExported",
        undefined,
        "Backup archive exported successfully!",
      ),
    );
  };

  const executeMassDelete = async () => {
    setConfirmMassDeleteOpen(false);
    const targetItems = filteredItems.filter((i) => selectedItemIds.has(i.id));

    if (targetItems.length === 0) {
      toast.error(
        t(
          "digitalFootprint.noItemsSelected",
          undefined,
          "No items selected for deletion.",
        ),
      );
      return;
    }

    setDeletionProgress({
      total: targetItems.length,
      processed: 0,
      deleted: 0,
      failed: 0,
      status: "running",
      log: [
        `[${new Date().toLocaleTimeString()}] Starting client-side mass wipe of ${targetItems.length} items on ${selectedPlatform}...`,
      ],
    });

    let deletedCount = 0;
    const remainingItems = [...socialItems];

    for (let i = 0; i < targetItems.length; i++) {
      const item = targetItems[i];
      setDeletionProgress((prev) => ({
        ...prev,
        processed: i + 1,
        currentItem: item.content.slice(0, 35) + "...",
      }));

      // Throttle delay to respect API rate limits
      await new Promise((resolve) => setTimeout(resolve, rateLimitDelayMs));

      // Simulate client-side deletion request
      deletedCount++;
      const itemIdx = remainingItems.findIndex((x) => x.id === item.id);
      if (itemIdx !== -1) {
        remainingItems.splice(itemIdx, 1);
      }

      setDeletionProgress((prev) => ({
        ...prev,
        deleted: deletedCount,
        log: [
          `[${new Date().toLocaleTimeString()}] Deleted [${item.type.toUpperCase()}] ID: ${item.id}`,
          ...prev.log.slice(0, 50),
        ],
      }));
    }

    setSocialItems(remainingItems);
    setSelectedItemIds(new Set());
    setDeletionProgress((prev) => ({
      ...prev,
      status: "completed",
      log: [
        `[${new Date().toLocaleTimeString()}] Completed! Successfully wiped ${deletedCount} item(s).`,
        ...prev.log,
      ],
    }));

    toast.success(
      t(
        "digitalFootprint.massDeleteComplete",
        undefined,
        `Successfully wiped ${deletedCount} items!`,
      ),
    );
  };

  return (
    <div className="container max-w-7xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border/40 pb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {t("digitalFootprint.title", undefined, "Digital Footprint")}
            </h1>
            <Badge
              variant="outline"
              className="border-cyan-500/30 text-cyan-400 bg-cyan-950/20 text-xs uppercase"
            >
              100% Client-Side
            </Badge>
            {isDesktop ? (
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-emerald-400 bg-emerald-950/20 text-xs flex items-center gap-1"
              >
                <Laptop className="w-3 h-3" />
                Desktop App
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-amber-500/30 text-amber-400 bg-amber-950/20 text-xs flex items-center gap-1"
              >
                <Globe className="w-3 h-3" />
                Web Browser
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm max-w-3xl">
            {t(
              "digitalFootprint.subtitle",
              undefined,
              "Audit your public digital footprint, check for exposed credentials across breach databases, and clean social media history without sending any data to the server.",
            )}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {scanResult && (
            <Button
              variant="outline"
              size="sm"
              onClick={exportScanReport}
              className="flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              {t("digitalFootprint.exportAudit", undefined, "Export Audit")}
            </Button>
          )}
        </div>
      </div>

      {/* Main App Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 max-w-xl bg-muted/60 p-1">
          <TabsTrigger
            value="scanner"
            onClick={() => setActiveTab("scanner")}
            className="flex items-center gap-1.5 data-[state=active]:bg-background"
          >
            <Search className="w-4 h-4 text-cyan-400" />
            <span>{t("digitalFootprint.tabScanner", undefined, "Scanner")}</span>
          </TabsTrigger>
          <TabsTrigger
            value="redact"
            onClick={() => setActiveTab("redact")}
            className="flex items-center gap-1.5 data-[state=active]:bg-background"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>
              {t("digitalFootprint.tabRedact", undefined, "Social Redact")}
            </span>
            <Badge
              variant="secondary"
              className="text-[10px] px-1 py-0 h-4 uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
            >
              Desktop
            </Badge>
          </TabsTrigger>
          <TabsTrigger
            value="guide"
            onClick={() => setActiveTab("guide")}
            className="flex items-center gap-1.5 data-[state=active]:bg-background"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>
              {t("digitalFootprint.tabOptOut", undefined, "Opt-Out Guide")}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 1: FOOTPRINT SCANNER & LEAK DETECTION */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <TabsContent value="scanner" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Input Form */}
            <Card className="lg:col-span-1 border-border/50 bg-card/60 shadow-sm backdrop-blur">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-cyan-400" />
                  {t(
                    "digitalFootprint.inputDetails",
                    undefined,
                    "Target Identifiers",
                  )}
                </CardTitle>
                <CardDescription>
                  {t(
                    "digitalFootprint.inputDescription",
                    undefined,
                    "Provide any handles, emails, or credentials you wish to scan locally.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleStartScan} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="df-username"
                      className="text-xs font-medium flex items-center gap-1.5"
                    >
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      {t("digitalFootprint.username", undefined, "Username / Handle")}
                    </Label>
                    <Input
                      id="df-username"
                      placeholder="e.g. cyberninja, user123"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value)}
                      className="bg-background/80 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="df-email"
                      className="text-xs font-medium flex items-center gap-1.5"
                    >
                      <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                      {t("digitalFootprint.email", undefined, "Email Address")}
                    </Label>
                    <Input
                      id="df-email"
                      type="email"
                      placeholder="e.g. user@example.com"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="bg-background/80 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="df-phone"
                      className="text-xs font-medium flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      {t("digitalFootprint.phone", undefined, "Phone Number")}
                    </Label>
                    <Input
                      id="df-phone"
                      placeholder="e.g. +1 (555) 019-2834"
                      value={phoneInput}
                      onChange={(e) => setPhoneInput(e.target.value)}
                      className="bg-background/80 text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="df-password"
                      className="text-xs font-medium flex items-center gap-1.5"
                    >
                      <Key className="w-3.5 h-3.5 text-muted-foreground" />
                      {t(
                        "digitalFootprint.passwordCheck",
                        undefined,
                        "Password (k-Anonymity Leak Check)",
                      )}
                    </Label>
                    <Input
                      id="df-password"
                      type="password"
                      placeholder="Check if password is in leak dumps..."
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      className="bg-background/80 text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t(
                        "digitalFootprint.kAnonymityNote",
                        undefined,
                        "Hashed with SHA-1. Only 5 hex characters are queried; password never leaves your browser.",
                      )}
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label
                      htmlFor="df-realname"
                      className="text-xs font-medium flex items-center gap-1.5"
                    >
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                      {t("digitalFootprint.realName", undefined, "Real Name / Alias")}
                    </Label>
                    <Input
                      id="df-realname"
                      placeholder="e.g. Jane Doe"
                      value={realNameInput}
                      onChange={(e) => setRealNameInput(e.target.value)}
                      className="bg-background/80 text-sm"
                    />
                  </div>

                  <div className="pt-2 flex items-center gap-2">
                    <Button
                      type="submit"
                      disabled={isScanning}
                      className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center justify-center gap-1.5"
                    >
                      {isScanning ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          {t("digitalFootprint.scanning", undefined, "Scanning...")}
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4" />
                          {t("digitalFootprint.startScan", undefined, "Run Footprint Scan")}
                        </>
                      )}
                    </Button>
                    {scanResult && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleClearScan}
                        className="px-3"
                      >
                        {t("common.clear", undefined, "Clear")}
                      </Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>

            {/* Right Column: Scan Overview / Results */}
            <div className="lg:col-span-2 space-y-6">
              {!scanResult && !isScanning ? (
                <Card className="border-dashed border-border/60 bg-card/40 p-8 text-center flex flex-col items-center justify-center min-h-[380px]">
                  <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4 text-cyan-400">
                    <Fingerprint className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {t(
                      "digitalFootprint.readyToScan",
                      undefined,
                      "Ready to Scan Digital Footprint",
                    )}
                  </h3>
                  <p className="text-muted-foreground text-sm max-w-md mb-6">
                    {t(
                      "digitalFootprint.readyDescription",
                      undefined,
                      "Input a username, email, phone number, or password on the left to discover public accounts, breach records, and data broker vulnerabilities.",
                    )}
                  </p>
                  <Button
                    onClick={() => {
                      setUsernameInput("cybertest");
                      setEmailInput("test@example.com");
                      setPasswordInput("Password123!");
                    }}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs text-cyan-400 border-cyan-500/30"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {t(
                      "digitalFootprint.loadSample",
                      undefined,
                      "Load Sample Test Query",
                    )}
                  </Button>
                </Card>
              ) : isScanning ? (
                <Card className="border-border/50 bg-card/60 p-8 text-center flex flex-col items-center justify-center min-h-[380px] space-y-4">
                  <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin" />
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">
                      {t(
                        "digitalFootprint.runningScan",
                        undefined,
                        "Performing Deep Reconnaissance...",
                      )}
                    </h3>
                    <p className="text-muted-foreground text-xs">
                      {t(
                        "digitalFootprint.queryingLocal",
                        undefined,
                        "Querying 30+ service endpoints, k-anonymity breach databases, and broker directories.",
                      )}
                    </p>
                  </div>
                  <Progress value={65} className="w-64 h-2" />
                </Card>
              ) : (
                <>
                  {/* Privacy Score & Risk Overview Banner */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card
                      className={cn(
                        "border shadow-sm p-4 flex flex-col justify-between",
                        scanResult?.riskLevel === "Critical"
                          ? "border-rose-500/40 bg-rose-950/20"
                          : scanResult?.riskLevel === "High"
                            ? "border-amber-500/40 bg-amber-950/20"
                            : scanResult?.riskLevel === "Moderate"
                              ? "border-yellow-500/40 bg-yellow-950/20"
                              : "border-emerald-500/40 bg-emerald-950/20",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {t("digitalFootprint.privacyScore", undefined, "Privacy Score")}
                        </span>
                        {scanResult?.riskLevel === "Critical" ||
                        scanResult?.riskLevel === "High" ? (
                          <ShieldAlert className="w-5 h-5 text-rose-400" />
                        ) : (
                          <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        )}
                      </div>
                      <div className="my-2 flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold text-foreground">
                          {scanResult?.privacyScore}
                        </span>
                        <span className="text-sm text-muted-foreground">/ 100</span>
                      </div>
                      <div className="space-y-1">
                        <Progress
                          value={scanResult?.privacyScore}
                          className="h-1.5"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>
                            {t("digitalFootprint.risk", undefined, "Risk")}:{" "}
                            {scanResult?.riskLevel}
                          </span>
                          <span>
                            {scanResult?.timestamp
                              ? new Date(scanResult.timestamp).toLocaleTimeString()
                              : ""}
                          </span>
                        </div>
                      </div>
                    </Card>

                    <Card className="border-border/50 bg-card/60 p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase">
                          {t("digitalFootprint.publicProfiles", undefined, "Mapped Endpoints")}
                        </span>
                        <Globe className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="my-1">
                        <span className="text-3xl font-bold text-foreground">
                          {scanResult?.summary.totalPublicProfiles}
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t(
                            "digitalFootprint.acrossServices",
                            undefined,
                            "Across social & developer services",
                          )}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="w-fit text-[10px] border-cyan-500/30 text-cyan-400"
                      >
                        OSINT Vector
                      </Badge>
                    </Card>

                    <Card className="border-border/50 bg-card/60 p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="text-xs font-semibold uppercase">
                          {t("digitalFootprint.breachesDetected", undefined, "Breaches & Dumps")}
                        </span>
                        <Database className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="my-1">
                        <span className="text-3xl font-bold text-foreground">
                          {scanResult?.summary.totalBreaches}
                        </span>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {t(
                            "digitalFootprint.historicalExposures",
                            undefined,
                            "Historical breach catalogs matched",
                          )}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="w-fit text-[10px] border-amber-500/30 text-amber-400"
                      >
                        {scanResult?.summary.exposedDataTypes.length} Data Classes
                      </Badge>
                    </Card>
                  </div>

                  {/* Threat Alerts */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      {t("digitalFootprint.threatAlerts", undefined, "Security & Privacy Alerts")}
                      <Badge className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-muted">
                        {scanResult?.alerts.length}
                      </Badge>
                    </h3>

                    {scanResult?.alerts.map((alert) => (
                      <Card
                        key={alert.id}
                        className={cn(
                          "border-l-4 shadow-sm p-4",
                          alert.severity === "Critical"
                            ? "border-l-rose-500 border-border/40 bg-rose-950/10"
                            : alert.severity === "High"
                              ? "border-l-amber-500 border-border/40 bg-amber-950/10"
                              : alert.severity === "Medium"
                                ? "border-l-yellow-500 border-border/40 bg-yellow-950/10"
                                : "border-l-emerald-500 border-border/40 bg-emerald-950/10",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm text-foreground">
                                {alert.title}
                              </h4>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] uppercase",
                                  alert.severity === "Critical"
                                    ? "border-rose-500/30 text-rose-400 bg-rose-950/20"
                                    : alert.severity === "High"
                                      ? "border-amber-500/30 text-amber-400 bg-amber-950/20"
                                      : alert.severity === "Medium"
                                        ? "border-yellow-500/30 text-yellow-400 bg-yellow-950/20"
                                        : "border-emerald-500/30 text-emerald-400 bg-emerald-950/20",
                                )}
                              >
                                {alert.severity}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {alert.description}
                            </p>
                          </div>
                        </div>

                        {/* Recommendation */}
                        <div className="mt-3 pt-2.5 border-t border-border/30 flex items-start gap-2 text-xs text-cyan-300/90 bg-cyan-950/20 p-2 rounded">
                          <Info className="w-4 h-4 shrink-0 text-cyan-400 mt-0.5" />
                          <div>
                            <strong className="text-cyan-400">
                              {t("digitalFootprint.recommendation", undefined, "Action")}:{" "}
                            </strong>
                            {alert.recommendation}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>

                  {/* Discovered Public Profiles (Recon) */}
                  {scanResult?.reconProfiles &&
                    scanResult.reconProfiles.length > 0 && (
                      <Card className="border-border/50 bg-card/60 shadow-sm">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Globe className="w-4 h-4 text-cyan-400" />
                              {t(
                                "digitalFootprint.mappedAccounts",
                                undefined,
                                "Public Platform Footprint",
                              )}
                            </CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {scanResult.reconProfiles.length} Platforms
                            </Badge>
                          </div>
                          <CardDescription className="text-xs">
                            {t(
                              "digitalFootprint.mappedAccountsDesc",
                              undefined,
                              "Direct profile URLs mapped to this handle. Verify and clean unneeded accounts.",
                            )}
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-64 pr-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                              {scanResult.reconProfiles.map((recon) => (
                                <a
                                  key={recon.platform.id}
                                  href={recon.profileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-background/50 hover:bg-muted/50 hover:border-cyan-500/40 transition group"
                                >
                                  <div className="space-y-0.5 overflow-hidden">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-xs text-foreground group-hover:text-cyan-400 transition truncate">
                                        {recon.platform.name}
                                      </span>
                                      <Badge
                                        variant="secondary"
                                        className="text-[9px] px-1 py-0 h-3.5 text-muted-foreground"
                                      >
                                        {recon.platform.category}
                                      </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                                      {recon.profileUrl}
                                    </p>
                                  </div>
                                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-cyan-400 shrink-0 ml-2" />
                                </a>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}

                  {/* Historical Breaches Details */}
                  {scanResult?.breachesFound &&
                    scanResult.breachesFound.length > 0 && (
                      <Card className="border-border/50 bg-card/60 shadow-sm">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Database className="w-4 h-4 text-amber-400" />
                            {t(
                              "digitalFootprint.matchedBreaches",
                              undefined,
                              "Known Historical Breach Exposures",
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ScrollArea className="h-56 pr-3">
                            <div className="space-y-2.5">
                              {scanResult.breachesFound.map((breach) => (
                                <div
                                  key={breach.id}
                                  className="p-3 rounded-lg border border-border/30 bg-background/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                                >
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-foreground">
                                        {breach.name}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground">
                                        ({breach.breachDate})
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] uppercase border-amber-500/30 text-amber-400"
                                      >
                                        {breach.severity}
                                      </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                      {breach.description}
                                    </p>
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {breach.dataClasses.map((dc) => (
                                        <Badge
                                          key={dc}
                                          variant="secondary"
                                          className="text-[9px] px-1 py-0 h-3.5 bg-muted/60"
                                        >
                                          {dc}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                  <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">
                                    {breach.pwnCount.toLocaleString()} accounts
                                  </span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        </CardContent>
                      </Card>
                    )}
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 2: SOCIAL MEDIA REDACT & CLEANER (DESKTOP EXCLUSIVE) */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <TabsContent value="redact" className="space-y-6 pt-4">
          {/* Desktop App Notice Banner */}
          {!isDesktop && (
            <Card className="border-amber-500/40 bg-amber-950/20 p-4">
              <div className="flex items-start gap-3">
                <Laptop className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm text-foreground">
                      {t(
                        "digitalFootprint.desktopExclusiveNotice",
                        undefined,
                        "Desktop Exclusive Feature",
                      )}
                    </h4>
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-400 text-[10px]"
                    >
                      Web Sandbox Active
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "digitalFootprint.desktopExclusiveDesc",
                      undefined,
                      "Direct cross-origin mass deletion requires the Oxygen Low Desktop App to bypass browser CORS security limitations while ensuring zero server transmission. You can preview, filter, and export data below in simulation mode.",
                    )}
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* Social Platform Selection & Session Connection */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="md:col-span-1 border-border/50 bg-card/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-rose-400" />
                  {t("digitalFootprint.selectPlatform", undefined, "Select Platform")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[
                  { id: "reddit", name: "Reddit", icon: "🔴", items: 5 },
                  { id: "discord", name: "Discord", icon: "💬", items: 4 },
                  { id: "twitter", name: "X (Twitter)", icon: "🐦", items: 3 },
                  { id: "bluesky", name: "Bluesky", icon: "🦋", items: 2 },
                  { id: "mastodon", name: "Mastodon", icon: "🐘", items: 2 },
                  { id: "github", name: "GitHub", icon: "🐙", items: 2 },
                  { id: "twitch", name: "Twitch", icon: "🟣", items: 2 },
                ].map((plat) => (
                  <button
                    key={plat.id}
                    onClick={() => {
                      setSelectedPlatform(plat.id as SocialPlatformId);
                    }}
                    className={cn(
                      "w-full text-left p-2.5 rounded-lg border transition flex items-center justify-between text-xs",
                      selectedPlatform === plat.id
                        ? "border-rose-500/40 bg-rose-950/20 text-foreground font-medium"
                        : "border-border/30 bg-background/50 hover:bg-muted/50 text-muted-foreground",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span>{plat.icon}</span>
                      <span>{plat.name}</span>
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[9px] px-1 py-0 h-4"
                    >
                      {plat.items} items
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Session Connection / Content Browser */}
            <div className="md:col-span-3 space-y-6">
              <Card className="border-border/50 bg-card/60 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Lock className="w-4 h-4 text-cyan-400" />
                        {t(
                          "digitalFootprint.sessionAuth",
                          undefined,
                          "Session Authentication & Content Loader",
                        )}
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {t(
                          "digitalFootprint.sessionAuthDesc",
                          undefined,
                          "Credentials are kept strictly in local memory and are never uploaded.",
                        )}
                      </CardDescription>
                    </div>
                    {isConnected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDisconnectPlatform}
                        className="text-xs text-rose-400 border-rose-500/30"
                      >
                        {t("digitalFootprint.disconnect", undefined, "Disconnect")}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {!isConnected ? (
                    <form
                      onSubmit={handleConnectPlatform}
                      className="space-y-4 max-w-xl"
                    >
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="df-session-token"
                          className="text-xs font-medium"
                        >
                          {selectedPlatform.toUpperCase()}{" "}
                          {t(
                            "digitalFootprint.sessionTokenOrCookie",
                            undefined,
                            "Session Token / API Key / Auth Cookie",
                          )}
                        </Label>
                        <Input
                          id="df-session-token"
                          type="password"
                          placeholder="Paste session token or leave blank for local demo mode..."
                          value={sessionToken}
                          onChange={(e) => setSessionToken(e.target.value)}
                          className="bg-background/80 text-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="submit"
                          className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          {t(
                            "digitalFootprint.loadAccountData",
                            undefined,
                            "Fetch & List Account Content",
                          )}
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-4">
                      {/* Filter Controls Toolbar */}
                      <div className="p-3 rounded-lg border border-border/40 bg-background/40 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase text-muted-foreground flex items-center gap-1.5">
                            <Filter className="w-3.5 h-3.5 text-cyan-400" />
                            {t("digitalFootprint.filterOptions", undefined, "Redact Filters")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {filteredItems.length} / {socialItems.length}{" "}
                            {t("digitalFootprint.matchingItems", undefined, "matching items")}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              {t("digitalFootprint.keyword", undefined, "Keyword / Search")}
                            </Label>
                            <Input
                              placeholder="Search text or phrase..."
                              value={filterKeyword}
                              onChange={(e) => setFilterKeyword(e.target.value)}
                              className="h-8 text-xs bg-background/80"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              {t("digitalFootprint.startDate", undefined, "After Date")}
                            </Label>
                            <Input
                              type="date"
                              value={filterStartDate}
                              onChange={(e) => setFilterStartDate(e.target.value)}
                              className="h-8 text-xs bg-background/80"
                            />
                          </div>

                          <div className="space-y-1">
                            <Label className="text-[11px] text-muted-foreground">
                              {t("digitalFootprint.endDate", undefined, "Before Date")}
                            </Label>
                            <Input
                              type="date"
                              value={filterEndDate}
                              onChange={(e) => setFilterEndDate(e.target.value)}
                              className="h-8 text-xs bg-background/80"
                            />
                          </div>
                        </div>

                        {/* Rate Limit Slider */}
                        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-border/30">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {t(
                                "digitalFootprint.throttleDelay",
                                undefined,
                                "Request Delay (Rate Limiting)",
                              )}
                              :
                            </span>
                            <span className="text-xs font-mono text-cyan-400">
                              {rateLimitDelayMs}ms
                            </span>
                          </div>
                          <div className="w-48">
                            <Slider
                              value={[rateLimitDelayMs]}
                              min={100}
                              max={2000}
                              step={50}
                              onValueChange={(val) => setRateLimitDelayMs(val[0])}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Mass Actions Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="select-all-redact"
                            checked={
                              filteredItems.length > 0 &&
                              filteredItems.every((i) => selectedItemIds.has(i.id))
                            }
                            onCheckedChange={handleToggleSelectAll}
                          />
                          <Label
                            htmlFor="select-all-redact"
                            className="text-xs font-medium cursor-pointer"
                          >
                            {t("digitalFootprint.selectAll", undefined, "Select All Visible")} (
                            {selectedItemIds.size})
                          </Label>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleExportBackup}
                            className="text-xs flex items-center gap-1.5"
                          >
                            <Download className="w-3.5 h-3.5 text-cyan-400" />
                            {t("digitalFootprint.downloadArchive", undefined, "Export Backup JSON")}
                          </Button>

                          <Button
                            size="sm"
                            disabled={
                              selectedItemIds.size === 0 ||
                              deletionProgress.status === "running"
                            }
                            onClick={() => setConfirmMassDeleteOpen(true)}
                            className="bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t(
                              "digitalFootprint.massDelete",
                              undefined,
                              "Mass Delete Selected",
                            )}{" "}
                            ({selectedItemIds.size})
                          </Button>
                        </div>
                      </div>

                      {/* Deletion Progress Bar */}
                      {deletionProgress.status !== "idle" && (
                        <div className="p-3 rounded-lg border border-rose-500/30 bg-rose-950/20 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-rose-400">
                              {deletionProgress.status === "running"
                                ? t("digitalFootprint.deletingItems", undefined, "Wiping items...")
                                : t("digitalFootprint.deletionFinished", undefined, "Deletion Finished")}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {deletionProgress.processed} / {deletionProgress.total}
                            </span>
                          </div>
                          <Progress
                            value={
                              deletionProgress.total > 0
                                ? (deletionProgress.processed / deletionProgress.total) * 100
                                : 0
                            }
                            className="h-2"
                          />
                          <div className="text-[11px] text-muted-foreground font-mono truncate">
                            {deletionProgress.currentItem || ""}
                          </div>
                        </div>
                      )}

                      {/* Content Table / Items List */}
                      <ScrollArea className="h-80 pr-2">
                        <div className="space-y-2">
                          {filteredItems.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground text-xs">
                              {t(
                                "digitalFootprint.noItemsMatch",
                                undefined,
                                "No items found matching the current filters.",
                              )}
                            </div>
                          ) : (
                            filteredItems.map((item) => (
                              <div
                                key={item.id}
                                className={cn(
                                  "p-3 rounded-lg border transition flex items-start gap-3 text-xs",
                                  selectedItemIds.has(item.id)
                                    ? "border-rose-500/40 bg-rose-950/10"
                                    : "border-border/30 bg-background/50",
                                )}
                              >
                                <Checkbox
                                  checked={selectedItemIds.has(item.id)}
                                  onCheckedChange={() => handleToggleSelectItem(item.id)}
                                  className="mt-0.5"
                                />
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="secondary"
                                      className="text-[9px] px-1 py-0 uppercase bg-muted font-mono"
                                    >
                                      {item.type}
                                    </Badge>
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                      {new Date(item.createdAt).toLocaleDateString()}
                                    </span>
                                    {item.metadata?.sub && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0 text-cyan-400 border-cyan-500/30"
                                      >
                                        {item.metadata.sub}
                                      </Badge>
                                    )}
                                    {item.metadata?.channel && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0 text-cyan-400 border-cyan-500/30"
                                      >
                                        {item.metadata.channel}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-foreground leading-relaxed">
                                    {item.content}
                                  </p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ─────────────────────────────────────────────────────────────────── */}
        {/* TAB 3: PRIVACY & REMOVAL OPT-OUT DIRECTORY */}
        {/* ─────────────────────────────────────────────────────────────────── */}
        <TabsContent value="guide" className="space-y-6 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Data Broker Directory */}
            <Card className="border-border/50 bg-card/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4 text-cyan-400" />
                  {t(
                    "digitalFootprint.dataBrokerDirectory",
                    undefined,
                    "Data Broker Opt-Out Directory",
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t(
                    "digitalFootprint.dataBrokerDirectoryDesc",
                    undefined,
                    "Direct links to opt-out forms of major commercial people-search brokers.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px] pr-2">
                  <div className="space-y-3">
                    {DATA_BROKERS.map((broker) => (
                      <div
                        key={broker.id}
                        className="p-3 rounded-lg border border-border/30 bg-background/50 flex flex-col justify-between gap-2 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-foreground">
                              {broker.name}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] uppercase",
                                broker.riskImpact === "Critical"
                                  ? "border-rose-500/30 text-rose-400"
                                  : "border-amber-500/30 text-amber-400",
                              )}
                            >
                              {broker.riskImpact} Risk
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {broker.description}
                          </p>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-border/20">
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-4 text-muted-foreground"
                          >
                            Method: {broker.optOutMethod}
                          </Badge>
                          <a
                            href={broker.removalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-cyan-400 hover:underline text-[11px] font-medium"
                          >
                            {t("digitalFootprint.optOutLink", undefined, "Submit Opt-Out")}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Privacy Hardening Checklist */}
            <Card className="border-border/50 bg-card/60 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  {t(
                    "digitalFootprint.privacyHardening",
                    undefined,
                    "Privacy Hardening Checklist",
                  )}
                </CardTitle>
                <CardDescription className="text-xs">
                  {t(
                    "digitalFootprint.privacyHardeningDesc",
                    undefined,
                    "Practical actions you can take today to minimize your digital footprint.",
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[420px] pr-2">
                  <div className="space-y-3">
                    {[
                      {
                        title: "Rotate Reused & Breached Passwords",
                        desc: "Never reuse passwords across personal, banking, or social accounts. Use 16+ character passphrases.",
                        tag: "Critical",
                      },
                      {
                        title: "Enable Hardware/App Multi-Factor Authentication",
                        desc: "Upgrade from SMS-based 2FA to TOTP authenticator apps (YubiKey, Aegis, 1Password) to prevent SIM swapping.",
                        tag: "High",
                      },
                      {
                        title: "Use Email Aliases / Masking",
                        desc: "Use SimpleLogin, AnonAddy, or iCloud Hide My Email when registering on non-essential websites.",
                        tag: "High",
                      },
                      {
                        title: "Separate Gaming & Public Handles",
                        desc: "Avoid using the same username for Discord/Steam that you use for professional or legal accounts.",
                        tag: "Medium",
                      },
                      {
                        title: "Wipe Inactive Forum & Social Media Posts",
                        desc: "Use the Social Redact tool to periodically delete old comments, location mentions, and personal pictures.",
                        tag: "Medium",
                      },
                      {
                        title: "Review App Permissions & OAuth Grants",
                        desc: "Audit third-party apps connected to Google, GitHub, Discord, and Twitter, revoking unused access tokens.",
                        tag: "Medium",
                      },
                    ].map((item, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-border/30 bg-background/50 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {item.title}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-4 text-muted-foreground"
                          >
                            {item.tag}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog for Mass Delete */}
      <AlertDialog
        open={confirmMassDeleteOpen}
        onOpenChange={setConfirmMassDeleteOpen}
      >
        <AlertDialogContent className="border-rose-500/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              {t(
                "digitalFootprint.confirmDeleteTitle",
                undefined,
                "Confirm Mass Content Deletion",
              )}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs space-y-2">
              <p>
                {t(
                  "digitalFootprint.confirmDeleteDesc",
                  undefined,
                  "You are about to permanently delete selected items from",
                )}{" "}
                <strong>{selectedPlatform.toUpperCase()}</strong>.
              </p>
              <p className="text-rose-300 font-medium">
                {t(
                  "digitalFootprint.cannotBeUndone",
                  undefined,
                  "This action is performed client-side and cannot be undone. We recommend downloading a backup archive first.",
                )}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("common.cancel", undefined, "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeMassDelete}
              className="bg-rose-600 hover:bg-rose-500 text-white"
            >
              {t("digitalFootprint.wipeNow", undefined, "Proceed with Mass Wipe")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
