import { describe, it, expect, vi } from "vitest";
import { parseAiProxyError } from "./aiUtils";

describe("parseAiProxyError", () => {
  const createMockResponse = (options: {
    contentType?: string;
    status?: number;
    json?: any;
    text?: string;
    shouldThrow?: boolean;
  }) => {
    const headers = new Headers();
    if (options.contentType) {
      headers.set("content-type", options.contentType);
    }

    return {
      headers,
      status: options.status || 200,
      json: vi.fn().mockImplementation(async () => {
        if (options.shouldThrow) throw new Error("Mock error");
        return options.json;
      }),
      text: vi.fn().mockImplementation(async () => {
        if (options.shouldThrow) throw new Error("Mock error");
        return options.text || "";
      }),
    } as unknown as Response;
  };

  it("should extract error from application/json format { error: { message: '...' } }", async () => {
    const response = createMockResponse({
      contentType: "application/json",
      json: { error: { message: "Nested error message" } },
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe("Nested error message");
  });

  it("should extract error from application/json format { error: '...' }", async () => {
    const response = createMockResponse({
      contentType: "application/json",
      json: { error: "Direct error string" },
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe("Direct error string");
  });

  it("should extract error from application/json format { message: '...' }", async () => {
    const response = createMockResponse({
      contentType: "application/json",
      json: { message: "Message string" },
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe("Message string");
  });

  it("should return default message if application/json doesn't contain recognized format", async () => {
    const response = createMockResponse({
      contentType: "application/json",
      json: { unknown: "field" },
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe("Upstream service error");
  });

  it("should return specific message for status 413", async () => {
    const response = createMockResponse({
      status: 413,
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe("Request entity too large. Try a shorter message or smaller image.");
  });

  it("should return specific message if response is HTML", async () => {
    const response = createMockResponse({
      text: "<html><body>Error</body></html>",
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe("Received HTML error response from upstream service.");
  });

  it("should return text if response is just plain text", async () => {
    const response = createMockResponse({
      text: "Plain text error message",
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe("Plain text error message");
  });

  it("should catch and return parse error string if exception is thrown", async () => {
    const response = createMockResponse({
      contentType: "application/json",
      shouldThrow: true,
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe("Error parsing error response");
  });

  it("should stringify errorMessage if it is an object instead of string", async () => {
    const response = createMockResponse({
      contentType: "application/json",
      json: { error: { code: 500, details: "some details" } },
    });
    const result = await parseAiProxyError(response);
    expect(result).toBe('{"code":500,"details":"some details"}');
  });
});
