import { describe, it, expect } from "vitest";
import { detectSensitivePath } from "./sensitivePaths.js";

describe("detectSensitivePath", () => {
  // ── Safe paths ──────────────────────────────────────────────────────────────
  it("should return null for safe, legitimate paths", () => {
    expect(detectSensitivePath("/api/products")).toBeNull();
    expect(detectSensitivePath("/api/users/123")).toBeNull();
    expect(detectSensitivePath("/images/avatar.png")).toBeNull();
    expect(detectSensitivePath("/apps/public-characters")).toBeNull();
    expect(detectSensitivePath("/acceptable-use")).toBeNull();
    expect(detectSensitivePath("/")).toBeNull();
    expect(detectSensitivePath("/about")).toBeNull();
    expect(detectSensitivePath("/contact")).toBeNull();
    expect(detectSensitivePath("/blog/my-post")).toBeNull();
    expect(detectSensitivePath("/robots.txt")).toBeNull();
    expect(detectSensitivePath("/sitemap.xml")).toBeNull();
    expect(detectSensitivePath("/.well-known/security.txt")).toBeNull();
  });

  it("should return null for empty / falsy input", () => {
    expect(detectSensitivePath("")).toBeNull();
    expect(detectSensitivePath(undefined as any)).toBeNull();
    expect(detectSensitivePath(null as any)).toBeNull();
  });

  // ── Credentials ─────────────────────────────────────────────────────────────
  it("should detect .env variants", () => {
    expect(detectSensitivePath("/.env")).not.toBeNull();
    expect(detectSensitivePath("/.env.local")).not.toBeNull();
    expect(detectSensitivePath("/.env.production")).not.toBeNull();
    expect(detectSensitivePath("/.env.staging")).not.toBeNull();
    expect(detectSensitivePath("/.env.backup")).not.toBeNull();
  });

  it("should detect credential files probed in the screenshot", () => {
    // Exact paths from the attack log shown by the user
    expect(detectSensitivePath("/.boto")?.category).toBe("credentials");
    expect(detectSensitivePath("/.s3cfg")?.category).toBe("credentials");
    expect(detectSensitivePath("/rclone.conf")?.category).toBe("credentials");
    expect(detectSensitivePath("/secrets.yaml")?.category).toBe("credentials");
    expect(detectSensitivePath("/secrets.yml")?.category).toBe("credentials");
  });

  it("should detect SSH key files", () => {
    expect(detectSensitivePath("/id_rsa")?.category).toBe("credentials");
    expect(detectSensitivePath("/.ssh/id_rsa")?.category).toBe("credentials");
    expect(detectSensitivePath("/.ssh/id_ed25519")?.category).toBe(
      "credentials",
    );
    expect(detectSensitivePath("/.ssh/authorized_keys")?.category).toBe(
      "credentials",
    );
  });

  // ── Config files ────────────────────────────────────────────────────────────
  it("should detect common config files probed in the screenshot", () => {
    expect(detectSensitivePath("/web.config")?.category).toBe("config");
    expect(detectSensitivePath("/instance/config.py")?.category).toBe("config");
    expect(detectSensitivePath("/local.settings.json")?.category).toBe("config");
    expect(detectSensitivePath("/settings.py")?.category).toBe("config");
    expect(detectSensitivePath("/core/settings.py")?.category).toBe("config");
    expect(detectSensitivePath("/backend/settings.py")?.category).toBe("config");
    expect(detectSensitivePath("/bootstrap.yml")?.category).toBe("config");
    expect(detectSensitivePath("/application.properties")?.category).toBe(
      "config",
    );
    expect(detectSensitivePath("/config.py")?.category).toBe("config");
    expect(detectSensitivePath("/app/settings.py")?.category).toBe("config");
    expect(detectSensitivePath("/app/config.py")?.category).toBe("config");
  });

  // ── VCS metadata ────────────────────────────────────────────────────────────
  it("should detect git metadata", () => {
    expect(detectSensitivePath("/.git/config")?.category).toBe("vcs");
    expect(detectSensitivePath("/.git/HEAD")?.category).toBe("vcs");
    expect(detectSensitivePath("/.git/index")?.category).toBe("vcs");
    // prefix match
    expect(detectSensitivePath("/.git/refs/heads/main")?.category).toBe("vcs");
    expect(detectSensitivePath("/.svn/entries")?.category).toBe("vcs");
  });

  // ── Cloud credentials ───────────────────────────────────────────────────────
  it("should detect cloud credential files", () => {
    expect(detectSensitivePath("/.aws/credentials")?.category).toBe("cloud");
    expect(detectSensitivePath("/.aws/config")?.category).toBe("cloud");
    expect(detectSensitivePath("/service-account.json")?.category).toBe("cloud");
  });

  // ── Backup / dump files ─────────────────────────────────────────────────────
  it("should detect backup file extensions on the last segment", () => {
    expect(detectSensitivePath("/config.bak")?.category).toBe("backup");
    expect(detectSensitivePath("/database.sql")?.category).toBe("backup");
    expect(detectSensitivePath("/site.tar.gz")?.category).toBe("backup");
    expect(detectSensitivePath("/backup.zip")?.category).toBe("backup");
    expect(detectSensitivePath("/data.sqlite3")?.category).toBe("backup");
  });

  it("should NOT flag backup extension in a non-final path segment", () => {
    // /api/backup-plan — 'plan' is the last segment, not a backup extension
    expect(detectSensitivePath("/api/backup-plan")).toBeNull();
  });

  // ── Debug / admin endpoints ─────────────────────────────────────────────────
  it("should detect Spring Boot actuator endpoints", () => {
    expect(detectSensitivePath("/actuator")?.category).toBe("debug");
    expect(detectSensitivePath("/actuator/env")?.category).toBe("debug");
    expect(detectSensitivePath("/actuator/heapdump")?.category).toBe("debug");
    // prefix match
    expect(detectSensitivePath("/actuator/loggers/root")?.category).toBe(
      "debug",
    );
  });

  it("should detect WordPress admin paths", () => {
    expect(detectSensitivePath("/wp-login.php")?.category).toBe("debug");
    expect(detectSensitivePath("/wp-config.php")?.category).toBe("debug");
    expect(detectSensitivePath("/wp-admin")?.category).toBe("debug");
    expect(detectSensitivePath("/wp-admin/admin-ajax.php")?.category).toBe(
      "debug",
    );
  });

  it("should detect database admin tools", () => {
    expect(detectSensitivePath("/phpmyadmin")?.category).toBe("debug");
    expect(detectSensitivePath("/pma")?.category).toBe("debug");
    expect(detectSensitivePath("/adminer.php")?.category).toBe("debug");
  });

  // ── CI/CD ───────────────────────────────────────────────────────────────────
  it("should detect CI/CD config paths", () => {
    expect(detectSensitivePath("/.gitlab-ci.yml")?.category).toBe("ci_cd");
    expect(detectSensitivePath("/.travis.yml")?.category).toBe("ci_cd");
    expect(detectSensitivePath("/Jenkinsfile")?.category).toBe("ci_cd");
    expect(
      detectSensitivePath("/.github/workflows/deploy.yml")?.category,
    ).toBe("ci_cd");
  });

  // ── Infra ───────────────────────────────────────────────────────────────────
  it("should detect infrastructure files", () => {
    expect(detectSensitivePath("/docker-compose.yml")?.category).toBe("infra");
    expect(detectSensitivePath("/terraform.tfvars")?.category).toBe("infra");
    expect(detectSensitivePath("/terraform.tfstate")?.category).toBe("infra");
    expect(detectSensitivePath("/nginx.conf")?.category).toBe("infra");
  });

  // ── Case insensitivity ──────────────────────────────────────────────────────
  it("should be case-insensitive", () => {
    expect(detectSensitivePath("/.ENV")).not.toBeNull();
    expect(detectSensitivePath("/WP-LOGIN.PHP")).not.toBeNull();
    expect(detectSensitivePath("/.Git/Config")).not.toBeNull();
  });

  // ── Query string stripped ───────────────────────────────────────────────────
  it("should strip query strings before matching", () => {
    expect(detectSensitivePath("/.env?foo=bar")).not.toBeNull();
    expect(detectSensitivePath("/wp-login.php?redirect_to=/admin")).not.toBeNull();
  });

  // ── Scanner attack attempt detection ─────────────────────────────────────────
  it("should detect all paths from recent scanner attack attempt", () => {
    // Paths from prompt
    expect(detectSensitivePath("/.git/zzcanary-31ace029da94793e")).not.toBeNull();
    expect(detectSensitivePath("/_vti_pvt/zzcanary-14a6457aafc806ad")).not.toBeNull();
    expect(detectSensitivePath("/api/.env")?.category).toBe("credentials");
    expect(detectSensitivePath("/.env")?.category).toBe("credentials");
    expect(detectSensitivePath("/.git/HEAD")?.category).toBe("vcs");
    expect(detectSensitivePath("/_vti_pvt/service.pwd")?.category).toBe("credentials");
    expect(detectSensitivePath("/.ssh/id_rsa")?.category).toBe("credentials");
    expect(detectSensitivePath("/.bash_history")?.category).toBe("credentials");
    expect(detectSensitivePath("/.npmrc")?.category).toBe("credentials");
    expect(detectSensitivePath("/secrets.json")?.category).toBe("credentials");
    expect(detectSensitivePath("/zzcanary-3c896927ab2a3b17.env")).not.toBeNull();

    // Paths from screenshots
    expect(detectSensitivePath("/.svn/zzcanary-3db22feaa2c274d7")).not.toBeNull();
    expect(detectSensitivePath("/.vscode/sftp.json")?.category).toBe("credentials");
    expect(detectSensitivePath("/server.key")?.category).toBe("credentials");
    expect(detectSensitivePath("/.env.production")?.category).toBe("credentials");
    expect(detectSensitivePath("/zzcanary-6314c15b558e38fd")?.category).toBe("canary");
    expect(detectSensitivePath("/actuator/zzcanary-3ddeb040a69bb7b9")?.category).toBe("debug");
    expect(detectSensitivePath("/backup.tar.gz")?.category).toBe("backup");
    expect(detectSensitivePath("/backup.zip")?.category).toBe("backup");
    expect(detectSensitivePath("/.svn/wc.db")).not.toBeNull();
    expect(detectSensitivePath("/actuator/heapdump")?.category).toBe("debug");
    expect(detectSensitivePath("/dump.sql")?.category).toBe("backup");
    expect(detectSensitivePath("/database_backup.sql")?.category).toBe("backup");
    expect(detectSensitivePath("/zzcanary-5aab18f51f096c6c.sql")).not.toBeNull();
    expect(detectSensitivePath("/database.sql")?.category).toBe("backup");
    expect(detectSensitivePath("/backup.sql")?.category).toBe("backup");
    expect(detectSensitivePath("/zzcanary-49a5e50df4385cee.xml")?.category).toBe("canary");
    expect(detectSensitivePath("/.ssh/zzcanary-29cf44002e0eb1d1")?.category).toBe("credentials");
    expect(detectSensitivePath("/config.xml")?.category).toBe("config");
    expect(detectSensitivePath("/zzcanary-4fee254614301b9b.yml")?.category).toBe("canary");
    expect(detectSensitivePath("/storage/logs/zzcanary-3266ffdf1f457f30")?.category).toBe("debug");
    expect(detectSensitivePath("/.ssh/id_ed25519")?.category).toBe("credentials");
    expect(detectSensitivePath("/docker-compose.yml")?.category).toBe("infra");
    expect(detectSensitivePath("/user_secrets.yml")?.category).toBe("credentials");
    expect(detectSensitivePath("/storage/logs/laravel.log")?.category).toBe("debug");
  });
});
