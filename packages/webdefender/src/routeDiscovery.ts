export function discoverRoutes(
  app: any,
): Array<{ method: string; path: string }> {
  const routes: Array<{ method: string; path: string }> = [];
  const seen = new Set<string>();

  if (!app) return routes;

  // Hono app detection
  if (app.routes && Array.isArray(app.routes)) {
    for (const route of app.routes) {
      if (
        route &&
        route.method &&
        route.path &&
        typeof route.method === "string"
      ) {
        const method = route.method.toUpperCase();
        if (method === "ALL") continue;

        const key = `${method}:${route.path}`;
        if (!seen.has(key)) {
          seen.add(key);
          routes.push({ method, path: route.path });
        }
      }
    }
    return routes.sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    );
  }

  // Express app detection
  if (app._router && app._router.stack) {
    function processExpressStack(stack: any[], basePath: string = "") {
      for (const layer of stack) {
        if (layer.route) {
          const path =
            basePath +
            (layer.route.path === "/" && basePath.length > 0
              ? ""
              : layer.route.path);
          const methods = layer.route.methods || {};

          for (const method of Object.keys(methods)) {
            if (methods[method]) {
              const uMethod = method.toUpperCase();
              const key = `${uMethod}:${path}`;
              if (!seen.has(key)) {
                seen.add(key);
                routes.push({ method: uMethod, path });
              }
            }
          }
        } else if (layer.name === "router" && layer.handle.stack) {
          // It's a router middleware
          let newBasePath = basePath;
          if (layer.regexp) {
            const match = layer.regexp
              .toString()
              .match(/^\/\^\\\/(.*?)\\\/\?\(\?\=\\\/\|\$\)\/i$/);
            if (match && match[1]) {
              newBasePath = basePath + "/" + match[1];
            }
          }
          processExpressStack(layer.handle.stack, newBasePath);
        }
      }
    }

    processExpressStack(app._router.stack);
    return routes.sort(
      (a, b) =>
        a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
    );
  }

  return routes;
}
