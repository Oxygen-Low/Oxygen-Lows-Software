import app from './index.ts';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import fs from 'node:fs';
import path from 'node:path';

if (process.env.NODE_ENV === 'production') {
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.ok) {
      c.header('Cache-Control', 'public, max-age=31536000, immutable');
    }
  });

  app.get('*', serveStatic({ root: './dist/spa' }));
  
  let indexHtml = '';
  try {
    indexHtml = fs.readFileSync(path.resolve('./dist/spa/index.html'), 'utf-8');
  } catch (e) {
    console.error('Could not load index.html', e);
  }

  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.notFound();
    }
    if (indexHtml) {
      return c.html(indexHtml);
    }
    return c.text('Not Found', 404);
  });
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
console.log(`Server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port
});
