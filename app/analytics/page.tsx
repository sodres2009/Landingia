'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';
import { api } from '@/lib/api';

type Row = { slug: string; name: string; visits: number; leads: number };

/** Analytics reais: visitas às páginas publicadas medidas pelo servidor. */
export default function AnalyticsPage() {
  const [data, setData] = useState<{ visits: number; leads: number; conversion: number; published: number; rows: Row[] } | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    void api.analytics().then((d) => setData({ visits: d.visits, leads: d.leads, conversion: d.conversion, published: d.published, rows: d.rows })).catch(() => setErr('Entra na tua conta para ver as métricas.'));
  }, []);

  return (
    <>
      <TopNav />
      <main className="shell">
        <div className="page-head"><div><h1>Analytics</h1><p>Números reais do servidor: visitas às tuas páginas publicadas e leads recebidos.</p></div></div>
        {err && <div className="empty"><h2>Sem sessão</h2><p>{err}</p></div>}
        {!err && !data ? <p className="intro">A carregar…</p> : !err && data && (
          <>
            <div className="stats">
              <div className="stat"><b>{data.published}</b><span>Páginas publicadas</span></div>
              <div className="stat"><b>{data.visits}</b><span>Visitas reais</span></div>
              <div className="stat"><b>{data.leads}</b><span>Leads</span></div>
              <div className="stat"><b>{data.visits ? `${data.conversion}%` : '—'}</b><span>Conversão lead/visita</span></div>
            </div>
            {data.rows.length === 0 ? (
              <div className="empty"><h2>Sem dados ainda</h2><p>Publica uma página e partilha o link — as visitas e os leads aparecem aqui.</p></div>
            ) : (
              <table className="table">
                <thead><tr><th>Página</th><th>Visitas</th><th>Leads</th><th>Conversão</th></tr></thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr key={r.slug}>
                      <td><b>{r.name}</b></td><td>{r.visits}</td><td>{r.leads}</td>
                      <td>{r.visits ? `${Math.round((r.leads / r.visits) * 100)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </main>
    </>
  );
}
