import { describe, it, expect, vi, beforeEach } from "vitest";
import { partnersRouter } from "./partners";
import { Hono } from "hono";

const app = new Hono();
app.route("/", partnersRouter);

let mockPartnersData: any = {
  existing_partners: [
    {
      id: "partner-1",
      name: "Partner One",
      logo_url: "https://example.com/logo.png",
      website_url: "https://example.com",
      description: "A great partner.",
      category: "Infrastructure",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  wanted_partners: [
    {
      id: "wanted-1",
      category: "Cloud & AI Infrastructure",
      target_companies: "Cloudflare",
      what_we_provide: "Platform integration",
      what_is_requested: "Compute credits",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
};

vi.mock("../lib/auth.ts", () => ({
  resolveUserFromToken: vi.fn(async (token: string) => {
    if (token === "admin-token") {
      return {
        id: "1",
        email: "admin@example.com",
        username: "admin",
        role: "admin",
      };
    }
    if (token === "user-token") {
      return {
        id: "user-123",
        email: "test@example.com",
        username: "user",
        role: "user",
      };
    }
    return null;
  }),
}));

vi.mock("../lib/partners.ts", () => ({
  getPartnersData: vi.fn(() => ({ ...mockPartnersData })),
  addExistingPartner: vi.fn((p) => {
    const newP = { ...p, id: "new-p-1", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mockPartnersData.existing_partners.push(newP);
    return newP;
  }),
  updateExistingPartner: vi.fn((id, updates) => {
    const idx = mockPartnersData.existing_partners.findIndex((p: any) => p.id === id);
    if (idx === -1) return null;
    mockPartnersData.existing_partners[idx] = { ...mockPartnersData.existing_partners[idx], ...updates };
    return mockPartnersData.existing_partners[idx];
  }),
  deleteExistingPartner: vi.fn((id) => {
    const before = mockPartnersData.existing_partners.length;
    mockPartnersData.existing_partners = mockPartnersData.existing_partners.filter((p: any) => p.id !== id);
    return mockPartnersData.existing_partners.length !== before;
  }),
  addWantedPartner: vi.fn((w) => {
    const newW = { ...w, id: "new-w-1", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mockPartnersData.wanted_partners.push(newW);
    return newW;
  }),
  updateWantedPartner: vi.fn((id, updates) => {
    const idx = mockPartnersData.wanted_partners.findIndex((w: any) => w.id === id);
    if (idx === -1) return null;
    mockPartnersData.wanted_partners[idx] = { ...mockPartnersData.wanted_partners[idx], ...updates };
    return mockPartnersData.wanted_partners[idx];
  }),
  deleteWantedPartner: vi.fn((id) => {
    const before = mockPartnersData.wanted_partners.length;
    mockPartnersData.wanted_partners = mockPartnersData.wanted_partners.filter((w: any) => w.id !== id);
    return mockPartnersData.wanted_partners.length !== before;
  }),
}));

describe("Partners Router API (/api/partners)", () => {
  beforeEach(() => {
    mockPartnersData = {
      existing_partners: [
        {
          id: "partner-1",
          name: "Partner One",
          logo_url: "https://example.com/logo.png",
          website_url: "https://example.com",
          description: "A great partner.",
          category: "Infrastructure",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      wanted_partners: [
        {
          id: "wanted-1",
          category: "Cloud & AI Infrastructure",
          target_companies: "Cloudflare",
          what_we_provide: "Platform integration",
          what_is_requested: "Compute credits",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    };
  });

  it("GET / returns public partners and wanted opportunities without authentication", async () => {
    const res = await app.request("/");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.existing_partners).toHaveLength(1);
    expect(data.existing_partners[0].name).toBe("Partner One");
    expect(data.wanted_partners).toHaveLength(1);
    expect(data.wanted_partners[0].category).toBe("Cloud & AI Infrastructure");
  });

  it("GET /admin denies unauthorized or non-admin users", async () => {
    const unauthRes = await app.request("/admin");
    expect(unauthRes.status).toBe(401);

    const userRes = await app.request("/admin", {
      headers: { Authorization: "Bearer user-token" },
    });
    expect(userRes.status).toBe(401);
  });

  it("GET /admin permits admin users", async () => {
    const res = await app.request("/admin", {
      headers: { Authorization: "Bearer admin-token" },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.existing_partners).toBeDefined();
    expect(data.wanted_partners).toBeDefined();
  });

  it("POST /admin/existing allows admins to create a new partner", async () => {
    const res = await app.request("/admin/existing", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({
        name: "New Partner Co",
        logo_url: "https://newco.com/logo.png",
        website_url: "https://newco.com",
        description: "Innovative studio.",
        category: "Game Studio",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.partner.name).toBe("New Partner Co");
    expect(mockPartnersData.existing_partners).toHaveLength(2);
  });

  it("PUT /admin/existing/:id updates existing partner", async () => {
    const res = await app.request("/admin/existing/partner-1", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({
        name: "Updated Partner Name",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.partner.name).toBe("Updated Partner Name");
  });

  it("DELETE /admin/existing/:id deletes partner", async () => {
    const res = await app.request("/admin/existing/partner-1", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer admin-token",
      },
    });

    expect(res.status).toBe(200);
    expect(mockPartnersData.existing_partners).toHaveLength(0);
  });

  it("POST /admin/wanted allows admins to create a wanted partner category", async () => {
    const res = await app.request("/admin/wanted", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({
        category: "Cybersecurity",
        target_companies: "Passkey providers",
        what_we_provide: "Integration & Testing",
        what_is_requested: "Threat feeds",
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.wanted.category).toBe("Cybersecurity");
    expect(mockPartnersData.wanted_partners).toHaveLength(2);
  });

  it("PUT /admin/wanted/:id updates wanted partner opportunity", async () => {
    const res = await app.request("/admin/wanted/wanted-1", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer admin-token",
      },
      body: JSON.stringify({
        target_companies: "Cloudflare, Akamai",
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wanted.target_companies).toBe("Cloudflare, Akamai");
  });

  it("DELETE /admin/wanted/:id deletes wanted partner opportunity", async () => {
    const res = await app.request("/admin/wanted/wanted-1", {
      method: "DELETE",
      headers: {
        Authorization: "Bearer admin-token",
      },
    });

    expect(res.status).toBe(200);
    expect(mockPartnersData.wanted_partners).toHaveLength(0);
  });
});
