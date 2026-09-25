import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Handshake,
  Mail,
  LifeBuoy,
  ExternalLink,
  Building2,
  Gift,
  ArrowRight,
  HelpCircle,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";

interface ExistingPartner {
  id: string;
  name: string;
  logo_url: string;
  website_url: string;
  description: string;
  category: string;
}

interface WantedPartner {
  id: string;
  category: string;
  target_companies: string;
  what_we_provide: string;
  what_is_requested: string;
}

export default function Partners() {
  const { t } = useTranslation();
  usePageTitle(t("titles.partners", undefined, "Partners"), {
    description: t(
      "partners.subtitle",
      undefined,
      "Explore existing partners and collaboration opportunities with Oxygen Low's Software.",
    ),
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  const [existingPartners, setExistingPartners] = useState<ExistingPartner[]>([]);
  const [wantedPartners, setWantedPartners] = useState<WantedPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isWantedDialogOpen, setIsWantedDialogOpen] = useState(false);

  const PARTNER_EMAIL = "partner@oxygenlow.com";

  useEffect(() => {
    fetchPartners();
  }, []);

  const fetchPartners = async () => {
    try {
      const res = await fetch("/api/partners");
      if (res.ok) {
        const data = await res.json();
        setExistingPartners(data.existing_partners || []);
        setWantedPartners(data.wanted_partners || []);
      }
    } catch (err) {
      console.error("Failed to fetch partners data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(PARTNER_EMAIL);
      setCopied(true);
      toast({
        title: t("partners.emailCopiedTitle", undefined, "Email Copied"),
        description: t(
          "partners.emailCopiedDesc",
          { email: PARTNER_EMAIL },
          `Copied ${PARTNER_EMAIL} to clipboard.`,
        ),
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({
        title: t("common.error", undefined, "Error"),
        description: t(
          "partners.emailCopyFailed",
          undefined,
          "Failed to copy email to clipboard.",
        ),
        variant: "destructive",
      });
    }
  };

  const handleGoToSupport = () => {
    navigate("/support?type=Partner+Request&open=true");
  };

  return (
    <Layout>
      <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header Hero Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 sm:p-12 text-white shadow-xl">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-sm font-medium">
              <Handshake className="w-4 h-4" />
              <span>{t("partners.heroBadge", undefined, "Partnerships & Collaborations")}</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              {t("partners.title", undefined, "Oxygen Low's Software Partners")}
            </h1>
            <p className="text-blue-100 text-base sm:text-lg leading-relaxed">
              {t(
                "partners.heroDesc",
                undefined,
                "We partner with forward-thinking tech companies, game studios, and infrastructure providers to deliver high-quality, privacy-first software to users worldwide.",
              )}
            </p>

            {/* Action Buttons */}
            <div className="pt-4 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleCopyEmail}
                className="font-semibold shadow-sm flex items-center gap-2 bg-white text-slate-900 hover:bg-slate-100"
              >
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                <span>
                  {copied
                    ? t("partners.copied", undefined, "Copied!")
                    : t("partners.copyEmailButton", undefined, "Copy Email (partner@oxygenlow.com)")}
                </span>
              </Button>

              <Button
                size="lg"
                onClick={handleGoToSupport}
                className="font-semibold bg-slate-900/80 hover:bg-slate-900 text-white border border-white/20 backdrop-blur-sm flex items-center gap-2"
              >
                <LifeBuoy className="w-4 h-4" />
                <span>{t("partners.goToSupportButton", undefined, "Request Partnership (Support)")}</span>
              </Button>

              {/* Wanted Partner Categories Modal Trigger */}
              <Dialog open={isWantedDialogOpen} onOpenChange={setIsWantedDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setIsWantedDialogOpen(true)}
                    className="font-semibold bg-white/10 hover:bg-white/20 text-white border-white/30 backdrop-blur-sm flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{t("partners.viewWantedButton", undefined, "View Wanted Partner Opportunities")}</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="text-2xl flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-amber-500" />
                      {t("partners.wantedModalTitle", undefined, "Wanted Partner Categories & Opportunities")}
                    </DialogTitle>
                    <DialogDescription>
                      {t(
                        "partners.wantedModalDesc",
                        undefined,
                        "Categories and companies Oxygen Low's Software is actively seeking to partner with, including mutual offerings.",
                      )}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-6 pt-4">
                    {wantedPartners.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p>{t("partners.noWantedYet", undefined, "No specific wanted partner categories listed at the moment.")}</p>
                      </div>
                    ) : (
                      wantedPartners.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-5 space-y-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                              <Building2 className="w-5 h-5 text-blue-500" />
                              {item.category}
                            </h3>
                            {item.target_companies && (
                              <Badge variant="secondary" className="font-normal text-xs">
                                {t("partners.targetCompanies", undefined, "Target/Example")}: {item.target_companies}
                              </Badge>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div className="space-y-1.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                              <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400">
                                <Gift className="w-4 h-4" />
                                <span>{t("partners.whatWeProvide", undefined, "What Oxygen Low's Software Provides")}</span>
                              </div>
                              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                {item.what_we_provide || t("partners.notSpecified", undefined, "Flexible integration options.")}
                              </p>
                            </div>

                            <div className="space-y-1.5 p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                              <div className="flex items-center gap-1.5 font-semibold text-indigo-700 dark:text-indigo-400">
                                <HelpCircle className="w-4 h-4" />
                                <span>{t("partners.whatIsRequested", undefined, "What Is Requested from Partner")}</span>
                              </div>
                              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                {item.what_is_requested || t("partners.notSpecified", undefined, "Collaboration and technical alignment.")}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}

                    <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 p-4 border border-blue-200 dark:border-blue-900/60 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-sm text-blue-900 dark:text-blue-200 space-y-1">
                        <p className="font-medium">
                          {t("partners.interestedTitle", undefined, "Fit one of these categories or have a proposal?")}
                        </p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          {t("partners.interestedDesc", undefined, "Contact our partnership team directly.")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button size="sm" variant="outline" onClick={handleCopyEmail}>
                          <Mail className="w-3.5 h-3.5 mr-1.5" />
                          partner@oxygenlow.com
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => {
                            setIsWantedDialogOpen(false);
                            handleGoToSupport();
                          }}
                        >
                          <LifeBuoy className="w-3.5 h-3.5 mr-1.5" />
                          {t("partners.openTicket", undefined, "Submit Ticket")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

        {/* Existing Partners Section */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {t("partners.existingTitle", undefined, "Our Partners")}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                {t(
                  "partners.existingSubtitle",
                  undefined,
                  "Trusted organizations and companies collaborating with Oxygen Low's Software.",
                )}
              </p>
            </div>
            {existingPartners.length > 0 && (
              <Badge variant="outline" className="text-xs">
                {existingPartners.length} {existingPartners.length === 1 ? "Partner" : "Partners"}
              </Badge>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse h-48 bg-muted/30" />
              ))}
            </div>
          ) : existingPartners.length === 0 ? (
            <Card className="border-dashed border-2 py-12 text-center">
              <CardContent className="space-y-4 max-w-md mx-auto">
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mx-auto">
                  <Handshake className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {t("partners.noPartnersYetTitle", undefined, "Be Our First Partner")}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {t(
                      "partners.noPartnersYetDesc",
                      undefined,
                      "We are currently reviewing applications and expanding our partner network. Reach out to collaborate with us!",
                    )}
                  </p>
                </div>
                <div className="pt-2 flex items-center justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={handleCopyEmail}>
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    partner@oxygenlow.com
                  </Button>
                  <Button size="sm" onClick={handleGoToSupport}>
                    {t("partners.applyNow", undefined, "Apply to Partner")}
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {existingPartners.map((partner) => (
                <Card
                  key={partner.id}
                  className="flex flex-col justify-between hover:shadow-md transition-shadow border-slate-200 dark:border-slate-800"
                >
                  <CardHeader className="space-y-3 pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {partner.logo_url ? (
                          <img
                            src={partner.logo_url}
                            alt={partner.name}
                            className="w-12 h-12 rounded-lg object-contain border border-slate-200 dark:border-slate-800 bg-white p-1"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 flex items-center justify-center font-bold text-lg">
                            {partner.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-lg font-bold">{partner.name}</CardTitle>
                          {partner.category && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {partner.category}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {partner.description && (
                      <CardDescription className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {partner.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  {partner.website_url && (
                    <CardFooter className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <a
                        href={partner.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 inline-flex items-center gap-1 transition-colors"
                      >
                        <span>{t("partners.visitWebsite", undefined, "Visit Website")}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </CardFooter>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
