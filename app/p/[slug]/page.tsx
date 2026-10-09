'use client';

import { useEffect, useState } from 'react';
import LandingRender from '@/components/builder/LandingRender';
import { api, API_URL } from '@/lib/api';
import type { LandingPage } from '@/lib/types';

/** Página pública real: dados do backend (servidor), funciona em qualquer dispositivo. */
export default function PublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string>('');
  const [page, setPage] = useState<LandingPage | null | 'loading'>('loading');

  useEffect(() => {
    void params.then(({ slug: s }) => {
      setSlug(s);
      void api.publishedGet(s).then((d) => {
        // Studio: a página pública é o HTML servido pela API (runtime injetado + visitas lá).
        if ((d.page as { kind?: string }).kind === "studio") {
          window.location.replace(`${API_URL}/published/${encodeURIComponent(s)}/html`);
          return;
        }
        setPage(d.page);
      }).catch(() => setPage(null));
      // Contagem de visitantes reais (uma por abertura da página; falha silenciosa).
      void api.visit(s).catch(() => undefined);
    });
  }, [params]);

  async function submitForm(sectionId: string, elementId: string, values: Record<string, string>): Promise<string> {
    const data = await api.leadAdd({ slug, sectionId, elementId, values });
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
