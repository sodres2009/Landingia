'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import TopNav from '@/components/TopNav';
import { api, tokenStore, type ApiLead } from '@/lib/api';

/** Um lead é uma marcação quando o formulário tinha campo de data. */
const DATE_KEYS = ['data', 'data_pretendida', 'data_marca', 'dia', 'date'];
const TIME_KEYS = ['hora', 'hora_preferida', 'horario', 'time'];
const field = (v: Record<string, string>, keys: string[]) =>
  Object.keys(v).find((k) => keys.includes(k.toLowerCase()));

export default function BookingsPage() {
  const [rows, setRows] = useState<ApiLead[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [logged, setLogged] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) { setLogged(false); return; }
    void api.leadsList().then((d) => {
      const v = (l: ApiLead) => l.values ?? {};
      setRows((d.leads ?? []).filter((l) => Boolean(field(v(l), DATE_KEYS))));
    }).catch(() => setRows([]));
    void api.publishedList().then((d) => {
      const map: Record<string, string> = {};
      for (const p of d.pages ?? []) map[p.slug] = p.name;
      setNames(map);
    }).catch(() => undefined);
  }, []);

  return (
    <>
      <TopNav />
      <main className="shell">
        <div className="page-head">
          <div>
            <h1>Agendamento</h1>
            <p>Marcações recebidas nos formulários das tuas páginas (com data/hora).</p>
          </div>
        </div>
        {!logged ? (
          <div className="empty"><h2>Entra na tua conta</h2><p><Link href="/login" className="btn primary small">Entrar</Link></p></div>
        ) : !rows ? <p className="intro">A carregar…</p> : rows.length === 0 ? (
          <div className="empty"><h2>Sem marcações</h2><p>Pede ao assistente do editor «acrescenta um formulário com data e hora para marcar» — as respostas aparecem aqui.</p></div>
        ) : (
          <table className="table">
            <thead><tr><th>Nome</th><th>Contacto</th><th>Data</th><th>Hora</th><th>Página</th><th>Recebido</th></tr></thead>
            <tbody>
              {rows.map((l, i) => {
                const v = l.values ?? {};
                const nameKey = field(v, ['nome', 'name']) ?? Object.keys(v)[0];
                const phoneKey = field(v, ['telefone', 'telemovel', 'phone', 'whatsapp', 'contacto']);
                const dKey = field(v, DATE_KEYS);
                const tKey = field(v, TIME_KEYS);
                const dt = dKey ? v[dKey] : '';
                const dateTxt = /^\d{4}-\d{2}-\d{2}/.test(dt) ? new Date(`${dt.slice(0, 10)}T00:00`).toLocaleDateString('pt-PT') : dt || '—';
                return (
                  <tr key={i}>
                    <td><b>{(nameKey ? v[nameKey] : '') || '—'}</b></td>
                    <td>{phoneKey ? v[phoneKey] : '—'}</td>
                    <td>{dateTxt}</td>
                    <td>{tKey ? v[tKey] : '—'}</td>
                    <td>{names[l._slug] ?? l._slug}</td>
                    <td>{new Date(l._createdAt).toLocaleDateString('pt-PT')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
