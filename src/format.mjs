const currency = new Intl.NumberFormat('en-MU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clock = new Intl.DateTimeFormat('en-MU', { timeZone: 'Indian/Mauritius', hour: '2-digit', minute: '2-digit', hour12: false });

export const money = cents => `MUR ${currency.format(cents / 100)}`;
export const time = date => clock.format(new Date(date));
export const twoDigits = number => String(number).padStart(2, '0');
export const orderNumber = number => `#${String(number).padStart(3, '0')}`;
export const elapsed = date => `${Math.max(0, Math.floor((Date.now() - new Date(date)) / 60000))} min`;
export const due = order => order.total - (order.payment?.applied ?? 0);
export const orderPlace = order => order.mode === 'DINE_IN' ? `Table ${twoDigits(order.tableNumber)}` : 'Takeaway';

export function parseMoney(value) {
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ''] = value.trim().split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return cents <= 100000000 ? cents : null;
}

export const statusNames = {
  PLACED: 'New order', ACCEPTED: 'Accepted', PREPARING: 'Preparing', READY: 'Ready', SERVED: 'Served', COMPLETED: 'Completed',
};

export const nextState = {
  PLACED: ['ACCEPTED', 'Accept order'], ACCEPTED: ['PREPARING', 'Start preparing'],
  PREPARING: ['READY', 'Mark ready'], READY: ['SERVED', 'Mark served'], SERVED: ['COMPLETED', 'Complete order'],
};
