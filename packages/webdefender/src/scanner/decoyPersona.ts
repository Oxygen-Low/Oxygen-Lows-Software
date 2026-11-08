/**
 * Deterministic decoy personas.
 *
 * Every protected app gets its own stable fake organization, infrastructure
 * and credential set. Values are derived from the app ID with a small,
 * edge-safe PRNG, so no Node `crypto` APIs are required.
 */

export interface DecoyPersona {
  appId: string;
  personaId: string;
  orgName: string;
  orgSlug: string;
  domain: string;
  appDomain: string;
  apiDomain: string;
  repoOwner: string;
  repoName: string;
  repoUrl: string;
  branch: string;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  redisHost: string;
  redisPassword: string;
  storageBucket: string;
  internalIp: string;
  internalSubnet: string;
  awsAccountId: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsRegion: string;
  gcpRegion: string;
  gcpProjectId: string;
  gcpPrivateKeyId: string;
  gcpClientEmail: string;
  azureTenantId: string;
  azureClientId: string;
  azureClientSecret: string;
  jwtSecret: string;
  sessionSecret: string;
  encryptionKey: string;
  stripeKey: string;
  sentryDsn: string;
  analyticsKey: string;
  mailApiKey: string;
  slackWebhook: string;
  appVersion: string;
  nodeVersion: string;
  phpVersion: string;
  canary: string;
  sshPrivateKey: string;
  rsaPrivateKey: string;
  tlsPrivateKey: string;
  sshPublicKey: string;
  sshFingerprint: string;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)];
  }

  bool(chance = 0.5): boolean {
    return this.next() < chance;
  }

  chars(length: number, alphabet: string): string {
    let out = "";
    for (let i = 0; i < length; i++) {
      out += alphabet[this.int(0, alphabet.length - 1)];
    }
    return out;
  }

  alnum(length: number): string {
    return this.chars(
      length,
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
    );
  }

  lower(length: number): string {
    return this.chars(length, "abcdefghijklmnopqrstuvwxyz0123456789");
  }

  upper(length: number): string {
    return this.chars(length, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
  }

  hex(length: number): string {
    return this.chars(length, "0123456789abcdef");
  }

  password(length = 24): string {
    return this.chars(
      length,
      "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*_-+=",
    );
  }

  bytes(length: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < length; i++) {
      out.push(this.int(0, 255));
    }
    return out;
  }

  uuid(): string {
    const hex = this.hex(32).split("");
    hex[12] = "4";
    hex[16] = this.pick(["8", "9", "a", "b"]);
    const value = hex.join("");
    return [
      value.slice(0, 8),
      value.slice(8, 12),
      value.slice(12, 16),
      value.slice(16, 20),
      value.slice(20),
    ].join("-");
  }
}

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Minimal base64 encoder (edge-safe; no Buffer/btoa dependency). */
export function toBase64(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += BASE64[(triple >> 18) & 63];
    out += BASE64[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(triple >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64[triple & 63] : "=";
  }
  return out;
}

function wrap(value: string, width = 64): string {
  const lines: string[] = [];
  for (let i = 0; i < value.length; i += width) {
    lines.push(value.slice(i, i + width));
  }
  return lines.join("\n");
}

function pem(label: string, rng: Rng, byteLength: number): string {
  const payload = toBase64(rng.bytes(byteLength));
  return `-----BEGIN ${label}-----\n${wrap(payload, 64)}\n-----END ${label}-----`;
}

const ORG_PREFIXES = [
  "Northwind",
  "Aurora",
  "Cobalt",
  "Ironwood",
  "Bluepeak",
  "Helix",
  "Vantage",
  "Summit",
  "Basalt",
  "Meridian",
  "Oakline",
  "Crestview",
  "Silvergate",
  "Redwood",
  "Kestrel",
  "Lighthouse",
];

const ORG_SUFFIXES = [
  "Logistics",
  "Analytics",
  "Health",
  "Labs",
  "Systems",
  "Commerce",
  "Media",
  "Financial",
  "Robotics",
  "Networks",
  "Foods",
  "Energy",
];

const BRANCHES = ["main", "master", "production", "release"];

const AWS_REGIONS = [
  "us-east-1",
  "us-east-2",
  "us-west-2",
  "eu-west-1",
  "eu-central-1",
];

const GCP_REGIONS = ["us-central1", "us-east1", "europe-west1"];

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Create a persona that is stable for an app and optional rotation seed. */
export function createDecoyPersona(appId: string, seed?: string): DecoyPersona {
  const stableId = appId && appId.trim() ? appId.trim() : "webdefender-app";
  const seedValue = `${stableId}|${seed && seed.trim() ? seed.trim() : "v1"}`;
  const rng = new Rng(hashString(seedValue));

  const orgName = `${rng.pick(ORG_PREFIXES)} ${rng.pick(ORG_SUFFIXES)}`;
  const orgSlug = slugify(orgName);
  const tld = rng.pick([".com", ".io", ".net", ".co"]);
  const domain = `${orgSlug}${tld}`;
  const appDomain = rng.bool(0.5) ? `app.${domain}` : `www.${domain}`;
  const apiDomain = `api.${domain}`;
  const repoOwner = rng.bool(0.6) ? orgSlug : `${orgSlug}-eng`;
  const repoName = rng.pick([
    "core-api",
    "platform",
    "backend",
    "webapp",
    "services",
    "monorepo",
  ]);
  const branch = rng.pick(BRANCHES);
  const dbPort = rng.pick([5432, 3306, 5432]);
  const internalSubnet = `10.${rng.int(0, 40)}.${rng.int(0, 40)}`;
  const internalIp = `${internalSubnet}.${rng.int(10, 240)}`;
  const awsRegion = rng.pick(AWS_REGIONS);
  const gcpRegion = rng.pick(GCP_REGIONS);
  const gcpProjectId = `${orgSlug}-${rng.pick(["prod", "platform", "core"])}-${rng.int(1000, 9999)}`;
  const appVersion = `${rng.int(1, 4)}.${rng.int(0, 9)}.${rng.int(0, 12)}`;
  const nodeVersion = rng.pick(["20.11.1", "20.18.0", "22.9.0", "18.20.4"]);
  const phpVersion = rng.pick(["8.1.29", "8.2.20", "8.3.8"]);
  const dbPassword = rng.password(22);
  const redisPassword = rng.password(20);
  const canary = `wd_${rng.hex(24)}`;

  const sshPrivateKey = pem("OPENSSH PRIVATE KEY", rng, rng.int(380, 520));
  const rsaPrivateKey = pem("RSA PRIVATE KEY", rng, rng.int(600, 780));
  const tlsPrivateKey = pem("PRIVATE KEY", rng, rng.int(600, 780));
  const sshPublicKey = `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI${toBase64(
    rng.bytes(48),
  )} deploy@${orgSlug}-ci`;
  const sshFingerprint = `SHA256:${toBase64(rng.bytes(32)).replace(/=+$/, "")}`;

  return {
    appId: stableId,
    personaId: hashString(seedValue).toString(16).padStart(8, "0"),
    orgName,
    orgSlug,
    domain,
    appDomain,
    apiDomain,
    repoOwner,
    repoName,
    repoUrl: rng.bool(0.7)
      ? `git@github.com:${repoOwner}/${repoName}.git`
      : `https://github.com/${repoOwner}/${repoName}.git`,
    branch,
    dbHost:
      dbPort === 5432
        ? `db-prod-01.${orgSlug}.internal`
        : `mysql-prod-01.${orgSlug}.internal`,
    dbPort,
    dbName: `${orgSlug.replace(/-/g, "_")}_production`,
    dbUser: rng.pick(["app_rw", "app_service", "webapp", "svc_app"]),
    dbPassword,
    redisHost: `cache-01.${orgSlug}.internal`,
    redisPassword,
    storageBucket: `${orgSlug}-prod-assets`,
    internalIp,
    internalSubnet,
    awsAccountId: rng.chars(12, "0123456789"),
    awsAccessKeyId: `AKIA${rng.upper(16)}`,
    awsSecretAccessKey: rng.alnum(40),
    awsRegion,
    gcpRegion,
    gcpProjectId,
    gcpPrivateKeyId: rng.hex(40),
    gcpClientEmail: `deployer@${gcpProjectId}.iam.gserviceaccount.com`,
    azureTenantId: rng.uuid(),
    azureClientId: rng.uuid(),
    azureClientSecret: `${rng.alnum(8)}~${rng.alnum(24)}~${rng.alnum(8)}`,
    jwtSecret: rng.hex(64),
    sessionSecret: rng.hex(48),
    encryptionKey: toBase64(rng.bytes(32)),
    stripeKey: `sk_live_${rng.alnum(24)}`,
    sentryDsn: `https://${rng.hex(32)}@o${rng.int(100000, 999999)}.ingest.sentry.io/${rng.int(1000000, 9999999)}`,
    analyticsKey: `prod_${rng.alnum(20)}`,
    mailApiKey: `SG.${rng.alnum(22)}.${rng.alnum(43)}`,
    slackWebhook: `https://hooks.slack.com/services/T${rng.upper(8)}/B${rng.upper(8)}/${rng.alnum(24)}`,
    appVersion,
    nodeVersion,
    phpVersion,
    canary,
    sshPrivateKey,
    rsaPrivateKey,
    tlsPrivateKey,
    sshPublicKey,
    sshFingerprint,
  };
}