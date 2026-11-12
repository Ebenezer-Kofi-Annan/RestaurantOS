import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { statusNames } from './format.mjs';

export function Button({ icon: Icon, variant = 'primary', children, ...props }) {
  return <button type="button" className={`button button-${variant}`} {...props}>{Icon && <Icon size={17} aria-hidden="true" />}{children}</button>;
}

export function Status({ status }) {
  return <span className={`pill status-${status.toLowerCase()}`}><span className="pill-dot" />{statusNames[status] ?? status}</span>;
}

export function PaymentStatus({ payment }) {
  return <span className={`pill ${payment ? 'status-completed' : 'unpaid'}`}>{payment ? 'Paid' : 'Unpaid'}</span>;
}

export function Empty({ icon: Icon, title, children }) {
  return <div className="empty"><span className="empty-icon"><Icon size={25} aria-hidden="true" /></span><h3>{title}</h3>{children}</div>;
}

export function Drawer({ title, subtitle, close, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog ref={ref} className="drawer" aria-labelledby="drawer-title" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="drawer-header"><div><h2 id="drawer-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
      <button type="button" className="icon-button" aria-label="Close panel" onClick={close}><X size={21} /></button>
    </div>
    <div className="drawer-content">{children}</div>
  </dialog>;
}

export function PageHeading({ title, children }) {
  return <header className="page-heading"><h1>{title}</h1>{children}</header>;
}
