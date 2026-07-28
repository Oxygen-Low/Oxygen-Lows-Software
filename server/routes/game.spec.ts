import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "../index";

describe("TOS LLMs Game Routes API", () => {
  let app: any;

  beforeEach(() => {
    app = createServer();
  });

  it("should fail authentication with 401 when no token is provided", async () => {
    const res = await request(app)
      .post("/api/social-deduction/create")
      .send({ aiModel: "Smart" });

    expect(res.status).toBe(401);
  });
});
