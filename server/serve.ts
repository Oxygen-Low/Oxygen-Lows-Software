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
    const reqPath = c.req.path;
    if (
      reqPath.startsWith('/api/') ||
      reqPath.startsWith('/assets/') ||
      /\.(js|css|wasm|map|json|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|mp3|wav|ogg)$/i.test(reqPath)
    ) {
      return c.notFound();
    }
    if (indexHtml) {
      return c.html(indexHtml, 200, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
    }
    return c.text('Not Found', 404);
  });
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const server = serve({
  fetch: app.fetch,
  port
}, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
