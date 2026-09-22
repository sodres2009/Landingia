'use client';

import { useEffect, useState } from 'react';
import LandingRender from '@/components/builder/LandingRender';
import type { LandingPage } from '@/lib/types';

/** Página pública real: servida pelo servidor, funciona em qualquer dispositivo. */
export default function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string>('');
  const [page, setPage] = useState<LandingPage | null | 'loading'>('loading');

  useEffect(() => {
    void params.then(({ slug: s }) => {
      setSlug(s);
      void fetch(`/api/publish?slug=${encodeURIComponent(s)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('404'))))
        .then((d: { page: LandingPage }) => setPage(d.page))
        .catch(() => setPage(null));
      // Contagem de visitantes reais (uma por abertura da página; falha silenciosa).
      void fetch('/api/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'visit', slug: s }),
      }).catch(() => undefined);
    });
  }, [params]);

  async function submitForm(sectionId: string, elementId: string, values: Record<string, string>): Promise<string> {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'lead', slug, sectionId, elementId, values }),
    });
    const data = (await res.json()) as { message?: string; error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Não foi possível enviar.');
    return data.message ?? 'Obrigado! Entraremos em contacto.';
  }

  if (page === 'loading') return <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', background: '#070b16', color: '#8b96b3' }}>A carregar…</main>;
  if (!page) {
    return (
      <main style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', background: '#070b16', color: '#e6eaf5', textAlign: 'center' }}>
        <div>
          <h2>Esta página não está publicada.</h2>
          <p style={{ color: '#8b96b3' }}>Peça ao dono da página para a publicar de novo.</p>
        </div>
      </main>
    );
  }

  return (
    <div style={{ background: '#070b16', minHeight: '100vh' }}>
      <LandingRender page={page} options={{ onSubmitForm: submitForm }} />
    </div>
  );
}
