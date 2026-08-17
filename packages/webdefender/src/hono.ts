import { DefenderClient } from './webdefender.js';
import { DefenderConfig } from './types.js';

export async function createDefender(config: DefenderConfig, app?: any): Promise<any> {
  const client = new DefenderClient(config);
  await client.init(app);

  return async (c: any, next: any) => {
    try {
      const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
      const normalizedIp = ip.split(',')[0].trim();
      
      let bodyStr = '';
      try {
        if (['POST', 'PUT', 'PATCH'].includes(c.req.method.toUpperCase())) {
          const raw = c.req.raw.clone();
          const text = await raw.text();
          bodyStr = text || '';
        }
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
