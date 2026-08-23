import { motion } from "framer-motion";
import { FileText } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePageTitle } from "@/hooks/usePageTitle";
// @ts-ignore
import licenseText from "../../LICENSE?raw";

export default function License() {
  const { t } = useTranslation();
  usePageTitle(t("titles.license", undefined, "License"), {
    description: t(
      "legal.licenseDesc",
      undefined,
      "The MIT License applies to this project.",
    ),
  });
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
            <FileText className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">License</h1>
            <p className="text-sm text-muted-foreground mt-1">MIT License</p>
          </div>
        </motion.div>

        {/* License Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.35 }}
          className="bg-card/50 rounded-xl border border-border/40 p-6 space-y-6"
        >
          <pre className="whitespace-pre-wrap font-mono text-xs text-muted-foreground">
            {licenseText}
          </pre>
        </motion.div>
      </div>
    </Layout>
  );
}
