import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { join } from 'node:path';

const browserDistFolder = join(import.meta.dirname, '../browser');

const app = express();
const angularApp = new AngularNodeAppEngine();

/**
 * The frontend calls the API through the relative `/api` path (see
 * src/environment.ts). `ng serve` resolves that via proxy.conf.json, but
 * this production server has no such thing, so it proxies here instead.
 */
const backendOrigin = process.env['BACKEND_ORIGIN'] || 'http://localhost:8080';

app.use(
  '/api',
  createProxyMiddleware({
    target: backendOrigin,
    changeOrigin: true,
    pathRewrite: { '^/api': '' },
  })
);

/**
 * The chat WebSocket connects same-origin to `/ws` whenever the page isn't
 * served from localhost (see ChatService.getConfiguredWebSocketUrl), so this
 * needs proxying too. Upgrade requests bypass Express's middleware chain, so
 * the proxy's `.upgrade` handler is wired to the HTTP server directly below.
 */
const wsProxy = createProxyMiddleware({
  target: backendOrigin,
  changeOrigin: true,
  ws: true,
});

app.use('/ws', wsProxy);

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  const server = app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });

  server.on('upgrade', wsProxy.upgrade);
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);
