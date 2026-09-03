import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./dataStore.ts";

export const AWARDS_DIR = path.join(DATA_DIR, "awards");

export interface AwardOption {
  value: string;
  defaultLabel: string;
}

export interface SoftwareAward {
  id: string;
  title: string;
  description: string;
  rewardName: string; // e.g., "Best Browser"
  options: AwardOption[];
  created_at: string;
  updated_at: string;
}

export interface AwardSubmission {
  id: string;
  user_id: string;
  award_id: string;
  month_key: string;
  created_at: string;
}

export interface AwardVote {
  id: string;
  award_id: string;
  month_key: string;
  answer: string;
  created_at: string;
}

export function ensureAwardsDir() {
  if (!fs.existsSync(AWARDS_DIR)) {
    fs.mkdirSync(AWARDS_DIR, { recursive: true });
  }
}

export function getCurrentMonthKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getAwardPeriodKey(award: SoftwareAward): string {
  return getCurrentMonthKey(new Date(award.created_at));
}

const AWARDS_FILE = path.join(AWARDS_DIR, "awards.json");
const VOTES_FILE = path.join(AWARDS_DIR, "votes.json");
const SUBMISSIONS_FILE = path.join(AWARDS_DIR, "submissions.json");

function readJson<T>(filePath: string, fallback: T): T {
  try {
    const content = fs.readFileSync(filePath, "utf-8").trim();
    if (!content) return fallback;
    return JSON.parse(content) as T;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      return fallback;
    }
    throw err;
  }
}

function writeJson(filePath: string, data: any): void {
  ensureAwardsDir();
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, filePath);
}

export function getAllAwards(): SoftwareAward[] {
  ensureAwardsDir();
  return readJson<SoftwareAward[]>(AWARDS_FILE, []);
}

export function getAwardById(id: string): SoftwareAward | null {
  const awards = getAllAwards();
  return awards.find((a) => a.id === id) || null;
}

export function isAwardActive(award: SoftwareAward): boolean {
  const now = new Date();

  // 1. First 3 days of the month
  if (now.getUTCDate() <= 3) {
    return true;
  }

  // 2. First 3 days after creation
  const createdDate = new Date(award.created_at);
  const diffTime = Math.abs(now.getTime() - createdDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 3) {
    return true;
  }

  return false;
}

export function saveAward(award: SoftwareAward): SoftwareAward {
  ensureAwardsDir();
  const awards = getAllAwards();
  const index = awards.findIndex((a) => a.id === award.id);

  if (index >= 0) {
    awards[index] = { ...award, updated_at: new Date().toISOString() };
  } else {
    awards.push({
      ...award,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  writeJson(AWARDS_FILE, awards);
  return award;
}

export function deleteAward(id: string): boolean {
  ensureAwardsDir();
  const awards = getAllAwards();
  const filtered = awards.filter((a) => a.id !== id);

  if (filtered.length !== awards.length) {
    writeJson(AWARDS_FILE, filtered);
    // Delete votes & submissions associated with this award
    const votes = readJson<AwardVote[]>(VOTES_FILE, []);
    writeJson(
      VOTES_FILE,
      votes.filter((v) => v.award_id !== id),
    );

    const submissions = readJson<AwardSubmission[]>(SUBMISSIONS_FILE, []);
    writeJson(
      SUBMISSIONS_FILE,
      submissions.filter((s) => s.award_id !== id),
    );
    return true;
  }
  return false;
}

export function hasUserVoted(userId: string, awardId: string): boolean {
  ensureAwardsDir();
  const submissions = readJson<AwardSubmission[]>(SUBMISSIONS_FILE, []);
  const award = getAwardById(awardId);
  const currentMonthKey = award ? getAwardPeriodKey(award) : getCurrentMonthKey();

  return submissions.some(
    (s) =>
      s.user_id === String(userId) &&
      s.award_id === awardId &&
      s.month_key === currentMonthKey,
  );
}

export function submitVote(params: {
  userId: string;
  awardId: string;
  answer: string;
}): { success: boolean; error?: string } {
  ensureAwardsDir();

  const award = getAwardById(params.awardId);
  if (!award) {
    return { success: false, error: "Award not found" };
  }

  if (!isAwardActive(award)) {
    return {
      success: false,
      error: "Voting is currently closed for this award",
    };
  }

  if (hasUserVoted(params.userId, params.awardId)) {
    return {
      success: false,
      error: "You have already voted for this award this month.",
    };
  }

  const currentMonthKey = getAwardPeriodKey(award);
  const now = new Date().toISOString();

  const vote: AwardVote = {
    id: crypto.randomUUID(),
    award_id: params.awardId,
    month_key: currentMonthKey,
    answer: params.answer,
    created_at: now,
  };

  const votes = readJson<AwardVote[]>(VOTES_FILE, []);
  votes.push(vote);
  writeJson(VOTES_FILE, votes);

  const submission: AwardSubmission = {
    id: crypto.randomUUID(),
    user_id: String(params.userId),
    award_id: params.awardId,
    month_key: currentMonthKey,
    created_at: now,
  };

  const submissions = readJson<AwardSubmission[]>(SUBMISSIONS_FILE, []);
  submissions.push(submission);
  writeJson(SUBMISSIONS_FILE, submissions);

  return { success: true };
}

export interface AwardResult {
  awardId: string;
  monthKey: string;
  totalVotes: number;
  winner: string | null;
  distribution: { name: string; count: number; percentage: number }[];
}

export function calculateAwardResults(
  awardId: string,
  monthKey?: string,
): AwardResult | null {
  ensureAwardsDir();
  const award = getAwardById(awardId);
  if (!award) return null;

  const activePeriodKey = monthKey || getAwardPeriodKey(award);

  const allVotes = readJson<AwardVote[]>(VOTES_FILE, []);
  const votes = allVotes.filter(
    (v) => v.award_id === awardId && v.month_key === activePeriodKey,
  );

  const totalVotes = votes.length;

  const counts: Record<string, number> = {};
  for (const opt of award.options) {
    counts[opt.value] = 0;
  }

  for (const v of votes) {
    if (counts[v.answer] !== undefined) {
      counts[v.answer]++;
    }
  }

  let winner: string | null = null;
  let maxCount = -1;
  let tied = false;

  const distribution = Object.entries(counts)
    .map(([name, count]) => {
      if (count > maxCount) {
        maxCount = count;
        winner = name;
        tied = false;
      } else if (count === maxCount) {
        tied = true;
      }
      const percentage =
        totalVotes > 0 ? Number(((count / totalVotes) * 100).toFixed(1)) : 0;
      return { name, count, percentage };
    })
    .sort((a, b) => b.count - a.count);

  if (tied || totalVotes === 0) {
    winner = null; // No winner if tied or no votes
  }

  return {
    awardId,
    monthKey: activePeriodKey,
    totalVotes,
    winner,
    distribution,
  };
}
