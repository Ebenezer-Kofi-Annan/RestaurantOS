import React, { useRef, useState } from 'react';
import { ArrowRight, Check, CircleDollarSign, ClipboardList, CookingPot, Printer, ReceiptText, Wallet } from 'lucide-react';
import { Button, Empty, PageHeading, PaymentStatus, Status } from './components.jsx';
import { elapsed, money, nextState, orderNumber, orderPlace, parseMoney, time } from './format.mjs';

function LineItems({ items }) {
  return <ul className="line-items">{items.map((item, index) => <li key={index}>
    <span className="item-qty">{item.quantity}×</span><div><strong>{item.name}</strong>
      {item.modifiers.length > 0 && <small>{item.modifiers.map(modifier => modifier.name).join(' · ')}</small>}
      {item.note && <small className="kitchen-note">{item.note}</small>}
    </div></li>)}</ul>;
}

export function OrderAction({ order, disabled, advance }) {
  const step = nextState[order.status];
  if (!step || (order.status === 'SERVED' && !order.payment)) return null;
  const label = order.status === 'READY' && order.mode === 'TAKEAWAY' ? 'Hand over' : step[1];
  return <Button variant="secondary" icon={step[0] === 'COMPLETED' ? Check : ArrowRight} disabled={disabled} onClick={() => advance(order, step[0])}>{label}</Button>;
}

export function Kitchen({ orders, disabled, advance, viewOrder }) {
  const lanes = [
    { label: 'New', states: ['PLACED'] }, { label: 'In progress', states: ['ACCEPTED', 'PREPARING'] }, { label: 'Ready', states: ['READY'] },
  ];
  return <>
    <PageHeading title="Kitchen" />
    <div className="kitchen-grid">{lanes.map(lane => {
      const matches = orders.filter(order => lane.states.includes(order.status)).reverse();
      return <section className="kitchen-lane" key={lane.label} aria-label={lane.label}>
        <h2>{lane.label} <span className="tab-count">{matches.length}</span></h2>
        {matches.length ? matches.map(order => <article className="ticket panel" key={order.id}>
          <div className="ticket-heading"><button className="text-button" onClick={() => viewOrder(order.id)}>Order {orderNumber(order.number)}</button><small><span className="visually-hidden">Elapsed </span>{elapsed(order.createdAt)}</small></div>
          <p>{orderPlace(order)}</p><div className="badge-row"><Status status={order.status} /></div>
          <LineItems items={order.items} /><OrderAction order={order} disabled={disabled} advance={advance} />
        </article>) : <Empty icon={CookingPot} title="No tickets" />}
      </section>;
    })}</div>
  </>;
}

export function OrderList({ orders, viewOrder }) {
  return orders.length ? <ul className="order-list">{orders.map(order => <li key={order.id}>
    <button className="order-row" onClick={() => viewOrder(order.id)}>
      <span><strong>Order {orderNumber(order.number)}</strong><small>{orderPlace(order)} · {time(order.createdAt)}</small></span>
      <span className="badge-row"><Status status={order.status} /><PaymentStatus payment={order.payment} /></span>
      <strong>{money(order.total)}</strong><ArrowRight size={18} aria-hidden="true" />
    </button>
  </li>)}</ul> : <Empty icon={ClipboardList} title="No orders yet" />;
}

export function Orders({ orders, viewOrder }) {
  const [filter, setFilter] = useState('All orders');
  const matches = orders.filter(order => filter === 'All orders' || (filter === 'Active' ? order.status !== 'COMPLETED' : order.status === 'COMPLETED'));
  return <><PageHeading title="Orders" />
    <div className="filters">{['All orders', 'Active', 'Completed'].map(value => <button key={value} className={filter === value ? 'selected' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value}</button>)}</div>
    <OrderList orders={matches} viewOrder={viewOrder} />
  </>;
}

function CashForm({ order, busy, disabled, send, receipt }) {
  const [received, setReceived] = useState((order.total / 100).toFixed(2));
  const intent = useRef(null);
  const parsed = parseMoney(received);
  const valid = parsed !== null && parsed >= order.total;
  async function pay(event) {
    event.preventDefault();
    if (!valid || disabled) return;
    if (intent.current?.received !== parsed) intent.current = { key: crypto.randomUUID(), received: parsed };
    const result = await send(`/orders/${order.id}/cash`, 'POST', intent.current);
    if (result.ok) receipt({ ...order, payment: result.data });
  }
  return <form className="checkout" onSubmit={pay}>
    <h3>Cash checkout</h3><label>Cash received (MUR)<input inputMode="decimal" value={received} onChange={event => setReceived(event.target.value)} disabled={busy} required /></label>
    <dl className="totals"><div><dt>Amount due</dt><dd>{money(order.total)}</dd></div><div><dt>Change</dt><dd>{valid ? money(parsed - order.total) : '—'}</dd></div></dl>
    <Button type="submit" icon={Wallet} disabled={disabled || !valid}>{busy ? 'Saving…' : 'Record cash payment'}</Button>
  </form>;
}

export function OrderDetail({ order, disabled, busy, register, advance, send, openRegister, receipt }) {
  return <>
    <div className="badge-row"><Status status={order.status} /><PaymentStatus payment={order.payment} /></div>
    <LineItems items={order.items} />
    <dl className="totals"><div><dt>Order total</dt><dd>{money(order.total)}</dd></div></dl>
    <div className="actions"><OrderAction order={order} disabled={disabled} advance={advance} />
      {order.payment && <Button variant="secondary" icon={ReceiptText} onClick={() => receipt(order)}>View receipt</Button>}
    </div>
    {!order.payment && (register
      ? <CashForm key={order.id} order={order} busy={busy} disabled={disabled} send={send} receipt={receipt} />
      : <div className="checkout"><p>Open the register to take a cash payment.</p><Button variant="secondary" icon={CircleDollarSign} disabled={disabled} onClick={openRegister}>Open register</Button></div>)}
  </>;
}

export function Receipt({ order }) {
  const payment = order.payment;
  return <>
    <div className="receipt print-receipt">
      <h3>RestaurantOS · Port Louis</h3><p>Demo receipt {orderNumber(payment.number)} · {time(payment.createdAt)}</p>
      <p>Order {orderNumber(order.number)} · {orderPlace(order)}</p>
      <dl className="totals">
        {order.items.map((item, index) => <div key={index}><dt>{item.quantity}× {item.name}{item.modifiers.length > 0 && <small>{item.modifiers.map(modifier => modifier.name).join(' · ')}</small>}</dt><dd>{money(item.total)}</dd></div>)}
        <div className="total-line"><dt>Total paid</dt><dd>{money(payment.applied)}</dd></div>
        <div><dt>Cash received</dt><dd>{money(payment.received)}</dd></div><div><dt>Change</dt><dd>{money(payment.change)}</dd></div>
      </dl>
    </div>
    <Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print receipt</Button>
  </>;
}

export function RegisterForm({ register, disabled, busy, send, done }) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const counted = parseMoney(value);
  const variance = register && counted !== null ? counted - register.expected : null;
  async function submit(event) {
    event.preventDefault();
    if (disabled || counted === null) return;
    const result = await send(`/register/${register ? 'close' : 'open'}`, 'POST', register ? { sessionId: register.id, counted, note } : { opening: counted });
    if (result.ok) done(register ? 'Register closed.' : 'Register opened.');
  }
  return <form className="register-form" onSubmit={submit}>
    {register && <dl className="totals"><div><dt>Opening float</dt><dd>{money(register.opening)}</dd></div><div><dt>Cash sales</dt><dd>{money(register.cash)}</dd></div><div><dt>Expected in drawer</dt><dd>{money(register.expected)}</dd></div></dl>}
    <label>{register ? 'Counted cash (MUR)' : 'Opening float (MUR)'}<input required inputMode="decimal" placeholder="0.00" value={value} onChange={event => setValue(event.target.value)} /></label>
    {variance !== null && <p className="muted">Difference {money(variance)}</p>}
    {variance !== null && variance !== 0 && <label>Reason for cash difference<textarea required maxLength={240} value={note} onChange={event => setNote(event.target.value)} /></label>}
    <Button icon={Wallet} type="submit" disabled={disabled || counted === null || (variance !== null && variance !== 0 && !note.trim())}>{busy ? 'Saving…' : register ? 'Close register' : 'Open register'}</Button>
  </form>;
}

export function Inventory({ inventory }) {
  return <><PageHeading title="Inventory" /><section className="panel data-panel"><table>
    <thead><tr><th>Ingredient</th><th>On hand</th><th>Low stock at</th><th>Status</th></tr></thead>
    <tbody>{inventory.map(item => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.quantity.toLocaleString('en-MU')} {item.unit}</td><td>{item.lowAt.toLocaleString('en-MU')} {item.unit}</td><td><span className={`pill ${item.quantity <= item.lowAt ? 'unpaid' : 'status-completed'}`}>{item.quantity <= item.lowAt ? 'Low stock' : 'In stock'}</span></td></tr>)}</tbody>
  </table></section></>;
}

export function Reports({ data, manageRegister }) {
  const { register, lastClose, orders } = data;
  const completed = orders.filter(order => order.status === 'COMPLETED').length;
  return <><PageHeading title="Reports"><Button variant="secondary" icon={Wallet} onClick={manageRegister}>{register ? 'Close register' : 'Open register'}</Button></PageHeading>
    <div className="report-grid">
      <section className="panel report"><h2>Current register</h2>{register ? <dl className="totals"><div><dt>Opened</dt><dd>{time(register.openedAt)}</dd></div><div><dt>Opening float</dt><dd>{money(register.opening)}</dd></div><div><dt>Cash sales</dt><dd>{money(register.cash)}</dd></div><div className="total-line"><dt>Expected cash</dt><dd>{money(register.expected)}</dd></div></dl> : <p className="muted">The register is closed.</p>}</section>
      <section className="panel report"><h2>Last register close</h2>{lastClose ? <dl className="totals"><div><dt>Expected</dt><dd>{money(lastClose.expected)}</dd></div><div><dt>Counted</dt><dd>{money(lastClose.counted)}</dd></div><div className="total-line"><dt>Difference</dt><dd>{money(lastClose.variance)}</dd></div>{lastClose.note && <div><dt>Reason</dt><dd>{lastClose.note}</dd></div>}</dl> : <p className="muted">No register has been closed yet.</p>}</section>
      <section className="panel report"><h2>Orders</h2><dl className="totals"><div><dt>Active</dt><dd>{orders.length - completed}</dd></div><div><dt>Completed</dt><dd>{completed}</dd></div></dl></section>
    </div>
  </>;
}
