'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Builder from '@/components/builder/Builder';
import { getPage, savePage } from '@/lib/storage';
import type { LandingPage } from '@/lib/types';

export default function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string | null>(null);
  const [page, setPage] = useState<LandingPage | null | 'loading'>('loading');

  useEffect(() => {
    void params.then((p) => setId(p.id));
  }, [params]);

  useEffect(() => {
    if (!id) return;
    setPage(getPage(id));
  }, [id]);

  if (page === 'loading') return <main className="shell"><p className="intro">A carregar…</p></main>;
  if (!page) {
    return (
      <main className="shell">
        <div className="empty">
          <h2>Página não encontrada</h2>
          <p><Link href="/" className="btn primary small">Voltar ao Dashboard</Link></p>
        </div>
      </main>
    );
  }
  return <Builder page={page} onSave={savePage} />;
}
