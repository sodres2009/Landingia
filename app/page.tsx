'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { LandingPage } from '@/lib/types';
import { getPages, removePage } from '@/lib/storage';
import TopNav from '@/components/TopNav';

export default function Dashboard() {
  const [pages, setPages] = useState<LandingPage[] | null>(null);
  const [server, setServer] = useState({ visits: 0, leads: 0 });

  useEffect(() => setPages(getPages()), []);

  // Dados reais dos visitantes (URLs publicadas vivem no servidor, não no browser).
  useEffect(() => {
    void fetch('/api/publish')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((d: { pages?: Array<{ visits: number; leads: number }> }) => {
        const list = d.pages ?? [];
        setServer({
          visits: list.reduce((s, p) => s + (p.visits ?? 0), 0),
          leads: list.reduce((s, p) => s + (p.leads ?? 0), 0),
        });
      })
      .catch(() => undefined);
  }, []);

  function del(id: string) {
    if (!window.confirm('Remover esta Landing Page?')) return;
    removePage(id);
    setPages(getPages());
  }

  const list = pages ?? [];
  const visits = list.reduce((sum, p) => sum + (p.visits ?? 0), 0) + server.visits;
  const leads = list.reduce((sum, p) => sum + (p.leads ?? 0), 0) + server.leads;
  const published = Math.max(list.filter((p) => p.status === 'published').length, 0);

  return (
    <>
      <TopNav />
      <main className="shell">
        <div className="page-head">
          <div>
            <h1>Landing Pages</h1>
            <p>Crie, edite, publique e otimize páginas profissionais com um agente de IA.</p>
          </div>
          <Link href="/create" className="btn primary">+ Criar Landing Page</Link>
        </div>

        <div className="stats">
          <div className="stat"><b>{list.length}</b><span>Landing Pages</span></div>
          <div className="stat"><b>{visits}</b><span>Visitas</span></div>
          <div className="stat"><b>{leads}</b><span>Leads</span></div>
          <div className="stat"><b>{published}</b><span>Publicadas</span></div>
        </div>

        {pages === null ? null : list.length === 0 ? (
          <div className="empty">
            <h2>Ainda não tem Landing Pages</h2>
            <p>Clique em <b>+ Criar Landing Page</b> — descreva o seu negócio e o agente IA trata do resto.</p>
          </div>
        ) : (
          <div className="grid">
            {list.map((p) => (
              <article className="card" key={p.id}>
                <h3>{p.name}</h3>
                <div className="meta">
                  <span className={`badge ${p.status}`}>{p.status === 'draft' ? 'RASCUNHO' : p.status === 'published' ? 'PUBLICADA' : 'PAUSA'}</span>
                  <span>{p.sections.length} secções</span>
                  <span>{p.leads ?? 0} leads</span>
                </div>
                <div className="meta">Atualizada {new Date(p.updatedAt).toLocaleDateString('pt-PT')}</div>
                <div className="row">
                  <Link href={`/builder/${p.id}`} className="btn primary small">Editar</Link>
                  <Link href={`/preview/${p.id}`} className="btn ghost small">Preview</Link>
                  <button className="btn danger small" onClick={() => del(p.id)}>Remover</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
