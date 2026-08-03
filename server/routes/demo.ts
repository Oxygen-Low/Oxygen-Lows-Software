import { Hono } from "hono";

export const demoRouter = new Hono();

demoRouter.get("/", (c) => {
  return c.json({
    message: "Hello from Hono server",
  });
});
