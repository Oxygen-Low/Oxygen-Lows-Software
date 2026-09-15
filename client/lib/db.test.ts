import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import db, { getAuthenticatedClient, LocalQueryBuilder, LocalChannel } from "./db";

// Mock the global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as any;

describe("getAuthenticatedClient", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    // Default mock response for fetch
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: "mock_data" }),
    });
  });

  it("returns default db when token is not provided", () => {
    const client = getAuthenticatedClient();
    expect(client).toBe(db);
  });

  it("returns an authenticated client with required methods when token is provided", () => {
    const token = "test_token_123";
    const client = getAuthenticatedClient(token);

    expect(client).not.toBe(db);
    expect(client).toHaveProperty("from");
    expect(client).toHaveProperty("rpc");
    expect(client).toHaveProperty("auth");
    expect(client).toHaveProperty("channel");
    expect(client).toHaveProperty("removeChannel");
    expect(client.auth).toBe(db.auth);
  });

  it("returns a LocalQueryBuilder with the correct token using from()", async () => {
    const token = "test_token_123";
    const client = getAuthenticatedClient(token);

    const queryBuilder = client.from("test_table");
    expect(queryBuilder).toBeInstanceOf(LocalQueryBuilder);

    // Execute to verify the token is used in the fetch request
    await queryBuilder.execute();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArgs = mockFetch.mock.calls[0];

    // Verify headers include the token
    const headers = fetchArgs[1].headers;
    expect(headers).toHaveProperty("Authorization", `Bearer ${token}`);
  });

  it("executes rpc calls with the correct token", async () => {
    const token = "test_token_123";
    const client = getAuthenticatedClient(token);

    await client.rpc("test_rpc", { arg1: "value1" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchArgs = mockFetch.mock.calls[0];

    // Verify endpoint and method
    expect(fetchArgs[0]).toBe("/api/data/rpc");
    expect(fetchArgs[1].method).toBe("POST");

    // Verify headers include the token
    const headers = fetchArgs[1].headers;
    expect(headers).toHaveProperty("Authorization", `Bearer ${token}`);

    // Verify body
    const body = JSON.parse(fetchArgs[1].body);
    expect(body).toEqual({ fn: "test_rpc", args: { arg1: "value1" } });
  });

  it("delegates channel and removeChannel to the default db", () => {
    const token = "test_token_123";
    const client = getAuthenticatedClient(token);

    // Test channel()
    const spyChannel = vi.spyOn(db, "channel");
    const channel = client.channel("test_channel");
    expect(spyChannel).toHaveBeenCalledWith("test_channel");
    expect(channel).toBeInstanceOf(LocalChannel);

    // Test removeChannel()
    const spyRemoveChannel = vi.spyOn(db, "removeChannel");
    client.removeChannel(channel);
    expect(spyRemoveChannel).toHaveBeenCalledWith(channel);

    spyChannel.mockRestore();
    spyRemoveChannel.mockRestore();
  });
});
