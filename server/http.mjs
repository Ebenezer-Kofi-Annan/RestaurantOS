import express from 'express';
import { resolve } from 'node:path';
import { RestaurantError } from './app.mjs';

export function createHttpApp(restaurant, { frontend, staticDir } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(req.headers.host ?? '')) {
      return res.status(403).json({ code: 'LOCAL_ONLY', message: 'Open the demo on localhost.' });
    }
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.get('Sec-Fetch-Site') === 'cross-site' || (req.get('Origin') && req.get('Origin') !== `http://${req.get('Host')}`)) {
      return res.status(403).json({ code: 'CROSS_ORIGIN', message: 'Open the demo directly to make changes.' });
    }
    if (['POST', 'PATCH'].includes(req.method) && !req.is('application/json')) {
      return res.status(415).json({ code: 'JSON_REQUIRED', message: 'Send a JSON request.' });
    }
    next();
  });
  api.use(express.json({ limit: '24kb' }));
  api.get('/snapshot', async (_req, res) => res.json(await restaurant.snapshot()));
  api.post('/orders', async (req, res) => res.status(201).json(await restaurant.placeOrder(req.body)));
  api.patch('/orders/:id/status', async (req, res) => res.json(await restaurant.transitionOrder(req.params.id, req.body)));
  api.post('/orders/:id/cash', async (req, res) => res.status(201).json(await restaurant.payCash(req.params.id, req.body)));
  api.post('/register/open', async (req, res) => res.status(201).json(await restaurant.openRegister(req.body)));
  api.post('/register/close', async (req, res) => {
    if (typeof req.body?.sessionId !== 'string') throw new RestaurantError(400, 'SESSION_REQUIRED', 'Choose the current register session.');
    res.json(await restaurant.closeRegister(req.body));
  });
  api.use((_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'The requested operation is unavailable.' }));
  app.use('/api', api);

  if (frontend) app.use(frontend);
  if (staticDir) {
    app.use('/assets', express.static(resolve(staticDir, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(staticDir, { maxAge: 0, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
  }

  app.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof RestaurantError) return res.status(error.status).json({ code: error.code, message: error.message });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ code: 'INVALID_JSON', message: 'The request body is not valid JSON.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ code: 'REQUEST_TOO_LARGE', message: 'This request is too large.' });
    console.error('RestaurantOS request failed:', error);
    res.status(500).json({ code: 'SERVER_ERROR', message: 'The server could not finish this request. Check the current state before retrying.' });
  });
  return app;
}
