'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LandingPage } from '@/lib/types';
import { getPages, deriveStudioTitle, removePage } from '@/lib/storage';
import { api, tokenStore } from '@/lib/api';
import TopNav from '@/components/TopNav';
import PublicLinkChip from '@/components/builder/PublicLinkChip';
import PublishedLinks from '@/components/dashboard/PublishedLinks';

export default function Dashboard() {
  const router = useRouter();
  const [pages, setPages] = useState<LandingPage[] | null>(null);
  const [server, setServer] = useState({ visits: 0, leads: 0 });

  useEffect(() => {
    if (!tokenStore.get()) router.replace('/login'); // o dashboard mostra dados da conta
  }, [router]);

  useEffect(() => {
    setPages(getPages());
    // Páginas também vivem no backend (acessíveis de qualquer dispositivo) — fundimos as duas origens.
    void api.pagesList()
      .then((d) => {
        // As páginas do servidor não passam pelo normalizador local: aplica-se
        // o mesmo auto-renome (Studio com nome-briefing → <title> do agente).
        const fixed = (d.pages ?? []).map((p) => {
          const name = String(p.name ?? '').trim();
          const bad = !name || name === 'Sem nome' || name.split(/\s+/).length > 6 || /^(quero|tenho|uma landing|uma p[áa]gina)/i.test(name);
          const derived = p.kind === 'studio' && p.html ? deriveStudioTitle(String(p.html)) : '';
          return bad && derived ? { ...p, name: derived.slice(0, 48) } : p;
        });
        const ids = new Set(fixed.map((p) => p.id));
        setPages((cur) => [...fixed, ...(cur ?? getPages()).filter((p) => !ids.has(p.id))]);
      })
      .catch(() => undefined);
  }, []);

  async function del(id: string) {
    if (!window.confirm('Remover esta Landing Page? Se estiver publicada, sai do ar e perde os leads.')) return;
    removePage(id);
    try {
      await api.pageDelete(id); // o servidor tira a cópia publicada do ar com ela
    } catch (e) {
      window.alert((e as Error).message || 'Falha ao apagar no servidor.');
    }
    setPages(getPages());
  }

  // Dados reais dos visitantes e leads (backend — vivem no servidor, não no browser).
  useEffect(() => {
    void api.publishedList()
      .then((d) => {
        const list = d.pages ?? [];
        setServer({
          visits: list.reduce((s, p) => s + (p.visits ?? 0), 0),
          leads: list.reduce((s, p) => s + (p.leads ?? 0), 0),
        });
      })
      .catch(() => undefined);
  }, []);

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

        {pages !== null && <PublishedLinks pages={list.filter((p) => p.status === 'published' && p.publishedSlug)} />}

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
                <div className="meta">Atualizada {(() => { const d = new Date(p.updatedAt || p.createdAt || 0); return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-PT'); })()}</div>
                {p.status === 'published' && p.publishedSlug && (
                  <div className="meta"><PublicLinkChip slug={p.publishedSlug} /></div>
                )}
                <div className="row">
                  <Link href={`/builder/${p.id}`} className="btn primary small">Editar</Link>
                  <Link href={`/preview/${p.id}`} className="btn ghost small">Preview</Link>
                  <button className="btn danger small" onClick={() => del(p.id)}>Remover</button>
                </div>
              </article>
            ))}
          </div>
        )}
        <p style={{ textAlign: 'center', marginTop: 30, fontSize: 12, color: 'var(--muted)' }}>
          LandingAI · <Link href="/legal" style={{ color: 'inherit' }}>Termos e privacidade</Link>
        </p>
      </main>
    </>
  );
}
