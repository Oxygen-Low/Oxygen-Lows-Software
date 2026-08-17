import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the createClient from @supabase/supabase-js
vi.mock("@supabase/supabase-js", async () => {
  const actual = await vi.importActual("@supabase/supabase-js");
  return {
    ...actual,
    createClient: vi.fn((url, key, options) => ({
      // a dummy mock client
      isMockClient: true,
      url,
      key,
    })),
  };
});

import { createClient } from "@supabase/supabase-js";

describe("getAuthenticatedClient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("should return the default client if no token is provided", async () => {
    const { getAuthenticatedClient, supabase } = await import("./supabase");
    const client = getAuthenticatedClient();
    expect(client).toBe(supabase);
    // createClient is called once when importing supabase.ts for the default client
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("should return the default client if the token is equal to supabaseAnonKey", async () => {
    const { getAuthenticatedClient, supabase } = await import("./supabase");
    // Since supabase isn't exporting anonKey, we can retrieve it from the default client's mock parameters
    const createClientMock = createClient as unknown as import("vitest").Mock;
    const anonKey = createClientMock.mock.calls[0][1];

    const client = getAuthenticatedClient(anonKey);
    expect(client).toBe(supabase);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("should create and cache a new client for a valid distinct token", async () => {
    const { getAuthenticatedClient, supabase } = await import("./supabase");

    const createClientMock = createClient as unknown as import("vitest").Mock;
    const url = createClientMock.mock.calls[0][0];
    const anonKey = createClientMock.mock.calls[0][1];

    const token = "my-custom-token-1";

    // Call the first time
    const client1 = getAuthenticatedClient(token);
    expect(client1).not.toBe(supabase);
    expect(createClient).toHaveBeenCalledTimes(2);

    // Assert that the client was created with the correct token
    expect(createClient).toHaveBeenLastCalledWith(
      url,
      anonKey,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false },
      }
    );

    // Call the second time with the same token
    const client2 = getAuthenticatedClient(token);
    // Should return the cached client
    expect(client2).toBe(client1);
    // createClient should not have been called again
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("should handle multiple different tokens gracefully", async () => {
    const { getAuthenticatedClient } = await import("./supabase");

    const token1 = "my-custom-token-1";
    const token2 = "my-custom-token-2";

    // Since we use vi.resetModules(), the map is clean.
    const client1 = getAuthenticatedClient(token1);
    expect(createClient).toHaveBeenCalledTimes(2); // 1 for default, 1 for token1

    const client2 = getAuthenticatedClient(token2);
    expect(createClient).toHaveBeenCalledTimes(3); // +1 for token2

    expect(client1).not.toBe(client2);
  });
});
