import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Scale, Shield, ScrollText, FileText, Copyright, ShieldAlert, ChevronRight } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";

const OPERATOR = "Oxygen Low's Software";

interface LegalCardProps {
  href: string;
  icon: React.ElementType;
  title: string;
  description: string;
  index: number;
}

function LegalCard({ href, icon: Icon, title, description, index }: LegalCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.35, ease: "easeOut" }}
    >
      <Link
        to={href}
        className="group flex items-center gap-4 p-5 rounded-xl border border-border/40 bg-card/50 hover:bg-card/80 hover:border-primary/30 transition-all duration-200 hover:shadow-md"
      >
        <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-inner shrink-0 group-hover:bg-primary/15 transition-colors duration-200">
          <Icon className="w-6 h-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-foreground text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
      </Link>
    </motion.div>
  );
}

export default function Legal() {
  const { t } = useTranslation();

  const legalDocuments = [
    {
      href: "/terms",
      icon: ScrollText,
      title: t("legal.termsTitle", undefined, "Terms of Use"),
      description: t(
        "legal.termsDesc",
        undefined,
        "The rules and conditions that govern your use of the Service, including eligibility, accounts, and permitted use.",
      ),
    },
    {
      href: "/privacy",
      icon: Shield,
      title: t("legal.privacyTitle", undefined, "Privacy Policy"),
      description: t(
        "legal.privacyDesc",
        undefined,
        "How we collect, use, share, and protect your personal data, and the rights you have under UK GDPR and CCPA.",
      ),
    },
    {
      href: "/eula",
      icon: FileText,
      title: t("legal.eulaTitle", undefined, "End User Licence Agreement"),
      description: t(
        "legal.eulaDesc",
        undefined,
        "The licence granted to you to use the Software, and the restrictions and obligations that apply.",
      ),
    },
    {
      href: "/dmca",
      icon: Copyright,
      title: t("legal.dmcaTitle", undefined, "DMCA & Copyright Policy"),
      description: t(
        "legal.dmcaDesc",
        undefined,
        "How to report copyright infringement, submit a counter-notice, and our repeat-infringer policy.",
      ),
    },
    {
      href: "/acceptable-use",
      icon: ShieldAlert,
      title: t("legal.aupTitle", undefined, "Acceptable Use Policy"),
      description: t(
        "legal.aupDesc",
        undefined,
        "The conduct standards for using the Service, including prohibited activities and enforcement actions.",
      ),
    },
    {
      href: "/license",
      icon: FileText,
      title: t("legal.licenseTitle", undefined, "License"),
      description: t(
        "legal.licenseDesc",
        undefined,
        "The MIT License applied to this project.",
      ),
    },
  ];

  return (
    <Layout>
      <div className="max-w-3xl mx-auto w-full px-2 py-6 space-y-10 pb-20">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex items-start gap-4"
        >
          <div className="p-3 bg-primary/10 rounded-xl border border-primary/20 shadow-inner shrink-0">
            <Scale className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{t("legal.title", undefined, "Legal")}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t(
                "legal.subtitle",
                { operator: OPERATOR },
                `Legal documents for ${OPERATOR} · United Kingdom`,
              )}
            </p>
          </div>
        </motion.div>

        {/* Intro */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="text-sm text-muted-foreground leading-relaxed -mt-4"
        >
          {t(
            "legal.intro",
            undefined,
            "The documents below govern your use of our Service. Please read each one carefully. By using the Service you agree to be bound by all applicable policies listed here.",
          )}
        </motion.p>

        {/* Document cards */}
        <div className="space-y-3">
          {legalDocuments.map((doc, i) => (
            <LegalCard key={doc.href} {...doc} index={i} />
          ))}
        </div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.35 }}
          className="text-xs text-muted-foreground/60 text-center pt-2"
        >
          {t("legal.questionsContact", undefined, "Questions? Contact us at")}{" "}
          <a
            href="mailto:support@oxygenlow.com"
            className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            support@oxygenlow.com
          </a>
        </motion.p>
      </div>
    </Layout>
  );
}
