export { DefenderClient } from './defender.js';
export { createExpressMiddleware } from './middleware.js';
export type { DefenderConfig, BlockedEvent, EventType, AppConfig, RouteConfig } from './types.js';
import { DefenderClient } from './defender.js';
import { createExpressMiddleware } from './middleware.js';
import { DefenderConfig } from './types.js';

// Convenience function
export async function createDefender(config: DefenderConfig, app?: any) {
  const client = new DefenderClient(config);
  await client.init(app);
  return {
    middleware: () => createExpressMiddleware(client),
    client,
  };
}
