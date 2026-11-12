import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('the worker keeps API requests on the network and serves the app shell on failed navigation', async () => {
  const worker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const handlers = new Map();
  vm.runInNewContext(worker, {
    self: { addEventListener: (name, handler) => handlers.set(name, handler), location: { origin: 'http://127.0.0.1:4173' } },
    URL, fetch: () => Promise.reject(new Error('Connection unavailable')),
    caches: { open: async () => ({ match: async path => path === '/index.html' ? 'app shell' : undefined }) },
  });
  assert.equal(typeof handlers.get('fetch'), 'function', 'The service worker handles app navigation');
  const request = (path, method = 'GET', mode = 'cors') => {
    let response;
    handlers.get('fetch')({ request: { url: `http://127.0.0.1:4173${path}`, method, mode }, respondWith: value => { response = value; } });
    return response;
  };
  assert.equal(request('/api/snapshot'), undefined);
  assert.equal(request('/api/orders', 'POST'), undefined);
  assert.equal(await request('/', 'GET', 'navigate'), 'app shell');
});
