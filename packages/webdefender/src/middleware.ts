import { DefenderClient, IncomingRequest } from './webdefender.js';

export function createExpressMiddleware(client: DefenderClient) {
  return async (req: any, res: any, next: any) => {
    try {
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || 'unknown';
      const normalizedIp = Array.isArray(ip) ? ip[0] : (typeof ip === 'string' ? ip.split(',')[0].trim() : String(ip));

      let bodyStr = '';
      if (req.body) {
        if (typeof req.body === 'string') {
          bodyStr = req.body;
        } else if (Buffer.isBuffer(req.body)) {
          bodyStr = req.body.toString();
        } else if (typeof req.body === 'object') {
          try {
            bodyStr = JSON.stringify(req.body);
          } catch (e) {}
        }
      }

      const defenderReq: IncomingRequest = {
        ip: normalizedIp,
        method: req.method || 'GET',
        path: req.path || req.url || '/',
        query: req.query || {},
        body: bodyStr,
        headers: req.headers || {},
        userAgent: req.headers['user-agent'] || ''
      };

      const result = await client.handleRequest(defenderReq);

      if (result.blocked) {
        return res.status(403).json({
          blocked: true,
          reason: result.reason || 'Request blocked by Defender'
        });
      }

      next();
    } catch (error) {
      // Fail open on error
      console.error('[Defender] Express middleware error:', error);
      next();
    }
  };
}
