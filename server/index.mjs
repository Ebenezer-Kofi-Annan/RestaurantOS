import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRestaurant } from './app.mjs';
import { createHttpApp } from './http.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.RESTAURANTOS_PORT ?? 4173);
const dev = process.argv.includes('--dev');
const staticDir = resolve(root, 'dist');

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('RESTAURANTOS_PORT must be a valid port.');
if (!dev && !existsSync(resolve(staticDir, 'index.html'))) throw new Error('Run npm run build before starting the PWA.');

const restaurant = await createRestaurant({
  dataDir: process.env.RESTAURANTOS_DATA_DIR ?? resolve(root, '.data', 'pgdata'),
  seedExamples: process.env.RESTAURANTOS_SEED_EXAMPLES !== '0',
});
const vite = dev ? await (await import('vite')).createServer({
  root, appType: 'spa',
  server: {
    middlewareMode: true, hmr: false,
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.data/**', '**/server/**', '**/test/**', '**/scripts/**'] },
  },
}) : null;

const app = createHttpApp(restaurant, vite ? { frontend: vite.middlewares } : { staticDir });
const server = app.listen(port, '127.0.0.1', () => console.log(`RestaurantOS is running at http://127.0.0.1:${port}`));

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await new Promise(resolve => server.close(resolve));
  await vite?.close();
  await restaurant.close();
}
server.on('error', async error => {
  console.error(error.message);
  process.exitCode = 1;
  await shutdown();
});
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
