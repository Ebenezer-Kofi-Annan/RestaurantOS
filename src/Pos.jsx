import React, { useState } from 'react';
import { ArrowRight, CircleDollarSign, ClipboardList, Minus, Plus, Search, ShoppingBasket, Trash2 } from 'lucide-react';
import { Button, Empty, PageHeading } from './components.jsx';
import { money, orderNumber, twoDigits } from './format.mjs';

export const newDraft = (mode = 'DINE_IN', tableNumber = '') => ({ mode, tableNumber, lines: [], unconfirmed: false });

export default function Pos({ data, draft, setDraft, intent, connected, busy, send, openRegister, placed }) {
  const [category, setCategory] = useState('All items');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);
  const { unconfirmed } = draft;
  const categories = ['All items', ...new Set(data.menu.map(item => item.category))];
  const matches = data.menu.filter(item => (category === 'All items' || item.category === category) && item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const total = draft.lines.reduce((sum, line) => sum + line.quantity * (line.item.price + line.item.modifiers.filter(option => line.modifiers.includes(option.id)).reduce((acc, option) => acc + option.price, 0)), 0);

  const updateLine = (id, update) => setDraft(previous => ({ ...previous, lines: previous.lines.map(line => line.id === id ? update(line) : line).filter(line => line.quantity > 0) }));

  function addItem(item) {
    const same = draft.lines.find(line => line.item.id === item.id && !line.modifiers.length && !line.note && line.quantity < 50);
    if (same) return updateLine(same.id, line => ({ ...line, quantity: line.quantity + 1 }));
    const line = { id: crypto.randomUUID(), item, quantity: 1, modifiers: [], note: '' };
    setDraft(previous => ({ ...previous, lines: [...previous.lines, line] }));
  }

  async function submit(event) {
    event.preventDefault();
    const payload = { mode: draft.mode, tableNumber: draft.mode === 'DINE_IN' ? Number(draft.tableNumber) : null,
      items: draft.lines.map(({ item, quantity, modifiers, note }) => ({ itemId: item.id, quantity, modifiers, note })) };
    const body = JSON.stringify(payload);
    if (intent.current?.body !== body) intent.current = { body, key: crypto.randomUUID() };
    const result = await send('/orders', 'POST', { ...payload, key: intent.current.key });
    if (!result.ok) {
      if (result.uncertain) setDraft(previous => ({ ...previous, unconfirmed: true }));
      return;
    }
    intent.current = null;
    setExpanded(null);
    setDraft(newDraft(draft.mode, draft.tableNumber));
    placed(result.data.id, orderNumber(result.data.number));
  }

  const editDisabled = busy || unconfirmed;
  return <>
    <PageHeading title="Point of sale">{!data.register && <Button variant="secondary" icon={CircleDollarSign} onClick={openRegister} disabled={!connected}>Open register</Button>}</PageHeading>
    <div className="pos-layout">
      <section className="catalog" aria-label="Menu">
        <label className="search"><Search size={19} /><input type="search" placeholder="Search the menu" aria-label="Search the menu" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <div className="filters" aria-label="Menu category">{categories.map(name => <button key={name} className={category === name ? 'selected' : ''} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
        {matches.length ? <div className="menu-grid">{matches.map(item => <button className="menu-card" key={item.id} disabled={editDisabled || draft.lines.length >= 40} onClick={() => addItem(item)}>
          <span className="menu-category">{item.category}</span><strong>{item.name}</strong>
          <span className="menu-price">{money(item.price)}<span className="menu-add"><Plus size={17} /></span></span>
        </button>)}</div> : <Empty icon={Search} title="No items found"><p>Try a different search or category.</p></Empty>}
      </section>
      <form className="cart panel" onSubmit={submit}>
        <div className="panel-heading"><span className="square-icon"><ShoppingBasket size={20} /></span><h2>Current order</h2></div>
        <fieldset className="fulfillment-fields" disabled={editDisabled}>
          <legend className="visually-hidden">Order location</legend>
          <label>Order type<select value={draft.mode} onChange={event => setDraft({ ...draft, mode: event.target.value, tableNumber: '' })}>
            <option value="DINE_IN">Dine-in</option><option value="TAKEAWAY">Takeaway</option>
          </select></label>
          {draft.mode === 'DINE_IN' && <label>Table<select value={draft.tableNumber} required onChange={event => setDraft({ ...draft, tableNumber: event.target.value })}>
            <option value="">Choose a table</option>{data.tables.map(table => <option key={table} value={table}>Table {twoDigits(table)}</option>)}
          </select></label>}
        </fieldset>
        {draft.lines.length ? <ul className="cart-lines">{draft.lines.map(line => <li key={line.id}>
          <div className="cart-line-top"><strong>{line.item.name}</strong><button type="button" className="icon-button" disabled={editDisabled} aria-label={`Remove ${line.item.name}`} onClick={() => updateLine(line.id, item => ({ ...item, quantity: 0 }))}><Trash2 size={16} /></button></div>
          <div className="cart-line-controls"><div className="stepper">
            <button type="button" aria-label={`Decrease ${line.item.name} quantity`} disabled={editDisabled} onClick={() => updateLine(line.id, item => ({ ...item, quantity: item.quantity - 1 }))}><Minus size={15} /></button>
            <span>{line.quantity}</span><button type="button" aria-label={`Increase ${line.item.name} quantity`} disabled={editDisabled || line.quantity >= 50} onClick={() => updateLine(line.id, item => ({ ...item, quantity: item.quantity + 1 }))}><Plus size={15} /></button>
          </div><button className="text-button" type="button" aria-expanded={expanded === line.id} onClick={() => setExpanded(expanded === line.id ? null : line.id)}>Options &amp; note{(line.modifiers.length || line.note) ? ' •' : ''}</button></div>
          {expanded === line.id && <fieldset className="line-options" disabled={editDisabled}>
            <legend className="visually-hidden">Options for {line.item.name}</legend>
            {line.item.modifiers.map(option => <label className="checkbox" key={option.id}><input type="checkbox" checked={line.modifiers.includes(option.id)} onChange={event => updateLine(line.id, item => ({ ...item, modifiers: event.target.checked ? [...item.modifiers, option.id] : item.modifiers.filter(id => id !== option.id) }))} />{option.name}{option.price ? ` (+${money(option.price)})` : ''}</label>)}
            <label>Kitchen note<input value={line.note} maxLength={160} placeholder="e.g. No onions" onChange={event => updateLine(line.id, item => ({ ...item, note: event.target.value }))} /></label>
          </fieldset>}
        </li>)}</ul> : <Empty icon={ClipboardList} title="Order is empty"><p>Select an item from the menu.</p></Empty>}
        <div className="cart-summary"><span>Order total</span><strong>{money(total)}</strong></div>
        {unconfirmed && <p className="inline-warning" role="status">The server may have received this order. Retry the same order to confirm it.</p>}
        <Button type="submit" icon={ArrowRight} disabled={busy || !connected || (!data.register && !unconfirmed) || !draft.lines.length || (draft.mode === 'DINE_IN' && !draft.tableNumber)}>{busy ? 'Saving…' : unconfirmed ? 'Retry order' : 'Send to kitchen'}</Button>
      </form>
    </div>
  </>;
}
