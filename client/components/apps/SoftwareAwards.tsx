import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Trophy,
  ArrowRight,
  Clock,
  CheckCircle2,
  Lock,
  BarChart2,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface AwardOption {
  value: string;
  defaultLabel: string;
}

interface Award {
  id: string;
  title: string;
  description: string;
  rewardName: string;
  options: AwardOption[];
  isActive: boolean;
  hasVoted: boolean;
  currentMonthKey: string;
}

interface AwardResult {
  awardId: string;
  monthKey: string;
  totalVotes: number;
  winner: string | null;
  distribution: { name: string; count: number; percentage: number }[];
}

export function SoftwareAwardsApp() {
  const { session } = useAuth();
  const { t } = useTranslation();

  const [awards, setAwards] = useState<Award[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAward, setActiveAward] = useState<Award | null>(null);
  const [selectedOption, setSelectedOption] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [resultsData, setResultsData] = useState<AwardResult | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);

  const fetchAwards = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch("/api/software-awards", {
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        signal: controller.signal,
      });
      const data = await res.json();
      if (data.awards) {
        setAwards(data.awards);
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast.error(t("awards.fetchError", undefined, "Failed to fetch awards."));
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchAwards();
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [session?.access_token]);

  const handleVote = async (awardId: string) => {
    if (!selectedOption) {
      toast.error(
        t("awards.selectOption", undefined, "Please select an option."),
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/software-awards/${awardId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ answer: selectedOption }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        toast.success(
          t("awards.voteSuccess", undefined, "Vote submitted successfully!"),
        );
        setActiveAward(null);
        setSelectedOption("");
        fetchAwards();
      } else {
        toast.error(
          data.error ||
            t("awards.voteFail", undefined, "Failed to submit vote."),
        );
      }
    } catch (err) {
      toast.error(t("awards.voteFail", undefined, "Failed to submit vote."));
    } finally {
      setSubmitting(false);
    }
  };

  const resultsAbortControllerRef = React.useRef<AbortController | null>(null);

  const fetchResults = async (awardId: string) => {
    if (resultsAbortControllerRef.current) {
      resultsAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    resultsAbortControllerRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(`/api/software-awards/${awardId}/results`, {
        headers: {
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        signal: controller.signal,
      });
      const data = await res.json();
      if (res.ok && data.results) {
        setResultsData(data.results);
      } else {
        toast.error(
          data.error ||
            t("awards.resultsError", undefined, "Failed to fetch results."),
        );
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast.error(
          t("awards.resultsError", undefined, "Failed to fetch results."),
        );
      }
    } finally {
      if (resultsAbortControllerRef.current === controller) {
        setLoading(false);
      }
    }
  };

  if (loading && awards.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 space-y-4 text-muted-foreground">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p>{t("common.loading", undefined, "Loading...")}</p>
      </div>
    );
  }

  // Active Award Voting View
  if (activeAward && activeAward.isActive && !activeAward.hasVoted) {
    return (
      <div className="p-4 sm:p-8 h-full overflow-y-auto bg-background/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setActiveAward(null);
            setSelectedOption("");
          }}
          className="mb-6 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("awards.back", undefined, "Back to Awards")}
        </Button>

        <Card className="max-w-2xl mx-auto border-border bg-card/80 shadow-xl backdrop-blur-sm">
          <CardHeader className="border-b border-border/80 bg-primary/5 pb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-bold text-foreground">
                  {activeAward.title}
                </CardTitle>
              </div>
            </div>
            <CardDescription className="text-sm text-muted-foreground mt-2">
              {activeAward.description}
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6">
            <RadioGroup
              value={selectedOption}
              onValueChange={setSelectedOption}
              className="space-y-3"
            >
              {activeAward.options.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex items-center space-x-3 p-4 rounded-xl border transition-all cursor-pointer ${
                    selectedOption === opt.value
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-background hover:bg-accent/50 hover:border-accent-foreground/20"
                  }`}
                  onClick={() => setSelectedOption(opt.value)}
                >
                  <RadioGroupItem value={opt.value} id={`opt-${opt.value}`} />
                  <Label
                    htmlFor={`opt-${opt.value}`}
                    className="flex-1 cursor-pointer font-medium text-foreground"
                  >
                    {opt.defaultLabel}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>

          <CardFooter className="pt-4 border-t border-border bg-background/50 flex justify-between items-center rounded-b-xl">
            <p className="text-xs text-muted-foreground">
              Reward: {activeAward.rewardName}
            </p>
            <Button
              onClick={() => handleVote(activeAward.id)}
              disabled={submitting || !selectedOption}
              className="font-semibold shadow-md"
            >
              {submitting
                ? t("common.submitting", undefined, "Submitting...")
                : t("awards.submit", undefined, "Submit Vote")}
              {!submitting && <ArrowRight className="w-4 h-4 ml-2" />}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // Results View
  if (resultsData) {
    return (
      <div className="p-4 sm:p-8 h-full overflow-y-auto bg-background/50">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setResultsData(null);
            setActiveAward(null);
          }}
          className="mb-6 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("awards.back", undefined, "Back to Awards")}
        </Button>

        <div className="max-w-3xl mx-auto space-y-6">
          <Card className="border-border bg-card/80 shadow-lg">
            <CardHeader className="pb-4">
              <CardTitle className="text-2xl font-bold flex flex-col items-center justify-center space-y-2">
                <Trophy className="w-12 h-12 text-yellow-500 mb-2" />
                <span className="text-center">{activeAward?.title}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {resultsData.winner ? (
                <div className="p-6 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl text-center space-y-2">
                  <h3 className="text-3xl font-extrabold text-yellow-500">
                    {resultsData.winner}
                  </h3>
                  <p className="text-lg font-medium text-foreground">
                    won{" "}
                    <span className="font-bold text-primary">
                      {activeAward?.rewardName}
                    </span>
                    !
                  </p>
                </div>
              ) : (
                <div className="p-6 bg-secondary/50 border border-border rounded-xl text-center">
                  <p className="text-lg font-medium text-muted-foreground">
                    No definitive winner could be determined (Tied or no votes).
                  </p>
                </div>
              )}

              <div className="mt-8 space-y-6">
                <h4 className="font-semibold text-lg border-b border-border pb-2">
                  Results Breakdown
                </h4>

                <div className="space-y-4">
                  {resultsData.distribution.map((opt) => (
                    <div key={opt.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm font-semibold text-foreground">
                        <span className="truncate pr-2">{opt.name}</span>
                        <span className="text-primary font-mono shrink-0">
                          {opt.percentage}% ({opt.count} votes)
                        </span>
                      </div>
                      <Progress
                        value={opt.percentage}
                        className="h-3 bg-background border border-border"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border bg-muted/20 text-xs text-muted-foreground justify-center">
              Total Votes: {resultsData.totalVotes}
            </CardFooter>
          </Card>
        </div>
      </div>
    );
  }

  // Main List View
  return (
    <div className="p-4 sm:p-8 h-full overflow-y-auto space-y-8 bg-background/50">
      <div className="max-w-6xl mx-auto space-y-2">
        <h1 className="text-3xl font-extrabold text-foreground flex items-center gap-3 tracking-tight">
          <Trophy className="w-8 h-8 text-yellow-500" />
          {t("awards.title", undefined, "Software Awards")}
        </h1>
        <p className="text-muted-foreground">
          {t(
            "awards.subtitle",
            undefined,
            "Vote for your favorite software and see the community's top choices.",
          )}
        </p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {awards.map((award) => (
          <Card
            key={award.id}
            className={`flex flex-col border-border shadow-sm transition-all hover:shadow-md ${
              !award.isActive && !award.hasVoted
                ? "bg-card/40 opacity-80 grayscale-[0.2]"
                : "bg-card hover:-translate-y-1"
            }`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-2">
                {award.isActive ? (
                  <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    <Clock className="w-3 h-3 mr-1" />
                    Voting Open
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                  >
                    <Lock className="w-3 h-3 mr-1" />
                    Voting Closed
                  </Badge>
                )}
                {award.hasVoted && (
                  <Badge
                    variant="outline"
                    className="border-primary/50 text-primary"
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Voted
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg font-bold text-foreground">
                {award.title}
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {award.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Reward
              </div>
              <div className="text-sm font-medium text-primary">
                {award.rewardName}
              </div>
            </CardContent>
            <CardFooter className="pt-4 border-t border-border/50 bg-muted/10">
              {award.isActive ? (
                <Button
                  className="w-full font-semibold"
                  variant={award.hasVoted ? "secondary" : "default"}
                  disabled={award.hasVoted}
                  onClick={() => {
                    if (!award.hasVoted) setActiveAward(award);
                  }}
                >
                  {award.hasVoted
                    ? t("awards.alreadyVoted", undefined, "Already Voted")
                    : t("awards.voteNow", undefined, "Vote Now")}
                </Button>
              ) : (
                <Button
                  className="w-full font-semibold bg-accent hover:bg-accent/80 text-accent-foreground"
                  onClick={() => {
                    setActiveAward(award);
                    fetchResults(award.id);
                  }}
                >
                  <BarChart2 className="w-4 h-4 mr-2" />
                  View Results
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
        {awards.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
            {t(
              "awards.noAwards",
              undefined,
              "No awards are currently available.",
            )}
          </div>
        )}
      </div>
    </div>
  );
}
export default SoftwareAwardsApp;
