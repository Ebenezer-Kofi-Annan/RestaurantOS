import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const freshKey = () => randomUUID();
const wrap = { itemId: 'chicken-wrap', quantity: 1, modifiers: [], note: '' };

async function openApp(t, dataDir = ':memory:') {
  const module = await import('../server/app.mjs').catch(error => {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && error.url?.endsWith('/server/app.mjs')) return {};
    throw error;
  });
  assert.equal(typeof module.createRestaurant, 'function', 'RestaurantOS order service is available');
  const restaurant = await module.createRestaurant({ dataDir, seedExamples: false });
  if (t) t.after(() => restaurant.close());
  return restaurant;
}

const place = (restaurant, items = [wrap]) => restaurant.placeOrder({
  key: freshKey(), mode: 'DINE_IN', tableNumber: 1, items,
});

test('order retries preserve one server-priced order and reject a changed payload', async t => {
  const restaurant = await openApp(t);
  await restaurant.openRegister({ opening: 150000 });
  const payload = { key: freshKey(), mode: 'DINE_IN', tableNumber: 2,
    items: [{ ...wrap, quantity: 2, modifiers: ['extra-cheese'], note: 'No onion', price: 1 }] };
  const [first, replay] = await Promise.all([restaurant.placeOrder(payload), restaurant.placeOrder(payload)]);
  assert.equal(first.id, replay.id);
  assert.equal(first.total, 88000);
  assert.equal(first.items[0].note, 'No onion');
  await assert.rejects(restaurant.placeOrder({ ...payload, tableNumber: 3 }), { code: 'IDEMPOTENCY_CONFLICT' });
  assert.equal((await restaurant.snapshot()).orders.length, 1);
});

test('concurrent kitchen acceptance consumes frozen recipe quantities once', async t => {
  const restaurant = await openApp(t);
  await restaurant.openRegister({ opening: 0 });
  const order = await place(restaurant, [{ ...wrap, quantity: 2 }]);
  const advance = () => restaurant.transitionOrder(order.id, { version: order.version, status: 'ACCEPTED' });
  const results = await Promise.allSettled([advance(), advance()]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'ORDER_CHANGED');
  assert.equal((await restaurant.snapshot()).inventory.find(item => item.id === 'chicken').quantity, 4760);
});

test('insufficient stock rolls back acceptance and all ingredient deductions', async t => {
  const restaurant = await openApp(t);
  await restaurant.openRegister({ opening: 0 });
  const order = await place(restaurant, [{ ...wrap, quantity: 50 }]);
  await assert.rejects(restaurant.transitionOrder(order.id, { version: order.version, status: 'ACCEPTED' }), { code: 'INSUFFICIENT_STOCK' });
  const data = await restaurant.snapshot();
  assert.equal(data.orders[0].status, 'PLACED');
  assert.equal(data.inventory.find(item => item.id === 'chicken').quantity, 5000);
  assert.equal(data.inventory.find(item => item.id === 'wraps').quantity, 80);
});

test('cash tender is recorded once and closing compares counted cash to the drawer balance', async t => {
  const restaurant = await openApp(t);
  await assert.rejects(place(restaurant), { code: 'REGISTER_CLOSED' });
  await restaurant.openRegister({ opening: 150000 });
  const order = await place(restaurant);
  const payment = { key: freshKey(), received: 50000 };
  const [receipt, replay] = await Promise.all([restaurant.payCash(order.id, payment), restaurant.payCash(order.id, payment)]);
  assert.equal(receipt.number, replay.number);
  assert.equal(receipt.applied, 39000);
  assert.equal(receipt.change, 11000);
  await assert.rejects(restaurant.payCash(order.id, { key: freshKey(), received: 50000 }), { code: 'ALREADY_PAID' });
  await assert.rejects(restaurant.closeRegister({ counted: 188000, note: '' }), { code: 'VARIANCE_NOTE_REQUIRED' });
  const closed = await restaurant.closeRegister({ counted: 188000, note: 'Cash count short by ten rupees' });
  assert.equal(closed.expected, 189000);
  assert.equal(closed.variance, -1000);
});

test('an early payment does not complete kitchen work or clear a running table', async t => {
  const restaurant = await openApp(t);
  await restaurant.openRegister({ opening: 0 });
  let order = await place(restaurant);
  await restaurant.payCash(order.id, { key: freshKey(), received: 39000 });
  let data = await restaurant.snapshot();
  assert.equal(data.orders[0].status, 'PLACED');
  assert.equal(data.orders[0].payment.applied, 39000);
  await assert.rejects(restaurant.transitionOrder(order.id, { version: order.version, status: 'COMPLETED' }), { code: 'INVALID_TRANSITION' });
  for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED']) {
    order = await restaurant.transitionOrder(order.id, { version: order.version, status });
  }
  data = await restaurant.snapshot();
  assert.equal(data.orders[0].status, 'COMPLETED');
});

test('a fresh nested data directory persists paid orders and receipts across service restarts', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'restaurantos-'));
  const dataDir = join(parent, 'instance', 'pgdata');
  let restaurant;
  try {
    restaurant = await openApp(null, dataDir);
    await restaurant.openRegister({ opening: 0 });
    const order = await place(restaurant);
    await restaurant.payCash(order.id, { key: freshKey(), received: 39000 });
    await restaurant.close();
    restaurant = undefined;
    restaurant = await openApp(null, dataDir);
    const data = await restaurant.snapshot();
    assert.equal(data.orders[0].payment.applied, 39000);
    assert.equal(data.register.expected, 39000);
  } finally {
    await restaurant?.close();
    await rm(parent, { recursive: true, force: true });
  }
});
