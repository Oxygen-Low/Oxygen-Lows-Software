export { DefenderClient } from "./webdefender.js";
export { ThreatActorDetector } from "./threatActors.js";
export { VpnDetector, matchesIpOrCidr, parseCidr, isIpInCidr } from "./vpn.js";
export { TorDetector } from "./tor.js";
export {
  detectSqlInjection,
  detectShellInjection,
  detectPathTraversal,
  detectSsrf,
  detectXss,
  detectNoSqlInjection,
  detectPrototypePollution,
  scanRequest,
} from "./scanner/injection.js";
export { createExpressMiddleware } from "./middleware.js";
export { createCloudflareDefender, withDefender } from "./cloudflare.js";
export type {
  CloudflareDefenderConfig,
  CloudflareWorkerHandler,
  CloudflareDefenderInstance,
} from "./cloudflare.js";
export type {
  DefenderConfig,
  BlockedEvent,
  EventType,
  AppConfig,
  RouteConfig,
  RateLimitInfo,
  ThreatActorCategory,
} from "./types.js";
import { DefenderClient } from "./webdefender.js";
import { createExpressMiddleware } from "./middleware.js";
import { DefenderConfig } from "./types.js";

// Convenience function
export async function createDefender(config: DefenderConfig, app?: any) {
  const client = new DefenderClient(config);
  await client.init(app);
  return {
    middleware: () => createExpressMiddleware(client),
    client,
  };
}
