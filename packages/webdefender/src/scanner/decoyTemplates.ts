import type { SensitivePathCategory } from "./sensitivePaths.js";
import type { DecoyPersona } from "./decoyPersona.js";

/** Concrete decoy file shapes. */
export type DecoyKind =
  | "dotenv_node"
  | "dotenv_php"
  | "dotenv_python"
  | "env_json"
  | "env_js"
  | "credentials_json"
  | "credentials_generic"
  | "aws_credentials"
  | "aws_config"
  | "gcp_service_account"
  | "azure_credentials"
  | "openssh_private_key"
  | "rsa_private_key"
  | "tls_private_key"
  | "ssh_authorized_keys"
  | "ssh_known_hosts"
  | "git_config"
  | "git_head"
  | "git_index"
  | "gitignore"
  | "svn_entries"
  | "wp_config"
  | "php_config"
  | "phpinfo"
  | "htpasswd"
  | "netrc"
  | "pgpass"
  | "mysql_config"
  | "shell_history"
  | "package_manager_config"
  | "docker_config"
  | "sftp_config"
  | "cloud_cli_config"
  | "vault_key"
  | "docker_compose"
  | "dockerfile"
  | "kubernetes_config"
  | "terraform_vars"
  | "terraform_state"
  | "nginx_config"
  | "apache_config"
  | "makefile"
  | "github_workflow"
  | "gitlab_ci"
  | "jenkinsfile"
  | "circleci_config"
  | "ci_pipeline"
  | "sql_dump"
  | "generic_backup"
  | "js_config"
  | "app_config_json"
  | "package_json"
  | "yaml_config"
  | "python_config"
  | "ruby_config"
  | "generic_config"
  | "actuator_env"
  | "actuator_health"
  | "actuator_metadata"
  | "server_status"
  | "wp_login"
  | "admin_login"
  | "phpmyadmin_login"
  | "health_json"
  | "metrics"
  | "debug_vars"
  | "telescope"
  | "ucp_json"
  | "canary";

export interface RenderedDecoy {
  content: string;
  contentType: string;
  templateId: DecoyKind;
  headers?: Record<string, string>;
}

function clean(rawPath: string): string {
  return (rawPath || "").toLowerCase().split("?")[0].split("#")[0];
}

function lastSegment(path: string): string {
  return path.split("/").pop() || "";
}

/**
 * Select the most realistic decoy shape for a path.
 * Category is authoritative; path details refine the variant.
 */
export function selectDecoyKind(
  rawPath: string,
  category?: SensitivePathCategory,
): DecoyKind {
  const path = clean(rawPath);
  const last = lastSegment(path);

  // ── Cloud credentials ────────────────────────────────────────────────────
  if (path.includes("/.aws/credentials") || path.includes("aws-credentials"))
    return "aws_credentials";
  if (path.endsWith("/.aws/config") || path === "/.aws/config")
    return "aws_config";
  if (
    path.includes("service-account") ||
    path.includes("service_account") ||
    path.includes("gcp-credentials")
  )
    return "gcp_service_account";
  if (path.includes("azure-credentials") || path.includes(".azure/credentials"))
    return "azure_credentials";

  // ── Dotenv and environment bundles ───────────────────────────────────────
  if (
    last === ".env" ||
    last.startsWith(".env.") ||
    last.endsWith(".env") ||
    path.includes("/.env") ||
    path === "/env"
  ) {
    if (path.includes("laravel") || path.includes("php")) return "dotenv_php";
    if (path.includes("django") || path.includes("python"))
      return "dotenv_python";
    return "dotenv_node";
  }
  if (last === "env.json" || last === "__env.json" || last === "_env.json")
    return "env_json";
  if (last === "env.js" || last === "__env.js" || last === "_env.js")
    return "env_js";

  // ── Private keys ─────────────────────────────────────────────────────────
  if (path.includes("authorized_keys")) return "ssh_authorized_keys";
  if (path.includes("known_hosts")) return "ssh_known_hosts";
  if (last === "id_rsa") return "openssh_private_key";
  if (
    last.startsWith("id_") ||
    path.includes("/.ssh/") ||
    last === "private.key" ||
    last === "private.pem"
  )
    return "openssh_private_key";
  if (last.endsWith(".pem") || last.endsWith(".key") || last.endsWith(".crt"))
    return "tls_private_key";

  // ── VCS metadata ─────────────────────────────────────────────────────────
  if (path.includes("/.git/config") || path === "/.gitconfig")
    return "git_config";
  if (path.includes("/.git/head")) return "git_head";
  if (path.includes("/.git/index")) return "git_index";
  if (path.includes("/.gitignore")) return "gitignore";
  if (path.includes("/.svn/entries")) return "svn_entries";

  // ── PHP / WordPress ──────────────────────────────────────────────────────
  if (path.includes("wp-config")) return "wp_config";
  if (path.includes("phpinfo") || path === "/info.php") return "phpinfo";
  if (path.includes("wp-login")) return "wp_login";
  if (
    path.includes("phpmyadmin") ||
    path.includes("/pma") ||
    path.includes("adminer") ||
    path.includes("myadmin")
  )
    return "phpmyadmin_login";
  if (
    path.includes("wp-admin") ||
    path.includes("wp-includes") ||
    path === "/administrator" ||
    path === "/admin.php" ||
    path === "/panel" ||
    path === "/cpanel"
  )
    return "admin_login";
  if (last.endsWith(".php")) return "php_config";

  // ── Credential stores ────────────────────────────────────────────────────
  if (path.includes(".htpasswd") || path.includes("_vti_pvt"))
    return "htpasswd";
  if (path.includes(".netrc")) return "netrc";
  if (path.includes(".pgpass")) return "pgpass";
  if (path.includes(".my.cnf")) return "mysql_config";
  if (
    path.includes(".bash_history") ||
    path.includes(".zsh_history") ||
    path.includes(".sh_history") ||
    path.endsWith("/.history")
  )
    return "shell_history";
  if (path.includes(".npmrc") || path.includes(".yarnrc"))
    return "package_manager_config";
  if (path.includes(".docker/config.json")) return "docker_config";
  if (path.includes(".vscode/sftp.json")) return "sftp_config";
  if (
    path.includes("rclone.conf") ||
    path.includes(".boto") ||
    path.includes(".s3cfg")
  )
    return "cloud_cli_config";
  if (path.includes("server_vault")) return "vault_key";

  return selectInfraOrFallback(path, last, category);
}

function selectInfraOrFallback(
  path: string,
  last: string,
  category?: SensitivePathCategory,
): DecoyKind {
  // ── Infrastructure ───────────────────────────────────────────────────────
  if (path.includes("docker-compose")) return "docker_compose";
  if (path.endsWith("/dockerfile") || path === "/dockerfile")
    return "dockerfile";
  if (
    path.includes("kubernetes") ||
    path.includes("k8s.") ||
    path.includes("/k8s/")
  )
    return "kubernetes_config";
  if (path.includes("terraform.tfvars")) return "terraform_vars";
  if (path.includes("terraform.tfstate")) return "terraform_state";
  if (path.includes("nginx.conf")) return "nginx_config";
  if (path.includes("apache.conf") || path.includes("httpd.conf"))
    return "apache_config";
  if (last === "makefile") return "makefile";

  // ── CI/CD ────────────────────────────────────────────────────────────────
  if (path.includes(".github/workflows")) return "github_workflow";
  if (path.includes(".gitlab-ci")) return "gitlab_ci";
  if (path.includes("jenkinsfile")) return "jenkinsfile";
  if (path.includes(".circleci")) return "circleci_config";
  if (
    path.includes(".travis.yml") ||
    path.includes("azure-pipelines") ||
    path.includes("cloudbuild") ||
    path.includes("buildspec") ||
    path.includes("bitbucket-pipelines")
  )
    return "ci_pipeline";

  // ── Backups ──────────────────────────────────────────────────────────────
  if (last.endsWith(".sql") || last.endsWith(".dump")) return "sql_dump";
  if (
    last.endsWith(".bak") ||
    last.endsWith(".backup") ||
    last.endsWith(".old") ||
    last.endsWith(".orig") ||
    last.endsWith(".save") ||
    last.endsWith(".swp") ||
    last.endsWith(".tmp") ||
    last.endsWith("~") ||
    last.endsWith(".db") ||
    last.endsWith(".sqlite") ||
    last.endsWith(".sqlite3") ||
    last.endsWith(".tar") ||
    last.endsWith(".tar.gz") ||
    last.endsWith(".tar.bz2") ||
    last.endsWith(".zip") ||
    last.endsWith(".7z") ||
    last.endsWith(".rar")
  )
    return "generic_backup";

  // ── Debug / diagnostic endpoints ─────────────────────────────────────────
  if (path.includes("actuator/env")) return "actuator_env";
  if (path.includes("actuator/health")) return "actuator_health";
  if (path.includes("actuator/")) return "actuator_metadata";
  if (path === "/server-status" || path === "/server-info")
    return "server_status";
  if (path === "/metrics") return "metrics";
  if (path.includes("/debug/vars") || path.includes("/debug/pprof"))
    return "debug_vars";
  if (path.includes("telescope") || path.includes("horizon"))
    return "telescope";
  if (
    path === "/health" ||
    path === "/healthz" ||
    path === "/readyz" ||
    path === "/status"
  )
    return "health_json";
  if (path.includes("/storage/logs")) return "generic_config";
  if (path === "/console") return "generic_config";

  // ── Config files ─────────────────────────────────────────────────────────
  if (path.includes(".well-known/ucp")) return "ucp_json";
  if (last === "package.json" || last === "version.json")
    return "package_json";
  if (last === "credentials.json" || last === "auth.json")
    return "credentials_json";
  if (
    path.includes("runtime-config") ||
    path.includes("runtime_config") ||
    path.includes("runtimeconfig") ||
    path.includes("app-config") ||
    path.includes("app_config") ||
    path.includes("appconfig") ||
    path.includes("global-config") ||
    path.includes("global_config") ||
    path.includes("globalconfig") ||
    path.includes("window-config") ||
    path.includes("window_config") ||
    path.includes("windowconfig") ||
    path.includes("server-config") ||
    path.includes("server_config") ||
    path.includes("serverconfig") ||
    last === "config.js" ||
    last === "settings.js" ||
    last === "runtime.js"
  )
    return "js_config";
  if (last.endsWith(".json")) return "app_config_json";
  if (last.endsWith(".yaml") || last.endsWith(".yml")) return "yaml_config";
  if (last.endsWith(".py")) return "python_config";
  if (last.endsWith(".rb")) return "ruby_config";
  if (last.endsWith(".js") || last.endsWith(".ts")) return "js_config";
  if (
    last.endsWith(".toml") ||
    last.endsWith(".ini") ||
    last.endsWith(".cfg") ||
    last.endsWith(".xml") ||
    last.endsWith(".properties") ||
    last.endsWith(".conf") ||
    last === ".htaccess" ||
    last === "app.config" ||
    last === "web.config"
  )
    return "generic_config";

  // ── Category fallbacks ───────────────────────────────────────────────────
  switch (category) {
    case "credentials":
      return "credentials_generic";
    case "cloud":
      return "credentials_generic";
    case "vcs":
      return "git_config";
    case "ci_cd":
      return "ci_pipeline";
    case "backup":
      return "generic_backup";
    case "debug":
      return "actuator_metadata";
    case "canary":
      return "canary";
    case "infra":
    case "config":
    default:
      return "generic_config";
  }
}

const PLAIN = "text/plain; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const JS_TYPE = "application/javascript; charset=utf-8";
const HTML_TYPE = "text/html; charset=utf-8";
const YAML_TYPE = "text/yaml; charset=utf-8";
const PHP_TYPE = "application/x-httpd-php; charset=utf-8";

function dbUrl(persona: DecoyPersona): string {
  const scheme = persona.dbPort === 3306 ? "mysql" : "postgresql";
  return `${scheme}://${persona.dbUser}:${persona.dbPassword}@${persona.dbHost}:${persona.dbPort}/${persona.dbName}`;
}

function renderDotenvNode(p: DecoyPersona): string {
  return `# ${p.orgName} - production runtime
NODE_ENV=production
APP_NAME=${p.orgSlug}
APP_URL=https://${p.appDomain}
PORT=3000
LOG_LEVEL=info

# Database
DATABASE_URL=${dbUrl(p)}
DB_HOST=${p.dbHost}
DB_PORT=${p.dbPort}
DB_DATABASE=${p.dbName}
DB_USERNAME=${p.dbUser}
DB_PASSWORD=${p.dbPassword}

# Cache / queues
REDIS_URL=rediss://:${p.redisPassword}@${p.redisHost}:6379
SESSION_SECRET=${p.sessionSecret}

# Authentication
JWT_SECRET=${p.jwtSecret}
JWT_EXPIRES_IN=7d
ENCRYPTION_KEY=${p.encryptionKey}

# Cloud services
AWS_ACCESS_KEY_ID=${p.awsAccessKeyId}
AWS_SECRET_ACCESS_KEY=${p.awsSecretAccessKey}
AWS_REGION=${p.awsRegion}
AWS_S3_BUCKET=${p.storageBucket}

# Integrations
STRIPE_SECRET_KEY=${p.stripeKey}
SENTRY_DSN=${p.sentryDsn}
SLACK_WEBHOOK_URL=${p.slackWebhook}
MAIL_API_KEY=${p.mailApiKey}

# Internal correlation
SERVICE_TOKEN=${p.canary}
DEPLOYMENT_ID=${p.personaId}
`;
}

function renderDotenvPhp(p: DecoyPersona): string {
  return `APP_NAME="${p.orgName}"
APP_ENV=production
APP_KEY=base64:${p.encryptionKey}
APP_DEBUG=false
APP_URL=https://${p.appDomain}

LOG_CHANNEL=stack
LOG_LEVEL=error

DB_CONNECTION=mysql
DB_HOST=${p.dbHost}
DB_PORT=${p.dbPort}
DB_DATABASE=${p.dbName}
DB_USERNAME=${p.dbUser}
DB_PASSWORD="${p.dbPassword}"

REDIS_HOST=${p.redisHost}
REDIS_PASSWORD=${p.redisPassword}
REDIS_PORT=6379

CACHE_DRIVER=redis
QUEUE_CONNECTION=redis
SESSION_DRIVER=redis

MAIL_MAILER=smtp
MAIL_HOST=smtp.${p.domain}
MAIL_USERNAME=no-reply@${p.domain}
MAIL_PASSWORD=${p.mailApiKey}

AWS_ACCESS_KEY_ID=${p.awsAccessKeyId}
AWS_SECRET_ACCESS_KEY=${p.awsSecretAccessKey}
AWS_DEFAULT_REGION=${p.awsRegion}
AWS_BUCKET=${p.storageBucket}

STRIPE_KEY=${p.stripeKey}
`;
}

function renderDotenvPython(p: DecoyPersona): string {
  return `DJANGO_SETTINGS_MODULE=config.settings.production
SECRET_KEY=${p.jwtSecret}
DEBUG=False
ALLOWED_HOSTS=.${p.domain},.${p.orgSlug}.internal

DATABASE_URL=${dbUrl(p)}
DB_CONN_MAX_AGE=60

CELERY_BROKER_URL=redis://:${p.redisPassword}@${p.redisHost}:6379/0
CELERY_RESULT_BACKEND=redis://:${p.redisPassword}@${p.redisHost}:6379/1

AWS_ACCESS_KEY_ID=${p.awsAccessKeyId}
AWS_SECRET_ACCESS_KEY=${p.awsSecretAccessKey}
AWS_STORAGE_BUCKET_NAME=${p.storageBucket}
AWS_S3_REGION_NAME=${p.awsRegion}

SENTRY_DSN=${p.sentryDsn}
STRIPE_SECRET_KEY=${p.stripeKey}
`;
}

function renderEnvJson(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        NODE_ENV: "production",
        APP_NAME: p.orgName,
        APP_URL: `https://${p.appDomain}`,
        API_URL: `https://${p.apiDomain}/v1`,
        DATABASE_URL: dbUrl(p),
        REDIS_URL: `rediss://:${p.redisPassword}@${p.redisHost}:6379`,
        JWT_SECRET: p.jwtSecret,
        AWS_ACCESS_KEY_ID: p.awsAccessKeyId,
        AWS_SECRET_ACCESS_KEY: p.awsSecretAccessKey,
        AWS_REGION: p.awsRegion,
        STRIPE_SECRET_KEY: p.stripeKey,
        SERVICE_TOKEN: p.canary,
        DEPLOYMENT_ID: p.personaId,
      },
      null,
      2,
    ) + "\n"
  );
}

function renderEnvJs(p: DecoyPersona): string {
  return `window.__ENV__ = {
  NODE_ENV: "production",
  APP_NAME: ${JSON.stringify(p.orgName)},
  API_BASE_URL: "https://${p.apiDomain}/v1",
  AUTH_DOMAIN: "auth.${p.domain}",
  SENTRY_DSN: "${p.sentryDsn}",
  ANALYTICS_KEY: "${p.analyticsKey}",
  APP_VERSION: "${p.appVersion}",
  DEPLOYMENT_ID: "${p.personaId}"
};
`;
}

function renderCredentialsGeneric(p: DecoyPersona): string {
  return `# ${p.orgName} credential store
SERVICE_ACCOUNT=${p.orgSlug}-deployer
ACCESS_KEY=${p.awsAccessKeyId}
SECRET_KEY=${p.awsSecretAccessKey}
DATABASE_URL=${dbUrl(p)}
API_TOKEN=${p.stripeKey}
SERVICE_TOKEN=${p.canary}
`;
}

function renderAwsCredentials(p: DecoyPersona): string {
  return `[default]
aws_access_key_id = ${p.awsAccessKeyId}
aws_secret_access_key = ${p.awsSecretAccessKey}
region = ${p.awsRegion}

[production]
aws_access_key_id = AKIA${p.awsAccessKeyId.slice(4).split("").reverse().join("")}
aws_secret_access_key = ${p.awsSecretAccessKey.split("").reverse().join("")}
region = ${p.awsRegion}
`;
}

function renderAwsConfig(p: DecoyPersona): string {
  return `[default]
region = ${p.awsRegion}
output = json

[profile production]
role_arn = arn:aws:iam::${p.awsAccountId}:role/${p.orgSlug}-deploy
source_profile = default
region = ${p.awsRegion}
`;
}

function renderGcpServiceAccount(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        type: "service_account",
        project_id: p.gcpProjectId,
        private_key_id: p.gcpPrivateKeyId,
        private_key: p.tlsPrivateKey,
        client_email: p.gcpClientEmail,
        client_id: p.awsAccountId,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url:
          "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(p.gcpClientEmail)}`,
        universe_domain: "googleapis.com",
      },
      null,
      2,
    ) + "\n"
  );
}

function renderAzureCredentials(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        tenantId: p.azureTenantId,
        clientId: p.azureClientId,
        clientSecret: p.azureClientSecret,
        subscriptionId: p.azureTenantId,
        resourceGroup: `${p.orgSlug}-prod-rg`,
      },
      null,
      2,
    ) + "\n"
  );
}

function renderSshKnownHosts(p: DecoyPersona): string {
  const key = p.sshPublicKey.split(" ").slice(1, -1).join(" ");
  return `${p.dbHost} ${key}\ngit.${p.domain} ${key}\n${p.internalIp} ${key}\n`;
}

function renderGitConfig(p: DecoyPersona): string {
  return `[core]
\trepositoryformatversion = 0
\tfilemode = true
\tbare = false
\tlogallrefupdates = true
\tignorecase = true
[remote "origin"]
\turl = ${p.repoUrl}
\tfetch = +refs/heads/*:refs/remotes/origin/*
[branch "${p.branch}"]
\tremote = origin
\tmerge = refs/heads/${p.branch}
[user]
\tname = ${p.orgName} CI
\temail = ci@${p.domain}
`;
}

function renderGitIndex(p: DecoyPersona): string {
  return `DIRC\0\0\0\x02\0\0\0${p.appVersion.slice(0, 1)}\0\0\0\x01${p.personaId}\0\0\0\0\0\0\0\0`;
}

function renderGitignore(p: DecoyPersona): string {
  return `node_modules/
.env
.env.*
!.env.example
dist/
coverage/
*.log
.DS_Store
${p.orgSlug}-local.*
`;
}

function renderSvnEntries(p: DecoyPersona): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<wc-entries xmlns="svn:">
<entry locked="false" revision="18">
<url>https://svn.${p.domain}/repos/${p.repoName}/trunk</url>
<root-url>https://svn.${p.domain}/repos/${p.repoName}</root-url>
<uuid>${p.personaId}-svn</uuid>
</entry>
</wc-entries>
`;
}

function renderWpConfig(p: DecoyPersona): string {
  return `<?php
define( 'DB_NAME', '${p.dbName}' );
define( 'DB_USER', '${p.dbUser}' );
define( 'DB_PASSWORD', '${p.dbPassword}' );
define( 'DB_HOST', '${p.dbHost}:${p.dbPort}' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'AUTH_KEY',         '${p.sessionSecret}' );
define( 'SECURE_AUTH_KEY',  '${p.jwtSecret.slice(0, 32)}' );
define( 'LOGGED_IN_KEY',    '${p.jwtSecret.slice(32, 64)}' );
define( 'NONCE_KEY',        '${p.encryptionKey}' );
define( 'AUTH_SALT',        '${p.personaId}${p.sessionSecret.slice(0, 12)}' );
define( 'SECURE_AUTH_SALT', '${p.personaId}${p.jwtSecret.slice(0, 12)}' );
define( 'LOGGED_IN_SALT',   '${p.personaId}${p.jwtSecret.slice(16, 28)}' );
define( 'NONCE_SALT',       '${p.personaId}${p.sessionSecret.slice(12, 24)}' );

$table_prefix = 'wp_';

define( 'WP_DEBUG', false );
define( 'WP_HOME', 'https://${p.appDomain}' );
define( 'WP_SITEURL', 'https://${p.appDomain}' );

if ( ! defined( 'ABSPATH' ) ) {
\tdefine( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
`;
}

function renderPhpConfig(p: DecoyPersona): string {
  return `<?php
return [
    'app' => [
        'name' => '${p.orgName}',
        'env' => 'production',
        'debug' => false,
        'url' => 'https://${p.appDomain}',
        'key' => '${p.encryptionKey}',
    ],
    'database' => [
        'host' => '${p.dbHost}',
        'port' => ${p.dbPort},
        'database' => '${p.dbName}',
        'username' => '${p.dbUser}',
        'password' => '${p.dbPassword}',
    ],
    'redis' => [
        'host' => '${p.redisHost}',
        'password' => '${p.redisPassword}',
        'port' => 6379,
    ],
    'mail' => [
        'host' => 'smtp.${p.domain}',
        'username' => 'no-reply@${p.domain}',
        'password' => '${p.mailApiKey}',
    ],
];
`;
}

function renderPhpInfo(p: DecoyPersona): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><title>PHP ${p.phpVersion} - phpinfo()</title></head>
<body style="background:#fff; color:#222; font-family:sans-serif; margin:1em;">
  <h1 style="font-size:1.5em; border-bottom:1px solid #ccc; padding-bottom:4px;">PHP Version ${p.phpVersion}</h1>
  <table style="border-collapse:collapse; width:100%">
    <tr><td>System</td><td>Linux ${p.orgSlug}-web-01 5.15.0-105-generic #115-Ubuntu SMP x86_64</td></tr>
    <tr><td>Server API</td><td>FPM/FastCGI</td></tr>
    <tr><td>Document Root</td><td>/var/www/${p.repoName}/public</td></tr>
    <tr><td>Loaded Configuration File</td><td>/etc/php/${p.phpVersion.slice(0, 3)}/fpm/php.ini</td></tr>
    <tr><td>Server Name</td><td>${p.appDomain}</td></tr>
    <tr><td>Server Software</td><td>nginx/1.24.0</td></tr>
  </table>
  <h2 style="font-size:1.2em;">Environment</h2>
  <table style="border-collapse:collapse; width:100%">
    <tr><td>APP_ENV</td><td>production</td></tr>
    <tr><td>DB_HOST</td><td>${p.dbHost}</td></tr>
    <tr><td>DB_DATABASE</td><td>${p.dbName}</td></tr>
    <tr><td>REDIS_HOST</td><td>${p.redisHost}</td></tr>
  </table>
</body>
</html>
`;
}

function renderHtpasswd(p: DecoyPersona): string {
  return `admin:$apr1$${p.personaId}$${p.jwtSecret.slice(0, 22)}
deploy:$apr1$${p.personaId}$${p.sessionSecret.slice(0, 22)}
ops:$apr1$${p.personaId}$${p.encryptionKey.slice(0, 22)}
`;
}

function renderNetrc(p: DecoyPersona): string {
  return `machine github.com login ${p.repoOwner} password ${p.analyticsKey}
machine api.${p.domain} login deploy password ${p.stripeKey}
machine registry.${p.orgSlug}.internal login ${p.dbUser} password ${p.dbPassword}
`;
}

function renderPgpass(p: DecoyPersona): string {
  return `${p.dbHost}:${p.dbPort}:${p.dbName}:${p.dbUser}:${p.dbPassword}
${p.dbHost}:${p.dbPort}:postgres:postgres:${p.dbPassword}
`;
}

function renderMysqlConfig(p: DecoyPersona): string {
  return `[client]
user=${p.dbUser}
password=${p.dbPassword}
host=${p.dbHost}
port=${p.dbPort}

[mysql]
database=${p.dbName}
default-character-set=utf8mb4
`;
}

function renderShellHistory(p: DecoyPersona): string {
  return `cd /srv/${p.repoName}
git pull origin ${p.branch}
npm ci --omit=dev
pm2 restart ${p.repoName}
psql "${dbUrl(p)}" -f migrations/2026_02_14_add_indexes.sql
redis-cli -h ${p.redisHost} -a '${p.redisPassword}' info
docker compose -f docker-compose.prod.yml logs --tail=100 app
curl -H "Authorization: Bearer ${p.analyticsKey}" https://${p.apiDomain}/v1/health
aws s3 sync ./dist s3://${p.storageBucket}/release/${p.appVersion}
`;
}

function renderPackageManagerConfig(p: DecoyPersona): string {
  return `registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${p.analyticsKey}
@${p.orgSlug}:registry=https://npm.${p.orgSlug}.internal/
//npm.${p.orgSlug}.internal/:_authToken=${p.jwtSecret.slice(0, 32)}
`;
}

function renderDockerConfig(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        auths: {
          [`registry.${p.orgSlug}.internal`]: {
            auth: `${p.dbUser}:${p.dbPassword}`,
          },
          "https://index.docker.io/v1/": { auth: `${p.orgSlug}:${p.analyticsKey}` },
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderSftpConfig(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        name: `${p.orgName} Production`,
        host: `sftp.${p.domain}`,
        protocol: "sftp",
        port: 22,
        username: "deploy",
        password: p.dbPassword,
        remotePath: `/var/www/${p.repoName}`,
        privateKeyPath: "~/.ssh/id_ed25519",
      },
      null,
      2,
    ) + "\n"
  );
}

function renderCloudCliConfig(p: DecoyPersona): string {
  return `[default]
aws_access_key_id = ${p.awsAccessKeyId}
aws_secret_access_key = ${p.awsSecretAccessKey}
region = ${p.awsRegion}

[s3]
bucket_location = ${p.awsRegion}
`;
}

function renderVaultKey(p: DecoyPersona): string {
  return `${p.encryptionKey}
`;
}

function renderDockerCompose(p: DecoyPersona): string {
  return `version: "3.9"
services:
  app:
    image: registry.${p.orgSlug}.internal/${p.repoName}:${p.appVersion}
    restart: unless-stopped
    environment:
      NODE_ENV: production
      DATABASE_URL: ${dbUrl(p)}
      REDIS_URL: redis://:${p.redisPassword}@${p.redisHost}:6379
      JWT_SECRET: ${p.jwtSecret}
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      - db
      - cache
  db:
    image: ${p.dbPort === 3306 ? "mysql:8.0" : "postgres:16-alpine"}
    environment:
      POSTGRES_DB: ${p.dbName}
      POSTGRES_USER: ${p.dbUser}
      POSTGRES_PASSWORD: ${p.dbPassword}
    volumes:
      - db_data:/var/lib/${p.dbPort === 3306 ? "mysql" : "postgresql"}/data
  cache:
    image: redis:7-alpine
    command: redis-server --requirepass ${p.redisPassword}
volumes:
  db_data:
`;
}

function renderDockerfile(p: DecoyPersona): string {
  return `FROM node:${p.nodeVersion}-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:${p.nodeVersion}-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3000
USER node
CMD ["node", "dist/server.js"]
`;
}

function renderKubernetesConfig(p: DecoyPersona): string {
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: ${p.orgSlug}-config
  namespace: production
data:
  NODE_ENV: "production"
  API_URL: "https://${p.apiDomain}"
  DB_HOST: "${p.dbHost}"
  REDIS_HOST: "${p.redisHost}"
---
apiVersion: v1
kind: Secret
metadata:
  name: ${p.orgSlug}-secrets
  namespace: production
type: Opaque
stringData:
  DATABASE_URL: "${dbUrl(p)}"
  JWT_SECRET: "${p.jwtSecret}"
  REDIS_PASSWORD: "${p.redisPassword}"
`;
}

function renderTerraformVars(p: DecoyPersona): string {
  return `aws_region        = "${p.awsRegion}"
project           = "${p.orgSlug}"
environment       = "production"
vpc_id            = "vpc-${p.personaId}"
db_instance_class = "db.r6g.xlarge"
db_name           = "${p.dbName}"
db_username       = "${p.dbUser}"
db_password       = "${p.dbPassword}"
s3_bucket         = "${p.storageBucket}"
`;
}

function renderTerraformState(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        version: 4,
        terraform_version: "1.7.5",
        serial: 12,
        lineage: p.azureTenantId,
        outputs: {
          database_endpoint: { value: `${p.dbHost}:${p.dbPort}` },
          bucket: { value: p.storageBucket },
        },
        resources: [
          {
            mode: "managed",
            type: "aws_db_instance",
            name: "primary",
            provider: `provider["registry.terraform.io/hashicorp/aws"]`,
            instances: [
              {
                attributes: {
                  address: p.dbHost,
                  port: p.dbPort,
                  username: p.dbUser,
                  name: p.dbName,
                },
              },
            ],
          },
        ],
      },
      null,
      2,
    ) + "\n"
  );
}

function renderNginxConfig(p: DecoyPersona): string {
  return `upstream ${p.orgSlug}_app {
    server 127.0.0.1:3000;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name ${p.appDomain} ${p.apiDomain};

    ssl_certificate     /etc/letsencrypt/live/${p.domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${p.domain}/privkey.pem;

    client_max_body_size 25m;

    location / {
        proxy_pass http://${p.orgSlug}_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
`;
}

function renderApacheConfig(p: DecoyPersona): string {
  return `<VirtualHost *:443>
    ServerName ${p.appDomain}
    DocumentRoot /var/www/${p.repoName}/public

    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/${p.domain}/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/${p.domain}/privkey.pem

    <Directory /var/www/${p.repoName}/public>
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog /var/log/apache2/${p.orgSlug}-error.log
    CustomLog /var/log/apache2/${p.orgSlug}-access.log combined
</VirtualHost>
`;
}

function renderMakefile(p: DecoyPersona): string {
  return `SHELL := /bin/bash
APP := ${p.repoName}

.PHONY: install build test deploy

install:
\tnpm ci

build:
\tnpm run build

test:
\tnpm test -- --runInBand

deploy:
\tdocker build -t registry.${p.orgSlug}.internal/$(APP):${p.appVersion} .
\tdocker push registry.${p.orgSlug}.internal/$(APP):${p.appVersion}
`;
}

function renderGithubWorkflow(p: DecoyPersona): string {
  return `name: Deploy
on:
  push:
    branches: [${p.branch}]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "${p.nodeVersion}"
      - run: npm ci
      - run: npm test
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: \${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: \${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${p.awsRegion}
      - run: aws s3 sync dist s3://${p.storageBucket}/release/\${{ github.sha }}
`;
}

function renderGitlabCi(p: DecoyPersona): string {
  return `stages:
  - test
  - deploy

variables:
  AWS_REGION: ${p.awsRegion}
  S3_BUCKET: ${p.storageBucket}

test:
  stage: test
  image: node:${p.nodeVersion}
  script:
    - npm ci
    - npm test

deploy:
  stage: deploy
  image: registry.${p.orgSlug}.internal/deployer:2
  script:
    - ./scripts/deploy.sh production
`;
}

function renderJenkinsfile(p: DecoyPersona): string {
  return `pipeline {
  agent any
  environment {
    AWS_REGION = '${p.awsRegion}'
    S3_BUCKET  = '${p.storageBucket}'
    NODE_ENV   = 'production'
  }
  stages {
    stage('Install') { steps { sh 'npm ci' } }
    stage('Test')    { steps { sh 'npm test' } }
    stage('Deploy')  { steps { sh './scripts/deploy.sh' } }
  }
}
`;
}

function renderCircleCiConfig(p: DecoyPersona): string {
  return `version: 2.1
jobs:
  build:
    docker:
      - image: cimg/node:${p.nodeVersion}
    steps:
      - checkout
      - run: npm ci
      - run: npm test
workflows:
  main:
    jobs:
      - build
`;
}

function renderCiPipeline(p: DecoyPersona): string {
  return `stages:
  - test
  - build
  - deploy

test:
  script:
    - npm ci
    - npm test

build:
  script:
    - docker build -t registry.${p.orgSlug}.internal/${p.repoName}:${p.appVersion} .

deploy:
  script:
    - ./deploy.sh production ${p.awsRegion}
`;
}

function renderSqlDump(p: DecoyPersona): string {
  return `-- ${p.orgName} database dump
-- Host: ${p.dbHost}    Database: ${p.dbName}
-- Server version: 8.0.36

CREATE TABLE \`users\` (
  \`id\` bigint unsigned NOT NULL AUTO_INCREMENT,
  \`email\` varchar(255) NOT NULL,
  \`password_hash\` varchar(255) NOT NULL,
  \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`users_email_unique\` (\`email\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`users\` VALUES (1,'admin@${p.domain}','$2y$10$${p.jwtSecret.slice(0, 53)}','2025-11-03 09:14:22');
INSERT INTO \`users\` VALUES (2,'deploy@${p.domain}','$2y$10$${p.sessionSecret.slice(0, 53)}','2025-12-19 16:41:07');

CREATE TABLE \`api_keys\` (
  \`id\` int NOT NULL AUTO_INCREMENT,
  \`name\` varchar(100) NOT NULL,
  \`token\` varchar(128) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO \`api_keys\` VALUES (1,'production','${p.analyticsKey}');

-- Dump completed on 2026-02-14 03:00:12
`;
}

function renderGenericBackup(p: DecoyPersona): string {
  return `-- ${p.orgName} logical backup
-- Database: ${p.dbName}
-- Dumped from: ${p.dbHost}:${p.dbPort}

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;

CREATE TABLE public.settings (
    key character varying(64) NOT NULL,
    value text NOT NULL
);

COPY public.settings (key, value) FROM stdin;
database_url\t${dbUrl(p)}
redis_url\trediss://:${p.redisPassword}@${p.redisHost}:6379
jwt_secret\t${p.jwtSecret}
\\.

-- PostgreSQL database dump complete
`;
}

function renderCredentialsJson(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        aws: {
          accessKeyId: p.awsAccessKeyId,
          secretAccessKey: p.awsSecretAccessKey,
          region: p.awsRegion,
        },
        database: {
          host: p.dbHost,
          port: p.dbPort,
          database: p.dbName,
          username: p.dbUser,
          password: p.dbPassword,
        },
        jwtSecret: p.jwtSecret,
        stripe: p.stripeKey,
      },
      null,
      2,
    ) + "\n"
  );
}

function renderJsConfig(p: DecoyPersona): string {
  return `window.__ENV__ = {
  NODE_ENV: "production",
  APP_NAME: ${JSON.stringify(p.orgName)},
  API_BASE_URL: "https://${p.apiDomain}/v1",
  AUTH_DOMAIN: "auth.${p.domain}",
  SENTRY_DSN: "${p.sentryDsn}",
  ANALYTICS_KEY: "${p.analyticsKey}",
  APP_VERSION: "${p.appVersion}"
};
window.__CONFIG__ = {
  API_BASE_URL: "https://${p.apiDomain}/v1",
  UPLOAD_BUCKET: "${p.storageBucket}",
  DEPLOYMENT_ID: "${p.personaId}"
};
`;
}

function renderAppConfigJson(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        app: {
          name: p.orgName,
          env: "production",
          version: p.appVersion,
          url: `https://${p.appDomain}`,
        },
        database: {
          host: p.dbHost,
          port: p.dbPort,
          name: p.dbName,
          user: p.dbUser,
          password: p.dbPassword,
        },
        cache: {
          host: p.redisHost,
          password: p.redisPassword,
        },
        auth: {
          jwtSecret: p.jwtSecret,
          sessionSecret: p.sessionSecret,
        },
        integrations: {
          stripe: p.stripeKey,
          sentry: p.sentryDsn,
          mail: p.mailApiKey,
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderPackageJson(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        name: `@${p.orgSlug}/${p.repoName}`,
        version: p.appVersion,
        private: true,
        description: `${p.orgName} application`,
        scripts: {
          build: "tsc && vite build",
          start: "node dist/server.js",
          test: "vitest run",
        },
        dependencies: {
          express: "^4.21.2",
          pg: "^8.13.1",
          redis: "^4.7.0",
          zod: "^3.24.1",
        },
        engines: { node: `>=${p.nodeVersion.split(".")[0]}` },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderYamlConfig(p: DecoyPersona): string {
  return `app:
  name: ${p.orgSlug}
  env: production
  url: https://${p.appDomain}
database:
  host: ${p.dbHost}
  port: ${p.dbPort}
  name: ${p.dbName}
  username: ${p.dbUser}
  password: ${p.dbPassword}
redis:
  host: ${p.redisHost}
  password: ${p.redisPassword}
auth:
  jwt_secret: ${p.jwtSecret}
integrations:
  stripe_key: ${p.stripeKey}
  sentry_dsn: ${p.sentryDsn}
`;
}

function renderPythonConfig(p: DecoyPersona): string {
  return `import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SECRET_KEY = "${p.jwtSecret}"
DEBUG = False
ALLOWED_HOSTS = ["${p.appDomain}", "${p.apiDomain}"]

DATABASES = {
    "default": {
        "ENGINE": "${p.dbPort === 3306 ? "django.db.backends.mysql" : "django.db.backends.postgresql"}",
        "NAME": "${p.dbName}",
        "USER": "${p.dbUser}",
        "PASSWORD": "${p.dbPassword}",
        "HOST": "${p.dbHost}",
        "PORT": "${p.dbPort}",
    }
}

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://:${p.redisPassword}@${p.redisHost}:6379/1",
    }
}
`;
}

function renderRubyConfig(p: DecoyPersona): string {
  return `Rails.application.configure do
  config.cache_classes = true
  config.eager_load = true
  config.log_level = :info

  config.database_configuration = {
    production: {
      adapter: "${p.dbPort === 3306 ? "mysql2" : "postgresql"}",
      host: "${p.dbHost}",
      port: ${p.dbPort},
      database: "${p.dbName}",
      username: "${p.dbUser}",
      password: "${p.dbPassword}"
    }
  }

  config.secret_key_base = "${p.jwtSecret}"
  config.action_mailer.smtp_settings = {
    address: "smtp.${p.domain}",
    user_name: "no-reply@${p.domain}",
    password: "${p.mailApiKey}"
  }
end
`;
}

function renderGenericConfig(p: DecoyPersona): string {
  return `# ${p.orgName} configuration
APP_ENV=production
APP_URL=https://${p.appDomain}
DB_HOST=${p.dbHost}
DB_PORT=${p.dbPort}
DB_NAME=${p.dbName}
DB_USER=${p.dbUser}
DB_PASSWORD=${p.dbPassword}
REDIS_HOST=${p.redisHost}
REDIS_PASSWORD=${p.redisPassword}
JWT_SECRET=${p.jwtSecret}
AWS_ACCESS_KEY_ID=${p.awsAccessKeyId}
AWS_SECRET_ACCESS_KEY=${p.awsSecretAccessKey}
`;
}

function renderActuatorEnv(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        activeProfiles: ["production"],
        propertySources: [
          {
            name: "systemEnvironment",
            properties: {
              "APP_ENV": { value: "production" },
              "DB_HOST": { value: p.dbHost },
              "DB_PORT": { value: String(p.dbPort) },
              "DB_NAME": { value: p.dbName },
              "DB_USER": { value: p.dbUser },
              "DB_PASSWORD": { value: p.dbPassword },
              "REDIS_HOST": { value: p.redisHost },
              "REDIS_PASSWORD": { value: p.redisPassword },
              "JWT_SECRET": { value: p.jwtSecret },
            },
          },
          {
            name: "applicationConfig: [classpath:/application-production.yml]",
            properties: {
              "server.port": { value: "8080" },
              "management.endpoints.web.exposure.include": { value: "*" },
            },
          },
        ],
      },
      null,
      2,
    ) + "\n"
  );
}

function renderActuatorHealth(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        status: "UP",
        components: {
          db: {
            status: "UP",
            details: {
              database: p.dbPort === 3306 ? "MySQL" : "PostgreSQL",
              validationQuery: "isValid()",
            },
          },
          redis: { status: "UP", details: { version: "7.2.4" } },
          diskSpace: {
            status: "UP",
            details: { total: 107374182400, free: 42949672960 },
          },
          ping: { status: "UP" },
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderActuatorMetadata(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        _links: {
          self: { href: `https://${p.apiDomain}/actuator`, templated: false },
          health: { href: `https://${p.apiDomain}/actuator/health` },
          env: { href: `https://${p.apiDomain}/actuator/env` },
          metrics: { href: `https://${p.apiDomain}/actuator/metrics` },
          loggers: { href: `https://${p.apiDomain}/actuator/loggers` },
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderHealthJson(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        status: "ok",
        service: p.repoName,
        version: p.appVersion,
        uptime: 184221,
        dependencies: {
          database: "up",
          cache: "up",
          storage: "up",
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderServerStatus(p: DecoyPersona): string {
  return `<!DOCTYPE html>
<html><head><title>Apache Server Status for ${p.appDomain}</title></head>
<body>
<h1>Apache Server Status for ${p.appDomain}</h1>
<dl><dt>Server Version: Apache/2.4.58 (Ubuntu)</dt>
<dt>Server MPM: event</dt>
<dt>Server Built: 2024-04-12T12:00:00</dt></dl>
<table border="1">
<tr><th>Srv</th><th>PID</th><th>Acc</th><th>M</th><th>CPU</th><th>SS</th><th>Req</th><th>Conn</th><th>Child</th><th>Slot</th><th>Client</th><th>VHost</th><th>Request</th></tr>
<tr><td>0-0</td><td>1841</td><td>0/32/64</td><td>.</td><td>0.42</td><td>12</td><td>0</td><td>0.0</td><td>0.00</td><td>0.00</td><td>127.0.0.1</td><td>${p.appDomain}</td><td>GET /health HTTP/1.1</td></tr>
</table>
<address>Apache Server at ${p.appDomain} Port 443</address>
</body></html>
`;
}

function renderWpLogin(p: DecoyPersona): string {
  return `<!DOCTYPE html>
<html lang="en-US"><head><meta charset="UTF-8"><title>Log In &lsaquo; ${p.orgName} &#8212; WordPress</title></head>
<body class="login">
<div id="login">
<h1><a href="https://${p.appDomain}/">${p.orgName}</a></h1>
<form name="loginform" id="loginform" action="https://${p.appDomain}/wp-login.php" method="post">
<p><label for="user_login">Username or Email Address</label><input type="text" name="log" id="user_login" autocomplete="username"></p>
<p><label for="user_pass">Password</label><input type="password" name="pwd" id="user_pass" autocomplete="current-password"></p>
<p class="submit"><input type="submit" name="wp-submit" id="wp-submit" value="Log In"></p>
</form>
<p id="nav"><a href="https://${p.appDomain}/wp-login.php?action=lostpassword">Lost your password?</a></p>
</div>
</body></html>
`;
}

function renderAdminLogin(p: DecoyPersona): string {
  return `<!DOCTYPE html>
<html><head><title>Sign in - ${p.orgName}</title></head>
<body>
<main>
<h1>Sign in to ${p.orgName}</h1>
<form method="post" action="/admin/login">
<label>Email <input type="email" name="email" autocomplete="username"></label>
<label>Password <input type="password" name="password" autocomplete="current-password"></label>
<button type="submit">Continue</button>
</form>
</main>
</body></html>
`;
}

function renderPhpMyAdminLogin(p: DecoyPersona): string {
  return `<!DOCTYPE html>
<html lang="en"><head><title>phpMyAdmin</title></head>
<body>
<h1>Welcome to phpMyAdmin</h1>
<form method="post" action="index.php">
<label>Username: <input type="text" name="pma_username" autocomplete="username"></label>
<label>Password: <input type="password" name="pma_password" autocomplete="current-password"></label>
<select name="server"><option value="1">${p.dbHost}</option></select>
<button type="submit">Log in</button>
</form>
<p>Server: ${p.dbHost} (${p.dbPort === 3306 ? "MySQL" : "MariaDB"})</p>
</body></html>
`;
}

function renderMetrics(p: DecoyPersona): string {
  return `# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",status="200"} 184223
http_requests_total{method="POST",status="201"} 9121
# HELP process_resident_memory_bytes Resident memory size in bytes
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 1.842217e+08
# HELP pg_up Whether the database is reachable
# TYPE pg_up gauge
pg_up 1
# HELP redis_up Whether Redis is reachable
# TYPE redis_up gauge
redis_up 1
`;
}

function renderDebugVars(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        cmdline: ["./server", "--config", "/etc/${p.orgSlug}/config.yaml"],
        memstats: { Alloc: 84221712, Sys: 184221472, NumGC: 912 },
        app: { name: p.repoName, version: p.appVersion, env: "production" },
        database: { host: p.dbHost, name: p.dbName },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderTelescope(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        data: [
          {
            id: p.personaId,
            type: "request",
            content: {
              method: "GET",
              uri: `/api/v1/${p.repoName}/status`,
              status: 200,
              duration: 42.18,
            },
          },
        ],
        meta: { total: 1, page: 1 },
      },
      null,
      2,
    ) + "\n"
  );
}

function renderUcpJson(p: DecoyPersona): string {
  return (
    JSON.stringify(
      {
        ucp: { version: "1.0", supported_versions: ["1.0"] },
        services: {
          api: `https://${p.apiDomain}/v1`,
          auth: `https://auth.${p.domain}/oauth2`,
          storage: `https://${p.storageBucket}.s3.${p.awsRegion}.amazonaws.com`,
        },
      },
      null,
      2,
    ) + "\n"
  );
}

function result(
  templateId: DecoyKind,
  content: string,
  contentType: string = PLAIN,
  headers?: Record<string, string>,
): RenderedDecoy {
  return { content, contentType, templateId, headers };
}

/** Render a decoy file for a persona. */
export function renderDecoy(
  kind: DecoyKind,
  persona: DecoyPersona,
): RenderedDecoy {
  switch (kind) {
    case "dotenv_node":
      return result(kind, renderDotenvNode(persona));
    case "dotenv_php":
      return result(kind, renderDotenvPhp(persona));
    case "dotenv_python":
      return result(kind, renderDotenvPython(persona));
    case "env_json":
      return result(kind, renderEnvJson(persona), JSON_TYPE);
    case "env_js":
    case "js_config":
      return result(kind, renderEnvJs(persona), JS_TYPE);
    case "credentials_json":
      return result(kind, renderCredentialsJson(persona), JSON_TYPE);
    case "credentials_generic":
      return result(kind, renderCredentialsGeneric(persona));
    case "aws_credentials":
      return result(kind, renderAwsCredentials(persona));
    case "aws_config":
      return result(kind, renderAwsConfig(persona));
    case "gcp_service_account":
      return result(kind, renderGcpServiceAccount(persona), JSON_TYPE);
    case "azure_credentials":
      return result(kind, renderAzureCredentials(persona), JSON_TYPE);
    case "openssh_private_key":
      return result(kind, persona.sshPrivateKey);
    case "rsa_private_key":
      return result(kind, persona.rsaPrivateKey);
    case "tls_private_key":
      return result(kind, persona.tlsPrivateKey);
    case "ssh_authorized_keys":
      return result(kind, `${persona.sshPublicKey}\n`);
    case "ssh_known_hosts":
      return result(kind, renderSshKnownHosts(persona));
    case "git_config":
      return result(kind, renderGitConfig(persona));
    case "git_head":
      return result(kind, `ref: refs/heads/${persona.branch}\n`);
    case "git_index":
      return result(kind, renderGitIndex(persona), "application/octet-stream");
    case "gitignore":
      return result(kind, renderGitignore(persona));
    case "svn_entries":
      return result(kind, renderSvnEntries(persona), "application/xml; charset=utf-8");
    case "wp_config":
      return result(kind, renderWpConfig(persona), PHP_TYPE);
    case "php_config":
      return result(kind, renderPhpConfig(persona), PHP_TYPE);
    case "phpinfo":
      return result(kind, renderPhpInfo(persona), HTML_TYPE);
    case "htpasswd":
      return result(kind, renderHtpasswd(persona));
    case "netrc":
      return result(kind, renderNetrc(persona));
    case "pgpass":
      return result(kind, renderPgpass(persona));
    case "mysql_config":
      return result(kind, renderMysqlConfig(persona));
    case "shell_history":
      return result(kind, renderShellHistory(persona));
    case "package_manager_config":
      return result(kind, renderPackageManagerConfig(persona));
    case "docker_config":
      return result(kind, renderDockerConfig(persona), JSON_TYPE);
    case "sftp_config":
      return result(kind, renderSftpConfig(persona), JSON_TYPE);
    case "cloud_cli_config":
      return result(kind, renderCloudCliConfig(persona));
    case "vault_key":
      return result(kind, renderVaultKey(persona));
    case "docker_compose":
      return result(kind, renderDockerCompose(persona), YAML_TYPE);
    case "dockerfile":
      return result(kind, renderDockerfile(persona));
    case "kubernetes_config":
      return result(kind, renderKubernetesConfig(persona), YAML_TYPE);
    case "terraform_vars":
      return result(kind, renderTerraformVars(persona));
    case "terraform_state":
      return result(kind, renderTerraformState(persona), JSON_TYPE);
    case "nginx_config":
      return result(kind, renderNginxConfig(persona));
    case "apache_config":
      return result(kind, renderApacheConfig(persona));
    case "makefile":
      return result(kind, renderMakefile(persona));
    case "github_workflow":
      return result(kind, renderGithubWorkflow(persona), YAML_TYPE);
    case "gitlab_ci":
      return result(kind, renderGitlabCi(persona), YAML_TYPE);
    case "jenkinsfile":
      return result(kind, renderJenkinsfile(persona));
    case "circleci_config":
      return result(kind, renderCircleCiConfig(persona), YAML_TYPE);
    case "ci_pipeline":
      return result(kind, renderCiPipeline(persona), YAML_TYPE);
    case "sql_dump":
      return result(kind, renderSqlDump(persona), "application/sql; charset=utf-8");
    case "generic_backup":
      return result(kind, renderGenericBackup(persona));
    case "app_config_json":
      return result(kind, renderAppConfigJson(persona), JSON_TYPE);
    case "package_json":
      return result(kind, renderPackageJson(persona), JSON_TYPE);
    case "yaml_config":
      return result(kind, renderYamlConfig(persona), YAML_TYPE);
    case "python_config":
      return result(kind, renderPythonConfig(persona));
    case "ruby_config":
      return result(kind, renderRubyConfig(persona));
    case "actuator_env":
      return result(kind, renderActuatorEnv(persona), JSON_TYPE);
    case "actuator_health":
      return result(kind, renderActuatorHealth(persona), JSON_TYPE);
    case "actuator_metadata":
      return result(kind, renderActuatorMetadata(persona), JSON_TYPE);
    case "server_status":
      return result(kind, renderServerStatus(persona), HTML_TYPE);
    case "wp_login":
      return result(kind, renderWpLogin(persona), HTML_TYPE);
    case "admin_login":
      return result(kind, renderAdminLogin(persona), HTML_TYPE);
    case "phpmyadmin_login":
      return result(kind, renderPhpMyAdminLogin(persona), HTML_TYPE);
    case "health_json":
      return result(kind, renderHealthJson(persona), JSON_TYPE);
    case "metrics":
      return result(kind, renderMetrics(persona));
    case "debug_vars":
      return result(kind, renderDebugVars(persona), JSON_TYPE);
    case "telescope":
      return result(kind, renderTelescope(persona), JSON_TYPE);
    case "ucp_json":
      return result(kind, renderUcpJson(persona), JSON_TYPE);
    case "canary":
      return result(kind, "ok\n");
    case "generic_config":
    default:
      return result("generic_config", renderGenericConfig(persona));
  }
}