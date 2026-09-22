'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/TopNav';
import { getLeads, saveLeads, updateLead } from '@/lib/storage';
import type { Lead } from '@/lib/types';

const STATUSES: Lead['status'][] = ['Novo', 'Contactado', 'Em negociação', 'Convertido'];

/** Leads reais de páginas publicadas vivem no servidor (JSONL) — vêm para aqui. */
async function fetchServerLeads(): Promise<Lead[]> {
  try {
    const list = (await (await fetch('/api/publish')).json()) as { pages?: Array<{ slug: string; name: string }> };
    const perPage = await Promise.all((list.pages ?? []).map(async (p) => {
      try {
        const d = (await (await fetch(`/api/publish?slug=${encodeURIComponent(p.slug)}&mode=leads`)).json()) as {
          leads?: Array<{ ts: string; values: Record<string, string> }>; pageName?: string;
        };
        return (d.leads ?? []).map((l, i): Lead => {
          const v = l.values ?? {};
          const email = v.email ?? Object.entries(v).find(([, val]) => String(val).includes('@'))?.[1] ?? '';
          const name = v.nome ?? v.name ?? Object.entries(v).find(([k]) => /nome|name/.test(k))?.[1] ?? 'Visitante';
          return {
            id: `srv-${p.slug}-${i}`, name, email,
            phone: v.telefone ?? v.telemovel ?? v.phone ?? v.contacto ?? undefined,
            message: v.mensagem ?? v.message ?? v.mensagem2 ?? Object.entries(v).find(([k]) => /msg|message|mensagem/.test(k))?.[1],
            status: 'Novo', pageId: p.slug, pageName: d.pageName ?? p.name,
            createdAt: l.ts,
          };
        });
      } catch { return []; }
    }));
    return perPage.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [serverCount, setServerCount] = useState(0);
  useEffect(() => {
    setLeads(getLeads());
    void fetchServerLeads().then((srv) => {
      setServerCount(srv.length);
      setLeads((cur) => [...srv, ...(cur ?? getLeads()).filter((l) => !srv.some((s) => s.email && s.email === l.email && s.createdAt === l.createdAt))]);
    });
  }, []);

  function setStatus(id: string, status: Lead['status']) {
    updateLead(id, { status });
    setLeads((cur) => (cur ?? []).map((l) => (l.id === id ? { ...l, status } : l)));
  }

  function remove(id: string) {
    if (!window.confirm('Remover este lead?')) return;
    saveLeads(getLeads().filter((l) => l.id !== id));
    setLeads((cur) => (cur ?? []).filter((l) => l.id !== id));
  }

  return (
    <>
      <TopNav />
      <main className="shell">
        <div className="page-head">
          <div>
            <h1>Leads</h1>
            <p>Cada submissão de formulário das tuas páginas aparece aqui, com pipeline de estado.{serverCount > 0 ? ` ${serverCount} de páginas publicadas (servidor).` : ''}</p>
          </div>
        </div>
        <div className="stats">
          {STATUSES.map((s) => (
            <div className="stat" key={s}><b>{(leads ?? []).filter((l) => l.status === s).length}</b><span>{s}</span></div>
          ))}
        </div>
        {!leads ? null : leads.length === 0 ? (
          <div className="empty"><h2>Sem leads ainda</h2><p>Publica uma página e partilha — os formulários alimentam esta lista.</p></div>
        ) : (
          <table className="table">
            <thead><tr><th>Nome</th><th>Contactos</th><th>Origem</th><th>Data</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td><b>{l.name}</b>{l.company ? <div style={{ fontSize: 11, opacity: 0.7 }}>{l.company}</div> : null}</td>
                  <td>{l.email}{l.phone ? ` · ${l.phone}` : ''}</td>
                  <td>{l.pageName ?? '—'}</td>
                  <td>{new Date(l.createdAt).toLocaleDateString('pt-PT')}</td>
                  <td>
                    <select className="select-mini" value={l.status} onChange={(e) => setStatus(l.id, e.target.value as Lead['status'])}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td><button className="btn danger small" onClick={() => remove(l.id)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
