import { Request, Response, Router } from "express";

export const proxyRouter = Router();

proxyRouter.post("/fetch", async (req: Request, res: Response) => {
  try {
    const { url, options } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Missing url" });
    }

    const response = await fetch(url, options);
    
    // We only care about text content for the AI fetcher
    const text = await response.text();
    
    res.status(response.status).send(text);
  } catch (error: any) {
    console.error("Proxy fetch error:", error);
    res.status(500).json({ error: error.message });
  }
});
