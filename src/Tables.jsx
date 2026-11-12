import React from 'react';
import { ClipboardList, Clock3, EllipsisVertical, Plus, ShoppingBag, UserRound } from 'lucide-react';
import { Button, Empty, PageHeading, PaymentStatus, Status } from './components.jsx';
import { due, elapsed, money, orderNumber, twoDigits } from './format.mjs';

function TableCard({ number, orders, selectTable, newOrder, disabled }) {
  const amountDue = orders.reduce((total, order) => total + due(order), 0);
  const firstOrder = orders.at(-1);
  function menuAction(event, action) {
    event.currentTarget.closest('details').open = false;
    action();
  }
  return <article className={`table-card ${firstOrder ? 'table-running' : 'table-available'}`}>
    <button className="table-card-main" onClick={() => selectTable(number)} aria-label={`View Table ${twoDigits(number)}`}>
      <span className="table-amount"><small>{firstOrder ? 'Amount due' : 'Available'}</small><strong>{money(amountDue)}</strong></span>
      <span className="table-identity"><span className="table-number">{twoDigits(number)}</span><span>Table</span></span>
      <span className="table-facts">
        <span><small><UserRound />Waiter</small><strong>Unassigned</strong></span>
        <span><small><ClipboardList />Orders</small><strong>{orders.length}</strong></span>
        <span><small><Clock3 />Elapsed</small><strong>{firstOrder ? elapsed(firstOrder.createdAt) : '—'}</strong></span>
      </span>
    </button>
    <details className="card-menu"><summary className="icon-button" aria-label={`Actions for Table ${twoDigits(number)}`}><EllipsisVertical size={20} /></summary>
      <div className="card-menu-items"><button onClick={event => menuAction(event, () => selectTable(number))}>View orders</button>
        <button disabled={disabled} onClick={event => menuAction(event, () => newOrder('DINE_IN', number))}>New order</button></div>
    </details>
  </article>;
}

export default function Tables({ data, mode, setMode, newOrder, selectTable, selectOrder, disabled }) {
  const active = data.orders.filter(order => order.status !== 'COMPLETED');
  const takeaway = active.filter(order => order.mode === 'TAKEAWAY');
  return <>
    <PageHeading title="Running tables"><Button icon={Plus} onClick={() => newOrder(mode)} disabled={disabled}>New order</Button></PageHeading>
    <div className="tabs" role="group" aria-label="Fulfillment">
      <button className={mode === 'DINE_IN' ? 'selected' : ''} aria-pressed={mode === 'DINE_IN'} onClick={() => setMode('DINE_IN')}>Dine-in</button>
      <button className={mode === 'TAKEAWAY' ? 'selected' : ''} aria-pressed={mode === 'TAKEAWAY'} onClick={() => setMode('TAKEAWAY')}>Takeaway <span className="tab-count">{takeaway.length}</span></button>
    </div>
    {mode === 'DINE_IN'
      ? <section className="table-grid" aria-label="Dining room tables">{data.tables.map(number => <TableCard key={number} number={number} orders={active.filter(order => order.tableNumber === number)} selectTable={selectTable} newOrder={newOrder} disabled={disabled} />)}</section>
      : takeaway.length ? <section className="table-grid" aria-label="Takeaway orders">{takeaway.map(order => <button className="pickup-card" key={order.id} onClick={() => selectOrder(order.id)}>
        <span className="pickup-top"><span className="square-icon"><ShoppingBag size={20} /></span><span className="muted"><Clock3 size={15} /> {elapsed(order.createdAt)}</span></span>
        <strong>Collection {orderNumber(order.number)}</strong><span className="pickup-amount">{money(order.total)}</span>
        <span className="badge-row"><Status status={order.status} /><PaymentStatus payment={order.payment} /></span>
      </button>)}</section>
        : <Empty icon={ShoppingBag} title="No takeaway orders"><Button icon={Plus} onClick={() => newOrder('TAKEAWAY')} disabled={disabled}>New takeaway order</Button></Empty>}
  </>;
}
