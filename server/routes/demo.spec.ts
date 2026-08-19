import { describe, it, expect } from "vitest";
import { demoRouter } from "./demo";

describe("Demo Router", () => {
  it("GET / should return 200 and a greeting message", async () => {
    const req = new Request("http://localhost/");
    const res = await demoRouter.fetch(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({
      message: "Hello from Hono server",
    });
  });
});
