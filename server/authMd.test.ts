import { describe, it, expect } from "vitest";
import app from "./index.ts";

describe("Auth.md & Agent Registration Discovery", () => {
  it("GET /auth.md returns 200 with text/markdown and an H1 containing 'auth.md'", async () => {
    const res = await app.fetch(new Request("https://oxygenlow.com/auth.md"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");

    const text = await res.text();
    // Must have H1 heading containing auth.md
    expect(text).toMatch(/^#\s+.*auth\.md/im);
    expect(text).toContain("## Agent Audience");
    expect(text).toContain("## Discovery Documents");
    expect(text).toContain("## Registration Endpoint");
    expect(text).toContain("## Supported Authentication Methods");
    expect(text).toContain("## Using Credentials");
  });

  it("GET /auth.md with Accept: text/markdown returns Auth.md and not generic page markdown", async () => {
    const res = await app.fetch(
      new Request("https://oxygenlow.com/auth.md", {
        headers: { Accept: "text/markdown" },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");

    const text = await res.text();
    expect(text).toMatch(/^#\s+.*auth\.md/im);
    expect(text).not.toBe("# Oxygen Low's Software\n\nOxygen Low's Software - Beta. A platform for apps, storage, and customization.");
  });

  it("GET /.well-known/oauth-protected-resource returns valid PRM document", async () => {
    const res = await app.fetch(
      new Request("https://oxygenlow.com/.well-known/oauth-protected-resource")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resource).toBe("https://oxygenlow.com");
    expect(body.authorization_servers).toContain("https://oxygenlow.com");
    expect(body.scopes_supported).toEqual(expect.arrayContaining(["read", "write"]));
    expect(body.bearer_methods_supported).toContain("header");
  });

  it("GET /.well-known/oauth-authorization-server returns valid AS metadata with agent_auth", async () => {
    const res = await app.fetch(
      new Request("https://oxygenlow.com/.well-known/oauth-authorization-server")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issuer).toBe("https://oxygenlow.com");
    expect(body.agent_auth).toBeDefined();
    expect(body.agent_auth.skill).toBe("agent-registration");
    expect(body.agent_auth.register_uri).toBe("https://oxygenlow.com/agent/auth");

    const methods = body.agent_auth.methods;
    expect(Array.isArray(methods)).toBe(true);

    // ID-JAG method
    const idJag = methods.find((m: any) =>
      m.identity_assertion?.assertion_types_supported?.includes("urn:ietf:params:oauth:token-type:id-jag")
    );
    expect(idJag).toBeDefined();
    expect(idJag.credential_types_supported).toContain("bearer");
    expect(idJag.revocation_uri).toBe("https://oxygenlow.com/agent/auth/revoke");
    expect(idJag.events_supported).toContain("urn:ietf:params:oauth:event-type:token-revoked");

    // Verified email method
    const verifiedEmail = methods.find((m: any) =>
      m.identity_assertion?.assertion_types_supported?.includes("verified_email")
    );
    expect(verifiedEmail).toBeDefined();
    expect(verifiedEmail.credential_types_supported).toContain("bearer");
    expect(verifiedEmail.claim_uri).toBe("https://oxygenlow.com/agent/auth/claim");

    // Anonymous method
    const anon = methods.find((m: any) =>
      m.identity_types_supported?.includes("anonymous")
    );
    expect(anon).toBeDefined();
    expect(anon.claim_uri).toBe("https://oxygenlow.com/agent/auth/claim");
  });

  it("Link header on root page includes auth.md describedby and PRM/AS links", async () => {
    const res = await app.fetch(new Request("https://oxygenlow.com/"));
    const linkHeader = res.headers.get("Link");
    expect(linkHeader).toBeDefined();
    expect(linkHeader).toContain('rel="describedby"');
    expect(linkHeader).toContain('/auth.md');
    expect(linkHeader).toContain('rel="oauth-protected-resource"');
    expect(linkHeader).toContain('rel="oauth-authorization-server"');
    expect(linkHeader).toContain('rel="api-catalog"');
  });

  it("Accept: text/markdown negotiation on regular pages still works", async () => {
    const res = await app.fetch(
      new Request("https://oxygenlow.com/", {
        headers: { Accept: "text/markdown" },
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const text = await res.text();
    expect(text).toContain("Oxygen Low's Software");
  });

  it("Agent registration, revocation, and claim endpoints respond correctly", async () => {
    const authRes = await app.fetch(
      new Request("https://oxygenlow.com/agent/auth", { method: "POST" })
    );
    expect(authRes.status).toBe(200);

    const revokeRes = await app.fetch(
      new Request("https://oxygenlow.com/agent/auth/revoke", { method: "POST" })
    );
    expect(revokeRes.status).toBe(200);

    const claimRes = await app.fetch(
      new Request("https://oxygenlow.com/agent/auth/claim", { method: "GET" })
    );
    expect(claimRes.status).toBe(200);
  });
});
