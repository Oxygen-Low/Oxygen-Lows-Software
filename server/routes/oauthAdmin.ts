import { Router } from "express";
import { getAuthenticatedClient } from "../lib/supabase.ts";
import { apiLimiter } from "../lib/limiter.ts";

const router = Router();

// Apply rate limiter to all admin routes
router.use(apiLimiter);

router.get("/clients", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing token" });
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { data, error } = await (supabase.auth as any).oauth.listClients();
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get("/authorized-apps", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing token" });
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { data, error } = await (
      supabase.auth as any
    ).oauth.listAuthorizedApps();
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/clients", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing token" });
    const { name, type, redirect_uris } = req.body;
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { data, error } = await (supabase.auth as any).oauth.createClient({
      name,
      type,
      redirect_uris,
    });
    if (error) throw error;
    res.json(data);
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.delete("/clients/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing token" });
    const { id } = req.params;
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { error } = await (supabase.auth as any).oauth.deleteClient(id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/revoke-authorization/:id", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Missing token" });
    const { id } = req.params;
    const supabase = getAuthenticatedClient(token);
    // @ts-ignore
    const { error } = await (supabase.auth as any).oauth.revokeAuthorization(
      id,
    );
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error("OAuth admin error:", err);
    res.status(500).json({ error: err.message });
  }
});

export { router as oauthAdminRouter };
