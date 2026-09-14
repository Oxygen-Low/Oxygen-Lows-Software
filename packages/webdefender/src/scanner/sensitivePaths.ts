/**
 * Sensitive Path Scanner
 *
 * Detects requests targeting well-known sensitive files and directories that
 * attackers commonly probe during reconnaissance scans, such as config files,
 * credential stores, CI/CD artifacts, version-control metadata, and debug
 * endpoints.
 */

/** A single matched sensitive path entry. */
export interface SensitivePathMatch {
  path: string;
  category: SensitivePathCategory;
}

export type SensitivePathCategory =
  | "credentials"
  | "config"
  | "vcs"
  | "ci_cd"
  | "backup"
  | "debug"
  | "cloud"
  | "infra"
  | "canary";

interface SensitivePathRule {
  /** Exact lower-case path(s) that should trigger a block. */
  exact?: string[];
  /** Prefix lower-case path(s) — any request whose path starts with one of these triggers. */
  prefix?: string[];
  /** Suffix lower-case path(s) — any request whose path ends with one of these triggers. */
  suffix?: string[];
  category: SensitivePathCategory;
}

const RULES: SensitivePathRule[] = [
  // ── Credentials & secrets ──────────────────────────────────────────────────
  {
    category: "credentials",
    prefix: [
      "/.ssh/",
      "/.vscode/",
      "/_vti_pvt/",
    ],
    exact: [
      "/.env",
      "/.env.local",
      "/.env.development",
      "/.env.development.local",
      "/.env.production",
      "/.env.production.local",
      "/.env.staging",
      "/.env.test",
      "/.env.backup",
      "/.env.bak",
      "/.env.old",
      "/.env.example", // sometimes contains real values
      "/secrets.yaml",
      "/secrets.yml",
      "/secrets.json",
      "/secrets.toml",
      "/user_secrets.yml",
      "/user_secrets.yaml",
      "/user_secrets.json",
      "/.secrets",
      "/credentials",
      "/credentials.json",
      "/credentials.yaml",
      "/credentials.yml",
      "/.htpasswd",
      "/.netrc",
      "/.pgpass",
      "/.my.cnf",
      "/.boto",
      "/.s3cfg",
      "/rclone.conf",
      "/.rclone.conf",
      "/id_rsa",
      "/.ssh/id_rsa",
      "/.ssh/id_ed25519",
      "/.ssh/id_ecdsa",
      "/.ssh/id_dsa",
      "/.ssh/authorized_keys",
      "/.ssh/known_hosts",
      "/.ssh/config",
      "/private.key",
      "/private.pem",
      "/server.key",
      "/server.pem",
      "/cert.key",
      "/keystore.jks",
      "/keystore.p12",
      "/auth.json",
      "/.auth",
      "/api-keys.json",
      "/api_keys.json",
      "/.bash_history",
      "/.zsh_history",
      "/.sh_history",
      "/.history",
      "/.bashrc",
      "/.bash_profile",
      "/.profile",
      "/.zshrc",
      "/.npmrc",
      "/.yarnrc",
      "/.yarnrc.yml",
      "/.docker/config.json",
      "/.vscode/sftp.json",
      "/_vti_pvt/service.pwd",
      "/_vti_pvt/administrators.pwd",
      "/_vti_pvt/users.pwd",
      "/_vti_pvt/service.grp",
      "/_vti_pvt/writeto.cnf",
    ],
  },

  // ── Application config files ───────────────────────────────────────────────
  {
    category: "config",
    exact: [
      "/config.php",
      "/config.py",
      "/config.rb",
      "/config.js",
      "/config.ts",
      "/config.json",
      "/config.yaml",
      "/config.yml",
      "/config.toml",
      "/config.ini",
      "/config.cfg",
      "/config.xml",
      "/configuration.php",
      "/configuration.json",
      "/configuration.yaml",
      "/configuration.yml",
      "/settings.php",
      "/settings.py",
      "/settings.js",
      "/settings.json",
      "/settings.xml",
      "/local.settings.json",
      "/local_settings.py",
      "/app.config",
      "/app.yaml",
      "/app.yml",
      "/app.json",
      "/app.php",
      "/app/config.php",
      "/app/settings.py",
      "/app/config.py",
      "/core/settings.py",
      "/backend/settings.py",
      "/instance/config.py",
      "/application.properties",
      "/application.yaml",
      "/application.yml",
      "/application-dev.properties",
      "/application-prod.properties",
      "/application-staging.properties",
      "/bootstrap.yml",
      "/bootstrap.yaml",
      "/web.config",
      "/web.xml",
      "/phpinfo.php",
      "/info.php",
      "/test.php",
      "/server-status",
      "/server-info",
      "/status",
      "/.htaccess",
    ],
  },

  // ── Cloud provider configs ─────────────────────────────────────────────────
  {
    category: "cloud",
    exact: [
      "/.aws/credentials",
      "/.aws/config",
      "/.azure/credentials",
      "/.gcloud/credentials.db",
      "/.config/gcloud/credentials.db",
      "/.config/gcloud/application_default_credentials.json",
      "/service-account.json",
      "/service_account.json",
      "/gcp-credentials.json",
      "/azure-credentials.json",
      "/aws-credentials.json",
      "/cloud-credentials.json",
    ],
  },

  // ── Infrastructure / DevOps ────────────────────────────────────────────────
  {
    category: "infra",
    exact: [
      "/docker-compose.yml",
      "/docker-compose.yaml",
      "/docker-compose.override.yml",
      "/Dockerfile",
      "/.dockerenv",
      "/kubernetes.yml",
      "/kubernetes.yaml",
      "/k8s.yml",
      "/k8s.yaml",
      "/terraform.tfvars",
      "/terraform.tfstate",
      "/terraform.tfstate.backup",
      "/.terraform/terraform.tfstate",
      "/ansible.cfg",
      "/inventory",
      "/Makefile",
      "/nginx.conf",
      "/apache.conf",
      "/httpd.conf",
    ],
  },

  // ── CI/CD pipelines & tokens ───────────────────────────────────────────────
  {
    category: "ci_cd",
    exact: [
      "/.github/workflows",
      "/.gitlab-ci.yml",
      "/.travis.yml",
      "/Jenkinsfile",
      "/.circleci/config.yml",
      "/bitbucket-pipelines.yml",
      "/azure-pipelines.yml",
      "/cloudbuild.yaml",
      "/buildspec.yml",
    ],
    prefix: [
      "/.github/workflows/",
    ],
  },

  // ── Version-control metadata ───────────────────────────────────────────────
  {
    category: "vcs",
    prefix: [
      "/.git/",
      "/.svn/",
      "/.hg/",
      "/.bzr/",
    ],
    exact: [
      "/.git/config",
      "/.git/HEAD",
      "/.git/index",
      "/.git/COMMIT_EDITMSG",
      "/.gitconfig",
      "/.gitignore",
      "/.svn/entries",
    ],
  },

  // ── Backup / dump files ────────────────────────────────────────────────────
  {
    category: "backup",
    suffix: [
      ".bak",
      ".backup",
      ".old",
      ".orig",
      ".save",
      ".swp",
      ".tmp",
      "~",
      ".sql",
      ".db",
      ".sqlite",
      ".sqlite3",
      ".dump",
      ".tar",
      ".tar.gz",
      ".tar.bz2",
      ".zip",
      ".7z",
      ".rar",
    ],
  },

  // ── Debug / diagnostic endpoints ──────────────────────────────────────────
  {
    category: "debug",
    exact: [
      "/actuator",
      "/actuator/env",
      "/actuator/health",
      "/actuator/info",
      "/actuator/metrics",
      "/actuator/mappings",
      "/actuator/beans",
      "/actuator/configprops",
      "/actuator/threaddump",
      "/actuator/heapdump",
      "/actuator/shutdown",
      "/actuator/loggers",
      "/actuator/auditevents",
      "/actuator/httptrace",
      "/metrics",
      "/health",
      "/healthz",
      "/readyz",
      "/debug",
      "/debug/vars",
      "/debug/pprof",
      "/_debug",
      "/trace",
      "/env",
      "/__debug_bar",
      "/telescope",
      "/telescope/api/requests",
      "/horizon",
      "/laravel-websockets",
      "/_profiler",
      "/_wdt",
      "/console",
      "/adminer.php",
      "/phpmyadmin",
      "/pma",
      "/phpMyAdmin",
      "/myadmin",
      "/wp-login.php",
      "/wp-admin",
      "/wp-config.php",
      "/wp-includes",
      "/administrator",
      "/admin.php",
      "/panel",
      "/cpanel",
      "/storage/logs",
    ],
    prefix: [
      "/actuator/",
      "/debug/",
      "/_debug/",
      "/telescope/",
      "/horizon/",
      "/wp-admin/",
      "/wp-includes/",
      "/phpmyadmin/",
      "/pma/",
      "/adminer",
      "/storage/logs/",
    ],
  },

  // ── Vulnerability scanner canary probes (e.g. Qualys WAS) ─────────────────
  {
    category: "canary",
    prefix: [
      "/zzcanary",
    ],
  },
];

// ── Build fast lookup structures ─────────────────────────────────────────────

interface LookupEntry {
  category: SensitivePathCategory;
}

const exactMap = new Map<string, LookupEntry>();
const prefixList: Array<{ prefix: string; category: SensitivePathCategory }> =
  [];
const suffixList: Array<{ suffix: string; category: SensitivePathCategory }> =
  [];

for (const rule of RULES) {
  if (rule.exact) {
    for (const path of rule.exact) {
      exactMap.set(path.toLowerCase(), { category: rule.category });
    }
  }
  if (rule.prefix) {
    for (const prefix of rule.prefix) {
      prefixList.push({ prefix: prefix.toLowerCase(), category: rule.category });
    }
  }
  if (rule.suffix) {
    for (const suffix of rule.suffix) {
      suffixList.push({ suffix: suffix.toLowerCase(), category: rule.category });
    }
  }
}

/**
 * Check whether a request path matches a known sensitive file/directory.
 *
 * @param rawPath - The URL path from the incoming request (e.g. `/.env`).
 * @returns A `SensitivePathMatch` if the path is sensitive, or `null` otherwise.
 */
export function detectSensitivePath(rawPath: string): SensitivePathMatch | null {
  if (!rawPath || typeof rawPath !== "string") return null;

  // Normalise: lower-case, strip query string / fragment, and collapse multiple slashes
  const cleaned = rawPath.toLowerCase().split("?")[0].split("#")[0];
  const path = cleaned.replace(/\/+/g, "/");

  // 1. Exact match
  const exact = exactMap.get(path);
  if (exact) return { path, category: exact.category };

  // 2. Prefix match
  for (let i = 0; i < prefixList.length; i++) {
    const { prefix, category } = prefixList[i];
    if (path.startsWith(prefix)) return { path, category };
  }

  // 3. Canary detection (Qualys WAS / automated vulnerability scanner canary tokens)
  if (path.includes("zzcanary")) {
    return { path, category: "canary" };
  }

  // 4. Dotenv detection on final segment (e.g. /api/.env, /.env.production, /test.env)
  const lastSegment = path.split("/").pop() ?? "";
  if (
    lastSegment === ".env" ||
    lastSegment.startsWith(".env.") ||
    lastSegment.endsWith(".env")
  ) {
    return { path, category: "credentials" };
  }

  // 5. Suffix match — applies to the final path segment only to avoid false
  //    positives on legitimate paths like `/api/backup-plan`.
  if (lastSegment.length > 0) {
    for (let i = 0; i < suffixList.length; i++) {
      const { suffix, category } = suffixList[i];
      if (lastSegment.endsWith(suffix)) return { path, category };
    }
  }

  return null;
}
