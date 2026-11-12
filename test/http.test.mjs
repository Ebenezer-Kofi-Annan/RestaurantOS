import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

test('the HTTP API runs a takeaway order from register opening to handover and cash close', async t => {
  const module = await import('../server/http.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url?.endsWith('/server/http.mjs')) return {};
    throw error;
  });
  assert.equal(typeof module.createHttpApp, 'function', 'The RestaurantOS HTTP app is available');
  const { createRestaurant } = await import('../server/app.mjs');
  const restaurant = await createRestaurant({ seedExamples: false });
  const server = module.createHttpApp(restaurant).listen(0, '127.0.0.1');
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await restaurant.close();
  });
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = async (route, method, body, status, origin = base) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
    assert.equal(response.status, status);
    return response.json();
  };
  const register = await send('/api/register/open', 'POST', { opening: 20000 }, 201);
  await send('/api/register/close', 'POST', { sessionId: register.id, counted: 20000 }, 403, 'https://unrelated.example');
  let order = await send('/api/orders', 'POST', { key: randomUUID(), mode: 'TAKEAWAY', items: [{ itemId: 'lemonade', quantity: 1 }] }, 201);
  await send(`/api/orders/${order.id}/cash`, 'POST', { key: randomUUID(), received: 20000 }, 201);
  for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']) {
    order = await send(`/api/orders/${order.id}/status`, 'PATCH', { status, version: order.version }, 200);
  }
  const result = await send('/api/register/close', 'POST', { sessionId: register.id, counted: 34000 }, 200);
  assert.equal(result.variance, 0);
  const response = await fetch(base + '/api/snapshot');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.orders[0].status, 'COMPLETED');
  assert.equal(data.orders[0].payment.change, 6000);
  assert.equal(data.lastClose.expected, 34000);
});
