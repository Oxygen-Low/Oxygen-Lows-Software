import { describe, it, expect } from "vitest";
import { discoverRoutes } from "./routeDiscovery";

describe("discoverRoutes", () => {
  describe("Edge cases and unrecognized apps", () => {
    it("should return empty array for null or undefined app", () => {
      expect(discoverRoutes(null)).toEqual([]);
      expect(discoverRoutes(undefined)).toEqual([]);
    });

    it("should return empty array for empty object or unrecognized app structure", () => {
      expect(discoverRoutes({})).toEqual([]);
      expect(discoverRoutes({ someField: "value" })).toEqual([]);
      expect(discoverRoutes({ routes: {} })).toEqual([]); // not an array
    });
  });

  describe("Hono app detection", () => {
    it("should extract standard methods and paths", () => {
      const mockApp = {
        routes: [
          { method: "GET", path: "/api/users" },
          { method: "post", path: "/api/users" }, // lowercase
          { method: "GET", path: "/api/status" },
        ],
      };

      const result = discoverRoutes(mockApp);

      expect(result).toEqual([
        { method: "GET", path: "/api/status" },
        { method: "GET", path: "/api/users" },
        { method: "POST", path: "/api/users" },
      ]);
    });

    it("should skip ALL method", () => {
      const mockApp = {
        routes: [
          { method: "ALL", path: "/api/catchall" },
          { method: "GET", path: "/api/catchall" },
        ],
      };

      expect(discoverRoutes(mockApp)).toEqual([
        { method: "GET", path: "/api/catchall" },
      ]);
    });

    it("should deduplicate identical routes", () => {
      const mockApp = {
        routes: [
          { method: "GET", path: "/dup" },
          { method: "GET", path: "/dup" },
        ],
      };

      expect(discoverRoutes(mockApp)).toEqual([
        { method: "GET", path: "/dup" },
      ]);
    });

    it("should handle malformed routes gracefully", () => {
      const mockApp = {
        routes: [
          { path: "/missing-method" },
          { method: "GET" }, // missing path
          { method: 123, path: "/num-method" }, // wrong type
          null,
        ],
      };

      expect(discoverRoutes(mockApp)).toEqual([]);
    });
  });

  describe("Express app detection", () => {
    it("should extract simple root-level routes", () => {
      const mockApp = {
        _router: {
          stack: [
            {
              route: {
                path: "/api/users",
                methods: { get: true, post: true, put: false },
              },
            },
            {
              route: {
                path: "/api/status",
                methods: { get: true },
              },
            },
          ],
        },
      };

      const result = discoverRoutes(mockApp);

      expect(result).toEqual([
        { method: "GET", path: "/api/status" },
        { method: "GET", path: "/api/users" },
        { method: "POST", path: "/api/users" },
      ]);
    });

    it("should handle path concatenation with root path /", () => {
      const mockApp = {
        _router: {
          stack: [
            {
              route: {
                path: "/",
                methods: { get: true },
              },
            },
          ],
        },
      };

      expect(discoverRoutes(mockApp)).toEqual([{ method: "GET", path: "/" }]);
    });

    it("should process nested router middleware with regex", () => {
      const mockApp = {
        _router: {
          stack: [
            {
              name: "router",
              // mock RegExp that will match the regex in processExpressStack
              // /^\/\^\\\/(.*?)\\\/\?\(\?\=\\\/\|\$\)\/i$/
              regexp: {
                toString: () => "/^\\/api\\/?(?=\\/|$)/i",
              },
              handle: {
                stack: [
                  {
                    route: {
                      path: "/users",
                      methods: { get: true },
                    },
                  },
                  {
                    route: {
                      path: "/",
                      methods: { get: true },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = discoverRoutes(mockApp);

      expect(result).toEqual([
        { method: "GET", path: "/api" },
        { method: "GET", path: "/api/users" },
      ]);
    });

    it("should process nested router middleware without matching regex", () => {
      const mockApp = {
        _router: {
          stack: [
            {
              name: "router",
              regexp: /something else/,
              handle: {
                stack: [
                  {
                    route: {
                      path: "/users",
                      methods: { get: true },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      const result = discoverRoutes(mockApp);

      expect(result).toEqual([{ method: "GET", path: "/users" }]);
    });

    it("should deduplicate express routes", () => {
      const mockApp = {
        _router: {
          stack: [
            {
              route: {
                path: "/dup",
                methods: { get: true },
              },
            },
            {
              route: {
                path: "/dup",
                methods: { get: true },
              },
            },
          ],
        },
      };

      expect(discoverRoutes(mockApp)).toEqual([
        { method: "GET", path: "/dup" },
      ]);
    });
  });
});
