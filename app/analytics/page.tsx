'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';
import { getBookings, getLeads, getPages } from '@/lib/storage';

/** Analytics honesto: só números reais medidos pelo MVP. */
export default function AnalyticsPage() {
  const [data, setData] = useState({ pages: 0, visits: 0, leads: 0, bookings: 0, published: 0 });
  const [rows, setRows] = useState<Array<{ name: string; visits: number; leads: number }>>([]);

  useEffect(() => {
    const pages = getPages();
    setData({
      pages: pages.length,
      visits: pages.reduce((x, p) => x + (p.visits ?? 0), 0),
      leads: getLeads().length,
      bookings: getBookings().length,
      published: pages.filter((p) => p.status === 'published').length,
    });
    setRows(pages.map((p) => ({ name: p.name, visits: p.visits ?? 0, leads: p.leads ?? 0 })).sort((a, b) => b.leads - a.leads));
  }, []);

  const conversion = data.visits ? `${Math.round((data.leads / data.visits) * 100)}%` : '—';
  return (
    <>
      <TopNav />
      <main className="shell">
        <div className="page-head"><div><h1>Analytics</h1><p>Métricas medidas neste dispositivo (localStorage).</p></div></div>
        <div className="stats">
          <div className="stat"><b>{data.pages}</b><span>Páginas</span></div>
          <div className="stat"><b>{data.visits}</b><span>Visitas de preview</span></div>
          <div className="stat"><b>{data.leads}</b><span>Leads</span></div>
          <div className="stat"><b>{conversion}</b><span>Conversão lead/visita</span></div>
        </div>
        {rows.length === 0 ? (
          <div className="empty"><h2>Sem dados ainda</h2><p>Cria e pré-visualiza uma página para começar a medir.</p></div>
        ) : (
          <table className="table">
            <thead><tr><th>Página</th><th>Visitas</th><th>Leads</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td><b>{r.name}</b></td><td>{r.visits}</td><td>{r.leads}</td></tr>)}</tbody>
          </table>
        )}
      </main>
    </>
  );
}
