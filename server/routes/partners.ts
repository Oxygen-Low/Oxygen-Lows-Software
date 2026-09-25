import { Hono } from "hono";
import { resolveUserFromToken } from "../lib/auth.ts";
import {
  getPartnersData,
  addExistingPartner,
  updateExistingPartner,
  deleteExistingPartner,
  addWantedPartner,
  updateWantedPartner,
  deleteWantedPartner,
} from "../lib/partners.ts";

export const partnersRouter = new Hono();

async function getAdminUser(c: any) {
  const authHeader = c.req.header("Authorization");
  let token = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!token) {
    token = c.req.query("token") || null;
  }
  if (!token) return null;

  const user = await resolveUserFromToken(token);
  if (!user) return null;
  if (user.role !== "admin" && String(user.id) !== "1") return null;
  return user;
}

// Public: Get all partners and wanted categories
partnersRouter.get("/", async (c) => {
  try {
    const data = getPartnersData();
    return c.json(data);
  } catch (error: any) {
    return c.json({ error: error?.message || "Failed to get partners data" }, 500);
  }
});

// Admin: Get all partners and wanted categories
partnersRouter.get("/admin", async (c) => {
  const user = await getAdminUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Admin access required" }, 401);
  }
  const data = getPartnersData();
  return c.json(data);
});

// Admin: Add existing partner
partnersRouter.post("/admin/existing", async (c) => {
  const user = await getAdminUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Admin access required" }, 401);
  }

  try {
    const body = await c.req.json();
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return c.json({ error: "Partner name is required" }, 400);
    }

    const partner = addExistingPartner({
      name: body.name.trim(),
      logo_url: typeof body.logo_url === "string" ? body.logo_url.trim() : "",
      website_url: typeof body.website_url === "string" ? body.website_url.trim() : "",
      description: typeof body.description === "string" ? body.description.trim() : "",
      category: typeof body.category === "string" ? body.category.trim() : "General",
    });

    return c.json({ success: true, partner }, 201);
  } catch (error: any) {
    return c.json({ error: error?.message || "Failed to create partner" }, 500);
  }
});

// Admin: Update existing partner
partnersRouter.put("/admin/existing/:id", async (c) => {
  const user = await getAdminUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Admin access required" }, 401);
  }

  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const updated = updateExistingPartner(id, {
      ...(body.name !== undefined ? { name: String(body.name).trim() } : {}),
      ...(body.logo_url !== undefined ? { logo_url: String(body.logo_url).trim() } : {}),
      ...(body.website_url !== undefined ? { website_url: String(body.website_url).trim() } : {}),
      ...(body.description !== undefined ? { description: String(body.description).trim() } : {}),
      ...(body.category !== undefined ? { category: String(body.category).trim() } : {}),
    });

    if (!updated) {
      return c.json({ error: "Partner not found" }, 404);
    }

    return c.json({ success: true, partner: updated });
  } catch (error: any) {
    return c.json({ error: error?.message || "Failed to update partner" }, 500);
  }
});

// Admin: Delete existing partner
partnersRouter.delete("/admin/existing/:id", async (c) => {
  const user = await getAdminUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Admin access required" }, 401);
  }

  const id = c.req.param("id");
  const success = deleteExistingPartner(id);
  if (!success) {
    return c.json({ error: "Partner not found" }, 404);
  }

  return c.json({ success: true });
});

// Admin: Add wanted partner opportunity
partnersRouter.post("/admin/wanted", async (c) => {
  const user = await getAdminUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Admin access required" }, 401);
  }

  try {
    const body = await c.req.json();
    if (!body.category || typeof body.category !== "string" || !body.category.trim()) {
      return c.json({ error: "Category is required" }, 400);
    }

    const wanted = addWantedPartner({
      category: body.category.trim(),
      target_companies: typeof body.target_companies === "string" ? body.target_companies.trim() : "",
      what_we_provide: typeof body.what_we_provide === "string" ? body.what_we_provide.trim() : "",
      what_is_requested: typeof body.what_is_requested === "string" ? body.what_is_requested.trim() : "",
    });

    return c.json({ success: true, wanted }, 201);
  } catch (error: any) {
    return c.json({ error: error?.message || "Failed to create wanted partner opportunity" }, 500);
  }
});

// Admin: Update wanted partner opportunity
partnersRouter.put("/admin/wanted/:id", async (c) => {
  const user = await getAdminUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Admin access required" }, 401);
  }

  const id = c.req.param("id");
  try {
    const body = await c.req.json();
    const updated = updateWantedPartner(id, {
      ...(body.category !== undefined ? { category: String(body.category).trim() } : {}),
      ...(body.target_companies !== undefined ? { target_companies: String(body.target_companies).trim() } : {}),
      ...(body.what_we_provide !== undefined ? { what_we_provide: String(body.what_we_provide).trim() } : {}),
      ...(body.what_is_requested !== undefined ? { what_is_requested: String(body.what_is_requested).trim() } : {}),
    });

    if (!updated) {
      return c.json({ error: "Wanted partner opportunity not found" }, 404);
    }

    return c.json({ success: true, wanted: updated });
  } catch (error: any) {
    return c.json({ error: error?.message || "Failed to update wanted partner opportunity" }, 500);
  }
});

// Admin: Delete wanted partner opportunity
partnersRouter.delete("/admin/wanted/:id", async (c) => {
  const user = await getAdminUser(c);
  if (!user) {
    return c.json({ error: "Unauthorized: Admin access required" }, 401);
  }

  const id = c.req.param("id");
  const success = deleteWantedPartner(id);
  if (!success) {
    return c.json({ error: "Wanted partner opportunity not found" }, 404);
  }

  return c.json({ success: true });
});
