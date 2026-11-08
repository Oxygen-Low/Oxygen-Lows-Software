import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDecoyCache,
  generateDecoyContent,
} from "./scanner/decoyGenerator.js";
import { createDecoyPersona } from "./scanner/decoyPersona.js";
import { selectDecoyKind } from "./scanner/decoyTemplates.js";

describe("Decoy generator", () => {
  beforeEach(() => {
    clearDecoyCache();
  });

  it("maps sensitive paths to realistic decoy shapes", () => {
    expect(selectDecoyKind("/.env")).toBe("dotenv_node");
    expect(selectDecoyKind("/.env.example")).toBe("dotenv_node");
    expect(selectDecoyKind("/env.json")).toBe("env_json");
    expect(selectDecoyKind("/runtime-config.js")).toBe("js_config");
    expect(selectDecoyKind("/.ssh/id_rsa")).toBe("openssh_private_key");
    expect(selectDecoyKind("/.ssh/id_ed25519")).toBe("openssh_private_key");
    expect(selectDecoyKind("/.aws/credentials")).toBe("aws_credentials");
    expect(selectDecoyKind("/wp-config.php")).toBe("wp_config");
    expect(selectDecoyKind("/.git/config")).toBe("git_config");
    expect(selectDecoyKind("/docker-compose.yml")).toBe("docker_compose");
    expect(selectDecoyKind("/backup.sql")).toBe("sql_dump");
    expect(selectDecoyKind("/actuator/env")).toBe("actuator_env");
  });

  it("is deterministic for the same app and seed", () => {
    const first = generateDecoyContent("/.env", "credentials", {
      appId: "app-123",
      seed: "2026-02",
    });
    clearDecoyCache();
    const second = generateDecoyContent("/.env", "credentials", {
      appId: "app-123",
      seed: "2026-02",
    });

    expect(first.personaId).toBe(second.personaId);
    expect(first.content).toBe(second.content);
    expect(first.headers).toEqual(second.headers);
  });

  it("creates a unique persona for each app", () => {
    const a = generateDecoyContent("/.env", "credentials", { appId: "app-a" });
    const b = generateDecoyContent("/.env", "credentials", { appId: "app-b" });

    expect(a.personaId).not.toBe(b.personaId);
    expect(a.content).not.toBe(b.content);
  });

  it("rotates the persona when the seed changes", () => {
    const a = generateDecoyContent("/.env", "credentials", {
      appId: "app-a",
      seed: "v1",
    });
    const b = generateDecoyContent("/.env", "credentials", {
      appId: "app-a",
      seed: "v2",
    });

    expect(a.personaId).not.toBe(b.personaId);
    expect(a.content).not.toBe(b.content);
  });

  it("keeps credentials consistent across different decoy files", () => {
    const env = generateDecoyContent("/.env", "credentials", {
      appId: "app-consistent",
    });
    const wp = generateDecoyContent("/wp-config.php", "config", {
      appId: "app-consistent",
    });
    const persona = createDecoyPersona("app-consistent");

    expect(env.content).toContain(persona.dbHost);
    expect(env.content).toContain(persona.dbPassword);
    expect(wp.content).toContain(persona.dbHost);
    expect(wp.content).toContain(persona.dbPassword);
    expect(env.personaId).toBe(wp.personaId);
  });

  it("returns decoy response headers and matching content length", () => {
    const result = generateDecoyContent("/.env", "credentials", {
      appId: "app-headers",
    });
    const expectedLength = new TextEncoder().encode(result.content).length;

    expect(result.statusCode).toBe(200);
    expect(result.headers?.["Cache-Control"]).toBe("no-store");
    expect(result.headers?.["X-Content-Type-Options"]).toBe("nosniff");
    expect(result.headers?.["Content-Length"]).toBe(String(expectedLength));
    expect(result.templateKind).toBe("dotenv_node");
    expect(result.templateId).toBe("dotenv_node");
    expect(result.personaId).toMatch(/^[a-f0-9]{8}$/);
  });

  it("omits the canary marker when includeCanary is false", () => {
    const withCanary = generateDecoyContent("/.env", "credentials", {
      appId: "app-canary",
      includeCanary: true,
    });
    const withoutCanary = generateDecoyContent("/.env", "credentials", {
      appId: "app-canary",
      includeCanary: false,
    });

    expect(withCanary.content).toMatch(/SERVICE_TOKEN=wd_[a-f0-9]{24}/);
    expect(withoutCanary.content).not.toMatch(/SERVICE_TOKEN=wd_/);
  });

  it("produces realistic key and credential formats", () => {
    const ssh = generateDecoyContent("/.ssh/id_ed25519", "credentials", {
      appId: "app-format",
    });
    const aws = generateDecoyContent("/.aws/credentials", "cloud", {
      appId: "app-format",
    });
    const gcp = generateDecoyContent(
      "/gcp-service-account.json",
      "cloud",
      { appId: "app-format" },
    );
    const sql = generateDecoyContent("/backup.sql", "backup", {
      appId: "app-format",
    });

    expect(ssh.content).toContain("BEGIN OPENSSH PRIVATE KEY");
    expect(ssh.content).toContain("END OPENSSH PRIVATE KEY");
    expect(aws.content).toMatch(/aws_access_key_id = AKIA[A-Z0-9]{16}/);
    expect(() => JSON.parse(gcp.content)).not.toThrow();
    expect(JSON.parse(gcp.content).type).toBe("service_account");
    expect(sql.content).toContain("CREATE TABLE");
  });

  it("does not emit obvious placeholder markers", () => {
    const result = generateDecoyContent("/.env", "credentials", {
      appId: "app-placeholder",
    });

    expect(result.content).not.toContain("EXAMPLE");
    expect(result.content).not.toContain("Fake");
    expect(result.content).not.toContain("changeme");
    expect(result.content).not.toContain("your-");
  });
});