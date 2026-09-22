'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import LandingRender from '@/components/builder/LandingRender';
import { addBooking, addLead, getPage, savePage } from '@/lib/storage';
import type { LandingPage } from '@/lib/types';

/** Preview público: formulários gravam Leads/Bookings reais no storage. */
export default function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const [page, setPage] = useState<LandingPage | null | 'loading'>('loading');

  useEffect(() => {
    void params.then(({ id }) => {
      const found = getPage(id);
      if (found) savePage({ ...found, visits: (found.visits ?? 0) + 1 });
      setPage(found);
    });
  }, [params]);

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
