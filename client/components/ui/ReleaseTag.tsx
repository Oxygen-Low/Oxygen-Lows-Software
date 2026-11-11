import { cn } from "@/lib/utils";
import { useTranslation } from "@/contexts/LanguageContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ReleaseStage = "alpha" | "beta";

interface ReleaseTagProps {
  stage: ReleaseStage;
  className?: string;
}

const STAGE_STYLES: Record<ReleaseStage, string> = {
  alpha: "border-purple-400/40 bg-purple-500/15 text-purple-200",
  beta: "border-yellow-400/40 bg-yellow-400/15 text-yellow-200",
};

const STAGE_DEFAULT_LABELS: Record<ReleaseStage, string> = {
  alpha: "Alpha",
  beta: "Beta",
};

const STAGE_DEFAULT_TOOLTIPS: Record<ReleaseStage, string> = {
  alpha: "This is in Alpha, expect bugs and provide feedback via support.",
  beta: "This is in Beta, expect bugs and provide feedback via support.",
};

/**
 * Small release-stage badge used for apps, games, and sidebar navigation
 * buttons. Hovering (or focusing) the badge reveals the full explanation.
 */
export function ReleaseTag({ stage, className }: ReleaseTagProps) {
  const { t } = useTranslation();
  const label = t(
    `releaseStage.${stage}` as any,
    undefined,
    STAGE_DEFAULT_LABELS[stage],
  );
  const tooltip = t(
    `releaseStage.${stage}Tooltip` as any,
    undefined,
    STAGE_DEFAULT_TOOLTIPS[stage],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="note"
            aria-label={tooltip}
            className={cn(
              "inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              STAGE_STYLES[stage],
              className,
            )}
          >
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64 text-center">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}