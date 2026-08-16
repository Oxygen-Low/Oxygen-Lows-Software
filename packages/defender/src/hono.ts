import { DefenderClient } from './defender.js';
import { DefenderConfig } from './types.js';

export async function createDefender(config: DefenderConfig): Promise<any> {
  const client = new DefenderClient(config);
  await client.init(); // note: for route discovery in hono you might want to call init(app) separately, but this is the middleware generator

  return async (c: any, next: any) => {
    try {
      const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
      const normalizedIp = ip.split(',')[0].trim();
      
      let bodyStr = '';
      try {
        const text = await c.req.text();
        bodyStr = text || '';
      } catch (e) {
        // Can't read body, ignore
      }

      // Hono parses query as Record<string, string | string[]>
      const query = c.req.queries() || {};

      const reqInfo = {
        ip: normalizedIp,
        method: c.req.method,
        path: new URL(c.req.url).pathname,
        query: query,
        body: bodyStr,
        headers: c.req.header(),
        userAgent: c.req.header('user-agent') || ''
      };

      const result = await client.handleRequest(reqInfo);

      if (result.blocked) {
        return c.json({
          blocked: true,
          reason: result.reason || 'Request blocked by Defender'
        }, 403);
      }

      await next();
    } catch (error) {
      console.error('[Defender] Hono middleware error:', error);
      await next();
    }
  };
}
