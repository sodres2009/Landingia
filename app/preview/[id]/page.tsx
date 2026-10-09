'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import LandingRender from '@/components/builder/LandingRender';
import { API_URL } from '@/lib/api';
import { addBooking, addLead, getPage, savePage } from '@/lib/storage';
import type { LandingPage } from '@/lib/types';

/** Preview público: formulários gravam Leads/Bookings reais no storage. */
export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [page, setPage] = useState<LandingPage | null | 'loading'>('loading');
  const [runtime, setRuntime] = useState('');

  useEffect(() => {
    void params.then(({ id }) => {
      const found = getPage(id);
      if (found) savePage({ ...found, visits: (found.visits ?? 0) + 1 });
      setPage(found);
    });
  }, [params]);

  // Runtime fresco do servidor (mapa, reveals, forms, float WhatsApp) — igual
  // ao editor: o preview nunca mostra uma versão velha ou crua da página.
  useEffect(() => {
    void fetch(`${API_URL}/agent/design/runtime`).then((r) => (r.ok ? r.text() : '')).then(setRuntime).catch(() => undefined);
  }, []);

  const studioSrcDoc = useMemo(() => {
    if (page === 'loading' || !page || page.kind !== 'studio' || !page.html) return '';
    let base = page.html.replace(/<style data-studio[^>]*>[\s\S]*?<\/style>/g, '').replace(/<script data-studio[\s\S]*?<\/script>/g, '');
    if (runtime && base) base = /<\/body>/i.test(base) ? base.replace(/<\/body>/i, runtime + '</body>') : base + runtime;
    const metas = page.publishedSlug
      ? `<meta name="lp-api" content="${API_URL}"><meta name="lp-slug" content="${page.publishedSlug}">`
      : '<meta name="lp-preview" content="1">';
    return /<head(\s[^>]*)?>/i.test(base) ? base.replace(/<head(\s[^>]*)?>/i, (m) => m + metas) : metas + base;
  }, [page, runtime]);

  if (page === 'loading') return <main className="shell"><p className="intro">A carregar…</p></main>;
  if (!page) {
    return (
      <main className="shell">
        <div className="empty">
          <h2>Esta página não existe</h2>
          <p><Link href="/" className="btn primary small">Ir para o Dashboard</Link></p>
        </div>
      </main>
    );
  }

  // Studio: a pré-visualização é a página real num iframe — nunca o render do builder.
  if (page.kind === "studio" && page.html) {
    return (
      <main style={{ minHeight: "100vh", background: "#0b0f1c" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", padding: "8px 10px", background: "rgba(14,21,38,.96)", borderBottom: "1px solid #1c2740", position: "sticky", top: 0, zIndex: 30 }}>
          <span style={{ fontSize: 11, color: "#8b96b3" }}>👁 Pré-visualização · {page.name} · <span className={`badge ${page.status}`}>{page.status === "published" ? "PUBLICADA" : "RASCUNHO"}</span></span>
          <Link href={`/builder/${page.id}`} className="btn ghost small">Voltar ao Editor</Link>
        </div>
        <iframe title="Pré-visualização Studio" srcDoc={studioSrcDoc || page.html} sandbox="allow-scripts allow-popups allow-forms"
          style={{ width: "100%", height: "calc(100vh - 41px)", border: 0, display: "block", background: "#fff" }} />
      </main>
    );
  }

  // Studio sem html em lado nenhum (página gravada durante o bug antigo): diz-no,
  // em vez de mostrar um render builder branco que parece mais um bug.
  if (page.kind === "studio" && !page.html) {
    return (
      <main className="shell">
        <div className="empty">
          <h2>Esta página Studio perdeu o design</h2>
          <p>O HTML não está guardado nem no browser nem no servidor — foi gravada durante uma versão antiga. Abre no editor e gera uma nova versão no Studio.</p>
          <p><Link href={`/builder/${page.id}`} className="btn primary small">Abrir no Editor</Link></p>
        </div>
      </main>
    );
  }

  async function submitForm(sectionId: string, elementId: string, values: Record<string, string>): Promise<string> {
    if (!page || page === 'loading') return 'Página indisponível.';
    const current: LandingPage = page;
    const section = current.sections.find((s) => s.id === sectionId);
    const element = section?.elements.find((e) => e.id === elementId);
    const name = values.nome ?? values.name ?? 'Visitante';
    const email = values.email ?? '';
    if (element?.type === 'scheduling') {
      addBooking({
        name, email,
        date: values.data_pretendida ?? values.data ?? new Date().toISOString().slice(0, 10),
        time: values.hora_preferida ?? values.hora ?? '10:00',
        duration: 30, status: 'Agendado', pageId: current.id,
      });
    } else {
      addLead({
        name, email,
        phone: values.telefone, company: values.empresa,
        message: values.mensagem, consent: values.consent === 'on',
        pageId: current.id, pageName: current.name,
      });
    }
    return String(element?.content.success ?? 'Obrigado! Entraremos em contacto.');
  }

  return (
    <div style={{ minHeight: '100vh', background: '#070b16' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', padding: '10px', background: 'rgba(14,21,38,.95)', borderBottom: '1px solid #1c2740', position: 'sticky', top: 0, zIndex: 30 }}>
        <span style={{ fontSize: 11, color: '#8b96b3' }}>👁 Pré-visualização · {page.name} · <span className={`badge ${page.status}`}>{page.status === 'published' ? 'PUBLICADA' : 'RASCUNHO'}</span></span>
        <Link href={`/builder/${page.id}`} className="btn ghost small">Voltar ao Editor</Link>
      </div>
      <div style={{ maxWidth: 960, margin: '26px auto', borderRadius: 16, overflow: 'hidden', boxShadow: '0 30px 90px rgba(0,0,0,.6)' }}>
        <LandingRender page={page} options={{ onSubmitForm: submitForm }} />
      </div>
    </div>
  );
}
