import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, Boxes, ClipboardList, CookingPot, LayoutGrid, MapPin, Monitor, Utensils, Wallet, WifiOff, X } from 'lucide-react';
import { Button, Drawer } from './components.jsx';
import Tables from './Tables.jsx';
import Pos, { newDraft } from './Pos.jsx';
import { Inventory, Kitchen, OrderDetail, OrderList, Orders, Receipt, RegisterForm, Reports } from './Operations.jsx';
import { due, money, orderNumber, orderPlace, twoDigits } from './format.mjs';
import './styles.css';

const sections = [
  ['Tables', LayoutGrid], ['POS', Monitor], ['Kitchen', CookingPot], ['Orders', ClipboardList], ['Inventory', Boxes], ['Reports', BarChart3],
];

async function request(route, method = 'GET', payload) {
  let response;
  try {
    response = await fetch(`/api${route}`, { method, cache: 'no-store', signal: AbortSignal.timeout(method === 'GET' ? 3500 : 10000),
      ...(payload && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }) });
  } catch {
    throw Object.assign(new Error('The server is unavailable. Reconnect and try again.'), { network: true, uncertain: method !== 'GET' });
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body) throw Object.assign(new Error(body?.message ?? 'The server returned an unexpected response.'), { uncertain: !body || response.status >= 500 });
  return body;
}

function useRestaurant() {
  const [data, setData] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(0);
  const refresh = useCallback(async () => {
    const token = ++latest.current;
    try {
      const snapshot = await request('/snapshot');
      if (token === latest.current) {
        setData(snapshot);
        setConnected(true);
      }
    } catch {
      if (token === latest.current) setConnected(false);
    } finally {
      if (token === latest.current) setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const disconnected = () => { latest.current++; setConnected(false); setLoaded(true); };
    refresh();
    const interval = setInterval(refresh, 5000);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', disconnected);
    return () => {
      latest.current++;
      clearInterval(interval);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', disconnected);
    };
  }, [refresh]);
  return { data, connected, setConnected, loaded, refresh };
}

function Notice({ notice, dismiss }) {
  if (!notice) return null;
  return <div className={`notice ${notice.error ? 'notice-error' : ''}`} role={notice.error ? 'alert' : 'status'}>
    <span>{notice.text}</span><button className="icon-button" onClick={dismiss} aria-label="Dismiss message"><X size={16} /></button>
  </div>;
}

function App() {
  const { data, connected, setConnected, loaded, refresh } = useRestaurant();
  const [page, setPage] = useState('Tables');
  const [mode, setMode] = useState('DINE_IN');
  const [draft, setDraft] = useState(() => newDraft());
  const [panel, setPanel] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const orderIntent = useRef(null);
  const activeOrders = data?.orders.filter(order => order.status !== 'COMPLETED') ?? [];
  const locked = busy || !connected;

  function selectPanel(next) { setNotice(null); setPanel(next); }
  function openRegister() { selectPanel({ type: 'register', returnTo: panel?.type === 'order' ? panel : null }); }
  function viewOrder(id) { selectPanel({ type: 'order', id }); }
  function newOrder(orderMode, tableNumber) {
    if (!draft.lines.length) setDraft(newDraft(orderMode, tableNumber));
    else setNotice({ text: 'Your current order is still in the cart.' });
    setPanel(null);
    setPage('POS');
  }

  async function send(route, method, payload) {
    if (working.current || !connected) return { ok: false };
    working.current = true;
    setBusy(true);
    setNotice(null);
    try {
      const result = await request(route, method, payload);
      await refresh();
      return { ok: true, data: result };
    } catch (error) {
      if (error.network) setConnected(false);
      else await refresh();
      setNotice({ text: error.message, error: true });
      return { ok: false, uncertain: error.uncertain };
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  async function advance(order, status) {
    const result = await send(`/orders/${order.id}/status`, 'PATCH', { version: order.version, status });
    if (result.ok && status === 'COMPLETED') setNotice({ text: `Order ${orderNumber(order.number)} completed.` });
  }

  function registerDone(text) { setPanel(panel.returnTo); setNotice({ text }); }
  function placed(id, number) { viewOrder(id); setNotice({ text: `Order ${number} sent to the kitchen.` }); }
  const showReceipt = order => selectPanel({ type: 'receipt', order });
  const order = panel?.type === 'order' ? data?.orders.find(item => item.id === panel.id) : null;
  const tableOrders = panel?.type === 'table' ? activeOrders.filter(item => item.tableNumber === panel.number) : [];
  const hasPanel = Boolean(panel && data);

  return <div className="app">
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="topbar">
      <button className="wordmark" onClick={() => setPage('Tables')} aria-label="RestaurantOS home"><span className="brand-icon"><Utensils size={20} /></span>RestaurantOS</button>
      <span className="branch"><MapPin size={16} /> Port Louis</span>
      <span className="top-spacer" />
      <span className="demo-label">Local demo</span>
      <button className="register-button" onClick={openRegister} disabled={!data}><Wallet size={17} /> <span>Register {data?.register ? 'open' : 'closed'}</span></button>
    </header>
    <div className="layout">
      <nav className="sidebar" aria-label="Workspace">{sections.map(([name, Icon]) => <button key={name} className={page === name ? 'active' : ''} aria-current={page === name ? 'page' : undefined} onClick={() => { setPage(name); setNotice(null); }}><Icon size={20} /><span>{name}</span></button>)}</nav>
      <main className="workspace" id="main">
        {loaded && !connected && <div className="connection" role="status"><WifiOff size={18} /><span>{data ? 'Connection lost. Orders and checkout are paused.' : 'The RestaurantOS server is unavailable.'}</span><Button variant="secondary" onClick={refresh}>Reconnect</Button></div>}
        {!hasPanel && <Notice notice={notice} dismiss={() => setNotice(null)} />}
        {!loaded && !data && <div className="loading" role="status">Loading RestaurantOS…</div>}
        {data && <>
          {page === 'Tables' && <Tables data={data} mode={mode} setMode={setMode} newOrder={newOrder} disabled={locked} selectTable={number => selectPanel({ type: 'table', number })} selectOrder={viewOrder} />}
          {page === 'POS' && <Pos data={data} draft={draft} setDraft={setDraft} intent={orderIntent} connected={connected} busy={busy} send={send} openRegister={openRegister} placed={placed} />}
          {page === 'Kitchen' && <Kitchen orders={activeOrders} disabled={locked} advance={advance} viewOrder={viewOrder} />}
          {page === 'Orders' && <Orders orders={data.orders} viewOrder={viewOrder} />}
          {page === 'Inventory' && <Inventory inventory={data.inventory} />}
          {page === 'Reports' && <Reports data={data} manageRegister={openRegister} />}
        </>}
      </main>
    </div>
    {hasPanel && <Drawer
      title={panel.type === 'table' ? `Table ${twoDigits(panel.number)}` : panel.type === 'order' ? `Order ${order ? orderNumber(order.number) : ''}` : panel.type === 'receipt' ? 'Receipt' : data.register ? 'Close register' : 'Open register'}
      subtitle={order ? orderPlace(order) : undefined} close={() => setPanel(panel.returnTo ?? null)}>
      <Notice notice={notice} dismiss={() => setNotice(null)} />
      {panel.type === 'table' && <>
        <dl className="totals"><div><dt>Amount due across orders</dt><dd>{money(tableOrders.reduce((total, item) => total + due(item), 0))}</dd></div></dl>
        <OrderList orders={tableOrders} viewOrder={viewOrder} />
        <Button onClick={() => newOrder('DINE_IN', panel.number)} disabled={locked}>New order for this table</Button>
      </>}
      {panel.type === 'order' && (order ? <OrderDetail order={order} disabled={locked} busy={busy} register={data.register} advance={advance} send={send} openRegister={openRegister} receipt={showReceipt} /> : <p>Order unavailable. Open Orders to refresh the list.</p>)}
      {panel.type === 'register' && <RegisterForm key={data.register?.id ?? 'closed'} register={data.register} disabled={locked} busy={busy} send={send} done={registerDone} />}
      {panel.type === 'receipt' && <Receipt order={panel.order} />}
    </Drawer>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Offline shell unavailable:', error)));
}
