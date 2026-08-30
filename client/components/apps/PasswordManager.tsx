import { useState, useEffect, useMemo, useCallback } from "react";
import {
  KeyRound, Eye, EyeOff, Copy, Check, Trash2, Pencil, Plus,
  Loader2, Search, ExternalLink, Globe, RefreshCw, ChevronDown,
  ChevronUp, Shuffle, ShieldAlert, ShieldCheck, Clock, Lock, X, ArrowUpDown,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { db, supabase } from "@/lib/db";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { EncryptionRequiredPrompt } from "@/components/EncryptionRequiredPrompt";
import {
  isCategoryLocked, isCategoryEncryptionEnabled, getActiveMasterKey,
  generateAes256Key, setActiveMasterKey, setCategoryEncryptionEnabled,
  encryptPasswordData, decryptPasswordData, type PasswordData,
} from "@/lib/crypto";
import {
  generateTotp, getTotpTimeRemaining, getTotpProgress,
  formatOtpCode, validateTotpSecret,
} from "@/lib/totp";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PasswordRecord {
  id: string;
  user_id: string;
  title: string | null;
  url: string | null;
  password: string;
  notes: string | null;
  otp_secret: string | null;
  created_at: string;
  updated_at: string;
}

type SortKey = "title_asc" | "title_desc" | "url_asc" | "url_desc" | "updated_desc" | "updated_asc" | "created_desc" | "created_asc";

interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
  mode: "random" | "passphrase" | "pin";
}

// ─── Password Strength ─────────────────────────────────────────────────────────

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: "", color: "bg-slate-700" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { score, label: "Weak", color: "bg-red-500" };
  if (score <= 4) return { score, label: "Fair", color: "bg-amber-500" };
  if (score <= 5) return { score, label: "Good", color: "bg-yellow-500" };
  return { score, label: "Strong", color: "bg-emerald-500" };
}

// ─── BIP39 Word List (subset) ──────────────────────────────────────────────────

const BIP39_WORDS = [
  "able","acid","aged","also","area","army","away","baby","back","ball","band","bank","base",
  "bath","bear","beat","been","bell","best","bird","blow","blue","boat","body","bomb","bond",
  "bone","book","born","both","bulk","burn","busy","call","calm","card","care","case","cash",
  "cast","city","clay","clip","club","coal","code","cold","come","core","corn","cost","crop",
  "dark","data","date","dawn","days","deal","dear","deep","deny","desk","dial","dirt","disk",
  "dock","done","door","dove","down","draw","drop","drum","dual","dusk","duty","each","earn",
  "east","edge","else","even","ever","exam","face","fact","fail","fair","fall","fame","farm",
  "fast","fate","feel","feet","fell","felt","file","film","find","fire","firm","fish","fist",
  "flag","flat","flew","flip","flow","foam","fold","folk","fond","foot","fork","form","fort",
  "free","from","fuel","full","fund","fuse","gate","gave","gear","glow","goal","gold","good",
  "grab","gray","grew","grid","grip","grit","grow","gulf","gust","half","hall","hand","hard",
  "harm","have","head","heal","heap","heat","heel","held","help","here","hero","hide","high",
  "hill","hire","hold","hole","home","hook","hope","horn","host","hour","huge","hull","hunt",
  "hurt","icon","idea","idle","inch","into","iron","item","join","jump","just","keen","keep",
  "kick","kind","king","knee","knew","knot","know","lack","lake","lamp","land","lane","last",
  "late","lava","lawn","lead","leaf","leak","lean","left","less","lift","like","lime","line",
  "link","lion","list","live","load","loan","lock","long","look","loop","lore","lose","loss",
  "loud","love","luck","made","main","make","mall","many","mark","mass","mast","math","maze",
  "mean","meat","meet","melt","mesh","milk","mill","mind","mine","miss","mode","moon","more",
  "most","move","much","must","myth","nail","name","navy","near","neck","need","nest","news",
  "next","nice","node","none","noon","norm","note","nova","null","oath","once","only","open",
  "over","pace","pack","page","paid","pair","palm","park","part","pass","past","path","peak",
  "peer","pile","pine","pipe","plan","play","plot","plug","plus","pool","port","pose","post",
  "pour","prey","pull","pure","push","race","rack","rain","ramp","rank","rate","read","real",
  "reef","reel","rely","rent","rest","rich","ride","ring","riot","rise","risk","road","rock",
  "role","roll","roof","room","root","rope","rose","rule","rush","rust","safe","sail","sake",
  "salt","same","sand","save","seal","seed","seem","seen","self","sell","send","sent","ship",
  "shoe","shop","shot","show","shut","sick","side","sign","silk","sink","site","size","skip",
  "slim","slip","slot","slow","snap","snow","soak","sock","soft","soil","sold","sole","some",
  "song","soon","sort","soul","span","spin","spot","spur","star","stay","stem","step","stop",
  "such","suit","sure","swap","swim","tail","take","tale","talk","tall","tank","tape","task",
  "team","tear","tech","tell","tend","tent","term","test","text","that","them","then","they",
  "thin","this","tick","tide","tile","time","tiny","tire","told","toll","tomb","tone","tool",
  "tore","torn","toss","tour","town","trap","tree","trim","trio","trip","true","tuck","tune",
  "turn","twin","type","upon","used","user","vary","vast","view","vine","void","vote","wade",
  "walk","wall","want","ward","warm","warn","wave","weak","wear","weed","week","well","went",
  "west","what","when","wide","wild","will","wind","wine","wing","wire","wish","with","wood",
  "word","wore","work","wrap","yarn","year","your","zero","zone",
];

// ─── Password Generator ────────────────────────────────────────────────────────

function generatePassword(opts: GeneratorOptions): string {
  const { length, uppercase, lowercase, numbers, symbols, avoidAmbiguous, mode } = opts;
  const amb = "l1IO0";
  if (mode === "pin") {
    const digits = avoidAmbiguous ? "23456789" : "0123456789";
    return Array.from(crypto.getRandomValues(new Uint8Array(length)))
      .map(b => digits[b % digits.length]).join("");
  }
  if (mode === "passphrase") {
    const wordCount = Math.max(3, Math.min(10, Math.round(length / 5)));
    const arr = crypto.getRandomValues(new Uint32Array(wordCount));
    return Array.from(arr).map(n => BIP39_WORDS[n % BIP39_WORDS.length]).join("-");
  }
  let chars = "";
  if (uppercase) { let s = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; if (avoidAmbiguous) s = s.split("").filter(c => !amb.includes(c)).join(""); chars += s; }
  if (lowercase) { let s = "abcdefghijklmnopqrstuvwxyz"; if (avoidAmbiguous) s = s.split("").filter(c => !amb.includes(c)).join(""); chars += s; }
  if (numbers) { let s = "0123456789"; if (avoidAmbiguous) s = s.split("").filter(c => !amb.includes(c)).join(""); chars += s; }
  if (symbols) chars += "!@#$%^&*()-_=+[]{}|;:,.<>?";
  if (!chars) chars = "abcdefghijklmnopqrstuvwxyz";
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map(b => chars[b % chars.length]).join("");
}

function extractDomain(url: string | null | undefined): string {
  if (!url) return "";
  try { return new URL(url.startsWith("http") ? url : "https://" + url).hostname; }
  catch { return url; }
}

// ─── OTP Live Display Component ───────────────────────────────────────────────

function OtpLiveDisplay({
  secret,
  onCopy,
}: {
  secret: string;
  onCopy?: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState<string>("");
  const [remaining, setRemaining] = useState<number>(() =>
    getTotpTimeRemaining(30),
  );
  const [progress, setProgress] = useState<number>(() =>
    getTotpProgress(30),
  );
  const [copied, setCopied] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const updateCode = async () => {
      try {
        if (!validateTotpSecret(secret)) {
          if (mounted) {
            setHasError(true);
            setCode("");
          }
          return;
        }
        const newCode = await generateTotp(secret);
        if (mounted) {
          setCode(newCode);
          setHasError(false);
        }
      } catch {
        if (mounted) {
          setHasError(true);
          setCode("");
        }
      }
    };

    updateCode();

    const interval = setInterval(() => {
      const rem = getTotpTimeRemaining(30);
      const prog = getTotpProgress(30);
      setRemaining(rem);
      setProgress(prog);
      if (rem === 30 || !code) {
        updateCode();
      }
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [secret]);

  const handleCopyOtp = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success(
      t(
        "passwords.otpCopiedToast",
        undefined,
        "One-time password copied to clipboard",
      ),
    );
    onCopy?.();
    setTimeout(() => setCopied(false), 2000);
  };

  if (hasError || !secret) return null;

  return (
    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/50 mt-1.5 shadow-inner">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="p-1.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm sm:text-base font-bold text-cyan-300 tracking-widest select-all">
              {formatOtpCode(code) || "------"}
            </span>
            <div className="flex items-center gap-1 text-[10px] text-cyan-400/90 shrink-0 font-mono bg-cyan-950/80 px-1.5 py-0.5 rounded border border-cyan-800/60">
              <Clock className="w-2.5 h-2.5" />
              <span>{remaining}s</span>
            </div>
          </div>
          <div className="h-1 bg-slate-800/80 rounded-full overflow-hidden mt-1.5 max-w-[160px]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-1000 ease-linear",
                remaining <= 5 ? "bg-amber-400" : "bg-cyan-400",
              )}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={handleCopyOtp}
        className="p-2 rounded-lg bg-cyan-900/30 hover:bg-cyan-900/60 text-cyan-300 hover:text-white transition shrink-0 border border-cyan-700/40"
        title={t("passwords.copyOtp", undefined, "Copy OTP code")}
      >
        {copied ? (
          <Check className="w-4 h-4 text-emerald-400" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

// ─── Generator Panel ───────────────────────────────────────────────────────────

function PasswordGeneratorPanel({ value, onChange, onApply }: { value: string; onChange: (v: string) => void; onApply?: (v: string) => void; }) {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<GeneratorOptions>({ length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true, avoidAmbiguous: false, mode: "random" });
  const [copied, setCopied] = useState(false);
  const regenerate = useCallback(() => { onChange(generatePassword(opts)); }, [opts, onChange]);
  useEffect(() => { regenerate(); }, [opts.length, opts.uppercase, opts.lowercase, opts.numbers, opts.symbols, opts.avoidAmbiguous, opts.mode]);
  const strength = getPasswordStrength(value);
  const handleCopy = async () => { if (!value) return; await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const CB = ({ label, checked, onChange: oc, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; }) => (
    <label className={cn("flex items-center gap-2 text-xs cursor-pointer select-none", disabled ? "opacity-40 cursor-not-allowed" : "text-slate-300 hover:text-white")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => oc(e.target.checked)} className="rounded border-slate-600 accent-cyan-500 w-3.5 h-3.5" />{label}
    </label>
  );
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
      <div className="flex items-center gap-2 justify-between">
        <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Shuffle className="w-3.5 h-3.5 text-cyan-400" />{t("passwords.generator", undefined, "Password Generator")}</span>
        <div className="flex gap-1">
          {(["random","passphrase","pin"] as const).map(m => (
            <button key={m} type="button" onClick={() => setOpts(o => ({ ...o, mode: m }))} className={cn("px-2 py-0.5 rounded text-[10px] font-medium transition-colors", opts.mode === m ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800")}>
              {m === "random" ? t("passwords.genModeRandom", undefined, "Random") : m === "passphrase" ? t("passwords.genModePassphrase", undefined, "Passphrase") : t("passwords.genModePIN", undefined, "PIN")}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 font-mono text-sm bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 break-all min-h-[2.25rem] leading-relaxed select-all">
          {value || <span className="text-slate-500 italic">No password generated</span>}
        </div>
        <button type="button" onClick={handleCopy} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition shrink-0" title="Copy">
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
        <button type="button" onClick={regenerate} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition shrink-0" title="Regenerate">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
      {value && (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-slate-500">{t("passwords.strength", undefined, "Strength")}</span>
            <span className={cn("text-[10px] font-semibold", strength.label === "Strong" ? "text-emerald-400" : strength.label === "Good" ? "text-yellow-400" : strength.label === "Fair" ? "text-amber-400" : "text-red-400")}>{strength.label}</span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full transition-all duration-300", strength.color)} style={{ width: `${Math.min(100, (strength.score / 7) * 100)}%` }} />
          </div>
        </div>
      )}
      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-slate-500"><span>{t("passwords.length", undefined, "Length")}: {opts.length}</span></div>
          <Slider min={opts.mode === "passphrase" ? 15 : opts.mode === "pin" ? 4 : 6} max={opts.mode === "passphrase" ? 50 : 64} step={1} value={[opts.length]} onValueChange={([v]) => setOpts(o => ({ ...o, length: v }))} className="[&_[role=slider]]:bg-cyan-500 [&_[role=slider]]:border-cyan-600" />
        </div>
        {opts.mode === "random" && (
          <div className="grid grid-cols-2 gap-2">
            <CB label={t("passwords.uppercase", undefined, "Uppercase (A-Z)")} checked={opts.uppercase} onChange={v => setOpts(o => ({ ...o, uppercase: v }))} />
            <CB label={t("passwords.lowercase", undefined, "Lowercase (a-z)")} checked={opts.lowercase} onChange={v => setOpts(o => ({ ...o, lowercase: v }))} />
            <CB label={t("passwords.numbers", undefined, "Numbers (0-9)")} checked={opts.numbers} onChange={v => setOpts(o => ({ ...o, numbers: v }))} />
            <CB label={t("passwords.symbols", undefined, "Symbols (!@#...)")} checked={opts.symbols} onChange={v => setOpts(o => ({ ...o, symbols: v }))} />
            <CB label={t("passwords.avoidAmbiguous", undefined, "Avoid ambiguous (l,1,I,O,0)")} checked={opts.avoidAmbiguous} onChange={v => setOpts(o => ({ ...o, avoidAmbiguous: v }))} />
          </div>
        )}
        {opts.mode === "pin" && (
          <CB label={t("passwords.avoidAmbiguous", undefined, "Avoid ambiguous (0,1)")} checked={opts.avoidAmbiguous} onChange={v => setOpts(o => ({ ...o, avoidAmbiguous: v }))} />
        )}
      </div>
      {onApply && (
        <Button type="button" size="sm" onClick={() => onApply(value)} className="w-full bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium gap-1.5">
          <Check className="w-3.5 h-3.5" />{t("passwords.applyPassword", undefined, "Apply to Password Field")}
        </Button>
      )}
    </div>
  );
}

// ─── Encryption Required Banner ────────────────────────────────────────────────

function EncryptionRequiredBanner({ onEnable }: { onEnable: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="w-full max-w-2xl mx-auto my-8 px-4">
      <Card className="bg-slate-900/80 border border-amber-500/30 backdrop-blur-md shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 left-0 h-[2px] bg-gradient-to-r from-amber-500/0 via-amber-500/80 to-amber-500/0" />
        <CardHeader className="text-center space-y-3 pb-4 pt-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-lg">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {t("passwords.encryptionRequiredTitle", undefined, "Encryption Required")}
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
              {t("passwords.encryptionRequiredDesc", undefined, "Password Manager requires AES-256 masterkey encryption to protect your passwords. Your key never leaves your browser.")}
            </CardDescription>
          </div>
          <div className="flex items-center justify-center gap-2 pt-1">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-mono text-[11px]">AES-256-GCM</Badge>
            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[11px]">Zero-Knowledge</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-2 pb-6 px-6 sm:px-8 text-center">
          <Button onClick={onEnable} className="bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-semibold gap-2 shadow-lg shadow-cyan-950/50 px-6 py-2.5 h-auto">
            <Lock className="w-4 h-4" />{t("passwords.enableEncryptionButton", undefined, "Enable Password Encryption")}
          </Button>
          <p className="text-[11px] text-slate-500">{t("security.clientSideNotice", undefined, "Zero-Knowledge: Your masterkey is held only in your browser session and is never sent to any server.")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function PasswordManagerApp() {
  const { session } = useAuth();
  const { t } = useTranslation();
  const [encryptionEnabled, setEncryptionEnabled] = useState(() => isCategoryEncryptionEnabled("passwords"));
  const [encryptionLocked, setEncryptionLocked] = useState(() => isCategoryLocked("passwords"));
  const [passwords, setPasswords] = useState<PasswordRecord[]>([]);
  const [fetching, setFetching] = useState(true);
  const [formTitle, setFormTitle] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formOtpSecret, setFormOtpSecret] = useState("");
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [generatorValue, setGeneratorValue] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated_desc");
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<PasswordRecord | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editOtpSecret, setEditOtpSecret] = useState("");
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [showEditGenerator, setShowEditGenerator] = useState(false);
  const [editGeneratorValue, setEditGeneratorValue] = useState("");
  const [deleteRecord, setDeleteRecord] = useState<PasswordRecord | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const formPasswordStrength = getPasswordStrength(formPassword);

  const refreshEncryptionState = useCallback(() => {
    setEncryptionEnabled(isCategoryEncryptionEnabled("passwords"));
    setEncryptionLocked(isCategoryLocked("passwords"));
  }, []);

  const fetchData = useCallback(async () => {
    if (!session?.user?.id) return;
    setFetching(true);
    try {
      const { data, error } = await supabase.from("user_passwords").select("*").eq("user_id", session.user.id).order("updated_at", { ascending: false });
      if (error) throw error;
      const key = getActiveMasterKey();
      const decrypted = await Promise.all((data || []).map(item => decryptPasswordData(item, key)));
      setPasswords(decrypted as PasswordRecord[]);
    } catch (err: any) {
      toast.error(err?.message || t("passwords.fetchError", undefined, "Failed to load passwords"));
    } finally { setFetching(false); }
  }, [session?.user?.id, t]);

  useEffect(() => { refreshEncryptionState(); }, [refreshEncryptionState]);
  useEffect(() => {
    if (encryptionEnabled && !encryptionLocked) { fetchData(); } else { setFetching(false); }
  }, [encryptionEnabled, encryptionLocked, fetchData]);

  const handleEnableEncryption = useCallback(async () => {
    let key = getActiveMasterKey();
    if (!key) { key = generateAes256Key(); setActiveMasterKey(key); }
    setCategoryEncryptionEnabled("passwords", true);
    setEncryptionEnabled(true); setEncryptionLocked(false);
    toast.success(t("passwords.encryptionEnabledToast", undefined, "Password encryption enabled"));
    setTimeout(() => fetchData(), 100);
  }, [fetchData, t]);

  const filtered = useMemo(() => {
    let list = passwords.filter(p => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (p.title?.toLowerCase().includes(q) ?? false) || (p.url?.toLowerCase().includes(q) ?? false) || extractDomain(p.url).toLowerCase().includes(q);
    });
    list = [...list].sort((a, b) => {
      const ta = (a.title || extractDomain(a.url) || "").toLowerCase();
      const tb = (b.title || extractDomain(b.url) || "").toLowerCase();
      const ua = (a.url || "").toLowerCase(); const ub = (b.url || "").toLowerCase();
      switch (sortKey) {
        case "title_asc": return ta.localeCompare(tb);
        case "title_desc": return tb.localeCompare(ta);
        case "url_asc": return ua.localeCompare(ub);
        case "url_desc": return ub.localeCompare(ua);
        case "updated_desc": return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        case "updated_asc": return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
        case "created_desc": return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "created_asc": return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default: return 0;
      }
    });
    return list;
  }, [passwords, search, sortKey]);

  const resetForm = () => {
    setFormTitle(""); setFormUrl(""); setFormPassword(""); setFormNotes(""); setFormOtpSecret("");
    setShowFormPassword(false); setEditingId(null); setShowGenerator(false); setGeneratorValue("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPassword.trim()) { toast.error(t("passwords.passwordRequired", undefined, "Password is required")); return; }
    if (!session?.user?.id) return;
    setSaving(true);
    try {
      const key = getActiveMasterKey();
      let payload: any = {
        user_id: session.user.id,
        title: formTitle.trim() || null,
        url: formUrl.trim() || null,
        password: formPassword,
        notes: formNotes.trim() || null,
        otp_secret: formOtpSecret.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (isCategoryEncryptionEnabled("passwords") && key) payload = await encryptPasswordData(payload, key);
      if (editingId) {
        const { error } = await supabase.from("user_passwords").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success(t("passwords.updatedToast", undefined, "Password updated"));
      } else {
        const { error } = await supabase.from("user_passwords").insert(payload);
        if (error) throw error;
        toast.success(t("passwords.savedToast", undefined, "Password saved"));
      }
      resetForm(); await fetchData();
    } catch (err: any) { toast.error(err?.message || t("passwords.saveError", undefined, "Failed to save password")); }
    finally { setSaving(false); }
  };

  const handleEditInForm = (record: PasswordRecord) => {
    setEditingId(record.id); setFormTitle(record.title || ""); setFormUrl(record.url || "");
    setFormPassword(record.password); setFormNotes(record.notes || "");
    setFormOtpSecret(record.otp_secret || "");
    setShowGenerator(false); setGeneratorValue(record.password);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleOpenEditDialog = (record: PasswordRecord) => {
    setEditRecord(record); setEditTitle(record.title || ""); setEditUrl(record.url || "");
    setEditPassword(record.password); setEditNotes(record.notes || "");
    setEditOtpSecret(record.otp_secret || "");
    setShowEditPassword(false); setShowEditGenerator(false); setEditGeneratorValue(record.password); setEditDialogOpen(true);
  };

  const handleDialogSave = async () => {
    if (!editRecord) return;
    if (!editPassword.trim()) { toast.error(t("passwords.passwordRequired", undefined, "Password is required")); return; }
    setEditSaving(true);
    try {
      const key = getActiveMasterKey();
      let payload: any = {
        title: editTitle.trim() || null,
        url: editUrl.trim() || null,
        password: editPassword,
        notes: editNotes.trim() || null,
        otp_secret: editOtpSecret.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (isCategoryEncryptionEnabled("passwords") && key) payload = await encryptPasswordData(payload, key);
      const { error } = await supabase.from("user_passwords").update(payload).eq("id", editRecord.id);
      if (error) throw error;
      toast.success(t("passwords.updatedToast", undefined, "Password updated")); setEditDialogOpen(false); await fetchData();
    } catch (err: any) { toast.error(err?.message || t("passwords.saveError", undefined, "Failed to save password")); }
    finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteRecord) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("user_passwords").delete().eq("id", deleteRecord.id);
      if (error) throw error;
      toast.success(t("passwords.deletedToast", undefined, "Password deleted")); setDeleteDialogOpen(false); setDeleteRecord(null); await fetchData();
    } catch (err: any) { toast.error(err?.message || t("passwords.deleteError", undefined, "Failed to delete password")); }
    finally { setDeleting(false); }
  };

  const handleCopyPassword = async (id: string, pw: string) => {
    await navigator.clipboard.writeText(pw); setCopiedId(id);
    toast.success(t("passwords.copiedToast", undefined, "Password copied to clipboard"));
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReveal = (id: string) => setRevealedIds(prev => ({ ...prev, [id]: !prev[id] }));

  const SORT_OPTIONS: { key: SortKey; label: string }[] = [
    { key: "title_asc", label: t("passwords.sortTitleAZ", undefined, "Title (A-Z)") },
    { key: "title_desc", label: t("passwords.sortTitleZA", undefined, "Title (Z-A)") },
    { key: "url_asc", label: t("passwords.sortUrlAZ", undefined, "URL (A-Z)") },
    { key: "url_desc", label: t("passwords.sortUrlZA", undefined, "URL (Z-A)") },
    { key: "updated_desc", label: t("passwords.sortUpdatedNewest", undefined, "Updated (Newest)") },
    { key: "updated_asc", label: t("passwords.sortUpdatedOldest", undefined, "Updated (Oldest)") },
    { key: "created_desc", label: t("passwords.sortCreatedNewest", undefined, "Created (Newest)") },
    { key: "created_asc", label: t("passwords.sortCreatedOldest", undefined, "Created (Oldest)") },
  ];

  if (!encryptionEnabled) return <EncryptionRequiredBanner onEnable={handleEnableEncryption} />;
  if (encryptionLocked) return <EncryptionRequiredPrompt category="passwords" onUnlocked={() => { refreshEncryptionState(); fetchData(); }} categoryLabel={t("passwords.appTitle", undefined, "Password Manager")} />;

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-full min-h-[600px]">
      {/* Left: Add/Edit Form */}
      <div className="w-full lg:w-[380px] xl:w-[420px] shrink-0">
        <Card className="bg-slate-900/60 border border-slate-800 sticky top-4">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"><KeyRound className="w-5 h-5" /></div>
              <div>
                <CardTitle className="text-base text-white">{editingId ? t("passwords.editPassword", undefined, "Edit Password") : t("passwords.addPassword", undefined, "Add Password")}</CardTitle>
                <CardDescription className="text-xs text-slate-500">{t("passwords.formDesc", undefined, "All fields are encrypted before saving")}</CardDescription>
              </div>
              {editingId && <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-slate-400 hover:text-white" onClick={resetForm}><X className="w-4 h-4" /></Button>}
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">{t("passwords.titleLabel", undefined, "Title")} <span className="text-slate-600">({t("common.optional", undefined, "Optional")})</span></Label>
                <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder={t("passwords.titlePlaceholder", undefined, "e.g. GitHub Account")} className="bg-slate-950 border-slate-800 text-slate-100 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">{t("passwords.urlLabel", undefined, "URL / Website")} <span className="text-slate-600">({t("common.optional", undefined, "Optional")})</span></Label>
                <div className="flex gap-2">
                  <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder={t("passwords.urlPlaceholder", undefined, "https://example.com")} className="bg-slate-950 border-slate-800 text-slate-100 text-sm flex-1" />
                  {formUrl && <a href={formUrl.startsWith("http") ? formUrl : "https://" + formUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 transition flex items-center" title="Open URL"><ExternalLink className="w-4 h-4" /></a>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">{t("passwords.passwordLabel", undefined, "Password")} <span className="text-rose-500">*</span></Label>
                <div className="relative">
                  <Input type={showFormPassword ? "text" : "password"} value={formPassword} onChange={e => { setFormPassword(e.target.value); setGeneratorValue(e.target.value); }} placeholder={t("passwords.passwordPlaceholder", undefined, "Enter or generate a password...")} className="bg-slate-950 border-slate-800 text-slate-100 text-sm pr-9 font-mono" required />
                  <button type="button" onClick={() => setShowFormPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition">{showFormPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
                {formPassword && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden"><div className={cn("h-full rounded-full transition-all", formPasswordStrength.color)} style={{ width: `${Math.min(100, (formPasswordStrength.score / 7) * 100)}%` }} /></div>
                    <span className="text-[10px] text-slate-500 shrink-0">{formPasswordStrength.label}</span>
                  </div>
                )}
              </div>
              <button type="button" onClick={() => setShowGenerator(v => !v)} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition font-medium">
                <Shuffle className="w-3.5 h-3.5" />
                {showGenerator ? t("passwords.hideGenerator", undefined, "Hide Generator") : t("passwords.showGenerator", undefined, "Show Generator")}
                {showGenerator ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showGenerator && <PasswordGeneratorPanel value={generatorValue} onChange={v => setGeneratorValue(v)} onApply={v => { setFormPassword(v); setGeneratorValue(v); }} />}
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">{t("passwords.otpSecretLabel", undefined, "One-Time Password (OTP) Secret / 2FA Key")} <span className="text-slate-600">({t("common.optional", undefined, "Optional")})</span></Label>
                <Input
                  value={formOtpSecret}
                  onChange={e => setFormOtpSecret(e.target.value)}
                  placeholder={t("passwords.otpSecretPlaceholder", undefined, "e.g. JBSWY3DPEHPK3PXP or otpauth://...")}
                  className="bg-slate-950 border-slate-800 text-slate-100 text-xs font-mono"
                />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {t("passwords.otpSecretHelp", undefined, "Enter the manual secret key provided during 2FA setup. QR code scanning is not supported.")}
                </p>
                {formOtpSecret.trim() && (
                  validateTotpSecret(formOtpSecret) ? (
                    <div className="pt-1">
                      <span className="text-[10px] uppercase font-semibold text-cyan-400 tracking-wider">
                        {t("passwords.otpLivePreview", undefined, "Live Preview")}
                      </span>
                      <OtpLiveDisplay secret={formOtpSecret} />
                    </div>
                  ) : (
                    <p className="text-[11px] text-rose-400">
                      {t("passwords.invalidOtpSecret", undefined, "Invalid OTP secret key")}
                    </p>
                  )
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-400">{t("passwords.notes", undefined, "Notes")} <span className="text-slate-600">({t("common.optional", undefined, "Optional")})</span></Label>
                <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder={t("passwords.notesPlaceholder", undefined, "Additional info, security questions, etc.")} className="bg-slate-950 border-slate-800 text-slate-100 text-sm resize-none min-h-[70px]" />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={saving} className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white font-medium gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {editingId ? t("passwords.updateButton", undefined, "Update Password") : t("passwords.saveButton", undefined, "Save Password")}
                </Button>
                {editingId && <Button type="button" variant="outline" onClick={resetForm} className="border-slate-700 text-slate-400 hover:text-white">{t("common.cancel", undefined, "Cancel")}</Button>}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Right: Vault */}
      <div className="flex-1 min-w-0 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("passwords.searchPlaceholder", undefined, "Search by title or URL...")} className="pl-9 bg-slate-900 border-slate-800 text-slate-100 text-sm" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className="bg-slate-900 border-slate-700 text-slate-400 text-xs">{passwords.length} {t("passwords.entries", undefined, "entries")}</Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="border-slate-700 text-slate-400 hover:text-white gap-1.5 h-9"><ArrowUpDown className="w-3.5 h-3.5" />{t("passwords.sort", undefined, "Sort")}</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-900 border-slate-800 text-slate-200">
                <DropdownMenuLabel className="text-xs text-slate-500">{t("passwords.sortBy", undefined, "Sort by")}</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-800" />
                {SORT_OPTIONS.map(opt => (
                  <DropdownMenuItem key={opt.key} onClick={() => setSortKey(opt.key)} className={cn("text-xs cursor-pointer hover:bg-slate-800", sortKey === opt.key && "text-cyan-400 font-medium")}>
                    {sortKey === opt.key && <Check className="w-3 h-3 mr-1.5" />}{opt.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {fetching ? (
          <div className="flex items-center justify-center py-16 text-slate-500 gap-2"><Loader2 className="w-5 h-5 animate-spin" /><span className="text-sm">{t("common.loading", undefined, "Loading...")}</span></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center"><KeyRound className="w-6 h-6 text-slate-600" /></div>
            <p className="text-slate-500 text-sm">{passwords.length === 0 ? t("passwords.noPasswords", undefined, "No passwords saved yet. Add one using the form on the left.") : t("passwords.noResults", undefined, "No passwords match your search.")}</p>
          </div>
        ) : (
          <ScrollArea className="h-full max-h-[calc(100vh-260px)]">
            <div className="space-y-3 pr-2">
              {filtered.map(record => {
                const domain = extractDomain(record.url);
                const displayTitle = record.title || domain || t("passwords.untitled", undefined, "Untitled Password");
                const isRevealed = revealedIds[record.id];
                const isCopied = copiedId === record.id;
                return (
                  <div key={record.id} className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-all group">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 shrink-0 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden">
                        {domain ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" onError={e => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} className="w-5 h-5 object-contain" /> : null}
                        <Globe className={cn("w-4 h-4 text-slate-500", domain ? "hidden" : "")} />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate">{displayTitle}</span>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] font-mono shrink-0">AES-256-GCM</Badge>
                          {record.otp_secret && (
                            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-400 border-cyan-500/30 text-[10px] font-mono shrink-0 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" /> 2FA TOTP
                            </Badge>
                          )}
                        </div>
                        {record.url && <a href={record.url.startsWith("http") ? record.url : "https://" + record.url} target="_blank" rel="noopener noreferrer" className="text-xs text-cyan-400 hover:text-cyan-300 hover:underline truncate flex items-center gap-1 max-w-xs">{domain}<ExternalLink className="w-3 h-3 shrink-0" /></a>}
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-300 select-all truncate max-w-[200px] sm:max-w-[300px]">{isRevealed ? record.password : "•".repeat(Math.min(20, record.password.length))}</span>
                          <button type="button" onClick={() => toggleReveal(record.id)} className="p-1 text-slate-500 hover:text-slate-300 transition shrink-0" title={isRevealed ? "Hide password" : "Reveal password"}>
                            {isRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {record.otp_secret && (
                          <div className="pt-0.5 max-w-md">
                            <OtpLiveDisplay secret={record.otp_secret} />
                          </div>
                        )}
                        {record.notes && <p className="text-xs text-slate-500 truncate">{record.notes}</p>}
                        <p className="text-[10px] text-slate-600">{t("passwords.updated", undefined, "Updated")} {new Date(record.updated_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" onClick={() => handleCopyPassword(record.id, record.password)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition" title={t("passwords.copy", undefined, "Copy password")}>
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button type="button" onClick={() => handleOpenEditDialog(record)} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 transition" title={t("passwords.edit", undefined, "Edit")}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => { setDeleteRecord(record); setDeleteDialogOpen(true); }} className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 transition" title={t("passwords.delete", undefined, "Delete")}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2"><KeyRound className="w-5 h-5 text-cyan-400" />{t("passwords.editPassword", undefined, "Edit Password")}</DialogTitle>
            <DialogDescription className="text-slate-500 text-xs">{t("passwords.editDesc", undefined, "Update the password details. All data is encrypted before saving.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label className="text-xs text-slate-400">{t("passwords.titleLabel", undefined, "Title")} <span className="text-slate-600">({t("common.optional", undefined, "Optional")})</span></Label><Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="bg-slate-950 border-slate-800 text-slate-100 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-400">{t("passwords.urlLabel", undefined, "URL / Website")} <span className="text-slate-600">({t("common.optional", undefined, "Optional")})</span></Label><Input value={editUrl} onChange={e => setEditUrl(e.target.value)} className="bg-slate-950 border-slate-800 text-slate-100 text-sm" /></div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">{t("passwords.passwordLabel", undefined, "Password")} <span className="text-rose-500">*</span></Label>
              <div className="relative"><Input type={showEditPassword ? "text" : "password"} value={editPassword} onChange={e => { setEditPassword(e.target.value); setEditGeneratorValue(e.target.value); }} className="bg-slate-950 border-slate-800 text-slate-100 text-sm pr-9 font-mono" /><button type="button" onClick={() => setShowEditPassword(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">{showEditPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button></div>
            </div>
            <button type="button" onClick={() => setShowEditGenerator(v => !v)} className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition font-medium">
              <Shuffle className="w-3.5 h-3.5" />{showEditGenerator ? t("passwords.hideGenerator", undefined, "Hide Generator") : t("passwords.showGenerator", undefined, "Show Generator")}{showEditGenerator ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showEditGenerator && <PasswordGeneratorPanel value={editGeneratorValue} onChange={v => setEditGeneratorValue(v)} onApply={v => { setEditPassword(v); setEditGeneratorValue(v); }} />}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">{t("passwords.otpSecretLabel", undefined, "One-Time Password (OTP) Secret / 2FA Key")} <span className="text-slate-600">({t("common.optional", undefined, "Optional")})</span></Label>
              <Input
                value={editOtpSecret}
                onChange={e => setEditOtpSecret(e.target.value)}
                placeholder={t("passwords.otpSecretPlaceholder", undefined, "e.g. JBSWY3DPEHPK3PXP or otpauth://...")}
                className="bg-slate-950 border-slate-800 text-slate-100 text-xs font-mono"
              />
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {t("passwords.otpSecretHelp", undefined, "Enter the manual secret key provided during 2FA setup. QR code scanning is not supported.")}
              </p>
              {editOtpSecret.trim() && (
                validateTotpSecret(editOtpSecret) ? (
                  <div className="pt-1">
                    <span className="text-[10px] uppercase font-semibold text-cyan-400 tracking-wider">
                      {t("passwords.otpLivePreview", undefined, "Live Preview")}
                    </span>
                    <OtpLiveDisplay secret={editOtpSecret} />
                  </div>
                ) : (
                  <p className="text-[11px] text-rose-400">
                    {t("passwords.invalidOtpSecret", undefined, "Invalid OTP secret key")}
                  </p>
                )
              )}
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-400">{t("passwords.notes", undefined, "Notes")} <span className="text-slate-600">({t("common.optional", undefined, "Optional")})</span></Label><Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} className="bg-slate-950 border-slate-800 text-slate-100 text-sm resize-none min-h-[60px]" /></div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} className="border-slate-700 text-slate-400 hover:text-white">{t("common.cancel", undefined, "Cancel")}</Button>
            <Button onClick={handleDialogSave} disabled={editSaving} className="bg-cyan-600 hover:bg-cyan-500 text-white gap-2">{editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{t("common.save", undefined, "Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-slate-900 border-slate-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{t("passwords.deleteConfirmTitle", undefined, "Delete Password?")}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">{t("passwords.deleteConfirmDesc", undefined, "This will permanently remove this password from your encrypted vault. This action cannot be undone.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-400 hover:text-white bg-transparent">{t("common.cancel", undefined, "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-rose-600 hover:bg-rose-500 text-white gap-2">{deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}{t("common.delete", undefined, "Delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
