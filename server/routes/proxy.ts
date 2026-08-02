import { Request, Response, Router } from "express";
import axios from "axios";

export const proxyRouter = Router();

proxyRouter.post("/fetch", async (req: Request, res: Response) => {
  try {
    const { url, options } = req.body;
    if (!url) {
      return res.status(400).json({ error: "Missing url" });
    }

    const response = await axios({
      url,
      method: options?.method || "GET",
      headers: options?.headers,
      data: options?.body,
      responseType: "text", // We want raw text
      validateStatus: () => true, // Don't throw on 4xx/5xx
    });
    
    res.status(response.status).send(response.data);
  } catch (error: any) {
    console.error("Proxy fetch error:", error);
    res.status(500).json({ error: error.message || "Unknown error" });
  }
});
