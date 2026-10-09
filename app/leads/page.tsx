'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import TopNav from '@/components/TopNav';
import { getLeads, saveLeads, updateLead } from '@/lib/storage';
import { api, tokenStore } from '@/lib/api';
import type { Lead } from '@/lib/types';

const STATUSES: Lead['status'][] = ['Novo', 'Contactado', 'Em negociação', 'Convertido'];

/** WhatsApp direto do lead — só prepara a conversa (clique do dono); nada é enviado sozinho. */
function waLeadLink(l: Lead): string | null {
  const d = String(l.phone ?? '').replace(/\D/g, '');
  if (d.length < 9) return null;
  const num = d.length === 9 && d[0] === '9' ? '351' + d
    : d.length === 9 && d[0] === '8' && '234567'.includes(d[1]) ? '258' + d
    : d;
  const ans = l.answers ? ' — ' + Object.entries(l.answers).map(([k, v]) => `${k}: ${v}`).join('; ').slice(0, 220) : '';
  const msg = `Olá ${l.name}! Recebi o teu pedido${l.pageName && l.pageName !== l.pageId ? ` (página «${l.pageName}»)` : ''}${l.message ? ` — ${String(l.message).slice(0, 160)}` : ''}${ans}. Como posso ajudar?`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}

/** Leads reais das páginas publicadas — vivem no backend (SQLite). */
const KNOWN = /^(email|e-?mail|nome|name|telefone|telemovel|phone|contacto|contacto|whatsapp|mensagem|message|msg|consent|company|empresa)$/i;
async function fetchServerLeads(): Promise<Lead[]> {
  const pages = await api.publishedList().then((d) => d.pages ?? []).catch(() => []);
  const names = Object.fromEntries(pages.map((p) => [p.slug, p.name]));
  const all = await api.leadsList().then((d) => d.leads ?? []).catch(() => []);
  return all.map((l, i): Lead => {
    const v = l.values ?? {};
    const email = v.email ?? Object.entries(v).find(([, val]) => String(val).includes('@'))?.[1] ?? '';
    const name = v.nome ?? v.name ?? Object.entries(v).find(([k]) => /nome|name/i.test(k))?.[1] ?? 'Visitante';
    // respostas do formulário fora dos campos fixos — cargo, tipo de demo, desafio…
    const answers: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      const s = String(val ?? '').trim();
      if (!s || s === 'on' || s === 'Concordo com o tratamento' || KNOWN.test(k)) continue;
      answers[k] = s;
    }
    return {
      id: `srv-${l._slug}-${i}`, name, email,
      phone: v.telefone ?? v.telemovel ?? v.phone ?? v.contacto ?? undefined,
      company: v.empresa ?? v.company ?? undefined,
      message: v.mensagem ?? v.message ?? Object.entries(v).find(([k]) => /msg|message|mensagem/i.test(k))?.[1],
      status: 'Novo', pageId: l._slug, pageName: names[l._slug] ?? l._slug,
      createdAt: l._createdAt,
      answers: Object.keys(answers).length ? answers : undefined,
    };
  });
}

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [serverCount, setServerCount] = useState(0);
  useEffect(() => {
    if (!tokenStore.get()) { router.replace('/login'); return; } // leads são privados por conta
    setLeads(getLeads());
    void fetchServerLeads().then((srv) => {
      setServerCount(srv.length);
      setLeads((cur) => [...srv, ...(cur ?? getLeads()).filter((l) => !srv.some((s) => s.email && s.email === l.email && s.createdAt === l.createdAt))]);
    });
  }, [router]);

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
                  <td><b>{l.name}</b>{l.company ? <div style={{ fontSize: 11, opacity: 0.7 }}>{l.company}</div> : null}
                    {l.answers ? <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 4, display: 'grid', gap: 2 }}>
                      {Object.entries(l.answers).map(([k, v]) => <span key={k}><b style={{ fontWeight: 600 }}>{k}</b>: {v}</span>)}
                    </div> : null}
                  </td>
                  <td>{l.email}{l.phone ? ` · ${l.phone}` : ''}</td>
                  <td>{l.pageName ?? '—'}</td>
                  <td>{new Date(l.createdAt).toLocaleDateString('pt-PT')}</td>
                  <td>
                    <select className="select-mini" value={l.status} onChange={(e) => setStatus(l.id, e.target.value as Lead['status'])}>
                      {STATUSES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {waLeadLink(l) ? (
                      <a className="btn small" style={{ background: '#25d366', color: '#063', fontWeight: 700, textDecoration: 'none' }}
                        href={waLeadLink(l)!} target="_blank" rel="noreferrer" title="Abrir a conversa com este lead — nada é enviado sem clicares">
                        WhatsApp
                      </a>
                    ) : null}{' '}
                    <button className="btn danger small" onClick={() => remove(l.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </>
  );
}
