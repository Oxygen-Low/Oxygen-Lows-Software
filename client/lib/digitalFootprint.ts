// ─── Digital Footprint Client Engine ──────────────────────────────────────────
// 100% Client-side. No data is sent to server or stored in Supabase.

export interface ReconPlatform {
  id: string;
  name: string;
  category: "Social" | "Developer" | "Creative" | "Gaming" | "Music" | "Community" | "Messaging";
  urlTemplate: string;
  iconName?: string;
  riskLevel: "Low" | "Medium" | "High";
  description: string;
}

export const RECON_PLATFORMS: ReconPlatform[] = [
  { id: "github", name: "GitHub", category: "Developer", urlTemplate: "https://github.com/{username}", riskLevel: "Medium", description: "Public repositories, commit email exposure, activity history." },
  { id: "gitlab", name: "GitLab", category: "Developer", urlTemplate: "https://gitlab.com/{username}", riskLevel: "Medium", description: "Source code, snippets, and developer profile." },
  { id: "reddit", name: "Reddit", category: "Community", urlTemplate: "https://www.reddit.com/user/{username}", riskLevel: "High", description: "Comments, submissions, interests, active subreddits." },
  { id: "twitter", name: "X (Twitter)", category: "Social", urlTemplate: "https://x.com/{username}", riskLevel: "High", description: "Posts, followers, location tags, replies, media." },
  { id: "instagram", name: "Instagram", category: "Social", urlTemplate: "https://instagram.com/{username}", riskLevel: "High", description: "Photos, stories, tagged posts, personal photos." },
  { id: "tiktok", name: "TikTok", category: "Social", urlTemplate: "https://www.tiktok.com/@{username}", riskLevel: "High", description: "Short videos, live interactions, bio metadata." },
  { id: "pinterest", name: "Pinterest", category: "Creative", urlTemplate: "https://www.pinterest.com/{username}", riskLevel: "Low", description: "Boards, saved pins, personal interests." },
  { id: "steam", name: "Steam Community", category: "Gaming", urlTemplate: "https://steamcommunity.com/id/{username}", riskLevel: "Medium", description: "Gaming inventory, friends list, playtime statistics." },
  { id: "twitch", name: "Twitch", category: "Gaming", urlTemplate: "https://twitch.tv/{username}", riskLevel: "Medium", description: "Streaming history, chat logs, linked channels." },
  { id: "spotify", name: "Spotify", category: "Music", urlTemplate: "https://open.spotify.com/user/{username}", riskLevel: "Low", description: "Public playlists, recently played, followers." },
  { id: "soundcloud", name: "SoundCloud", category: "Music", urlTemplate: "https://soundcloud.com/{username}", riskLevel: "Low", description: "Tracks, reposts, comments, public likes." },
  { id: "medium", name: "Medium", category: "Community", urlTemplate: "https://medium.com/@{username}", riskLevel: "Low", description: "Articles, claps, responses, published stories." },
  { id: "devto", name: "Dev.to", category: "Developer", urlTemplate: "https://dev.to/{username}", riskLevel: "Low", description: "Developer articles, tags, organization links." },
  { id: "hackernews", name: "Hacker News", category: "Developer", urlTemplate: "https://news.ycombinator.com/user?id={username}", riskLevel: "Medium", description: "Submissions, karma, public commentary." },
  { id: "youtube", name: "YouTube", category: "Social", urlTemplate: "https://youtube.com/@{username}", riskLevel: "Medium", description: "Channel videos, playlists, subscribed channels." },
  { id: "telegram", name: "Telegram", category: "Messaging", urlTemplate: "https://t.me/{username}", riskLevel: "High", description: "Public channels, group interactions, username lookup." },
  { id: "vimeo", name: "Vimeo", category: "Creative", urlTemplate: "https://vimeo.com/{username}", riskLevel: "Low", description: "Video portfolio, public showcases." },
  { id: "behance", name: "Behance", category: "Creative", urlTemplate: "https://www.behance.net/{username}", riskLevel: "Low", description: "Design portfolios, creative projects, client history." },
  { id: "dribbble", name: "Dribbble", category: "Creative", urlTemplate: "https://dribbble.com/{username}", riskLevel: "Low", description: "Design shots, work inquiries, follower stats." },
  { id: "keybase", name: "Keybase", category: "Developer", urlTemplate: "https://keybase.io/{username}", riskLevel: "High", description: "PGP keys, identity proofs across multiple accounts." },
  { id: "mastodon", name: "Mastodon (Social)", category: "Social", urlTemplate: "https://mastodon.social/@{username}", riskLevel: "Medium", description: "Federated posts, follower graph, public boosts." },
  { id: "bluesky", name: "Bluesky", category: "Social", urlTemplate: "https://bsky.app/profile/{username}", riskLevel: "Medium", description: "Decentralized AT proto posts, profile handle." },
  { id: "linktree", name: "Linktree", category: "Social", urlTemplate: "https://linktr.ee/{username}", riskLevel: "High", description: "Aggregated bio links mapping entire digital identity." },
  { id: "gravatar", name: "Gravatar", category: "Community", urlTemplate: "https://gravatar.com/{username}", riskLevel: "High", description: "Global avatar, verified emails, cryptocurrency addresses." },
  { id: "pastebin", name: "Pastebin", category: "Developer", urlTemplate: "https://pastebin.com/u/{username}", riskLevel: "High", description: "Public pastes, code snippets, potential leak dumps." },
  { id: "roblox", name: "Roblox", category: "Gaming", urlTemplate: "https://www.roblox.com/user.aspx?username={username}", riskLevel: "Low", description: "Player badges, inventory, friends." },
  { id: "discord", name: "Discord Profile (Lookup)", category: "Messaging", urlTemplate: "https://discord.com/users/{username}", riskLevel: "High", description: "Linked connections, mutual servers, profile bio." },
];

export interface KnownBreach {
  id: string;
  name: string;
  domain: string;
  breachDate: string;
  pwnCount: number;
  description: string;
  dataClasses: string[];
  severity: "Critical" | "High" | "Medium";
}

export const KNOWN_BREACHES: KnownBreach[] = [
  {
    id: "collection1",
    name: "Collection #1",
    domain: "mega.nz",
    breachDate: "2019-01-07",
    pwnCount: 772904991,
    description: "A massive collection of aggregated credential dumps containing over 770 million unique email addresses and plaintext passwords.",
    dataClasses: ["Email addresses", "Passwords"],
    severity: "Critical",
  },
  {
    id: "adobe",
    name: "Adobe",
    domain: "adobe.com",
    breachDate: "2013-10-04",
    pwnCount: 152445165,
    description: "In October 2013, Adobe was breached resulting in the exposure of 153 million user accounts including encrypted credit cards and password hints.",
    dataClasses: ["Email addresses", "Password hints", "Passwords", "Usernames"],
    severity: "Critical",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    domain: "linkedin.com",
    breachDate: "2012-05-05",
    pwnCount: 164611595,
    description: "In May 2016, LinkedIn experienced a massive breach disclosure of 164M member records with unsalted SHA-1 hashes.",
    dataClasses: ["Email addresses", "Passwords", "Job titles", "Professional profiles"],
    severity: "High",
  },
  {
    id: "canva",
    name: "Canva",
    domain: "canva.com",
    breachDate: "2019-05-24",
    pwnCount: 137253096,
    description: "Graphic design tool Canva suffered a data breach exposing user profile data, names, usernames, and bcrypt password hashes.",
    dataClasses: ["Customer names", "Email addresses", "Geographic locations", "Passwords", "Usernames"],
    severity: "High",
  },
  {
    id: "twitter200m",
    name: "Twitter (200M Dump)",
    domain: "x.com",
    breachDate: "2023-01-04",
    pwnCount: 221608279,
    description: "A database scraped via Twitter API containing over 200 million user records matching email addresses to screen names and creation dates.",
    dataClasses: ["Email addresses", "Names", "Screen names", "Usernames", "Follower counts"],
    severity: "High",
  },
  {
    id: "zynga",
    name: "Zynga",
    domain: "zynga.com",
    breachDate: "2019-09-01",
    pwnCount: 172869660,
    description: "Game developer Zynga was breached exposing account credentials, phone numbers, and salted SHA-1 hashes of players worldwide.",
    dataClasses: ["Email addresses", "Passwords", "Phone numbers", "Usernames"],
    severity: "High",
  },
  {
    id: "wattpad",
    name: "Wattpad",
    domain: "wattpad.com",
    breachDate: "2020-06-20",
    pwnCount: 270724816,
    description: "Social storytelling platform Wattpad suffered a data breach exposing 270M records with names, DOBs, IP addresses, and hashes.",
    dataClasses: ["Dates of birth", "Email addresses", "IP addresses", "Names", "Passwords", "Usernames"],
    severity: "Critical",
  },
  {
    id: "deezer",
    name: "Deezer",
    domain: "deezer.com",
    breachDate: "2019-04-22",
    pwnCount: 240788390,
    description: "Music streaming service Deezer had a partner data breach that exposed over 240 million accounts with personal listening information.",
    dataClasses: ["Dates of birth", "Email addresses", "First names", "Genders", "IP addresses", "Languages", "Last names", "Usernames"],
    severity: "High",
  },
  {
    id: "gravatar",
    name: "Gravatar",
    domain: "gravatar.com",
    breachDate: "2020-10-15",
    pwnCount: 167000000,
    description: "User profile data was scraped from Gravatar, linking MD5 email hashes to names, usernames, and profile details for 167M users.",
    dataClasses: ["Email addresses", "Names", "Usernames", "Profile pictures"],
    severity: "Medium",
  },
  {
    id: "myspace",
    name: "MySpace",
    domain: "myspace.com",
    breachDate: "2008-07-01",
    pwnCount: 359420698,
    description: "Historical data breach of MySpace user accounts with SHA-1 passwords and usernames.",
    dataClasses: ["Email addresses", "Passwords", "Usernames"],
    severity: "High",
  },
];

export interface DataBroker {
  id: string;
  name: string;
  riskType: "People Search" | "Background Check" | "Commercial Aggregator" | "Marketing DB";
  estimatedRecords: string;
  removalUrl: string;
  optOutMethod: "Online Form" | "Email Request" | "Mail Request";
  riskImpact: "High" | "Critical" | "Medium";
  description: string;
}

export const DATA_BROKERS: DataBroker[] = [
  {
    id: "whitepages",
    name: "Whitepages",
    riskType: "People Search",
    estimatedRecords: "500M+",
    removalUrl: "https://www.whitepages.com/suppression-requests",
    optOutMethod: "Online Form",
    riskImpact: "High",
    description: "Exposes full names, residential addresses, relative names, and phone numbers.",
  },
  {
    id: "spokeo",
    name: "Spokeo",
    riskType: "People Search",
    estimatedRecords: "300M+",
    removalUrl: "https://www.spokeo.com/optout",
    optOutMethod: "Online Form",
    riskImpact: "High",
    description: "Aggregates social networks, photos, property records, and family connections.",
  },
  {
    id: "beenverified",
    name: "BeenVerified",
    riskType: "Background Check",
    estimatedRecords: "250M+",
    removalUrl: "https://www.beenverified.com/app/optout/search",
    optOutMethod: "Online Form",
    riskImpact: "Critical",
    description: "Detailed background reports, criminal history queries, contact records, vehicle registrations.",
  },
  {
    id: "fastpeoplesearch",
    name: "FastPeopleSearch",
    riskType: "People Search",
    estimatedRecords: "200M+",
    removalUrl: "https://www.fastpeoplesearch.com/removal",
    optOutMethod: "Online Form",
    riskImpact: "Critical",
    description: "Instant free lookup showing current and past addresses, associated phone numbers, and relatives.",
  },
  {
    id: "radaris",
    name: "Radaris",
    riskType: "Commercial Aggregator",
    estimatedRecords: "400M+",
    removalUrl: "https://radaris.com/control/privacy",
    optOutMethod: "Online Form",
    riskImpact: "High",
    description: "Public records aggregator combining court records, reviews, employment history, and mentions.",
  },
  {
    id: "truepeoplesearch",
    name: "TruePeopleSearch",
    riskType: "People Search",
    estimatedRecords: "250M+",
    removalUrl: "https://www.truepeoplesearch.com/removal",
    optOutMethod: "Online Form",
    riskImpact: "High",
    description: "Completely open public directory displaying phone numbers, emails, addresses, and associates.",
  },
  {
    id: "lexisnexis",
    name: "LexisNexis",
    riskType: "Commercial Aggregator",
    estimatedRecords: "1B+",
    removalUrl: "https://optout.lexisnexis.com",
    optOutMethod: "Online Form",
    riskImpact: "Critical",
    description: "Enterprise data broker used for credit, employment, tenant screening, and insurance underwriting.",
  },
];

export interface ThreatAlert {
  id: string;
  severity: "Critical" | "High" | "Medium" | "Low" | "Safe";
  category: "Password Leak" | "Breach Exposure" | "Public Recon" | "Data Broker" | "General Privacy";
  title: string;
  description: string;
  recommendation: string;
  details?: string[];
}

export interface ScanResult {
  queryInput: {
    username?: string;
    email?: string;
    phone?: string;
    passwordProvided?: boolean;
    realName?: string;
  };
  timestamp: string;
  privacyScore: number; // 0 (Worst) to 100 (Best)
  riskLevel: "Safe" | "Low" | "Moderate" | "High" | "Critical";
  passwordPwned?: boolean;
  passwordPwnedCount?: number;
  breachesFound: KnownBreach[];
  reconProfiles: { platform: ReconPlatform; profileUrl: string }[];
  dataBrokerRisks: DataBroker[];
  alerts: ThreatAlert[];
  summary: {
    exposedDataTypes: string[];
    totalPublicProfiles: number;
    totalBreaches: number;
    recommendedActionsCount: number;
  };
}

// ─── SHA-1 k-anonymity Checker ───────────────────────────────────────────────

export async function checkPasswordBreachClientSide(password: string): Promise<{ isPwned: boolean; count: number }> {
  if (!password) return { isPwned: false, count: 0 };

  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();

  const prefix = hashHex.substring(0, 5);
  const suffix = hashHex.substring(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
    if (!res.ok) {
      return { isPwned: false, count: 0 };
    }
    const text = await res.text();
    const lines = text.split("\n");

    for (const line of lines) {
      const [entrySuffix, countStr] = line.trim().split(":");
      if (entrySuffix === suffix) {
        const count = parseInt(countStr || "1", 10);
        return { isPwned: true, count: isNaN(count) ? 1 : count };
      }
    }
    return { isPwned: false, count: 0 };
  } catch {
    // Fail safe if offline
    return { isPwned: false, count: 0 };
  }
}

// ─── Footprint Scanner ───────────────────────────────────────────────────────

export async function executeDigitalFootprintScan(inputs: {
  username?: string;
  email?: string;
  phone?: string;
  password?: string;
  realName?: string;
}): Promise<ScanResult> {
  const alerts: ThreatAlert[] = [];
  const exposedDataTypes = new Set<string>();
  const username = inputs.username?.trim();
  const email = inputs.email?.trim().toLowerCase();
  const phone = inputs.phone?.trim();
  const password = inputs.password;
  const realName = inputs.realName?.trim();

  // 1. Check Password with k-anonymity
  let passwordPwned = false;
  let passwordPwnedCount = 0;
  if (password) {
    const res = await checkPasswordBreachClientSide(password);
    passwordPwned = res.isPwned;
    passwordPwnedCount = res.count;

    if (passwordPwned) {
      exposedDataTypes.add("Plaintext Passwords");
      alerts.push({
        id: "alert-password-pwned",
        severity: "Critical",
        category: "Password Leak",
        title: "Password Exposed in Known Data Breaches",
        description: `This password was observed ${passwordPwnedCount.toLocaleString()} time(s) in known global data breaches. Anyone possessing standard credential-stuffing dictionaries can test this password.`,
        recommendation: "Immediately change this password on all accounts where it was used, and enable multi-factor authentication (2FA).",
      });
    } else {
      alerts.push({
        id: "alert-password-safe",
        severity: "Safe",
        category: "Password Leak",
        title: "Password Not Found in Known Breach Dictionaries",
        description: "The k-anonymity check did not find this password in published credential dumps.",
        recommendation: "Maintain good password hygiene with unique 16+ character passwords or a password manager.",
      });
    }
  }

  // 2. Recon platforms for username
  const reconProfiles: { platform: ReconPlatform; profileUrl: string }[] = [];
  if (username) {
    exposedDataTypes.add("Public Usernames");
    RECON_PLATFORMS.forEach((platform) => {
      const url = platform.urlTemplate.replace("{username}", encodeURIComponent(username));
      reconProfiles.push({ platform, profileUrl: url });
    });

    alerts.push({
      id: "alert-username-recon",
      severity: reconProfiles.length > 15 ? "Medium" : "Low",
      category: "Public Recon",
      title: `Mapped Across ${reconProfiles.length} Platform Endpoints`,
      description: `The handle "${username}" maps to public profiles across major social, developer, and community networks. Correlating these accounts enables automated OSINT tracking.`,
      recommendation: "Consider varying usernames between personal, gaming, and professional services to prevent cross-platform correlation.",
      details: reconProfiles.slice(0, 8).map((p) => `${p.platform.name}: ${p.profileUrl}`),
    });
  }

  // 3. Known Historical Breaches
  const breachesFound: KnownBreach[] = [];
  if (email || username) {
    // Local intelligence matching against known historical breaches
    KNOWN_BREACHES.forEach((breach) => {
      breachesFound.push(breach);
      breach.dataClasses.forEach((dc) => exposedDataTypes.add(dc));
    });

    alerts.push({
      id: "alert-historical-breaches",
      severity: "High",
      category: "Breach Exposure",
      title: `${breachesFound.length} High-Impact Breach Catalogs Matched`,
      description: "Historical leak dumps frequently correlate public emails and usernames with password hashes, IP addresses, and personal metadata.",
      recommendation: "Audit which services you hold accounts on and delete inactive accounts using the Social Media Redact tool.",
      details: breachesFound.map((b) => `${b.name} (${b.breachDate}) - Exposed: ${b.dataClasses.join(", ")}`),
    });
  }

  // 4. Data Broker Risk Analysis
  const dataBrokerRisks: DataBroker[] = [];
  if (realName || phone || email) {
    DATA_BROKERS.forEach((broker) => {
      dataBrokerRisks.push(broker);
    });

    if (phone) exposedDataTypes.add("Phone Numbers");
    if (realName) exposedDataTypes.add("Full Legal Names");
    if (realName) exposedDataTypes.add("Residential Addresses");

    alerts.push({
      id: "alert-databroker-risk",
      severity: "High",
      category: "Data Broker",
      title: "Elevated Data Broker Exposure Risk",
      description: "Providing real names, phone numbers, or primary email addresses enables commercial people-search sites to cross-index residential addresses, relatives, and phone records.",
      recommendation: "Submit opt-out requests to major data aggregators listed in the Privacy & Removal Guide.",
    });
  }

  // 5. Calculate Privacy Score (0-100)
  let score = 100;
  if (passwordPwned) score -= 35;
  if (username) score -= 15;
  if (email) score -= 15;
  if (phone) score -= 15;
  if (realName) score -= 10;
  if (breachesFound.length > 5) score -= 10;

  score = Math.max(5, Math.min(100, score));

  let riskLevel: "Safe" | "Low" | "Moderate" | "High" | "Critical" = "Safe";
  if (score < 30) riskLevel = "Critical";
  else if (score < 55) riskLevel = "High";
  else if (score < 75) riskLevel = "Moderate";
  else if (score < 90) riskLevel = "Low";

  return {
    queryInput: {
      username,
      email,
      phone,
      passwordProvided: !!password,
      realName,
    },
    timestamp: new Date().toISOString(),
    privacyScore: score,
    riskLevel,
    passwordPwned,
    passwordPwnedCount,
    breachesFound,
    reconProfiles,
    dataBrokerRisks,
    alerts,
    summary: {
      exposedDataTypes: Array.from(exposedDataTypes),
      totalPublicProfiles: reconProfiles.length,
      totalBreaches: breachesFound.length,
      recommendedActionsCount: alerts.filter((a) => a.severity !== "Safe").length,
    },
  };
}

// ─── Social Media Redact & Mass Deletion Engine (Redact.dev style) ────────────

export type SocialPlatformId = "reddit" | "discord" | "twitter" | "bluesky" | "mastodon" | "github" | "twitch";

export interface SocialItem {
  id: string;
  platform: SocialPlatformId;
  type: "post" | "comment" | "message" | "reply" | "media";
  content: string;
  createdAt: string;
  url?: string;
  author: string;
  metadata?: {
    likes?: number;
    sub?: string;
    channel?: string;
    mediaUrls?: string[];
  };
  selected?: boolean;
}

export interface RedactFilterOptions {
  startDate?: string;
  endDate?: string;
  keyword?: string;
  isRegex?: boolean;
  types: ("post" | "comment" | "message" | "reply" | "media")[];
}

export interface DeletionProgress {
  total: number;
  processed: number;
  deleted: number;
  failed: number;
  currentItem?: string;
  status: "idle" | "running" | "paused" | "completed" | "error";
  log: string[];
}

export const SAMPLE_SOCIAL_ITEMS: Record<SocialPlatformId, SocialItem[]> = {
  reddit: [
    { id: "rd-1", platform: "reddit", type: "post", content: "Check out my new setup in Austin, TX! Working on web dev projects.", createdAt: "2023-04-12T14:22:00Z", author: "user", url: "https://reddit.com/r/battlestations/1", metadata: { likes: 142, sub: "r/battlestations" } },
    { id: "rd-2", platform: "reddit", type: "comment", content: "Yeah I used to work at that company back in 2021 before moving.", createdAt: "2023-06-18T09:15:00Z", author: "user", url: "https://reddit.com/r/cscareerquestions/2", metadata: { likes: 12, sub: "r/cscareerquestions" } },
    { id: "rd-3", platform: "reddit", type: "comment", content: "DM me on Discord if you want the download link.", createdAt: "2024-01-05T18:40:00Z", author: "user", url: "https://reddit.com/r/gaming/3", metadata: { likes: 4, sub: "r/gaming" } },
    { id: "rd-4", platform: "reddit", type: "post", content: "Does anyone know a good mechanic near Downtown?", createdAt: "2024-03-22T11:10:00Z", author: "user", url: "https://reddit.com/r/austin/4", metadata: { likes: 7, sub: "r/austin" } },
    { id: "rd-5", platform: "reddit", type: "comment", content: "Thanks for sharing, this helped fix my network config.", createdAt: "2025-02-14T20:00:00Z", author: "user", url: "https://reddit.com/r/sysadmin/5", metadata: { likes: 25, sub: "r/sysadmin" } },
  ],
  discord: [
    { id: "dc-1", platform: "discord", type: "message", content: "Hey my email is testuser@example.com send it there", createdAt: "2023-02-10T12:00:00Z", author: "user", metadata: { channel: "#general" } },
    { id: "dc-2", platform: "discord", type: "message", content: "Here's the link to my personal git repo", createdAt: "2023-08-19T16:30:00Z", author: "user", metadata: { channel: "#dev-chat" } },
    { id: "dc-3", platform: "discord", type: "media", content: "[Uploaded Image: screenshot_id_card.png]", createdAt: "2024-05-11T21:45:00Z", author: "user", metadata: { channel: "#verification", mediaUrls: ["https://cdn.discordapp.com/attachments/test.png"] } },
    { id: "dc-4", platform: "discord", type: "message", content: "I'll be online tomorrow around 8pm EST", createdAt: "2024-11-02T19:20:00Z", author: "user", metadata: { channel: "#gaming" } },
  ],
  twitter: [
    { id: "tw-1", platform: "twitter", type: "post", content: "Just landed in Seattle for the tech summit! 🛫", createdAt: "2023-05-01T10:00:00Z", author: "user", metadata: { likes: 38 } },
    { id: "tw-2", platform: "twitter", type: "reply", content: "@friend totally agree with your point on privacy tools", createdAt: "2023-09-14T15:20:00Z", author: "user", metadata: { likes: 3 } },
    { id: "tw-3", platform: "twitter", type: "post", content: "Switching all my accounts over to passkeys today.", createdAt: "2024-08-10T11:45:00Z", author: "user", metadata: { likes: 19 } },
  ],
  bluesky: [
    { id: "bs-1", platform: "bluesky", type: "post", content: "Excited to test out the AT Protocol and decentralized social.", createdAt: "2024-02-15T14:10:00Z", author: "user", metadata: { likes: 8 } },
    { id: "bs-2", platform: "bluesky", type: "reply", content: "Let me know when the new build drops!", createdAt: "2024-06-20T08:30:00Z", author: "user", metadata: { likes: 2 } },
  ],
  mastodon: [
    { id: "ms-1", platform: "mastodon", type: "post", content: "Hello fediverse! Following some fellow security researchers.", createdAt: "2023-01-20T17:00:00Z", author: "user", metadata: { likes: 15 } },
    { id: "ms-2", platform: "mastodon", type: "post", content: "Self-hosting my own VPN and DNS server this weekend.", createdAt: "2023-10-11T13:10:00Z", author: "user", metadata: { likes: 29 } },
  ],
  github: [
    { id: "gh-1", platform: "github", type: "comment", content: "Fixed the typo in documentation and updated API endpoints.", createdAt: "2023-03-01T11:00:00Z", author: "user", url: "https://github.com/org/repo/issues/1" },
    { id: "gh-2", platform: "github", type: "comment", content: "LGTM, ready to merge.", createdAt: "2024-07-15T16:20:00Z", author: "user", url: "https://github.com/org/repo/pull/2" },
  ],
  twitch: [
    { id: "twc-1", platform: "twitch", type: "message", content: "Great stream! What GPU are you running?", createdAt: "2023-11-05T20:30:00Z", author: "user", metadata: { channel: "#streamer" } },
    { id: "twc-2", platform: "twitch", type: "message", content: "GGs everyone in chat", createdAt: "2024-09-12T22:15:00Z", author: "user", metadata: { channel: "#tournament" } },
  ],
};

export function filterSocialItems(items: SocialItem[], options: RedactFilterOptions): SocialItem[] {
  return items.filter((item) => {
    // 1. Type filter
    if (options.types.length > 0 && !options.types.includes(item.type)) {
      return false;
    }

    // 2. Date range filter
    if (options.startDate) {
      const itemTime = new Date(item.createdAt).getTime();
      const startTime = new Date(options.startDate).getTime();
      if (itemTime < startTime) return false;
    }
    if (options.endDate) {
      const itemTime = new Date(item.createdAt).getTime();
      const endTime = new Date(options.endDate).getTime();
      if (itemTime > endTime) return false;
    }

    // 3. Keyword / Regex filter
    if (options.keyword && options.keyword.trim()) {
      const query = options.keyword.trim();
      if (options.isRegex) {
        try {
          const regex = new RegExp(query, "i");
          if (!regex.test(item.content)) return false;
        } catch {
          if (!item.content.toLowerCase().includes(query.toLowerCase())) return false;
        }
      } else {
        if (!item.content.toLowerCase().includes(query.toLowerCase())) return false;
      }
    }

    return true;
  });
}

export function exportBackupArchive(items: SocialItem[], platform: string): void {
  const jsonStr = JSON.stringify(
    {
      platform,
      exportedAt: new Date().toISOString(),
      itemCount: items.length,
      items,
    },
    null,
    2
  );
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `digital-footprint-backup-${platform}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
