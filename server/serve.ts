import app from './index.ts';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

if (process.env.NODE_ENV === 'production') {
  app.get('*', serveStatic({ root: './dist/spa' }));
}

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
console.log(`Server starting on port ${port}...`);

serve({
  fetch: app.fetch,
  port
});
