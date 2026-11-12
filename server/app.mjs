import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { ingredients, menu, tables } from './catalog.mjs';

const states = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
const menuById = new Map(menu.map(item => [item.id, item]));
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');

export class RestaurantError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function reject(status, code, message) {
  throw new RestaurantError(status, code, message);
}

function getKey(value) {
  if (typeof value !== 'string' || !uuid.test(value)) reject(400, 'INVALID_KEY', 'A valid request ID is required.');
  return value.toLowerCase();
}

function amount(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) {
    reject(400, 'INVALID_AMOUNT', 'Enter a valid amount in MUR.');
  }
  return value;
}

function cleanText(value, limit) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > limit) reject(400, 'INVALID_TEXT', `Enter no more than ${limit} characters.`);
  return value.trim();
}

async function one(db, sql, params) {
  return (await db.query(sql, params)).rows[0];
}

function parseOrder({ key, mode, tableNumber, items } = {}) {
  if (mode !== 'DINE_IN' && mode !== 'TAKEAWAY') reject(400, 'INVALID_MODE', 'Choose dine-in or takeaway.');
  if (mode === 'DINE_IN' && !tables.includes(tableNumber)) reject(400, 'INVALID_TABLE', 'Choose a valid table.');
  if (mode === 'TAKEAWAY' && tableNumber != null) reject(400, 'INVALID_TABLE', 'Takeaway does not use a table.');
  if (!Array.isArray(items) || !items.length || items.length > 40) reject(400, 'INVALID_ITEMS', 'Add between 1 and 40 lines.');
  const cleaned = items.map(line => {
    if (!line || typeof line.itemId !== 'string' || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 50) {
      reject(400, 'INVALID_ITEMS', 'Choose an item and a quantity from 1 to 50.');
    }
    const modifiers = line.modifiers ?? [];
    if (!Array.isArray(modifiers) || modifiers.length > 12 || modifiers.some(id => typeof id !== 'string') || new Set(modifiers).size !== modifiers.length) {
      reject(400, 'INVALID_MODIFIER', 'Choose each modifier once.');
    }
    return { itemId: line.itemId, quantity: line.quantity, modifiers: [...modifiers].sort(), note: cleanText(line.note, 160) };
  });
  const request = { mode, tableNumber: tableNumber ?? null, items: cleaned };
  return { ...request, key: getKey(key), hash: createHash('sha256').update(JSON.stringify(request)).digest('hex') };
}

function priceOrder(items) {
  const requirements = {};
  const lines = items.map(line => {
    const item = menuById.get(line.itemId);
    if (!item) reject(400, 'ITEM_UNAVAILABLE', 'One of the items is unavailable.');
    const modifiers = line.modifiers.map(id => {
      const modifier = item.modifiers.find(option => option.id === id);
      if (!modifier) reject(400, 'INVALID_MODIFIER', 'This modifier is unavailable for the selected item.');
      return modifier;
    });
    for (const recipe of [item.recipe, ...modifiers.map(modifier => modifier.recipe)]) {
      for (const [ingredient, quantity] of Object.entries(recipe)) {
        requirements[ingredient] = (requirements[ingredient] ?? 0) + line.quantity * quantity;
      }
    }
    const unitPrice = item.price + modifiers.reduce((total, modifier) => total + modifier.price, 0);
    return {
      itemId: item.id, name: item.name, quantity: line.quantity, note: line.note, unitPrice,
      modifiers: modifiers.map(({ id, name, price }) => ({ id, name, price })), total: line.quantity * unitPrice,
    };
  });
  return { lines, requirements, total: lines.reduce((total, line) => total + line.total, 0) };
}

function paymentView(row) {
  return row ? { number: row.number, received: row.received, applied: row.applied, change: row.received - row.applied, createdAt: row.created_at } : null;
}

function orderView(row, payment) {
  return {
    id: row.id, number: row.number, mode: row.mode, tableNumber: row.table_number, status: row.status,
    version: row.version, total: row.total, items: row.items, createdAt: row.created_at, payment: paymentView(payment),
  };
}

async function history(tx, order) {
  await tx.query('INSERT INTO order_history (order_id, version, status) VALUES ($1, $2, $3)', [order.id, order.version, order.status]);
}

async function insertOrder(tx, request) {
  const priced = priceOrder(request.items);
  const row = await one(tx, `INSERT INTO orders (id, request_key, request_hash, mode, table_number, total, items, requirements)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`, [randomUUID(), request.key, request.hash, request.mode,
    request.tableNumber, priced.total, JSON.stringify(priced.lines), JSON.stringify(priced.requirements)]);
  await history(tx, row);
  return row;
}

async function consumeStock(tx, order) {
  for (const [id, quantity] of Object.entries(order.requirements).sort(([a], [b]) => a.localeCompare(b))) {
    const ingredient = await one(tx, 'SELECT * FROM ingredients WHERE id = $1 FOR UPDATE', [id]);
    if (!ingredient || ingredient.quantity < quantity) {
      reject(409, 'INSUFFICIENT_STOCK', `There is not enough ${ingredient?.name.toLowerCase() ?? 'stock'} to accept this order.`);
    }
    await tx.query('UPDATE ingredients SET quantity = quantity - $2 WHERE id = $1', [id, quantity]);
    await tx.query('INSERT INTO stock_movements (order_id, ingredient_id, quantity) VALUES ($1, $2, $3)', [order.id, id, -quantity]);
  }
}

async function getOrder(tx, id) {
  const row = await one(tx, 'SELECT * FROM orders WHERE id = $1 FOR UPDATE', [getKey(id)]);
  if (!row) reject(404, 'ORDER_NOT_FOUND', 'This order could not be found.');
  return row;
}

const getPayment = (tx, id) => one(tx, 'SELECT * FROM cash_payments WHERE order_id = $1', [id]);

async function getRegister(tx, lock = false) {
  return one(tx, `SELECT * FROM register_sessions WHERE closed_at IS NULL${lock ? ' FOR UPDATE' : ''}`);
}

async function requireRegister(tx) {
  const active = await getRegister(tx, true);
  if (!active) reject(409, 'REGISTER_CLOSED', 'Open the cash register before taking an order or recording payment.');
  return active;
}

async function registerView(tx, row) {
  if (!row) return null;
  const { cash } = await one(tx, 'SELECT COALESCE(SUM(applied), 0)::int AS cash FROM cash_payments WHERE session_id = $1', [row.id]);
  const expected = row.expected ?? row.opening + cash;
  return { id: row.id, openedAt: row.opened_at, closedAt: row.closed_at, opening: row.opening,
    cash, expected, counted: row.counted, variance: row.counted === null ? null : row.counted - expected, note: row.note };
}

async function seed(db, includeExamples) {
  await db.transaction(async tx => {
    const first = await one(tx, 'INSERT INTO demo_configuration (id) VALUES (1) ON CONFLICT DO NOTHING RETURNING id');
    if (!first) return;
    for (const item of ingredients) {
      await tx.query('INSERT INTO ingredients (id, name, quantity, unit, low_at) VALUES ($1, $2, $3, $4, $5)',
        [item.id, item.name, item.quantity, item.unit, item.lowAt]);
    }
    if (!includeExamples) return;
    const examples = [
      { tableNumber: 1, minutes: 24, status: 'PREPARING', items: [['chicken-wrap', 2], ['lemonade', 1]] },
      { tableNumber: 2, minutes: 18, status: 'READY', items: [['paneer-wrap', 1], ['fries', 1]] },
      { tableNumber: 3, minutes: 42, status: 'SERVED', items: [['rice-bowl', 2], ['lemonade', 2]] },
      { tableNumber: 4, minutes: 12, status: 'PLACED', items: [['chicken-wrap', 1]] },
      { tableNumber: 5, minutes: 31, status: 'PREPARING', items: [['paneer-wrap', 2], ['espresso', 1]] },
      { tableNumber: 6, minutes: 15, status: 'ACCEPTED', items: [['chicken-wrap', 1], ['fries', 1]] },
      { tableNumber: null, minutes: 8, status: 'PREPARING', items: [['rice-bowl', 1], ['lemonade', 1]] },
    ];
    for (const example of examples) {
      let order = await insertOrder(tx, parseOrder({ key: randomUUID(), tableNumber: example.tableNumber,
        mode: example.tableNumber ? 'DINE_IN' : 'TAKEAWAY', items: example.items.map(([itemId, quantity]) => ({ itemId, quantity })) }));
      await tx.query('UPDATE orders SET created_at = $2 WHERE id = $1', [order.id, new Date(Date.now() - example.minutes * 60000)]);
      for (const status of states.slice(1, states.indexOf(example.status) + 1)) {
        if (status === 'ACCEPTED') await consumeStock(tx, order);
        order = await one(tx, 'UPDATE orders SET status = $2, version = version + 1 WHERE id = $1 RETURNING *', [order.id, status]);
        await history(tx, order);
      }
    }
  });
}

export async function createRestaurant({ dataDir = ':memory:', seedExamples = true } = {}) {
  if (dataDir !== ':memory:') await mkdir(dataDir, { recursive: true });
  const db = new PGlite(dataDir === ':memory:' ? undefined : dataDir);
  try {
    await db.exec(schema);
    await seed(db, seedExamples);
  } catch (error) {
    await db.close();
    throw error;
  }

  return {
    close: () => db.close(),

    snapshot: () => db.transaction(async tx => {
      const { rows: orderRows } = await tx.query('SELECT * FROM orders ORDER BY number DESC');
      const { rows: paymentRows } = await tx.query('SELECT * FROM cash_payments');
      const payments = new Map(paymentRows.map(row => [row.order_id, row]));
      const { rows: stock } = await tx.query('SELECT id, name, quantity, unit, low_at AS "lowAt" FROM ingredients ORDER BY name');
      const last = await one(tx, 'SELECT * FROM register_sessions WHERE closed_at IS NOT NULL ORDER BY closed_at DESC LIMIT 1');
      return {
        tables, menu: menu.map(({ recipe, modifiers, ...item }) => ({ ...item, modifiers: modifiers.map(({ recipe, ...option }) => option) })),
        orders: orderRows.map(row => orderView(row, payments.get(row.id))), inventory: stock,
        register: await registerView(tx, await getRegister(tx)), lastClose: await registerView(tx, last),
      };
    }),

    openRegister: ({ opening } = {}) => db.transaction(async tx => {
      amount(opening);
      if (await getRegister(tx, true)) reject(409, 'REGISTER_OPEN', 'The register is already open.');
      const row = await one(tx, 'INSERT INTO register_sessions (id, opening) VALUES ($1, $2) RETURNING *', [randomUUID(), opening]);
      return registerView(tx, row);
    }),

    closeRegister: ({ sessionId, counted, note } = {}) => db.transaction(async tx => {
      amount(counted);
      const reason = cleanText(note, 240);
      const row = await requireRegister(tx);
      if (sessionId !== undefined && getKey(sessionId) !== row.id) reject(409, 'REGISTER_CHANGED', 'The active register changed. Review the current session.');
      const { expected } = await registerView(tx, row);
      if (counted !== expected && !reason) reject(400, 'VARIANCE_NOTE_REQUIRED', 'Add a reason for the cash difference.');
      const closed = await one(tx, `UPDATE register_sessions SET closed_at = now(), counted = $2, expected = $3, note = $4
        WHERE id = $1 RETURNING *`, [row.id, counted, expected, reason]);
      return registerView(tx, closed);
    }),

    placeOrder: payload => db.transaction(async tx => {
      const request = parseOrder(payload);
      const previous = await one(tx, 'SELECT * FROM orders WHERE request_key = $1', [request.key]);
      if (previous) {
        if (previous.request_hash !== request.hash) reject(409, 'IDEMPOTENCY_CONFLICT', 'This request ID belongs to a different order.');
        return orderView(previous, await getPayment(tx, previous.id));
      }
      await requireRegister(tx);
      return orderView(await insertOrder(tx, request));
    }),

    transitionOrder: (id, { version, status } = {}) => db.transaction(async tx => {
      const order = await getOrder(tx, id);
      if (order.version !== version) reject(409, 'ORDER_CHANGED', 'The order changed. Review its latest status before continuing.');
      if (typeof status !== 'string' || states[states.indexOf(order.status) + 1] !== status) {
        reject(409, 'INVALID_TRANSITION', 'This order cannot move to that status yet.');
      }
      const payment = await getPayment(tx, id);
      if (status === 'COMPLETED' && !payment) reject(409, 'PAYMENT_REQUIRED', 'Record payment before completing the order.');
      if (status === 'ACCEPTED') await consumeStock(tx, order);
      const updated = await one(tx, 'UPDATE orders SET status = $2, version = version + 1 WHERE id = $1 RETURNING *', [id, status]);
      await history(tx, updated);
      return orderView(updated, payment);
    }),

    payCash: (id, { key, received } = {}) => db.transaction(async tx => {
      const requestKey = getKey(key);
      amount(received);
      const order = await getOrder(tx, id);
      const previous = await one(tx, 'SELECT * FROM cash_payments WHERE request_key = $1', [requestKey]);
      if (previous) {
        if (previous.order_id !== order.id || previous.received !== received) reject(409, 'IDEMPOTENCY_CONFLICT', 'This request ID belongs to a different payment.');
        return paymentView(previous);
      }
      if (await getPayment(tx, id)) reject(409, 'ALREADY_PAID', 'This order has already been paid.');
      const active = await requireRegister(tx);
      if (received < order.total) reject(400, 'INSUFFICIENT_CASH', 'Cash received must cover the order total.');
      const paid = await one(tx, `INSERT INTO cash_payments (order_id, request_key, session_id, applied, received)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`, [order.id, requestKey, active.id, order.total, received]);
      return paymentView(paid);
    }),
  };
}
