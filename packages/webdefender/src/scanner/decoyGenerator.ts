import { SensitivePathCategory } from "./sensitivePaths.js";

export interface DecoyResult {
  content: string;
  contentType: string;
}

/**
 * Generates realistic decoy content and matching Content-Type headers for sensitive path requests.
 * Uses authentic high-entropy token formats, framework-consistent variable archetypes, and
 * realistic structural syntax to mislead scrapers, security scanners (Trufflehog, GitGuardian),
 * and pentesters without triggering giveaway heuristics.
 */
export function generateDecoyContent(
  rawPath: string,
  category?: SensitivePathCategory,
): DecoyResult {
  const cleaned = (rawPath || "").toLowerCase().split("?")[0].split("#")[0];
  const lastSegment = cleaned.split("/").pop() || "";

  // 1. Dotenv files (.env, .env.local, .env.production, etc.)
  if (
    lastSegment === ".env" ||
    lastSegment.startsWith(".env.") ||
    lastSegment.endsWith(".env") ||
    cleaned.includes("/.env")
  ) {
    return {
      contentType: "text/plain; charset=utf-8",
      content: `# Core Application Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
APP_NAME=enterprise-core-service
NEXT_PUBLIC_APP_URL=https://app.internal-cloud.net
API_BASE_URL=https://api-prod-internal.services.net

# Database & Storage
DATABASE_URL=postgresql://app_service_rw:p8N_9xK2mQ4vL7sB1@db-prod-aurora-cluster.internal.net:5432/core_production
DATABASE_REPLICA_URL=postgresql://app_service_ro:p8N_9xK2mQ4vL7sB1@db-prod-aurora-replica.internal.net:5432/core_production
REDIS_URL=rediss://default:r8N4xP1sQ9vL3mZ7k@cache-cluster-01.internal.net:6379/0

# Authentication & Security
SESSION_SECRET=c8e7f1a9b2d3c4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9
JWT_SECRET=9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b
JWT_EXPIRY=86400
ENCRYPTION_KEY=4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b

# Cloud & Object Storage (AWS S3)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA2Y7NZ8V9K1LM4PQX
AWS_SECRET_ACCESS_KEY=v8N3xP+7mQzK9yR2wT4vB1cL0sD8fJ6hA9gE3uY1
S3_BUCKET_NAME=corp-assets-prod-us-east-1
S3_CUSTOM_DOMAIN=cdn-assets.internal-cloud.net

# Payment & Third-Party Integrations
STRIPE_SECRET_KEY=sk_live_51Mv8kL2eZvKYlo2C8u9N3mQ4vP1aX7yR0sT2wB5cD8eF9gH1iJ3kL5mN7oP9qR1
STRIPE_WEBHOOK_SECRET=whsec_8N2kL4vP1sQ7rS9tU3vW5xY7zA9bC1dE
SENDGRID_API_KEY=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
SENTRY_DSN=https://8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d@o918237.ingest.sentry.io/5918273

# Internal Services
AUTH_SERVICE_KEY=svc_sec_9a8b7c6d5e4f3a2b1c0d9e8f
BILLING_SERVICE_URL=http://billing-srv.internal:8000
`,
    };
  }

  // 2. AWS / Cloud credentials (.aws/credentials, .aws/config, azure/gcloud)
  if (
    cleaned.includes(".aws/credentials") ||
    cleaned.includes("aws-credentials") ||
    cleaned.includes(".aws/config")
  ) {
    return {
      contentType: "text/plain; charset=utf-8",
      content: `[default]
aws_access_key_id = AKIA2Y7NZ8V9K1LM4PQX
aws_secret_access_key = v8N3xP+7mQzK9yR2wT4vB1cL0sD8fJ6hA9gE3uY1
region = us-east-1

[production]
aws_access_key_id = AKIA4B8QC9DH1EK7N2PR
aws_secret_access_key = j8E7MtGbClwBF92Zp4Utkh3yCo8nvbL1wX7zA9bC
region = us-west-2
`,
    };
  }

  // 3. SSH / Private Keys & Certificates (id_rsa, private.pem, server.key, etc.)
  if (
    cleaned.includes("id_rsa") ||
    cleaned.includes("id_ed25519") ||
    cleaned.includes("id_ecdsa") ||
    cleaned.includes("id_dsa") ||
    cleaned.endsWith(".key") ||
    cleaned.endsWith(".pem") ||
    cleaned.includes("private")
  ) {
    return {
      contentType: "text/plain; charset=utf-8",
      content: `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZTAAAAAAAAAABAAAAMAAAAB3YWFh
YkFBQUFBQk5BWlc1cGMzTmhjM0psWlhnd0FBQUFBbWRsY3lBQUFBQUJDQUFBQUFjWnlr
c2Z2ZXJmZGprc2RqZmtsZHNqZmtsZHNqZjhsZHNramZsc2tqZmRsc2tqZmxza2pmZGxz
a2pmbHNrZmpsZHNrZmxrc2RqZmRsa3NqZmxkczlrZGZsamRzbGtmamRsZHNramZsc2tq
ZmRsc2tqZmRsa3NqZmRsc2tqZmRsa3NqZmRsa3NqZmQAAAEAgP8vK3f2k4m9XvL0Qz1b
N2h3Y4k5m6n7p8q9r0s1t2u3v4w5x6y7z8A9B0C1D2E3F4G5H6I7J8K9L0M1N2O3P4Q5
R6S7T8U9V0W1X2Y3Z4a5b6c7d8e9f0g1h2i3j4k5l6m7n8o9p0q1r2s3t4u5v6w7x8y9
z0A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6Q7R8S9T0U1V2W3X4Y5Z6a7b8c9d0e1f2g3
h4i5j6k7l8m9n0o1p2q3r4s5t6u7v8w9x0y1z2A3B4C5D6E7F8G9H0I1J2K3L4M5N6O7
P8Q9R0S1T2U3V4W5X6Y7Z8a9b0c1d2e3f4g5h6i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1
-----END OPENSSH PRIVATE KEY-----
`,
    };
  }

  // 4. Git configuration (.git/config, .git/HEAD)
  if (cleaned.includes("/.git/config") || cleaned === ".git/config") {
    return {
      contentType: "text/plain; charset=utf-8",
      content: `[core]
	repositoryformatversion = 0
	filemode = true
	bare = false
	logallrefupdates = true
	ignorecase = true
[remote "origin"]
	url = git@github.com:infrastructure-services-internal/core-backend-api.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
	merge = refs/heads/main
`,
    };
  }

  if (cleaned.includes("/.git/head") || cleaned === ".git/head") {
    return {
      contentType: "text/plain; charset=utf-8",
      content: `ref: refs/heads/main\n`,
    };
  }

  // 5. WordPress and PHP config files (wp-config.php, config.php, settings.php)
  if (
    cleaned.includes("wp-config") ||
    (cleaned.endsWith(".php") && (cleaned.includes("config") || cleaned.includes("setting")))
  ) {
    return {
      contentType: "application/x-httpd-php; charset=utf-8",
      content: `<?php
define( 'DB_NAME', 'wp_db_production' );
define( 'DB_USER', 'wp_db_user' );
define( 'DB_PASSWORD', 'Wp_P8N#9xK2mQ4vL7sB1!' );
define( 'DB_HOST', '10.0.14.12:3306' );
define( 'DB_CHARSET', 'utf8mb4' );
define( 'DB_COLLATE', '' );

define( 'AUTH_KEY',         'x98z71698Kd8k27Lp06mQ98vBn74XyZ1oP2qR4sT6uV8wX0yZ2aB4cD6eF8gH0i' );
define( 'SECURE_AUTH_KEY',  'w89q72687Jc8j17Ko96lP88uAm73WxY0nP1qR3sT5uV7wX9yZ1aB3cD5eF7gH9i' );
define( 'LOGGED_IN_KEY',    'v70p83776Ib8i06Jn88kO77tZl62VwX9mP0qR2sT4uV6wX8yZ0aB2cD4eF6gH8i' );
define( 'NONCE_KEY',        'u61o94865Ha8h97Im78jN68sYk71UvW8lP9qR1sT3uV5wX7yZ9aB1cD3eF5gH7i' );

$table_prefix = 'wp_';
define( 'WP_DEBUG', false );
if ( ! defined( 'ABSPATH' ) ) {
    define( 'ABSPATH', __DIR__ . '/' );
}
require_once ABSPATH . 'wp-settings.php';
`,
    };
  }

  // 6. phpinfo.php / info.php
  if (cleaned.includes("phpinfo") || cleaned.includes("info.php")) {
    return {
      contentType: "text/html; charset=utf-8",
      content: `<!DOCTYPE html>
<html lang="en">
<head><title>PHP 8.2.14 - phpinfo()</title></head>
<body style="background:#fff; color:#222; font-family:sans-serif; margin:1em;">
  <h1 style="font-size:1.5em; border-bottom:1px solid #ccc; padding-bottom:4px;">PHP Version 8.2.14</h1>
  <table style="border-collapse:collapse; width:100%; max-width:800px; font-size:13px;">
    <tr style="background:#def;"><th style="padding:6px; text-align:left;">System</th><td style="padding:6px;">Linux prod-srv-01 5.15.0-88-generic x86_64</td></tr>
    <tr><th style="padding:6px; text-align:left;">Build Date</th><td style="padding:6px;">Dec 21 2023 14:22:10</td></tr>
    <tr style="background:#def;"><th style="padding:6px; text-align:left;">Server API</th><td style="padding:6px;">FPM/FastCGI</td></tr>
    <tr><th style="padding:6px; text-align:left;">Loaded Configuration File</th><td style="padding:6px;">/etc/php/8.2/fpm/php.ini</td></tr>
  </table>
</body>
</html>
`,
    };
  }

  // 7. .htpasswd / auth credentials
  if (cleaned.includes(".htpasswd") || cleaned.includes(".netrc") || cleaned.includes(".pgpass")) {
    return {
      contentType: "text/plain; charset=utf-8",
      content: `admin:$apr1$4n9k1m2o$Pq8R7s6T5u4V3w2X1y0Za.
root:$apr1$8x7y6z5w$AbCdEfGhIjKlMnOpQrStUv.
deploy:$apr1$9v8u7t6s$1234567890abcdefghijkl.
`,
    };
  }

  // 8. Docker compose / Kubernetes / YAML configs
  if (
    cleaned.endsWith(".yaml") ||
    cleaned.endsWith(".yml") ||
    cleaned.includes("docker-compose") ||
    cleaned.includes("k8s")
  ) {
    return {
      contentType: "text/yaml; charset=utf-8",
      content: `version: '3.8'
services:
  app:
    image: internal-registry.corp.net/backend/core-service:v2.4.1
    environment:
      - DATABASE_URL=postgres://app_service_rw:p8N_9xK2mQ4vL7sB1@db-prod-aurora-cluster.internal.net:5432/core_production
      - REDIS_URL=rediss://default:r8N4xP1sQ9vL3mZ7k@cache-cluster-01.internal.net:6379/0
      - API_SECRET=sec_live_9a8b7c6d5e4f3a2b1c0d9e8f
    ports:
      - "3000:3000"
    restart: always
`,
    };
  }

  // 9. JSON configs & credentials (credentials.json, auth.json, service-account.json, etc.)
  if (
    cleaned.endsWith(".json") ||
    cleaned.includes("credentials") ||
    cleaned.includes("secrets") ||
    cleaned.includes("service-account") ||
    cleaned.includes("api-keys")
  ) {
    return {
      contentType: "application/json; charset=utf-8",
      content: JSON.stringify(
        {
          type: "service_account",
          project_id: "corp-cloud-infrastructure-9941",
          private_key_id: "7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a",
          private_key:
            "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC7rM8xK9vN2pL4\nqR1sT3uV5wX7yZ9aB1cD3eF5gH7iJ9kL1mN3oP5qR7sT9uV1wX3yZ5aB7cD9eF1g\nH3iJ5kL7mN9oP1qR3sT5uV7wX9yZ1aB3cD5eF7gH9iJ1kL3mN5oP7qR9sT1uV3wX\n5yZ7aB9cD1eF3gH5iJ7kL9mN1oP3qR5sT7uV9wX1yZ3aB5cD7eF9gH1iJ3kL5mN7\noP9qR1sT3uV5wX7yZ9aB1cD3eF5gH7iJ9kL1mN3oP5qR7sT9uV1wX3yZ5aB7cD9e\nF1gH3iJ5kL7mN9oP1qR3sT5uV7wX9yZ1aB3cD5eF7gH9iJ1kL3mN5oP7qR9sT1u\nV3wX5yZ7aB9cD1eF3gH5iJ7kL9mN1oP3qR5sT7uV9wX1yZ3aB5cD7eF9gH1iJ3k\nL5mN7oP9qR1sT3uV5wX7yZ9aB1cD3eF5gH7iJ9kL1mN3oP5qR7sT9uV1wX3yZ5aB\n-----END PRIVATE KEY-----\n",
          client_email:
            "storage-accessor@corp-cloud-infrastructure-9941.iam.gserviceaccount.com",
          client_id: "109823749817234918234",
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
          auth_provider_x509_cert_url:
            "https://www.googleapis.com/oauth2/v1/certs",
        },
        null,
        2,
      ),
    };
  }

  // 10. Default / Generic fallback
  return {
    contentType: "text/plain; charset=utf-8",
    content: `# Protected Configuration Resource
STATUS=active
SERVICE_ID=svc_prod_9921
ACCESS_TOKEN=tok_live_7a8b9c0d1e2f3a4b5c6d7e8f
DATABASE_INTERNAL=10.0.12.44:5432
`,
  };
}
